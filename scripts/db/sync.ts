// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { Edital } from '../types';
import { uploadPdfsToStorage } from './storage';

interface DatabaseEdital {
  id?: string;
  numero?: string;
  titulo: string;
  descricao?: string;
  data_publicacao?: string;
  data_encerramento?: string;
  status?: string;
  valor?: string;
  area?: string;
  orgao?: string;
  fonte: string;
  link?: string;
  processado_em?: string;
}

/**
 * Sincroniza editais do JSON com o banco de dados Supabase
 */
export async function syncEditaisToDatabase(): Promise<void> {
  // Tentar múltiplas variáveis de ambiente (VITE_* para compatibilidade com frontend, sem prefixo para scripts)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                      process.env.SUPABASE_URL || 
                      process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Variáveis de ambiente não encontradas!');
    console.error('   Procuradas:');
    console.error('   - VITE_SUPABASE_URL ou SUPABASE_URL');
    console.error('   - VITE_SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_ROLE_KEY');
    console.error('\n   Configure no arquivo .env.local na raiz do projeto:');
    console.error('   VITE_SUPABASE_URL=https://seu-projeto.supabase.co');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role\n');
    throw new Error('Variáveis de ambiente do Supabase não configuradas');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Carregar editais do JSON
  const jsonFile = path.join(process.cwd(), 'scripts', 'output', 'editais.json');
  
  if (!fs.existsSync(jsonFile)) {
    throw new Error(`Arquivo JSON não encontrado: ${jsonFile}`);
  }

  const content = fs.readFileSync(jsonFile, 'utf-8');
  const allEditais: Edital[] = JSON.parse(content);

  // Filtrar editais sem título válido
  const editais = allEditais.filter(edital => {
    const titulo = edital.titulo?.trim();
    return titulo && 
           titulo.length > 3 && 
           titulo !== 'Sem título' && 
           titulo !== 'N/A' &&
           !titulo.match(/^N\/A\s*-\s*Sem título$/i);
  });

  const filteredCount = allEditais.length - editais.length;
  if (filteredCount > 0) {
    console.log(`⚠️ ${filteredCount} edital(is) sem título válido foram filtrados`);
  }

  console.log(`\n🔄 Sincronizando ${editais.length} edital(is) com o banco de dados...\n`);

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ edital: string; error: string }> = [];

  // Processar cada edital
  for (const edital of editais) {
    try {
      // Validar título novamente (segurança extra)
      const titulo = edital.titulo?.trim();
      if (!titulo || titulo.length <= 3 || titulo === 'Sem título' || titulo === 'N/A') {
        console.warn(`⚠️ Pulando edital ${edital.numero || 'N/A'} - título inválido: "${titulo}"`);
        continue;
      }

      // Converter formato do JSON para formato do banco
      const dbEdital: Record<string, any> = {
        titulo: titulo,
        fonte: edital.fonte || 'unknown',
        processado_em: edital.processadoEm || new Date().toISOString(),
      };

      // Adicionar campos opcionais apenas se existirem
      if (edital.numero) dbEdital.numero = edital.numero;
      if (edital.descricao) dbEdital.descricao = edital.descricao;
      if (edital.dataPublicacao) {
        const parsedDate = parseDate(edital.dataPublicacao);
        if (parsedDate) dbEdital.data_publicacao = parsedDate;
      }
      if (edital.dataEncerramento) {
        const parsedDate = parseDate(edital.dataEncerramento);
        if (parsedDate) dbEdital.data_encerramento = parsedDate;
      }
      if (edital.status) dbEdital.status = edital.status;
      if (edital.valor) dbEdital.valor = edital.valor;
      if (edital.area) dbEdital.area = edital.area;
      if (edital.orgao) dbEdital.orgao = edital.orgao;
      if (edital.link) dbEdital.link = edital.link;

      // Inserir ou atualizar edital (usando ON CONFLICT)
      const { data: insertedEdital, error: insertError } = await supabase
        .from('editais')
        .upsert(dbEdital, {
          onConflict: 'numero,fonte',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // Upload de PDFs para o storage
      if (edital.pdfPaths && edital.pdfPaths.length > 0 && insertedEdital) {
        await uploadPdfsToStorage(supabase, insertedEdital.id, edital);
      }

      successCount++;
      console.log(`✅ ${edital.numero || 'N/A'} (${edital.fonte}): Sincronizado`);
    } catch (error) {
      errorCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push({
        edital: `${edital.numero || 'N/A'} (${edital.fonte})`,
        error: errorMsg,
      });
      console.error(`❌ Erro ao sincronizar ${edital.numero || 'N/A'} (${edital.fonte}):`, errorMsg);
    }
  }

  // Resumo
  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO DA SINCRONIZAÇÃO');
  console.log('═'.repeat(50));
  console.log(`📥 Editais processados: ${editais.length}`);
  console.log(`✅ Editais sincronizados: ${successCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  if (filteredCount > 0) {
    console.log(`⚠️ Editais filtrados (sem título): ${filteredCount}`);
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Detalhes dos erros:');
    errors.forEach(({ edital, error }) => {
      console.log(`   - ${edital}: ${error}`);
    });
  }
}

/**
 * Converte data no formato brasileiro (DD/MM/YYYY) para ISO (YYYY-MM-DD)
 */
function parseDate(dateStr?: string): string | null {
  if (!dateStr) return null;

  // Tentar formato brasileiro: DD/MM/YYYY
  const brMatch = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const [, dia, mes, ano] = brMatch;
    return `${ano}-${mes}-${dia}`;
  }

  // Tentar formato ISO: YYYY-MM-DD
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return dateStr;
  }

  // Tentar parsear como Date
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Ignorar erros
  }

  return null;
}

