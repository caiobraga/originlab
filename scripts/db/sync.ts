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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const isRetryableNetworkError = (err: unknown): boolean => {
    const s = (() => {
      if (!err) return '';
      if (typeof err === 'string') return err;
      if (err instanceof Error) return `${err.name}: ${err.message}`;
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    })().toLowerCase();

    return (
      s.includes('fetch failed') ||
      s.includes('connecttimeout') ||
      s.includes('connect timeout') ||
      s.includes('und_err_connect_timeout') ||
      s.includes('etimedout') ||
      s.includes('econnreset') ||
      s.includes('socket hang up') ||
      s.includes('network') ||
      s.includes('temporary failure') ||
      s.includes('dns') ||
      s.includes('enotfound')
    );
  };

  const safeErrorString = (err: unknown): string => {
    if (!err) return 'Erro desconhecido';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message || String(err);
    if (typeof err === 'object') {
      const anyErr = err as any;
      const msg = anyErr?.message || anyErr?.error || '';
      const details = anyErr?.details || anyErr?.hint || '';
      if (msg || details) return `${msg}${details ? ` (${String(details).slice(0, 200)})` : ''}`;
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    }
    return String(err);
  };

  const resilientFetch: typeof fetch = async (input: any, init?: any) => {
    const maxAttempts = Number(process.env.SUPABASE_FETCH_RETRIES || '3') || 3;
    const baseDelayMs = Number(process.env.SUPABASE_FETCH_RETRY_DELAY_MS || '800') || 800;
    const timeoutMs = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS || '30000') || 30000;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(input, {
          ...(init || {}),
          signal: init?.signal ? init.signal : controller.signal,
        });
        clearTimeout(t);
        return res;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        if (attempt >= maxAttempts || !isRetryableNetworkError(e)) throw e;
        const backoff = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
    throw lastErr;
  };

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: resilientFetch },
  });

  // Carregar editais do(s) JSON(s)
  // Por padrão, o orquestrador escreve em scripts/output/editais.json.
  // Alguns scrapers também podem escrever arquivos separados (ex.: editais-finep.json).
  // Aqui mesclamos automaticamente editais.json + editais-*.json (se existirem).
  const outputDir = path.join(process.cwd(), 'scripts', 'output');
  const consolidatedFile = path.join(outputDir, 'editais.json');

  const jsonFiles: string[] = [];
  if (fs.existsSync(consolidatedFile)) {
    jsonFiles.push(consolidatedFile);
  }

  if (fs.existsSync(outputDir)) {
    const extra = fs
      .readdirSync(outputDir)
      .filter((f) => /^editais-[^/\\]+\.json$/i.test(f))
      .map((f) => path.join(outputDir, f));
    jsonFiles.push(...extra);
  }

  if (jsonFiles.length === 0) {
    throw new Error(
      `Nenhum arquivo de editais encontrado em ${outputDir}. Rode "npm run scrape:all" ou um "npm run scrape:<fonte>" antes do sync.`
    );
  }

  const loaded: Edital[] = [];
  for (const file of jsonFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const arr = JSON.parse(content);
      if (Array.isArray(arr)) {
        loaded.push(...(arr as Edital[]));
      } else {
        console.warn(`⚠️ Ignorando JSON inválido (não é array): ${file}`);
      }
    } catch (e) {
      console.warn(`⚠️ Não foi possível ler/parsear: ${file}`);
    }
  }

  // De-dup básico para evitar processar o mesmo edital múltiplas vezes
  const keyOf = (e: Edital): string => {
    const fonte = (e.fonte || 'unknown').trim().toLowerCase();
    const numero = (e.numero || '').trim().toLowerCase();
    const titulo = (e.titulo || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
    return numero ? `${fonte}:${numero}` : `${fonte}:${titulo}`;
  };

  const allEditais: Edital[] = [];
  const seen = new Set<string>();
  for (const e of loaded) {
    const k = keyOf(e);
    if (seen.has(k)) continue;
    seen.add(k);
    allEditais.push(e);
  }

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
  let editais = allEditais.filter(edital => {
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

  // Opcional: filtrar por fonte (ex.: SYNC_FONTE=finep) e limitar (ex.: SYNC_LIMIT=10)
  const onlyFonte = String(process.env.SYNC_FONTE || '').trim().toLowerCase();
  if (onlyFonte) {
    editais = editais.filter((e) => String(e.fonte || '').trim().toLowerCase() === onlyFonte);
  }
  const limit = Number(process.env.SYNC_LIMIT || '0') || 0;
  if (limit > 0) {
    editais = editais.slice(0, limit);
  }

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
      
      let insertedEdital: any = null;
      let insertError: any = null;

      // Estratégia:
      // - Se houver "numero", priorizar numero+fonte (evita colidir títulos repetidos, ex.: FINEP).
      // - Se não houver "numero", usar título normalizado+fonte para evitar duplicatas.
      if (edital.numero) {
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
        const normalizedTitulo = normalizeTitle(titulo);

        // Buscar todos os editais da mesma fonte para comparar títulos normalizados
        const { data: allEditaisSameFonte } = await supabase
          .from('editais')
          .select('id, numero, titulo')
          .eq('fonte', edital.fonte || 'unknown');

        const existingEdital = allEditaisSameFonte?.find(e => {
          const existingNormalized = normalizeTitle(e.titulo || '');
          return existingNormalized === normalizedTitulo;
        });

        if (existingEdital) {
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
        // Tentar novamente em falhas de rede (principalmente quando o script está baixando muitos PDFs)
        if (isRetryableNetworkError(insertError)) {
          console.warn(`  ⚠️ Falha de rede ao inserir/atualizar. Tentando novamente... (${safeErrorString(insertError)})`);
          await sleep(1200);
          // Repetir uma vez o upsert/update inteiro do edital (sem reprocessar PDFs)
          // Nota: o createClient já tem retry no fetch, mas aqui damos uma segunda chance "macro".
          const retryResult = await supabase
            .from('editais')
            .upsert(dbEdital, {
              onConflict: edital.numero ? 'numero,fonte' : undefined,
              ignoreDuplicates: false,
            } as any)
            .select()
            .single();
          insertedEdital = retryResult.data;
          insertError = retryResult.error;
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
      // PDFs:
      // - Preferir arquivos locais (pdfPaths) quando existirem de fato no disco
      // - Caso contrário, cair para download via pdfUrls (importante quando o sync roda em outra máquina/ambiente)
      if (insertedEdital) {
        const existingLocalPaths =
          (edital.pdfPaths || []).filter((p) => {
            try {
              return Boolean(p) && fs.existsSync(p);
            } catch {
              return false;
            }
          }) || [];

        if (existingLocalPaths.length > 0) {
          await uploadPdfsToStorage(supabase, insertedEdital.id, {
            ...edital,
            pdfPaths: existingLocalPaths,
          });
        } else if (edital.pdfUrls && edital.pdfUrls.length > 0) {
          if (edital.pdfPaths && edital.pdfPaths.length > 0) {
            console.warn(
              `  ⚠️ pdfPaths presente(s), mas arquivo(s) não encontrado(s) no disco. Usando pdfUrls (${edital.pdfUrls.length}).`
            );
          }
          await uploadPdfsFromUrls(supabase, insertedEdital.id, edital);
        }
      }

      successCount++;
      console.log(`✅ ${edital.numero || 'N/A'} (${edital.fonte}): Sincronizado`);
    } catch (error) {
      errorCount++;
      const errorMsg = safeErrorString(error);
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

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const maxAttempts = Number(process.env.PDF_FETCH_RETRIES || '3') || 3;
  const baseDelayMs = Number(process.env.PDF_FETCH_RETRY_DELAY_MS || '700') || 700;
  const timeoutMs = Number(process.env.PDF_FETCH_TIMEOUT_MS || '45000') || 45000;

  const fetchPdfWithRetry = async (url: string): Promise<Response> => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: { Accept: 'application/pdf,application/octet-stream,*/*' },
        });
        clearTimeout(t);
        return r;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        if (attempt >= maxAttempts) throw e;
        const backoff = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
    throw lastErr;
  };

  for (let i = 0; i < edital.pdfUrls.length; i++) {
    const pdfUrl = edital.pdfUrls[i];
    
    try {
      // Baixar o PDF da URL
      const response = await fetchPdfWithRetry(pdfUrl);
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
        .select('id, file_id')
        .eq('caminho_storage', storagePath)
        .maybeSingle();

      if (existingPdf) {
        console.log(`  ℹ️ PDF já existe no banco: ${fileName}`);
        // Se estiver sem file_id (UUID do storage), tentar completar
        if (!(existingPdf as any).file_id) {
          try {
            const { data: fileData } = await supabase.storage
              .from(STORAGE_BUCKET)
              .list(path.dirname(storagePath), { search: path.basename(storagePath) });
            const id = fileData && fileData.length > 0 ? (fileData[0] as any).id : null;
            if (id) {
              await supabase.from('edital_pdfs').update({ file_id: id }).eq('caminho_storage', storagePath);
            }
          } catch {
            // ignore
          }
        }
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

      // Obter UUID do objeto no Storage (para o n8n)
      let fileId: string | null = null;
      try {
        const { data: fileData } = await supabase.storage
          .from(STORAGE_BUCKET)
          .list(path.dirname(storagePath), { search: path.basename(storagePath) });
        if (fileData && fileData.length > 0 && (fileData[0] as any).id) {
          fileId = (fileData[0] as any).id as string;
        }
      } catch {
        // ignore
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

