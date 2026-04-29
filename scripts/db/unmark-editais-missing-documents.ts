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

/** Limite opcional: máximo de edital_pdfs a marcar is_processed = false (e editais afetados). Via argumento ou env UNMARK_LIMIT. */
function getLimit(): number | null {
  const fromEnv = process.env.UNMARK_LIMIT;
  if (fromEnv) {
    const n = parseInt(fromEnv, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  const arg = process.argv[2];
  if (arg) {
    const n = parseInt(arg, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

/**
 * Marca como não processados:
 * 1. Editais que não têm document para todos os PDFs → editais.informacoes_processadas_em = null
 * 2. Cada PDF (edital_pdfs) sem document → edital_pdfs.is_processed = false
 * Aceita limite opcional: npm run db:unmark-editais-missing-documents -- 100 ou UNMARK_LIMIT=100
 */
async function unmarkEditaisMissingDocuments() {
  const limit = getLimit();

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   DESMARCAR EDITAIS E EDITAL_PDFs SEM DOCUMENTS           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  if (limit !== null) {
    console.log(`   Limite: processar no máximo ${limit} edital_pdf(s).`);
  }
  console.log('   • editais.informacoes_processadas_em = null (edital com algum PDF sem document)');
  console.log('   • edital_pdfs.is_processed = false (PDF sem registro em documents)');
  console.log('   Coluna edital_pdfs.is_processed: execute migration-add-edital-pdfs-is-processed.sql se não existir.\n');

  try {
    // 1. Buscar todos os file_id que têm document
    console.log('📑 Passo 1: Buscando file_ids presentes em documents...');
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('file_id')
      .not('file_id', 'is', null);

    if (docsError) {
      console.error('❌ Erro ao buscar documents:', docsError);
      throw docsError;
    }

    const normalizeFileId = (x: string | null | undefined) => (x != null ? String(x).trim() : '');
    const fileIdsWithDocument = new Set(
      (documents || [])
        .map((d) => normalizeFileId(d.file_id))
        .filter((id) => id.length > 0)
    );
    console.log(`   ✅ ${fileIdsWithDocument.size} file_id(s) com document\n`);

    // 2. Buscar todos os edital_pdfs com file_id (id para atualizar is_processed; edital_id para editais)
    console.log('📄 Passo 2: Buscando edital_pdfs por edital...');
    const { data: pdfs, error: pdfsError } = await supabase
      .from('edital_pdfs')
      .select('id, edital_id, file_id')
      .not('file_id', 'is', null);

    if (pdfsError) {
      console.error('❌ Erro ao buscar edital_pdfs:', pdfsError);
      throw pdfsError;
    }

    const pdfsByEdital = new Map<string, string[]>();
    const pdfsWithoutDoc: { id: string; edital_id: string }[] = []; // só PDFs cujo file_id NÃO está em documents
    for (const p of pdfs || []) {
      if (!p.edital_id || !p.file_id) continue;
      const list = pdfsByEdital.get(p.edital_id) || [];
      list.push(p.file_id);
      pdfsByEdital.set(p.edital_id, list);
      const fileIdNorm = normalizeFileId(p.file_id);
      if (!fileIdNorm || !fileIdsWithDocument.has(fileIdNorm)) {
        pdfsWithoutDoc.push({ id: p.id, edital_id: p.edital_id });
      }
    }
    const totalPdfsWithoutDoc = pdfsWithoutDoc.length;
    const pdfIdsToUnmark = limit !== null
      ? pdfsWithoutDoc.slice(0, limit).map((x) => x.id)
      : pdfsWithoutDoc.map((x) => x.id);
    const editalIdsFromLimitedPdfs = limit !== null
      ? [...new Set(pdfsWithoutDoc.slice(0, limit).map((x) => x.edital_id))]
      : null;

    console.log(`   ✅ ${pdfsByEdital.size} edital(is) com pelo menos um PDF (file_id)`);
    console.log(`   ✅ ${totalPdfsWithoutDoc} edital_pdf(s) sem document`);
    if (limit !== null) {
      console.log(`   📌 Aplicando limite: ${pdfIdsToUnmark.length} edital_pdf(s) e ${editalIdsFromLimitedPdfs!.length} edital(is) afetado(s)\n`);
    } else {
      console.log('');
    }

    // 3. Editais a desmarcar: todos com PDF sem document, ou só os afetados pelo limite
    const editalIdsToUnmark: string[] = editalIdsFromLimitedPdfs ?? (() => {
      const out: string[] = [];
      for (const [editalId, fileIds] of pdfsByEdital) {
        if (fileIds.some((fid) => !fileIdsWithDocument.has(fid))) out.push(editalId);
      }
      return out;
    })();

    if (editalIdsToUnmark.length === 0 && pdfIdsToUnmark.length === 0) {
      console.log('✅ Nenhum edital nem edital_pdf sem document. Nada a desmarcar.\n');
      return;
    }

    if (editalIdsToUnmark.length > 0) {
      console.log(`⚠️  ${editalIdsToUnmark.length} edital(is) com pelo menos um PDF sem document.`);
      console.log('   Será definido informacoes_processadas_em = null nesses editais.\n');
    }

    // 4. Buscar numero/titulo para exibir (opcional)
    if (editalIdsToUnmark.length > 0) {
      const { data: editaisInfo } = await supabase
        .from('editais')
        .select('id, numero, titulo, fonte')
        .in('id', editalIdsToUnmark);

      if (editaisInfo?.length) {
        console.log('   Editais a desmarcar:');
        for (const e of editaisInfo.slice(0, 20)) {
          console.log(`   - ${e.numero || '?'} (${e.fonte}) ${(e.titulo || '').slice(0, 50)}...`);
        }
        if (editaisInfo.length > 20) {
          console.log(`   ... e mais ${editaisInfo.length - 20} edital(is)`);
        }
        console.log('');
      }
    }

    // 5. Atualizar editais em lotes: informacoes_processadas_em = null
    const BATCH = 50;
    let updatedEditais = 0;
    for (let i = 0; i < editalIdsToUnmark.length; i += BATCH) {
      const batch = editalIdsToUnmark.slice(i, i + BATCH);
      const { error: updateError } = await supabase
        .from('editais')
        .update({ informacoes_processadas_em: null })
        .in('id', batch);

      if (updateError) {
        console.error('❌ Erro ao atualizar editais:', updateError.message);
        throw updateError;
      }
      updatedEditais += batch.length;
      console.log(`   ✅ Editais desmarcados ${updatedEditais}/${editalIdsToUnmark.length}`);
    }

    // 6. Atualizar edital_pdfs em lotes: is_processed = false (PDFs sem document)
    let updatedPdfs = 0;
    if (pdfIdsToUnmark.length > 0) {
      console.log('');
      const BATCH_PDF = 100;
      for (let i = 0; i < pdfIdsToUnmark.length; i += BATCH_PDF) {
        const batch = pdfIdsToUnmark.slice(i, i + BATCH_PDF);
        const { error: pdfUpdateError } = await supabase
          .from('edital_pdfs')
          .update({ is_processed: false })
          .in('id', batch);

        if (pdfUpdateError) {
          if (pdfUpdateError.message?.includes('is_processed') || pdfUpdateError.message?.includes('column')) {
            console.warn('   ⚠️ Coluna edital_pdfs.is_processed não existe. Execute: scripts/db/migration-add-edital-pdfs-is-processed.sql');
          } else {
            console.error('❌ Erro ao atualizar edital_pdfs:', pdfUpdateError.message);
            throw pdfUpdateError;
          }
          break;
        }
        updatedPdfs += batch.length;
        console.log(`   ✅ edital_pdfs.is_processed = false: ${updatedPdfs}/${pdfIdsToUnmark.length}`);
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                        RESUMO                             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`   editais.informacoes_processadas_em = null: ${editalIdsToUnmark.length}`);
    console.log(`   edital_pdfs.is_processed = false:         ${updatedPdfs}`);
    if (limit !== null && totalPdfsWithoutDoc > limit) {
      console.log(`   (limite ${limit} de ${totalPdfsWithoutDoc} disponíveis)`);
    }
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
  process.argv[1]?.includes('unmark-editais-missing-documents.ts')
) {
  unmarkEditaisMissingDocuments()
    .then(() => {
      console.log('✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { unmarkEditaisMissingDocuments };
