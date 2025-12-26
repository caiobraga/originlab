// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { Edital } from '../types';
import { uploadPdfsToStorage } from './storage';

const STORAGE_BUCKET = 'edital-pdfs';

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

  // Função para verificar se é um anexo (não é um edital separado)
  const isAnexo = (titulo: string): boolean => {
    if (!titulo) return false;
    const tituloLower = titulo.toLowerCase().trim();
    return tituloLower.startsWith('anexo') || 
           /^anexo\s+[ivx]+/i.test(tituloLower) ||
           /anexo\s+[ivx]+\s*[–-]/i.test(tituloLower) ||
           (tituloLower.includes('formulário') && tituloLower.includes('anexo')) ||
           (tituloLower.includes('formulario') && tituloLower.includes('anexo')) ||
           tituloLower.includes('anexo i –') ||
           tituloLower.includes('anexo ii') ||
           tituloLower.includes('anexo iii') ||
           tituloLower.includes('anexo iv') ||
           tituloLower.includes('anexo v') ||
           tituloLower.includes('anexo vi') ||
           tituloLower.includes('anexo vii') ||
           tituloLower.includes('anexo viii') ||
           tituloLower.includes('anexo ix') ||
           tituloLower.includes('anexo x');
  };

  // Filtrar editais sem título válido e anexos
  const editais = allEditais.filter(edital => {
    const titulo = edital.titulo?.trim();
    if (!titulo || 
        titulo.length <= 3 || 
        titulo === 'Sem título' || 
        titulo === 'N/A' ||
        titulo.match(/^N\/A\s*-\s*Sem título$/i)) {
      return false;
    }
    
    // Filtrar anexos
    if (isAnexo(titulo)) {
      return false;
    }
    
    return true;
  });

  const filteredCount = allEditais.length - editais.length;
  const anexosFiltrados = allEditais.filter(e => isAnexo(e.titulo?.trim() || '')).length;
  
  if (filteredCount > 0) {
    console.log(`⚠️ ${filteredCount} edital(is) filtrados (sem título válido ou anexos)`);
    if (anexosFiltrados > 0) {
      console.log(`   📎 ${anexosFiltrados} anexo(s) filtrado(s) (não são editais separados)`);
    }
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
      
      // Verificar se é anexo e pular
      if (isAnexo(titulo)) {
        console.warn(`⚠️ Pulando anexo (não é edital separado): "${titulo}"`);
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

      // IMPORTANTE: Normalizar título para comparação (remover espaços extras, lowercase, remover acentos)
      // Isso ajuda a detectar duplicatas mesmo com pequenas diferenças de formatação
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
      
      const normalizedTitulo = normalizeTitle(titulo);
      
      // Estratégia de upsert: sempre verificar por título normalizado + fonte primeiro
      // Isso evita duplicatas mesmo quando o número está diferente ou ausente
      let insertedEdital: any = null;
      let insertError: any = null;

      // Primeiro, buscar todos os editais da mesma fonte para comparar títulos normalizados
      // Isso é necessário porque o PostgreSQL não tem função de normalização built-in
      const { data: allEditaisSameFonte } = await supabase
        .from('editais')
        .select('id, numero, titulo')
        .eq('fonte', edital.fonte || 'unknown');

      // Encontrar edital existente com título normalizado similar
      const existingEdital = allEditaisSameFonte?.find(e => {
        const existingNormalized = normalizeTitle(e.titulo || '');
        return existingNormalized === normalizedTitulo;
      });

      if (existingEdital) {
        // Edital já existe: atualizar
        console.log(`  🔄 Edital já existe (título: "${titulo.substring(0, 50)}..."), atualizando ID=${existingEdital.id}...`);
        const { data: updatedEdital, error: updateError } = await supabase
          .from('editais')
          .update(dbEdital)
          .eq('id', existingEdital.id)
          .select()
          .single();
        
        insertedEdital = updatedEdital;
        insertError = updateError;
      } else {
        // Edital não existe: inserir ou fazer upsert por número+fonte (se tiver número)
        if (edital.numero) {
          // Edital com número: usar upsert com constraint numero,fonte
          const result = await supabase
            .from('editais')
            .upsert(dbEdital, {
              onConflict: 'numero,fonte',
              ignoreDuplicates: false,
            })
            .select()
            .single();
          
          insertedEdital = result.data;
          insertError = result.error;
        } else {
          // Edital sem número: inserir novo
          const { data: newEdital, error: newError } = await supabase
            .from('editais')
            .insert(dbEdital)
            .select()
            .single();
          
          insertedEdital = newEdital;
          insertError = newError;
        }
      }

      if (insertError) {
        console.error(`  ❌ Erro ao inserir/atualizar edital no banco:`, insertError);
        throw insertError;
      }

      if (!insertedEdital) {
        console.error(`  ❌ Edital não foi inserido/atualizado (retorno vazio)`);
        throw new Error('Edital não foi inserido/atualizado (retorno vazio)');
      }

      console.log(`  ✅ Edital ${insertedEdital.id ? 'atualizado' : 'inserido'} no banco: ID=${insertedEdital.id || 'N/A'}, Numero=${edital.numero || 'N/A'}, Fonte=${edital.fonte || 'unknown'}`);

      // Upload de PDFs para o storage
      // Se temos pdfPaths (arquivos locais), usar upload normal
      if (edital.pdfPaths && edital.pdfPaths.length > 0 && insertedEdital) {
        await uploadPdfsToStorage(supabase, insertedEdital.id, edital);
      } 
      // Se temos apenas pdfUrls (URLs remotas), baixar e salvar diretamente
      else if (edital.pdfUrls && edital.pdfUrls.length > 0 && insertedEdital) {
        await uploadPdfsFromUrls(supabase, insertedEdital.id, edital);
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
 * Faz upload de PDFs diretamente das URLs (sem baixar localmente primeiro)
 */
async function uploadPdfsFromUrls(
  supabase: SupabaseClient,
  editalId: string,
  edital: Edital
): Promise<void> {
  if (!edital.pdfUrls || edital.pdfUrls.length === 0) {
    return;
  }

  console.log(`  📥 Processando ${edital.pdfUrls.length} PDF(s) das URLs...`);

  for (let i = 0; i < edital.pdfUrls.length; i++) {
    const pdfUrl = edital.pdfUrls[i];
    
    try {
      // Baixar o PDF da URL
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        console.warn(`  ⚠️ Erro ao baixar PDF ${i + 1}: HTTP ${response.status}`);
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extrair nome do arquivo da URL
      const urlPath = new URL(pdfUrl).pathname;
      let fileName = path.basename(urlPath);
      
      // IMPORTANTE: Sanitizar nome do arquivo para evitar problemas com espaços e caracteres especiais
      const sanitizeFileName = (name: string): string => {
        // Decodificar URL se necessário
        let sanitized = decodeURIComponent(name);
        
        // Remover caracteres perigosos e substituir espaços por underscores
        sanitized = sanitized
          .replace(/[^a-zA-Z0-9._-]/g, '_') // Substituir caracteres especiais por underscore
          .replace(/_{2,}/g, '_') // Remover underscores múltiplos
          .replace(/^_+|_+$/g, '') // Remover underscores no início e fim
          .substring(0, 200); // Limitar tamanho
        
        // Se não tem extensão, adicionar .pdf
        if (!sanitized.includes('.')) {
          sanitized = `${sanitized}.pdf`;
        } else if (!sanitized.toLowerCase().endsWith('.pdf')) {
          // Se tem extensão mas não é .pdf, substituir
          sanitized = sanitized.replace(/\.[^.]+$/, '.pdf');
        }
        
        return sanitized || 'edital.pdf';
      };
      
      fileName = sanitizeFileName(fileName);
      
      // Sanitizar também o número do edital para o caminho
      const sanitizePathSegment = (segment: string): string => {
        return segment
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 100);
      };
      
      const safeFonte = sanitizePathSegment(edital.fonte || 'unknown');
      const safeNumero = sanitizePathSegment(edital.numero || 'unknown');

      // Criar caminho no storage: fonte/numero/nome_arquivo (todos sanitizados)
      const storagePath = `${safeFonte}/${safeNumero}/${fileName}`;

      // Detectar tipo MIME
      let contentType = 'application/pdf';
      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.docx') {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (ext === '.doc') {
        contentType = 'application/msword';
      } else if (ext === '.xlsx') {
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      // Verificar se já existe no banco
      const { data: existingPdf } = await supabase
        .from('edital_pdfs')
        .select('id')
        .eq('caminho_storage', storagePath)
        .maybeSingle();

      if (existingPdf) {
        console.log(`  ℹ️ PDF já existe no banco: ${fileName}`);
        continue;
      }

      // Fazer upload para o storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.warn(`  ⚠️ Erro ao fazer upload de ${fileName}:`, uploadError.message);
        continue;
      }

      // Obter file_id do arquivo no storage
      let fileId: string | null = null;
      if (uploadData?.path) {
        const { data: fileData } = await supabase.storage
          .from(STORAGE_BUCKET)
          .list(path.dirname(uploadData.path), {
            search: path.basename(uploadData.path),
          });
        if (fileData && fileData.length > 0 && fileData[0].id) {
          fileId = fileData[0].id;
        }
      }

      // Salvar registro na tabela edital_pdfs
      const { error: dbError } = await supabase
        .from('edital_pdfs')
        .upsert({
          edital_id: editalId,
          nome_arquivo: fileName,
          caminho_storage: storagePath,
          url_original: pdfUrl,
          tamanho_bytes: buffer.length,
          tipo_mime: contentType,
          file_id: fileId,
        }, {
          onConflict: 'caminho_storage',
          ignoreDuplicates: false,
        });

      if (dbError) {
        console.warn(`  ⚠️ Erro ao salvar registro do PDF ${fileName}:`, dbError.message);
      } else {
        console.log(`  ✅ PDF salvo: ${fileName} (${(buffer.length / 1024).toFixed(2)} KB)`);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠️ Erro ao processar PDF ${i + 1} (${pdfUrl}):`, errorMsg);
    }
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

// Executar sincronização se o script for chamado diretamente
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('sync.ts')) {
  syncEditaisToDatabase()
    .then(() => {
      console.log('\n✅ Sincronização concluída com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro durante sincronização:', error);
      process.exit(1);
    });
}

