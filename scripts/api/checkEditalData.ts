// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';

/**
 * Verifica os dados salvos dos editais no banco
 */
async function checkEditalData(): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL;
  
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Variáveis de ambiente não encontradas!');
    throw new Error('Variáveis de ambiente do Supabase não configuradas');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\n📊 Verificando dados salvos dos editais...\n');

  // Buscar todos os editais com suas informações processadas
  const { data: editais, error } = await supabase
    .from('editais')
    .select('id, numero, titulo, valor_projeto, prazo_inscricao, localizacao, vagas, informacoes_processadas_em')
    .order('criado_em', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Erro ao buscar editais:', error);
    return;
  }

  if (!editais || editais.length === 0) {
    console.log('⚠️ Nenhum edital encontrado');
    return;
  }

  console.log(`📥 Total de editais encontrados: ${editais.length}\n`);

  // Estatísticas
  let naoInformadoCount = {
    valor_projeto: 0,
    prazo_inscricao: 0,
    localizacao: 0,
    vagas: 0,
  };

  let informadoCount = {
    valor_projeto: 0,
    prazo_inscricao: 0,
    localizacao: 0,
    vagas: 0,
  };

  // Mostrar detalhes de cada edital
  editais.forEach((edital, index) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📄 Edital ${index + 1}: ${edital.numero || 'N/A'} - ${edital.titulo?.substring(0, 50)}...`);
    console.log(`   ID: ${edital.id}`);
    console.log(`   Processado em: ${edital.informacoes_processadas_em || 'Não processado'}`);
    console.log(`\n   📊 Dados extraídos:`);
    
    // Valor por Projeto
    const valor = edital.valor_projeto || 'Não informado';
    if (valor === 'Não informado') {
      naoInformadoCount.valor_projeto++;
      console.log(`   ❌ Valor por Projeto: ${valor}`);
    } else {
      informadoCount.valor_projeto++;
      const valorPreview = valor.length > 100 ? valor.substring(0, 100) + '...' : valor;
      console.log(`   ✅ Valor por Projeto: ${valorPreview}`);
    }
    
    // Prazo de Inscrição
    const prazo = edital.prazo_inscricao || 'Não informado';
    if (prazo === 'Não informado') {
      naoInformadoCount.prazo_inscricao++;
      console.log(`   ❌ Prazo de Inscrição: ${prazo}`);
    } else {
      informadoCount.prazo_inscricao++;
      const prazoPreview = prazo.length > 100 ? prazo.substring(0, 100) + '...' : prazo;
      console.log(`   ✅ Prazo de Inscrição: ${prazoPreview}`);
    }
    
    // Localização
    const localizacao = edital.localizacao || 'Não informado';
    if (localizacao === 'Não informado') {
      naoInformadoCount.localizacao++;
      console.log(`   ❌ Localização: ${localizacao}`);
    } else {
      informadoCount.localizacao++;
      console.log(`   ✅ Localização: ${localizacao}`);
    }
    
    // Vagas
    const vagas = edital.vagas || 'Não informado';
    if (vagas === 'Não informado') {
      naoInformadoCount.vagas++;
      console.log(`   ❌ Vagas: ${vagas}`);
    } else {
      informadoCount.vagas++;
      console.log(`   ✅ Vagas: ${vagas}`);
    }
  });

  // Resumo estatístico
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 RESUMO ESTATÍSTICO');
  console.log(`${'═'.repeat(60)}`);
  console.log(`\n✅ Informações extraídas com sucesso:`);
  console.log(`   Valor por Projeto: ${informadoCount.valor_projeto}/${editais.length} (${Math.round(informadoCount.valor_projeto / editais.length * 100)}%)`);
  console.log(`   Prazo de Inscrição: ${informadoCount.prazo_inscricao}/${editais.length} (${Math.round(informadoCount.prazo_inscricao / editais.length * 100)}%)`);
  console.log(`   Localização: ${informadoCount.localizacao}/${editais.length} (${Math.round(informadoCount.localizacao / editais.length * 100)}%)`);
  console.log(`   Vagas: ${informadoCount.vagas}/${editais.length} (${Math.round(informadoCount.vagas / editais.length * 100)}%)`);
  
  console.log(`\n❌ Informações não encontradas (Não informado):`);
  console.log(`   Valor por Projeto: ${naoInformadoCount.valor_projeto}/${editais.length} (${Math.round(naoInformadoCount.valor_projeto / editais.length * 100)}%)`);
  console.log(`   Prazo de Inscrição: ${naoInformadoCount.prazo_inscricao}/${editais.length} (${Math.round(naoInformadoCount.prazo_inscricao / editais.length * 100)}%)`);
  console.log(`   Localização: ${naoInformadoCount.localizacao}/${editais.length} (${Math.round(naoInformadoCount.localizacao / editais.length * 100)}%)`);
  console.log(`   Vagas: ${naoInformadoCount.vagas}/${editais.length} (${Math.round(naoInformadoCount.vagas / editais.length * 100)}%)`);
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('checkEditalData')) {
  checkEditalData()
    .then(() => {
      console.log('\n✅ Verificação concluída!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}













