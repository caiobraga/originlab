// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.SUPABASE_SERVICE_ROLE_KEY ||
                    process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não encontradas!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Normalizar título para comparação
const normalizeTitle = (t: string): string => {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .trim()
    .replace(/\s+/g, ' ') // Normaliza espaços
    .replace(/[^\w\s]/g, '') // Remove caracteres especiais exceto letras e números
    .substring(0, 200); // Limita tamanho
};

async function findDuplicates() {
  console.log('🔍 Buscando editais duplicados no banco de dados...\n');

  // Buscar todos os editais
  const { data: allEditais, error } = await supabase
    .from('editais')
    .select('id, numero, titulo, fonte, criado_em')
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('❌ Erro ao buscar editais:', error);
    process.exit(1);
  }

  if (!allEditais || allEditais.length === 0) {
    console.log('✅ Nenhum edital encontrado no banco.');
    return;
  }

  console.log(`📊 Total de editais no banco: ${allEditais.length}\n`);

  // Agrupar por título normalizado + fonte
  const groupedByTitle = new Map<string, Array<typeof allEditais[0]>>();

  for (const edital of allEditais) {
    const normalizedTitulo = normalizeTitle(edital.titulo || '');
    const key = `${normalizedTitulo}::${edital.fonte}`;
    
    if (!groupedByTitle.has(key)) {
      groupedByTitle.set(key, []);
    }
    groupedByTitle.get(key)!.push(edital);
  }

  // Encontrar grupos com mais de um edital (duplicatas)
  const duplicates: Array<{ key: string; editais: typeof allEditais }> = [];
  
  for (const [key, editais] of groupedByTitle.entries()) {
    if (editais.length > 1) {
      duplicates.push({ key, editais });
    }
  }

  if (duplicates.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada!\n');
    return;
  }

  console.log(`⚠️ Encontradas ${duplicates.length} duplicata(s):\n`);

  for (const { key, editais } of duplicates) {
    const [normalizedTitulo, fonte] = key.split('::');
    console.log(`📋 Título: "${editais[0].titulo?.substring(0, 60)}..."`);
    console.log(`   Fonte: ${fonte}`);
    console.log(`   Quantidade: ${editais.length}`);
    console.log(`   IDs:`);
    
    // Ordenar por data de criação (mais antigo primeiro)
    const sorted = [...editais].sort((a, b) => {
      const dateA = new Date(a.criado_em || 0).getTime();
      const dateB = new Date(b.criado_em || 0).getTime();
      return dateA - dateB;
    });

    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const isOldest = i === 0;
      const marker = isOldest ? '✅ MANTER' : '❌ REMOVER';
      console.log(`     ${marker} ${e.id} (criado em: ${e.criado_em || 'N/A'}, número: ${e.numero || 'N/A'})`);
    }
    console.log('');
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO');
  console.log('═'.repeat(50));
  console.log(`Total de editais únicos: ${groupedByTitle.size}`);
  console.log(`Total de duplicatas encontradas: ${duplicates.length}`);
  
  let totalToRemove = 0;
  for (const { editais } of duplicates) {
    totalToRemove += editais.length - 1; // Manter 1, remover o resto
  }
  console.log(`Total de editais a remover: ${totalToRemove}`);
  console.log(`Total de editais que permanecerão: ${allEditais.length - totalToRemove}`);
}

findDuplicates().catch(console.error);

