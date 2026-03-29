/**
 * Delays para processamento de editais (n8n vs Ollama local).
 * n8n/Cloudflare: espaçar requisições. Ollama local: defaults mais curtos.
 */

const useOllama = process.env.USE_OLLAMA === 'true';
const useLocalApi = process.env.USE_LOCAL_API === 'true';

function parseEnvMs(key: string): number | undefined {
  const raw = process.env[key];
  if (raw === undefined || String(raw).trim() === '') return undefined;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? Math.max(0, n) : undefined;
}

/** Entre cada campo extraído (valor, prazo, …). n8n default 2000; Ollama default 0. */
export function getFieldExtractDelayMs(): number {
  return parseEnvMs('FIELD_EXTRACT_DELAY_MS') ?? (useOllama ? 0 : 2000);
}

export async function sleepFieldExtractDelay(): Promise<void> {
  const ms = getFieldExtractDelayMs();
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** Entre um edital e o próximo no batch. n8n default 30000; Ollama default 2000. */
export function getDelayBetweenEditaisMs(): number {
  return parseEnvMs('DELAY_BETWEEN_EDITAIS_MS') ?? (useOllama ? 2000 : 30000);
}

/**
 * Quantos campos extrair em paralelo por edital (só Ollama). n8n permanece sequencial.
 * Aumenta throughput na GPU se o Ollama aceitar várias requisições; demais pode fila ou RAM.
 */
export function getOllamaFieldConcurrency(): number {
  if (!useOllama) return 1;
  const raw = process.env.OLLAMA_FIELD_CONCURRENCY;
  if (raw !== undefined && String(raw).trim() !== '') {
    return Math.max(1, parseInt(String(raw).trim(), 10) || 1);
  }
  return 3;
}

/**
 * Quantos editais processar em paralelo no batch (api:process-edital-info).
 * Com USE_OLLAMA e sem env: default 2. Com n8n força 1. `PROCESS_EDITAL_CONCURRENCY=1` volta ao sequencial.
 */
/**
 * Delay padrão antes de cada POST ao extrator (n8n vs API local / Gemini).
 * Com USE_LOCAL_API e sem Ollama, ~60s/15 RPM + margem (override: GEMINI_LOCAL_API_MIN_DELAY_MS).
 */
export function getWebhookOrLocalApiDefaultDelayMs(): number {
  if (useLocalApi) {
    return parseEnvMs('GEMINI_LOCAL_API_MIN_DELAY_MS') ?? 4500;
  }
  return 12000;
}

export function getProcessEditalBatchConcurrency(): number {
  if (!useOllama) return 1;
  const raw = process.env.PROCESS_EDITAL_CONCURRENCY;
  if (raw !== undefined && String(raw).trim() !== '') {
    return Math.max(1, parseInt(String(raw).trim(), 10) || 1);
  }
  return 2;
}
