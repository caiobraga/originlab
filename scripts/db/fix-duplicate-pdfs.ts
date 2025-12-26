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

// Normalizar nome do arquivo para comparação
const normalizeFileName = (fileName: string): string => {
  if (!fileName) return '';
  return fileName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .trim()
    .replace(/\s+/g, '_') // Normaliza espaços para underscore
    .replace(/[^\w._-]/g, '') // Remove caracteres especiais exceto letras, números, underscore, ponto e hífen
    .replace(/\.pdf$/i, ''); // Remove extensão .pdf para comparação
};

async function fixDuplicatePdfs() {
  console.log('🔧 Removendo PDFs duplicados do banco de dados...\n');

  // Buscar todos os PDFs com informações do edital
  const { data: allPdfs, error } = await supabase
    .from('edital_pdfs')
    .select(`
      id, 
      nome_arquivo, 
      caminho_storage, 
      edital_id, 
      criado_em, 
      tamanho_bytes,
      editais:titulo,
      editais:numero,
      editais:fonte
    `)
    .order('criado_em', { ascending: true });

  if (error) {
    console.error('❌ Erro ao buscar PDFs:', error);
    process.exit(1);
  }

  if (!allPdfs || allPdfs.length === 0) {
    console.log('✅ Nenhum PDF encontrado no banco.');
    return;
  }

  console.log(`📊 Total de PDFs no banco: ${allPdfs.length}\n`);

  // Agrupar por múltiplos critérios para detectar diferentes tipos de duplicatas
  const groupedByPath = new Map<string, typeof allPdfs>(); // caminho_storage + edital_id
  const groupedByName = new Map<string, typeof allPdfs>(); // nome_arquivo normalizado + edital_id
  const groupedByStoragePath = new Map<string, typeof allPdfs>(); // apenas caminho_storage (mesmo arquivo em editais diferentes)
  
  for (const pdf of allPdfs) {
    const edital = pdf.editais as any;
    const editalTitulo = edital?.titulo || 'Sem título';
    const editalNumero = edital?.numero || 'N/A';
    const editalFonte = edital?.fonte || 'unknown';
    
    // Agrupar por caminho_storage + edital_id
    const keyPath = `${pdf.caminho_storage.toLowerCase().trim()}::${pdf.edital_id}`;
    if (!groupedByPath.has(keyPath)) {
      groupedByPath.set(keyPath, []);
    }
    groupedByPath.get(keyPath)!.push(pdf);
    
    // Agrupar por nome_arquivo normalizado + edital_id
    const normalizedName = normalizeFileName(pdf.nome_arquivo || '');
    const keyName = `${normalizedName}::${pdf.edital_id}`;
    if (!groupedByName.has(keyName)) {
      groupedByName.set(keyName, []);
    }
    groupedByName.get(keyName)!.push(pdf);
    
    // Agrupar apenas por caminho_storage (mesmo arquivo físico)
    const keyStorage = pdf.caminho_storage.toLowerCase().trim();
    if (!groupedByStoragePath.has(keyStorage)) {
      groupedByStoragePath.set(keyStorage, []);
    }
    groupedByStoragePath.get(keyStorage)!.push(pdf);
  }

  // Encontrar grupos com mais de um PDF (duplicatas)
  const duplicates: Array<{ 
    key: string; 
    pdfs: typeof allPdfs; 
    type: 'path' | 'name' | 'storage';
    editalInfo?: string;
  }> = [];
  
  // Duplicatas por caminho_storage + edital_id
  for (const [key, pdfs] of groupedByPath.entries()) {
    if (pdfs.length > 1) {
      const edital = pdfs[0].editais as any;
      duplicates.push({ 
        key, 
        pdfs, 
        type: 'path',
        editalInfo: `${edital?.titulo || 'N/A'} (${edital?.fonte || 'unknown'})`
      });
    }
  }
  
  // Duplicatas por nome normalizado + edital_id (mesmo arquivo com caminhos diferentes)
  for (const [key, pdfs] of groupedByName.entries()) {
    if (pdfs.length > 1) {
      // Verificar se são realmente duplicatas (mesmo nome mas caminhos diferentes)
      const uniquePaths = new Set(pdfs.map(p => p.caminho_storage.toLowerCase().trim()));
      if (uniquePaths.size < pdfs.length) {
        const edital = pdfs[0].editais as any;
        duplicates.push({ 
          key, 
          pdfs, 
          type: 'name',
          editalInfo: `${edital?.titulo || 'N/A'} (${edital?.fonte || 'unknown'})`
        });
      }
    }
  }
  
  // Duplicatas por caminho_storage (mesmo arquivo físico em editais diferentes)
  for (const [key, pdfs] of groupedByStoragePath.entries()) {
    if (pdfs.length > 1) {
      const uniqueEditais = new Set(pdfs.map(p => p.edital_id));
      if (uniqueEditais.size < pdfs.length) {
        // Mesmo arquivo físico associado ao mesmo edital múltiplas vezes
        duplicates.push({ 
          key, 
          pdfs, 
          type: 'storage',
          editalInfo: `Múltiplos editais`
        });
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
  const idsToRemove = new Set<string>();

  for (const { key, pdfs, type, editalInfo } of duplicates) {
    const edital = pdfs[0].editais as any;
    const editalTitulo = edital?.titulo || 'Sem título';
    const editalNumero = edital?.numero || 'N/A';
    const editalFonte = edital?.fonte || 'unknown';
    
    console.log(`📋 Tipo: ${type === 'path' ? 'Caminho + Edital' : type === 'name' ? 'Nome + Edital' : 'Caminho Storage'}`);
    console.log(`   Edital: ${editalTitulo.substring(0, 60)}...`);
    console.log(`   Número: ${editalNumero} | Fonte: ${editalFonte}`);
    console.log(`   Quantidade: ${pdfs.length}`);
    
    // Ordenar por data de criação (mais antigo primeiro) e manter o mais completo
    const sorted = [...pdfs].sort((a, b) => {
      const dateA = new Date(a.criado_em || 0).getTime();
      const dateB = new Date(b.criado_em || 0).getTime();
      
      // Se tiver tamanho_bytes, preferir o que tem
      if (a.tamanho_bytes && !b.tamanho_bytes) return -1;
      if (!a.tamanho_bytes && b.tamanho_bytes) return 1;
      
      return dateA - dateB;
    });

    // Manter o primeiro (mais antigo e mais completo)
    const toKeep = sorted[0];
    const toRemove = sorted.slice(1);

    console.log(`   ✅ MANTER: ${toKeep.id}`);
    console.log(`      - Arquivo: ${toKeep.nome_arquivo}`);
    console.log(`      - Caminho: ${toKeep.caminho_storage}`);
    console.log(`      - Criado em: ${toKeep.criado_em || 'N/A'}`);
    console.log(`      - Tamanho: ${toKeep.tamanho_bytes ? `${(toKeep.tamanho_bytes / 1024).toFixed(2)} KB` : 'N/A'}`);
    
    for (const pdf of toRemove) {
      console.log(`   ❌ REMOVER: ${pdf.id}`);
      console.log(`      - Arquivo: ${pdf.nome_arquivo}`);
      console.log(`      - Caminho: ${pdf.caminho_storage}`);
      console.log(`      - Criado em: ${pdf.criado_em || 'N/A'}`);
      idsToRemove.add(pdf.id);
    }
    
    keptCount++;
    console.log('');
  }

  if (idsToRemove.size === 0) {
    console.log('✅ Nenhum PDF para remover.\n');
    return;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO ANTES DA REMOÇÃO');
  console.log('═'.repeat(50));
  console.log(`Total de PDFs no banco: ${allPdfs.length}`);
  console.log(`Total de duplicatas encontradas: ${duplicates.length}`);
  console.log(`PDFs a manter: ${keptCount}`);
  console.log(`PDFs a remover: ${idsToRemove.size}`);
  console.log(`Total de PDFs após remoção: ${allPdfs.length - idsToRemove.size}`);
  console.log('');

  // Remover PDFs duplicados em batch
  console.log('🗑️  Removendo PDFs duplicados...\n');
  
  const idsArray = Array.from(idsToRemove);
  const batchSize = 10;
  
  for (let i = 0; i < idsArray.length; i += batchSize) {
    const batch = idsArray.slice(i, i + batchSize);
    
    const { error: deleteError } = await supabase
      .from('edital_pdfs')
      .delete()
      .in('id', batch);
    
    if (deleteError) {
      console.error(`   ⚠️ Erro ao remover batch ${i / batchSize + 1}:`, deleteError.message);
      // Tentar remover um por um se o batch falhar
      for (const id of batch) {
        const { error: singleError } = await supabase
          .from('edital_pdfs')
          .delete()
          .eq('id', id);
        
        if (singleError) {
          console.error(`     ⚠️ Erro ao remover PDF ${id}:`, singleError.message);
        } else {
          removedCount++;
        }
      }
    } else {
      removedCount += batch.length;
      console.log(`   ✅ Removidos ${Math.min(removedCount, idsArray.length)}/${idsArray.length} PDFs...`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO FINAL');
  console.log('═'.repeat(50));
  console.log(`Total de duplicatas encontradas: ${duplicates.length}`);
  console.log(`PDFs mantidos: ${keptCount}`);
  console.log(`PDFs removidos: ${removedCount}`);
  console.log(`Total de PDFs após limpeza: ${allPdfs.length - removedCount}`);
  console.log('');
  
  if (removedCount === idsArray.length) {
    console.log('✅ Limpeza concluída com sucesso!');
  } else {
    console.log(`⚠️  Aviso: ${idsArray.length - removedCount} PDFs não puderam ser removidos.`);
  }
}

fixDuplicatePdfs().catch(console.error);

