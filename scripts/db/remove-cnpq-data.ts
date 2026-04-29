// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    undefined;

const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
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
const STORAGE_BUCKET = 'edital-pdfs';

async function removeCNPqData() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     REMOÇÃO DE DADOS CNPq DO BANCO DE DADOS               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Buscar todos os editais do CNPq (buscar por variações comuns: cnpq, CNPq, CNPQ)
    console.log('📋 Passo 1: Buscando editais do CNPq...');
    const { data: cnpqEditais, error: editaisError } = await supabase
      .from('editais')
      .select('id, numero, titulo, fonte')
      .ilike('fonte', '%cnpq%');

    if (editaisError) {
      console.error('❌ Erro ao buscar editais:', editaisError);
      throw editaisError;
    }

    if (!cnpqEditais || cnpqEditais.length === 0) {
      console.log('✅ Nenhum edital do CNPq encontrado no banco.');
      return;
    }

    console.log(`   ✅ Encontrados ${cnpqEditais.length} edital(is) do CNPq`);
    
    // Mostrar alguns exemplos dos editais que serão removidos
    if (cnpqEditais.length > 0) {
      console.log('\n   📋 Exemplos de editais que serão removidos:');
      cnpqEditais.slice(0, 5).forEach((edital, idx) => {
        console.log(`      ${idx + 1}. ${edital.numero || 'Sem número'} - ${edital.titulo?.substring(0, 60) || 'Sem título'}...`);
      });
      if (cnpqEditais.length > 5) {
        console.log(`      ... e mais ${cnpqEditais.length - 5} edital(is)\n`);
      } else {
        console.log('');
      }
    }

    const editalIds = cnpqEditais.map(e => e.id);

    // 2. Buscar todos os PDFs relacionados
    console.log('📄 Passo 2: Buscando PDFs relacionados...');
    const { data: pdfs, error: pdfsError } = await supabase
      .from('edital_pdfs')
      .select('id, edital_id, nome_arquivo, caminho_storage, file_id')
      .in('edital_id', editalIds);

    if (pdfsError) {
      console.error('❌ Erro ao buscar PDFs:', pdfsError);
      throw pdfsError;
    }

    console.log(`   ✅ Encontrados ${pdfs?.length || 0} PDF(s) relacionados\n`);

    // 3. Buscar scores relacionados
    console.log('📊 Passo 3: Buscando scores relacionados...');
    const { data: scores, error: scoresError } = await supabase
      .from('edital_scores')
      .select('id, edital_id')
      .in('edital_id', editalIds);

    if (scoresError) {
      console.error('❌ Erro ao buscar scores:', scoresError);
      throw scoresError;
    }

    console.log(`   ✅ Encontrados ${scores?.length || 0} score(s) relacionado(s)\n`);

    // 4. Verificar se existe tabela documents e buscar documentos relacionados
    console.log('📑 Passo 4: Verificando documentos relacionados...');
    let documents: any[] = [];
    try {
      // Tentar buscar da tabela documents se existir
      const fileIds = pdfs?.map(p => p.file_id).filter(Boolean) || [];
      if (fileIds.length > 0) {
        const { data: docs, error: docsError } = await supabase
          .from('documents')
          .select('id, file_id')
          .in('file_id', fileIds);

        if (!docsError && docs) {
          documents = docs;
          console.log(`   ✅ Encontrados ${documents.length} documento(s) relacionado(s)\n`);
        } else {
          console.log('   ℹ️  Tabela "documents" não encontrada ou sem documentos relacionados\n');
        }
      } else {
        console.log('   ℹ️  Nenhum file_id disponível para buscar documentos\n');
      }
    } catch (err) {
      console.log('   ℹ️  Tabela "documents" não existe ou não acessível\n');
    }

    // Resumo antes de remover
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              RESUMO DO QUE SERÁ REMOVIDO                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`📋 Editais: ${cnpqEditais.length}`);
    console.log(`📄 PDFs do Storage: ${pdfs?.length || 0}`);
    console.log(`📊 Scores: ${scores?.length || 0}`);
    if (documents.length > 0) {
      console.log(`📑 Documentos: ${documents.length}`);
    }
    console.log('\n⚠️  ATENÇÃO: Esta operação irá remover TODOS os dados relacionados ao CNPq.');
    console.log('   - Editais do CNPq serão removidos');
    console.log('   - PDFs serão removidos do Supabase Storage');
    console.log('   - Registros de edital_pdfs serão removidos');
    console.log('   - Scores relacionados serão removidos');
    if (documents.length > 0) {
      console.log('   - Documentos relacionados serão removidos');
    }
    console.log('\n   Esta ação NÃO pode ser desfeita!\n');

    // 5. Remover PDFs do Storage
    console.log('🗑️  Removendo PDFs do Supabase Storage...');
    if (pdfs && pdfs.length > 0) {
      let removedCount = 0;
      let errorCount = 0;

      for (const pdf of pdfs) {
        try {
          // Tentar remover pelo caminho_storage
          const { error: removeError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([pdf.caminho_storage]);

          if (removeError) {
            console.warn(`   ⚠️  Erro ao remover ${pdf.nome_arquivo}: ${removeError.message}`);
            errorCount++;
          } else {
            removedCount++;
            console.log(`   ✅ Removido: ${pdf.nome_arquivo}`);
          }
        } catch (err: any) {
          console.warn(`   ⚠️  Erro ao remover ${pdf.nome_arquivo}: ${err.message}`);
          errorCount++;
        }
      }

      console.log(`\n   📊 Resultado: ${removedCount} removido(s), ${errorCount} erro(s)\n`);
    } else {
      console.log('   ℹ️  Nenhum PDF para remover\n');
    }

    // 6. Remover documentos da tabela documents (se existir)
    if (documents.length > 0) {
      console.log('🗑️  Removendo documentos da tabela documents...');
      const documentIds = documents.map(d => d.id);
      
      const { error: removeDocsError } = await supabase
        .from('documents')
        .delete()
        .in('id', documentIds);

      if (removeDocsError) {
        console.error('   ❌ Erro ao remover documentos:', removeDocsError);
      } else {
        console.log(`   ✅ Removidos ${documents.length} documento(s) da tabela documents\n`);
      }
    }

    // 7. Remover registros de edital_pdfs (CASCADE deve remover automaticamente, mas vamos garantir)
    console.log('🗑️  Removendo registros de edital_pdfs...');
    if (pdfs && pdfs.length > 0) {
      const pdfIds = pdfs.map(p => p.id);
      const { error: removePdfsError } = await supabase
        .from('edital_pdfs')
        .delete()
        .in('id', pdfIds);

      if (removePdfsError) {
        console.error('   ❌ Erro ao remover PDFs:', removePdfsError);
      } else {
        console.log(`   ✅ Removidos ${pdfs.length} registro(s) de edital_pdfs\n`);
      }
    }

    // 8. Remover registros de edital_scores (CASCADE deve remover automaticamente, mas vamos garantir)
    console.log('🗑️  Removendo registros de edital_scores...');
    if (scores && scores.length > 0) {
      const scoreIds = scores.map(s => s.id);
      const { error: removeScoresError } = await supabase
        .from('edital_scores')
        .delete()
        .in('id', scoreIds);

      if (removeScoresError) {
        console.error('   ❌ Erro ao remover scores:', removeScoresError);
      } else {
        console.log(`   ✅ Removidos ${scores.length} registro(s) de edital_scores\n`);
      }
    }

    // 9. Remover editais (isso deve fazer CASCADE e remover tudo relacionado)
    console.log('🗑️  Removendo editais do CNPq...');
    const { error: removeEditaisError } = await supabase
      .from('editais')
      .delete()
      .in('id', editalIds);

    if (removeEditaisError) {
      console.error('❌ Erro ao remover editais:', removeEditaisError);
      throw removeEditaisError;
    }

    console.log(`   ✅ Removidos ${cnpqEditais.length} edital(is) do CNPq\n`);

    // Resumo final
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMO DA REMOÇÃO                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`✅ Editais removidos: ${cnpqEditais.length}`);
    console.log(`✅ PDFs removidos do Storage: ${pdfs?.length || 0}`);
    console.log(`✅ Registros de edital_pdfs removidos: ${pdfs?.length || 0}`);
    console.log(`✅ Scores removidos: ${scores?.length || 0}`);
    if (documents.length > 0) {
      console.log(`✅ Documentos removidos: ${documents.length}`);
    }
    console.log('\n✅ Remoção concluída com sucesso!');
    console.log('   Agora você pode executar "npm run db:sync" para adicionar os dados atualizados do CNPq.\n');

  } catch (error: any) {
    console.error('\n❌ Erro durante a remoção:', error);
    console.error('   Detalhes:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('remove-cnpq-data.ts')) {
  removeCNPqData()
    .then(() => {
      console.log('✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

export { removeCNPqData };
