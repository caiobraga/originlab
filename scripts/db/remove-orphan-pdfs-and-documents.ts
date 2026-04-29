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
 * Remove:
 * 1. edital_pdfs cujo edital não existe mais (edital_id não está em editais)
 * 2. documents cujo file_id não está mais em edital_pdfs (porque o PDF foi removido ou nunca existiu)
 */
async function removeOrphanPdfsAndDocuments() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   LIMPEZA: edital_pdfs órfãos + documents órfãos           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // ─── Passo 1: edital_pdfs cujo edital não existe mais ───
    console.log('📄 Passo 1: Buscando edital_pdfs cujo edital não existe...');
    const { data: allPdfs, error: pdfsListError } = await supabase
      .from('edital_pdfs')
      .select('id, edital_id');

    if (pdfsListError) {
      console.error('❌ Erro ao buscar edital_pdfs:', pdfsListError);
      throw pdfsListError;
    }

    const { data: editaisIds, error: editaisError } = await supabase
      .from('editais')
      .select('id');

    if (editaisError) {
      console.error('❌ Erro ao buscar editais:', editaisError);
      throw editaisError;
    }

    const existingEditalIds = new Set((editaisIds || []).map((e) => e.id));
    const orphanPdfs = (allPdfs || []).filter(
      (p) => p.edital_id && !existingEditalIds.has(p.edital_id)
    );

    if (orphanPdfs.length === 0) {
      console.log('   ✅ Nenhum edital_pdf órfão (todos os PDFs têm edital existente).\n');
    } else {
      console.log(`   ⚠️  ${orphanPdfs.length} edital_pdf(s) órfão(s) (edital não existe mais).`);
      const BATCH = 100;
      let removedPdfs = 0;
      for (let i = 0; i < orphanPdfs.length; i += BATCH) {
        const batch = orphanPdfs.slice(i, i + BATCH);
        const ids = batch.map((p) => p.id);
        const { error: delError } = await supabase
          .from('edital_pdfs')
          .delete()
          .in('id', ids);
        if (delError) {
          console.error('   ❌ Erro ao remover edital_pdfs:', delError.message);
          throw delError;
        }
        removedPdfs += batch.length;
        console.log(`   ✅ Removidos ${removedPdfs}/${orphanPdfs.length} edital_pdf(s)`);
      }
      console.log('');
    }

    // ─── Passo 2: documents cujo file_id não está em edital_pdfs ───
    console.log('📑 Passo 2: Buscando documents órfãos (file_id sem edital_pdf)...');
    const { data: pdfsAfter, error: pdfsAfterError } = await supabase
      .from('edital_pdfs')
      .select('file_id')
      .not('file_id', 'is', null);

    if (pdfsAfterError) {
      console.error('❌ Erro ao buscar edital_pdfs:', pdfsAfterError);
      throw pdfsAfterError;
    }

    const validFileIds = new Set(
      (pdfsAfter || []).map((p) => p.file_id).filter(Boolean)
    );

    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, file_id');

    if (docsError) {
      console.error('❌ Erro ao buscar documents:', docsError);
      throw docsError;
    }

    if (!documents || documents.length === 0) {
      console.log('   ℹ️  Nenhum registro na tabela documents.\n');
      return;
    }

    const orphanDocs = documents.filter(
      (d) => d.file_id && !validFileIds.has(d.file_id)
    );

    if (orphanDocs.length === 0) {
      console.log('   ✅ Nenhum document órfão. Todos referenciam um edital_pdf.\n');
      return;
    }

    console.log(`   ⚠️  ${orphanDocs.length} documento(s) órfão(s) (file_id sem edital_pdf).`);
    const BATCH_DOC = 100;
    let removedDocs = 0;
    for (let i = 0; i < orphanDocs.length; i += BATCH_DOC) {
      const batch = orphanDocs.slice(i, i + BATCH_DOC);
      const ids = batch.map((d) => d.id);
      const { error: delError } = await supabase
        .from('documents')
        .delete()
        .in('id', ids);
      if (delError) {
        console.error('   ❌ Erro ao remover documents:', delError.message);
        throw delError;
      }
      removedDocs += batch.length;
      console.log(`   ✅ Removidos ${removedDocs}/${orphanDocs.length} documento(s)`);
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                        RESUMO                             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`   edital_pdfs removidos (edital inexistente): ${orphanPdfs.length}`);
    console.log(`   documents removidos (sem edital_pdf):      ${orphanDocs.length}`);
    console.log('');
  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Erro durante a limpeza:', err);
    console.error('   Detalhes:', err.message);
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.includes('remove-orphan-pdfs-and-documents.ts')
) {
  removeOrphanPdfsAndDocuments()
    .then(() => {
      console.log('✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { removeOrphanPdfsAndDocuments };
