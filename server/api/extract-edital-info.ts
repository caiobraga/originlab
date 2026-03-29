import express from 'express';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
router.use(express.json({ limit: '50mb' }));

function parsePositiveIntEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || String(v).trim() === '') return fallback;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Tier gratuito Gemini 2.5 Flash (override: GEMINI_FREE_RPM / GEMINI_FREE_RPD / GEMINI_FREE_TPM).
 */
const FREE_TIER_LIMITS = {
  rpm: parsePositiveIntEnv('GEMINI_FREE_RPM', 15),
  rpd: parsePositiveIntEnv('GEMINI_FREE_RPD', 250),
  tpm: parsePositiveIntEnv('GEMINI_FREE_TPM', 1_000_000),
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || '';
if (!GEMINI_API_KEY) {
  console.warn(
    '⚠️ GEMINI_API_KEY não definida: POST /api/extract-edital-info falhará até configurar a chave no .env',
  );
}
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const QUOTA_LIMITS = {
  'gemini-2.5-flash': { ...FREE_TIER_LIMITS },
  'gemini-3-pro': {
    rpm: parsePositiveIntEnv('GEMINI_PRO_RPM', 1),
    tpm: parsePositiveIntEnv('GEMINI_PRO_TPM', 378),
    rpd: parsePositiveIntEnv('GEMINI_PRO_RPD', 1),
  },
} as const;

function getQuotaLimits(modelName: string): { rpm: number; rpd: number; tpm: number } {
  const m = modelName.toLowerCase();
  if (m.includes('gemini-3') && m.includes('pro')) {
    return QUOTA_LIMITS['gemini-3-pro'];
  }
  return QUOTA_LIMITS['gemini-2.5-flash'];
}

const rateLimitState = {
  requests: [] as number[],
  dailyRequests: 0,
  lastResetDate: new Date().toDateString(),
  tokenWindowStartMs: Date.now(),
  tokensInCurrentMinute: 0,
};

/** Serializa processamento Gemini nesta instância (evita estourar RPM com HTTP paralelo). */
let geminiTail: Promise<void> = Promise.resolve();
function runGeminiSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = geminiTail.then(() => fn());
  geminiTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Inicializar Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente do Supabase não configuradas');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const STORAGE_BUCKET = 'edital-pdfs';

/**
 * Busca um PDF do Supabase Storage pelo ID
 */
async function fetchPdfFromStorage(fileId: string): Promise<Buffer | null> {
  if (!supabase) {
    throw new Error('Supabase não configurado');
  }

  try {
    const ref = String(fileId || '').trim();
    if (!ref) return null;

    // Suportar 3 formatos:
    // 1) path do storage (contém "/")
    // 2) id da linha em edital_pdfs
    // 3) UUID do objeto no storage (storage.objects.id) — usado pelo n8n
    let storagePath = ref;
    if (!ref.includes('/')) {
      // 2) tentar resolver como edital_pdfs.id
      const { data: pdfRecord } = await supabase
        .from('edital_pdfs')
        .select('caminho_storage')
        .eq('id', ref)
        .maybeSingle();
      if (pdfRecord?.caminho_storage) {
        storagePath = pdfRecord.caminho_storage;
      } else {
        // 3) tentar resolver como storage.objects.id
        const { data: obj } = await supabase
          .from('storage.objects')
          .select('name, bucket_id')
          .eq('id', ref)
          .maybeSingle();
        if (obj?.name) {
          storagePath = obj.name;
        }
      }
    }

    const { data: fileData, error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (storageError || !fileData) {
      console.error(`Erro ao baixar PDF ${storagePath} do storage:`, storageError);
      return null;
    }

    // Converter Blob para Buffer
    const arrayBuffer = await fileData.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Erro ao buscar PDF ${fileId}:`, error);
    return null;
  }
}

/**
 * Upload de arquivo para o Gemini File API
 * Usa a biblioteca @google/generative-ai que tem suporte nativo
 */
async function uploadFileToGemini(buffer: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  try {
    // Usar a biblioteca para fazer upload
    // A biblioteca tem um método uploadFile, mas vamos usar a API REST diretamente
    // que é mais confiável para Node.js
    
    // Criar FormData usando a API nativa do Node.js (se disponível) ou construir manualmente
    const boundary = `----formdata-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    
    // Construir multipart/form-data manualmente
    const metadata = JSON.stringify({
      file: {
        displayName: fileName,
      },
    });

    const parts: Buffer[] = [];
    
    // Parte 1: metadata JSON
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Type: application/json\r\n\r\n`));
    parts.push(Buffer.from(metadata));
    parts.push(Buffer.from(`\r\n`));
    
    // Parte 2: arquivo binário
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Type: ${mimeType}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="data"; filename="${fileName}"\r\n\r\n`));
    parts.push(buffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const formData = Buffer.concat(parts);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro ao fazer upload para Gemini (${response.status}):`, errorText);
      return null;
    }

    const result = await response.json();
    const fileUri = result.file?.uri || result.uri;
    
    if (!fileUri) {
      console.error(`Upload bem-sucedido mas sem URI:`, result);
      return null;
    }

    // Aguardar o arquivo estar pronto (polling)
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileUri}?key=${GEMINI_API_KEY}`
      );
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (statusData.state === 'ACTIVE') {
          return fileUri;
        }
      }
      
      attempts++;
    }

    console.warn(`Arquivo não ficou pronto após ${maxAttempts} tentativas, retornando URI mesmo assim`);
    return fileUri;
  } catch (error) {
    console.error(`Erro ao fazer upload para Gemini:`, error);
    return null;
  }
}

