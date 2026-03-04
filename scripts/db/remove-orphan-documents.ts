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

async function removeOrphanDocuments() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   REMOÇÃO DE DOCUMENTOS ÓRFÃOS (sem edital associado)   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Buscar todos os file_id que estão referenciados em edital_pdfs (pertencem a um edital)
    console.log('📄 Passo 1: Buscando file_ids referenciados em edital_pdfs...');
    const { data: pdfs, error: pdfsError } = await supabase
      .from('edital_pdfs')
      .select('file_id')
      .not('file_id', 'is', null);

    if (pdfsError) {
      console.error('❌ Erro ao buscar edital_pdfs:', pdfsError);
      throw pdfsError;
    }

    const referencedFileIds = new Set(
      (pdfs || []).map((p) => p.file_id).filter(Boolean)
    );
    console.log(`   ✅ ${referencedFileIds.size} file_id(s) vinculados a editais\n`);

    // 2. Buscar todos os registros da tabela documents
    console.log('📑 Passo 2: Buscando todos os documentos...');
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, file_id');

    if (docsError) {
      console.error('❌ Erro ao buscar documents:', docsError);
      throw docsError;
    }

    if (!documents || documents.length === 0) {
      console.log('   ℹ️  Nenhum registro na tabela documents.');
      return;
    }

    console.log(`   ✅ ${documents.length} documento(s) na tabela\n`);

    // 3. Identificar órfãos: documents cujo file_id não está em edital_pdfs
    const orphanDocs = documents.filter(
      (d) => d.file_id && !referencedFileIds.has(d.file_id)
    );

    if (orphanDocs.length === 0) {
      console.log('✅ Nenhum documento órfão encontrado. Todos referenciam um edital.');
      return;
    }

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              DOCUMENTOS ÓRFÃOS A REMOVER                  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`📑 Total: ${orphanDocs.length} documento(s) sem edital associado\n`);
    console.log('⚠️  Estes registros serão removidos da tabela documents.\n');

    // 4. Remover em lotes (evitar payload muito grande)
    const BATCH = 100;
    let removed = 0;
    for (let i = 0; i < orphanDocs.length; i += BATCH) {
      const batch = orphanDocs.slice(i, i + BATCH);
      const ids = batch.map((d) => d.id);
      const { error: delError } = await supabase
        .from('documents')
        .delete()
        .in('id', ids);

      if (delError) {
        console.error(`   ❌ Erro ao remover lote: ${delError.message}`);
        throw delError;
      }
      removed += batch.length;
      console.log(`   ✅ Removidos ${removed}/${orphanDocs.length} documento(s)`);
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMO DA REMOÇÃO                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`✅ Documentos órfãos removidos: ${orphanDocs.length}\n`);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Erro durante a remoção:', err);
    console.error('   Detalhes:', err.message);
    process.exit(1);
  }
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.includes('remove-orphan-documents.ts')
) {
  removeOrphanDocuments()
    .then(() => {
      console.log('✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { removeOrphanDocuments };
