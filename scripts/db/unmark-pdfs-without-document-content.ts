// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

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

/** Colunas de conteúdo tentadas pelo RAG (ollama-edital.ts). */
const CONTENT_COLUMNS = ['name', 'content', 'text', 'body', 'page_content', 'chunk'] as const;

/**
 * Marca como não processados (is_processed = false) os edital_pdfs para os quais
 * a tabela documents não retorna conteúdo (mesmo critério do Ollama RAG):
 * - não existe registro em documents para o file_id, ou
 * - existe registro mas todas as colunas de conteúdo estão vazias.
 *
 * Uso: npm run db:unmark-pdfs-without-document-content
 */
async function unmarkPdfsWithoutDocumentContent() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   MARCAR EDITAL_PDFs SEM CONTEÚDO EM DOCUMENTS (RAG)      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('   • edital_pdfs.is_processed = false quando documents não tem conteúdo para o file_id');
  console.log('   (mesmo critério do aviso "tabela documents não retornou conteúdo").\n');

  try {
    // 1. Buscar file_ids que têm pelo menos um conteúdo não vazio em documents
    console.log('📑 Passo 1: Buscando file_ids em documents com conteúdo (name, content, text, body, page_content, chunk)...');
    const fileIdsWithContent = new Set<string>();

    for (const col of CONTENT_COLUMNS) {
      let rows: unknown[] | null = null;
      let error: { message: string } | null = null;
      const res = await supabase.from('documents').select('file_id, metadata, ' + col);
      error = res.error;
      rows = res.data;

      if (error) {
        if (process.env.OLLAMA_DEBUG_RAG === '1') {
          console.warn(`   [debug] coluna "${col}": ${error.message}`);
        }
        continue;
      }
      for (const row of rows || []) {
        const r = row as unknown as Record<string, unknown>;
        const content = r[col];
        const fid = (typeof r.file_id === 'string' && r.file_id.trim() ? r.file_id : null) ||
          (typeof (r.metadata as Record<string, unknown>)?.file_id === 'string' ? (r.metadata as Record<string, unknown>).file_id as string : null);
        if (fid && fid.trim() && typeof content === 'string' && content.trim().length > 0) {
          fileIdsWithContent.add(fid.trim());
        }
      }
    }

    console.log(`   ✅ ${fileIdsWithContent.size} file_id(s) com conteúdo em documents\n`);

    if (fileIdsWithContent.size === 0) {
      console.log('⚠️  Nenhum registro em documents tem conteúdo (colunas name, content, text, body, page_content ou chunk).');
      console.log('   Para não desmarcar todos os PDFs, nenhuma alteração foi feita.');
      console.log('   Verifique no Supabase se a tabela documents existe e qual é o nome da coluna de texto.');
      console.log('   Se a tabela estiver vazia ou com outro esquema, popule documents primeiro e rode o script de novo.\n');
      return;
    }

    // 2. Buscar todos os edital_pdfs (id e file_id; o RAG usa file_id quando existe, senão id)
    console.log('📄 Passo 2: Buscando edital_pdfs...');
    const { data: pdfs, error: pdfsError } = await supabase
      .from('edital_pdfs')
      .select('id, file_id, edital_id');

    if (pdfsError) {
      console.error('❌ Erro ao buscar edital_pdfs:', pdfsError);
      throw pdfsError;
    }

    const normalize = (x: string | null | undefined) => (x != null ? String(x).trim() : '');
    const pdfsWithoutContent: { id: string; edital_id: string }[] = [];

    for (const p of pdfs || []) {
      const r = p as { id: string; file_id?: string | null; edital_id?: string | null };
      const docKey1 = normalize(r.file_id) || normalize(r.id);
      const docKey2 = r.file_id ? normalize(r.id) : '';
      const hasContent = (docKey1 && fileIdsWithContent.has(docKey1)) || (docKey2 && fileIdsWithContent.has(docKey2));
      if (!hasContent) {
        pdfsWithoutContent.push({ id: String(r.id), edital_id: String(r.edital_id || '') });
      }
    }

    console.log(`   ✅ ${(pdfs || []).length} edital_pdf(s) no total`);
    console.log(`   ✅ ${pdfsWithoutContent.length} edital_pdf(s) sem conteúdo em documents\n`);

    if (pdfsWithoutContent.length === 0) {
      console.log('✅ Nenhum edital_pdf sem conteúdo. Nada a desmarcar.\n');
      return;
    }

    // 3. Opcional: listar alguns editais afetados
    const editalIds = [...new Set(pdfsWithoutContent.map((x) => x.edital_id).filter(Boolean))];
    if (editalIds.length > 0) {
      const { data: editaisInfo } = await supabase
        .from('editais')
        .select('id, numero, titulo, fonte')
        .in('id', editalIds.slice(0, 50));
      if (editaisInfo?.length) {
        console.log('   Editais com PDFs sem conteúdo (amostra):');
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

    // 4. Atualizar edital_pdfs em lotes: is_processed = false
    const BATCH = 100;
    let updated = 0;
    for (let i = 0; i < pdfsWithoutContent.length; i += BATCH) {
      const batch = pdfsWithoutContent.slice(i, i + BATCH).map((x) => x.id);
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
      updated += batch.length;
      console.log(`   ✅ edital_pdfs.is_processed = false: ${updated}/${pdfsWithoutContent.length}`);
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                        RESUMO                             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`   edital_pdfs.is_processed = false: ${updated}`);
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