function slideTokenMinuteWindow(now: number) {
  if (now - rateLimitState.tokenWindowStartMs >= 60_000) {
    rateLimitState.tokenWindowStartMs = now;
    rateLimitState.tokensInCurrentMinute = 0;
  }
}

/**
 * Respeita RPD, RPM e TPM (este último com base em usageMetadata após cada generate).
 */
async function waitForRateLimit(modelName: string): Promise<void> {
  const limits = getQuotaLimits(modelName);
  let now = Date.now();
  slideTokenMinuteWindow(now);

  if (limits.tpm > 0 && rateLimitState.tokensInCurrentMinute >= limits.tpm) {
    const waitMs = 60_000 - (now - rateLimitState.tokenWindowStartMs) + 500;
    if (waitMs > 0) {
      console.warn(
        `⚠️ Limite de TPM no minuto atual (~${rateLimitState.tokensInCurrentMinute}/${limits.tpm}). Aguardando ${Math.ceil(waitMs / 1000)}s...`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
    now = Date.now();
    rateLimitState.tokenWindowStartMs = now;
    rateLimitState.tokensInCurrentMinute = 0;
  }

  if (rateLimitState.lastResetDate !== new Date().toDateString()) {
    rateLimitState.dailyRequests = 0;
    rateLimitState.lastResetDate = new Date().toDateString();
  }

  const oneMinuteAgo = now - 60_000;
  rateLimitState.requests = rateLimitState.requests.filter((timestamp) => timestamp > oneMinuteAgo);

  if (rateLimitState.dailyRequests >= limits.rpd) {
    const waitUntil = new Date();
    waitUntil.setHours(24, 0, 0, 0);
    const waitMs = Math.max(0, waitUntil.getTime() - now);
    console.warn(
      `⚠️ Limite diário atingido (${limits.rpd} requests/dia). Aguardando até ${waitUntil.toLocaleString()}...`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
    rateLimitState.dailyRequests = 0;
    rateLimitState.lastResetDate = new Date().toDateString();
    now = Date.now();
  }

  if (rateLimitState.requests.length >= limits.rpm) {
    const oldestRequest = Math.min(...rateLimitState.requests);
    const waitMs = 60_000 - (now - oldestRequest) + 1000;
    if (waitMs > 0) {
      console.warn(
        `⚠️ Limite de RPM atingido (${limits.rpm} req/min). Aguardando ${Math.ceil(waitMs / 1000)}s...`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
    now = Date.now();
    rateLimitState.requests = rateLimitState.requests.filter((t) => t > now - 60_000);
  }

  rateLimitState.requests.push(Date.now());
  rateLimitState.dailyRequests++;
}

/**
 * Processa arquivos usando Gemini com retry logic e rate limiting
 */
async function processWithGemini(
  message: string,
  fileIds: string[]
): Promise<string> {
  if (!genAI) {
    throw new Error('Configure GEMINI_API_KEY no ambiente do servidor');
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  await waitForRateLimit(modelName);
  
  // Buscar e fazer upload dos PDFs para o Gemini (fazer apenas uma vez)
  const geminiFileUris: string[] = [];
  
  for (const fileId of fileIds) {
    const pdfBuffer = await fetchPdfFromStorage(fileId);
    if (!pdfBuffer) {
      console.warn(`⚠️ Não foi possível buscar PDF ${fileId}, pulando...`);
      continue;
    }

    // Detectar MIME type baseado no conteúdo
    const mimeType = pdfBuffer[0] === 0x25 && pdfBuffer[1] === 0x50 && pdfBuffer[2] === 0x44 && pdfBuffer[3] === 0x46
      ? 'application/pdf'
      : 'application/pdf'; // Default para PDF

    // Nome do arquivo: se for path, usar basename; senão, buscar no banco
    let fileName = `file_${fileId}.pdf`;
    if (String(fileId).includes('/')) {
      fileName = path.basename(String(fileId));
    } else if (supabase) {
      const { data: pdfRecord } = await supabase
        .from('edital_pdfs')
        .select('nome_arquivo')
        .eq('id', fileId)
        .single();
      fileName = pdfRecord?.nome_arquivo || fileName;
    }

    // Fazer upload para o Gemini
    const fileUri = await uploadFileToGemini(pdfBuffer, mimeType, fileName);
    if (fileUri) {
      geminiFileUris.push(fileUri);
      console.log(`✅ PDF ${fileName} enviado para Gemini (URI: ${fileUri})`);
    }
  }

  if (geminiFileUris.length === 0) {
    throw new Error('Nenhum arquivo foi enviado com sucesso para o Gemini');
  }

  // Preparar o prompt com os arquivos
  const prompt = `${message}\n\nAnalise os documentos anexados e responda em formato JSON conforme solicitado.`;

  // Criar partes do conteúdo incluindo os arquivos
  const parts: any[] = [{ text: prompt }];
  
  for (const fileUri of geminiFileUris) {
    parts.push({
      fileData: {
        mimeType: 'application/pdf',
        fileUri: fileUri,
      },
    });
  }

  // Retry logic para a requisição ao Gemini
  const maxRetries = 3;
  let lastError: any = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Fazer a requisição ao Gemini
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
      });

      const response = result.response;
      const text = response.text();

      const usage = (response as { usageMetadata?: { totalTokenCount?: number } }).usageMetadata;
      const totalTok = usage?.totalTokenCount;
      if (typeof totalTok === 'number' && totalTok > 0) {
        const t = Date.now();
        slideTokenMinuteWindow(t);
        rateLimitState.tokensInCurrentMinute += totalTok;
        console.log(`📊 Tokens (usageMetadata): +${totalTok} no minuto (~${rateLimitState.tokensInCurrentMinute} acumulado)`);
      }

      return text;
    } catch (error: any) {
      lastError = error;
      
      // Verificar se é erro de quota (429)
      const isQuotaError = error?.message?.includes('429') || 
                          error?.message?.includes('quota') ||
                          error?.message?.includes('Quota exceeded');
      
      if (isQuotaError && attempt < maxRetries - 1) {
        // Extrair tempo de retry da mensagem de erro se disponível
        const retryMatch = error?.message?.match(/retry in ([\d.]+)s/i);
        const retrySeconds = retryMatch ? parseFloat(retryMatch[1]) : Math.pow(2, attempt) * 5; // Exponential backoff
        
        console.warn(`⚠️ Quota excedida (tentativa ${attempt + 1}/${maxRetries}). Aguardando ${retrySeconds.toFixed(1)}s antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
        continue;
      }
      
      // Se não for erro de quota ou já tentou todas as vezes, lançar erro
      throw error;
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  throw lastError || new Error('Falha ao processar com Gemini após múltiplas tentativas');
}

/**
 * Endpoint POST /api/extract-edital-info
 */
router.post('/extract-edital-info', async (req, res) => {
  try {
    const { message, file_ids } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Campo "message" é obrigatório' });
    }

    if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return res.status(400).json({ error: 'Campo "file_ids" deve ser um array não vazio' });
    }

    console.log(`📥 Recebida requisição: ${message.substring(0, 80)}...`);
    console.log(`📁 File IDs: ${file_ids.length} arquivo(s)`);

    const result = await runGeminiSerialized(() => processWithGemini(message, file_ids));

    console.log(`✅ Resposta gerada (${result.length} caracteres)`);

    res.json({ result });
  } catch (error) {
    console.error('❌ Erro no endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

