// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';

/**
 * Corrige os flags is_researcher e is_company de um edital específico
 */
async function fixEditalFlags() {
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

  // Buscar o edital pelo título
  const tituloBusca = 'MARIE SKLODOWSKA-CURIE';
  
  console.log(`\n🔍 Buscando edital: ${tituloBusca}...\n`);

  const { data: editais, error } = await supabase
    .from('editais')
    .select('id, titulo, is_researcher, is_company')
    .ilike('titulo', `%${tituloBusca}%`);

  if (error) {
    console.error('❌ Erro ao buscar edital:', error);
    return;
  }

  if (!editais || editais.length === 0) {
    console.log('⚠️ Nenhum edital encontrado com esse título');
    return;
  }

  console.log(`📋 Encontrados ${editais.length} edital(is):\n`);
  editais.forEach((edital, index) => {
    console.log(`${index + 1}. ${edital.titulo}`);
    console.log(`   ID: ${edital.id}`);
    console.log(`   is_researcher: ${edital.is_researcher}`);
    console.log(`   is_company: ${edital.is_company}\n`);
  });

  // Corrigir cada edital encontrado
  for (const edital of editais) {
    console.log(`\n🔧 Corrigindo edital: ${edital.titulo}`);
    console.log(`   Antes: is_researcher=${edital.is_researcher}, is_company=${edital.is_company}`);
    
    // MSCA é para pesquisadores, não empresas
    const updateData = {
      is_researcher: true,
      is_company: false,
    };

    const { error: updateError } = await supabase
      .from('editais')
      .update(updateData)
      .eq('id', edital.id);

    if (updateError) {
      console.error(`   ❌ Erro ao atualizar: ${updateError.message}`);
    } else {
      console.log(`   ✅ Atualizado: is_researcher=true, is_company=false`);
    }
  }

  console.log('\n✅ Correção concluída!');
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('fixEditalFlags')) {
  fixEditalFlags()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}

