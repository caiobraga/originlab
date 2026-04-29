// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const supabaseKey =
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não encontradas!');
  console.error('   Configure no arquivo .env.local:');
  console.error('   VITE_SUPABASE_URL=https://seu-projeto.supabase.co');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Marca como não processados (is_processed = false) os edital_pdfs para os quais
 * a tabela documents tem linhas, mas `content` está vazio.
 *
 * Regra pedida:
 * - "sem conteúdo" = apenas quando há registro em documents e content é null/vazio.
 * - se não há registro em documents para o file_id, não altera is_processed.
 * - também sincroniza para true quando há content preenchido.
 *
 * Uso: npm run db:unmark-pdfs-without-document-content
 */
async function unmarkPdfsWithoutDocumentContent() {
  const dryRun = process.argv.includes('--dry-run');
  const forceLargeUpdate = process.argv.includes('--force-large-update');
  const maxAutoUpdateRatio = parseFloat(process.env.UNMARK_MAX_RATIO || '0.5'); // 50% por padrão

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   MARCAR EDITAL_PDFs SEM CONTEÚDO EM DOCUMENTS (RAG)      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('   • Sincroniza is_processed usando SOMENTE documents.content');
  console.log('   • false: existe documents para o file_id, mas content está vazio');
  console.log('   • true: existe documents para o file_id, e content está preenchido');
  console.log('   • sem registro em documents: não altera\n');
  if (dryRun) {
    console.log('   • Modo: --dry-run (não altera is_processed)\n');
  }

  try {
    // 1) Buscar presença/estado de content por file_id em documents.
    console.log('📑 Passo 1: Lendo documents (file_id, metadata, content)...');
    const fileIdsSeenInDocuments = new Set<string>();
    const fileIdsWithContent = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    const DOCS_PAGE = 1000;
    let docsOffset = 0;
    while (true) {
      const { data: page, error: docsErr } = await supabase
        .from('documents')
        .select('file_id, metadata, content')
        .range(docsOffset, docsOffset + DOCS_PAGE - 1);
      if (docsErr) {
        console.error('❌ Erro ao ler documents:', docsErr.message);
        throw docsErr;
      }
      const pageRows = (page || []) as Record<string, unknown>[];
      rows.push(...pageRows);
      if (pageRows.length < DOCS_PAGE) break;
      docsOffset += DOCS_PAGE;
    }

    for (const row of rows || []) {
      const r = row as Record<string, unknown>;
      const fid = (
        typeof r.file_id === 'string' && r.file_id.trim()
          ? r.file_id
          : (typeof (r.metadata as Record<string, unknown>)?.file_id === 'string'
              ? (r.metadata as Record<string, unknown>).file_id as string
              : null)
      );
      if (!fid || !fid.trim()) continue;
      const key = fid.trim();
      fileIdsSeenInDocuments.add(key);

      const content = r.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        fileIdsWithContent.add(key);
      }
    }

    console.log(`   ✅ ${fileIdsSeenInDocuments.size} file_id(s) que aparecem em documents`);
    console.log(`   ✅ ${fileIdsWithContent.size} file_id(s) com content preenchido\n`);

    if (fileIdsSeenInDocuments.size === 0) {
      console.log('⚠️  Nenhum registro com file_id em documents. Nenhuma alteração aplicada.\n');
      return;
    }

    // 2) Buscar edital_pdfs atuais para sincronizar status.
    console.log('📄 Passo 2: Buscando edital_pdfs...');
    const pdfs: { id: string; file_id?: string | null; edital_id?: string | null; is_processed?: boolean | null }[] = [];
    const PDFS_PAGE = 1000;
    let pdfsOffset = 0;
    while (true) {
      const { data: page, error: pdfsError } = await supabase
        .from('edital_pdfs')
        .select('id, file_id, edital_id, is_processed')
        .range(pdfsOffset, pdfsOffset + PDFS_PAGE - 1);
      if (pdfsError) {
        console.error('❌ Erro ao buscar edital_pdfs:', pdfsError);
        throw pdfsError;
      }
      const pageRows = (page || []) as { id: string; file_id?: string | null; edital_id?: string | null; is_processed?: boolean | null }[];
      pdfs.push(...pageRows);
      if (pageRows.length < PDFS_PAGE) break;
      pdfsOffset += PDFS_PAGE;
    }

    const normalize = (x: string | null | undefined) => (x != null ? String(x).trim() : '');
    const toFalse: { id: string; edital_id: string }[] = [];
    const toTrue: { id: string; edital_id: string }[] = [];
    let unchangedNoDocuments = 0;

    for (const p of pdfs || []) {
      const r = p;
      const docKey1 = normalize(r.file_id) || normalize(r.id);
      const docKey2 = r.file_id ? normalize(r.id) : '';

      const appearsInDocuments =
        (docKey1 && fileIdsSeenInDocuments.has(docKey1)) ||
        (docKey2 && fileIdsSeenInDocuments.has(docKey2));
      if (!appearsInDocuments) {
        unchangedNoDocuments++;
        continue;
      }

      const hasContent =
        (docKey1 && fileIdsWithContent.has(docKey1)) ||
        (docKey2 && fileIdsWithContent.has(docKey2));

      if (hasContent) {
        if (r.is_processed !== true) {
          toTrue.push({ id: String(r.id), edital_id: String(r.edital_id || '') });
        }
      } else {
        if (r.is_processed !== false) {
          toFalse.push({ id: String(r.id), edital_id: String(r.edital_id || '') });
        }
      }
    }

    console.log(`   ✅ ${(pdfs || []).length} edital_pdf(s) no total`);
    console.log(`   ✅ ${unchangedNoDocuments} sem registro em documents (inalterados)`);
    console.log(`   ✅ ${toFalse.length} para marcar is_processed=false (content vazio)`);
    console.log(`   ✅ ${toTrue.length} para marcar is_processed=true (content preenchido)\n`);

    const totalPdfs = (pdfs || []).length;
    const totalChanges = toFalse.length + toTrue.length;
    const ratio = totalPdfs > 0 ? totalChanges / totalPdfs : 0;

    // Proteção para evitar desmarcar tudo por mismatch de coluna/esquema/configuração.
    if (!forceLargeUpdate && ratio > maxAutoUpdateRatio) {
      console.warn(`⚠️  Proteção ativada: o script alteraria ${totalChanges}/${totalPdfs} PDFs (${(ratio * 100).toFixed(1)}%).`);
      console.warn(`   Isso geralmente indica problema de schema/colunas de conteúdo ou dados incompletos em documents.`);
      console.warn(`   Nenhuma alteração foi aplicada.`);
      console.warn(`   Para executar mesmo assim: npm run db:unmark-pdfs-without-document-content -- --force-large-update`);
      console.warn(`   Ou ajuste UNMARK_MAX_RATIO no .env.local (ex.: UNMARK_MAX_RATIO=0.9)\n`);
      return;
    }

    if (totalChanges === 0) {
      console.log('✅ Nenhuma alteração necessária. is_processed já está sincronizado.\n');
      return;
    }

    // 3. Opcional: listar alguns editais afetados
    const editalIds = [...new Set([...toFalse, ...toTrue].map((x) => x.edital_id).filter(Boolean))];
    if (editalIds.length > 0) {
      const { data: editaisInfo } = await supabase
        .from('editais')
        .select('id, numero, titulo, fonte')
        .in('id', editalIds.slice(0, 50));
      if (editaisInfo?.length) {
        console.log('   Editais afetados (amostra):');
        for (const e of editaisInfo.slice(0, 10)) {
          const ei = e as { numero?: string; fonte?: string; titulo?: string };
          console.log(`   - ${ei.numero || '?'} (${ei.fonte || '?'}) ${(ei.titulo || '').slice(0, 45)}...`);
        }
        if (editalIds.length > 10) {
          console.log(`   ... e mais ${editalIds.length - 10} edital(is)`);
        }
        console.log('');
      }
    }

    // 4) Atualizar edital_pdfs em lotes.
    const BATCH = 100;
    let updatedFalse = 0;
    for (let i = 0; i < toFalse.length; i += BATCH) {
      const batch = toFalse.slice(i, i + BATCH).map((x) => x.id);
      if (dryRun) {
        updatedFalse += batch.length;
        console.log(`   [dry-run] is_processed=false: ${updatedFalse}/${toFalse.length}`);
        continue;
      }
      const { error: updateError } = await supabase
        .from('edital_pdfs')
        .update({ is_processed: false })
        .in('id', batch);

      if (updateError) {
        if (updateError.message?.includes('is_processed') || updateError.message?.includes('column')) {
          console.warn('   ⚠️ Coluna edital_pdfs.is_processed não existe. Execute: scripts/db/migration-add-edital-pdfs-is-processed.sql');
        } else {
          console.error('❌ Erro ao atualizar edital_pdfs:', updateError.message);
          throw updateError;
        }
        break;
      }
      updatedFalse += batch.length;
      console.log(`   ✅ is_processed=false: ${updatedFalse}/${toFalse.length}`);
    }

    let updatedTrue = 0;
    for (let i = 0; i < toTrue.length; i += BATCH) {
      const batch = toTrue.slice(i, i + BATCH).map((x) => x.id);
      if (dryRun) {
        updatedTrue += batch.length;
        console.log(`   [dry-run] is_processed=true: ${updatedTrue}/${toTrue.length}`);
        continue;
      }
      const { error: updateError } = await supabase
        .from('edital_pdfs')
        .update({ is_processed: true })
        .in('id', batch);

      if (updateError) {
        if (updateError.message?.includes('is_processed') || updateError.message?.includes('column')) {
          console.warn('   ⚠️ Coluna edital_pdfs.is_processed não existe. Execute: scripts/db/migration-add-edital-pdfs-is-processed.sql');
        } else {
          console.error('❌ Erro ao atualizar edital_pdfs:', updateError.message);
          throw updateError;
        }
        break;
      }
      updatedTrue += batch.length;
      console.log(`   ✅ is_processed=true: ${updatedTrue}/${toTrue.length}`);
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                        RESUMO                             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`   is_processed=false: ${updatedFalse}${dryRun ? ' (simulado)' : ''}`);
    console.log(`   is_processed=true:  ${updatedTrue}${dryRun ? ' (simulado)' : ''}`);
    console.log(`   editais afetados (com pelo menos um PDF sem conteúdo): ${editalIds.length}`);
    console.log('');
  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Erro:', err);
    console.error('   Detalhes:', err.message);
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.includes('unmark-pdfs-without-document-content.ts')
) {
  unmarkPdfsWithoutDocumentContent()
    .then(() => {
      console.log('✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { unmarkPdfsWithoutDocumentContent };
