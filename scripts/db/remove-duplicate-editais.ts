// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';

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

// Normalizar título para comparação (mesma função usada em sync.ts)
const normalizeTitle = (t: string): string => {
  if (!t) return '';
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .trim()
    .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
    .replace(/[^\w\s]/g, '') // Remove caracteres especiais exceto letras e números
    .replace(/\b(n[oº°°]?|numero|num)\s*/gi, '') // Remove "Nº", "N°", "número", etc.
    .replace(/\b(edital|chamada|publica)\s*/gi, '') // Remove palavras comuns
    .trim()
    .substring(0, 200); // Limita tamanho
};

async function removeDuplicateEditais() {
  console.log('🔧 Removendo editais duplicados do banco de dados...\n');

  // Buscar todos os editais
  const { data: allEditais, error } = await supabase
    .from('editais')
    .select('id, numero, titulo, fonte, criado_em, atualizado_em, descricao, link, data_encerramento')
    .order('criado_em', { ascending: true });

  if (error) {
    console.error('❌ Erro ao buscar editais:', error);
    process.exit(1);
  }

  if (!allEditais || allEditais.length === 0) {
    console.log('✅ Nenhum edital encontrado no banco.');
    return;
  }

  console.log(`📊 Total de editais no banco: ${allEditais.length}\n`);

  // Agrupar por título normalizado + fonte E também por número + fonte
  const groupedByTitle = new Map<string, Array<typeof allEditais[0]>>();
  const groupedByNumero = new Map<string, Array<typeof allEditais[0]>>();
  
  for (const edital of allEditais) {
    // Agrupar por título normalizado + fonte
    const normalizedTitulo = normalizeTitle(edital.titulo || '');
    const keyTitle = `${normalizedTitulo}::${edital.fonte}`;
    
    if (!groupedByTitle.has(keyTitle)) {
      groupedByTitle.set(keyTitle, []);
    }
    groupedByTitle.get(keyTitle)!.push(edital);
    
    // Agrupar por número + fonte (se tiver número)
    if (edital.numero) {
      const keyNumero = `${edital.numero}::${edital.fonte}`;
      if (!groupedByNumero.has(keyNumero)) {
        groupedByNumero.set(keyNumero, []);
      }
      groupedByNumero.get(keyNumero)!.push(edital);
    }
  }

  // Encontrar grupos com mais de um edital (duplicatas)
  // Usar Set para evitar contar o mesmo edital duas vezes
  const duplicateIds = new Set<string>();
  const duplicates: Array<{ key: string; editais: typeof allEditais; type: 'title' | 'numero' }> = [];
  
  // Verificar duplicatas por título
  for (const [key, editais] of groupedByTitle.entries()) {
    if (editais.length > 1) {
      duplicates.push({ key, editais, type: 'title' });
      editais.forEach(e => duplicateIds.add(e.id));
    }
  }
  
  // Verificar duplicatas por número (pode ser mais preciso)
  for (const [key, editais] of groupedByNumero.entries()) {
    if (editais.length > 1) {
      // Só adicionar se ainda não foi adicionado por título
      const newDuplicates = editais.filter(e => !duplicateIds.has(e.id));
      if (newDuplicates.length > 0 || editais.length > 1) {
        duplicates.push({ key, editais, type: 'numero' });
        editais.forEach(e => duplicateIds.add(e.id));
      }
    }
  }

  if (duplicates.length === 0) {
    console.log('✅ Nenhuma duplicata encontrada!\n');
    return;
  }

  console.log(`⚠️ Encontradas ${duplicates.length} duplicata(s):\n`);

  let removedCount = 0;
  let keptCount = 0;
  const idsToRemove: string[] = [];

  for (const { key, editais, type } of duplicates) {
    const [normalizedTitulo, fonte] = key.split('::');
    console.log(`📋 ${type === 'title' ? 'Título' : 'Número'}: ${type === 'title' ? `"${editais[0].titulo?.substring(0, 60)}..."` : editais[0].numero}`);
    console.log(`   Fonte: ${fonte}`);
    console.log(`   Quantidade: ${editais.length}`);
    
    // Ordenar por data de criação (mais antigo primeiro) e completude
    const sorted = [...editais].sort((a, b) => {
      const dateA = new Date(a.criado_em || 0).getTime();
      const dateB = new Date(b.criado_em || 0).getTime();
      
      // Se tiver mais informações (descricao, link, data_encerramento), preferir
      const scoreA = (a.descricao ? 1 : 0) + (a.link ? 1 : 0) + (a.data_encerramento ? 1 : 0);
      const scoreB = (b.descricao ? 1 : 0) + (b.link ? 1 : 0) + (b.data_encerramento ? 1 : 0);
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Maior score primeiro
      }
      
      return dateA - dateB; // Mais antigo primeiro
    });

    // Manter o primeiro (mais completo e mais antigo)
    const toKeep = sorted[0];
    const toRemove = sorted.slice(1);

    console.log(`   ✅ MANTER: ${toKeep.id}`);
    console.log(`      - Criado em: ${toKeep.criado_em || 'N/A'}`);
    console.log(`      - Número: ${toKeep.numero || 'N/A'}`);
    console.log(`      - Completude: ${(toKeep.descricao ? 1 : 0) + (toKeep.link ? 1 : 0) + (toKeep.data_encerramento ? 1 : 0)} campos`);
    
    for (const edital of toRemove) {
      console.log(`   ❌ REMOVER: ${edital.id}`);
      console.log(`      - Criado em: ${edital.criado_em || 'N/A'}`);
      console.log(`      - Número: ${edital.numero || 'N/A'}`);
      idsToRemove.push(edital.id);
    }
    
    keptCount++;
    console.log('');
  }

  if (idsToRemove.length === 0) {
    console.log('✅ Nenhum edital para remover.\n');
    return;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO ANTES DA REMOÇÃO');
  console.log('═'.repeat(50));
  console.log(`Total de editais únicos: ${groupedByTitle.size}`);
  console.log(`Total de duplicatas encontradas: ${duplicates.length}`);
  console.log(`Editais a manter: ${keptCount}`);
  console.log(`Editais a remover: ${idsToRemove.length}`);
  console.log(`Total de editais após remoção: ${allEditais.length - idsToRemove.length}`);
  console.log('');

  // Confirmar antes de remover
  console.log('⚠️  ATENÇÃO: Esta operação irá remover editais duplicados do banco de dados.');
  console.log('   Os PDFs relacionados serão removidos automaticamente (CASCADE).');
  console.log('   Os scores relacionados também serão removidos automaticamente.\n');

  // Remover editais duplicados em batch para melhor performance
  // IMPORTANTE: O CASCADE vai remover automaticamente os PDFs e scores relacionados
  console.log('🗑️  Removendo editais duplicados...\n');
  
  // Remover em batches de 10 para evitar timeouts
  const batchSize = 10;
  for (let i = 0; i < idsToRemove.length; i += batchSize) {
    const batch = idsToRemove.slice(i, i + batchSize);
    
    // Remover batch usando .in() para melhor performance
    const { error: deleteError } = await supabase
      .from('editais')
      .delete()
      .in('id', batch);
    
    if (deleteError) {
      console.error(`   ⚠️ Erro ao remover batch ${i / batchSize + 1}:`, deleteError.message);
      // Tentar remover um por um se o batch falhar
      for (const id of batch) {
        const { error: singleError } = await supabase
          .from('editais')
          .delete()
          .eq('id', id);
        
        if (singleError) {
          console.error(`     ⚠️ Erro ao remover edital ${id}:`, singleError.message);
        } else {
          removedCount++;
        }
      }
    } else {
      removedCount += batch.length;
      console.log(`   ✅ Removidos ${Math.min(removedCount, idsToRemove.length)}/${idsToRemove.length} editais...`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO FINAL');
  console.log('═'.repeat(50));
  console.log(`Total de grupos únicos: ${groupedByTitle.size}`);
  console.log(`Total de duplicatas encontradas: ${duplicates.length}`);
  console.log(`Editais mantidos: ${keptCount}`);
  console.log(`Editais removidos: ${removedCount}`);
  console.log(`Total de editais após limpeza: ${allEditais.length - removedCount}`);
  console.log('');
  
  if (removedCount === idsToRemove.length) {
    console.log('✅ Limpeza concluída com sucesso!');
  } else {
    console.log(`⚠️  Aviso: ${idsToRemove.length - removedCount} editais não puderam ser removidos.`);
  }
}

removeDuplicateEditais().catch(console.error);

