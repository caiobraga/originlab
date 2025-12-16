// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';
import { 
  processEditalInfo, 
  updateEditalInfo, 
  fetchEditaisToProcess 
} from './processEditalInfo';

/**
 * Força a atualização de TODOS os editais, mesmo os já processados
 */
export async function updateAllEditaisInfo(): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                      process.env.SUPABASE_URL || 
                      process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Variáveis de ambiente não encontradas!');
    console.error('   Configure no arquivo .env.local:');
    console.error('   VITE_SUPABASE_URL=https://seu-projeto.supabase.co');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role\n');
    throw new Error('Variáveis de ambiente do Supabase não configuradas');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n🔄 Iniciando ATUALIZAÇÃO FORÇADA de informações dos editais...');
  console.log('⚠️  Todos os editais serão reprocessados, mesmo os já processados.\n');

  // Buscar TODOS os editais (incluindo processados)
  const editais = await fetchEditaisToProcess(supabase, true);

  if (!editais || editais.length === 0) {
    console.log('⚠️ Nenhum edital encontrado no banco de dados');
    return;
  }

  console.log(`📊 Total de editais encontrados: ${editais.length}`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ edital: string; error: string }> = [];

  // Processar cada edital (forçando atualização)
  for (const edital of editais) {
    try {
      const processedInfo = await processEditalInfo(supabase, edital);
      
      // Atualizar no banco usando a função exportada
      await updateEditalInfo(supabase, edital.id, processedInfo);

      successCount++;
      console.log(`  ✅ Edital atualizado com sucesso\n`);
    } catch (error) {
      errorCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({
        edital: `${edital.numero || 'N/A'} - ${edital.titulo}`,
        error: errorMsg,
      });
      console.error(`  ❌ Erro ao atualizar edital: ${errorMsg}\n`);
    }
  }

  // Resumo
  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO DA ATUALIZAÇÃO');
  console.log('═'.repeat(50));
  console.log(`📥 Editais encontrados: ${editais.length}`);
  console.log(`✅ Editais atualizados com sucesso: ${successCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Detalhes dos erros:');
    errors.forEach(({ edital, error }) => {
      console.log(`   - ${edital}: ${error}`);
    });
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('updateEditalInfo')) {
  updateAllEditaisInfo()
    .then(() => {
      console.log('\n✅ Atualização concluída!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}

