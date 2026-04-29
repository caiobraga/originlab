/**
 * Processa editais em loop com retries: roda até não haver mais editais a processar
 * ou até o usuário cancelar (Ctrl+C).
 *
 * - Busca editais a processar (mesmo critério do api:process-edital-info e PROCESS_EDITAL_MODE).
 * - Para cada edital: tenta processar com retries (max tentativas e backoff configuráveis).
 * - Quando não há mais editais: aguarda POLL_INTERVAL_MS e busca de novo (loop infinito).
 *
 * Uso:
 *   npm run api:process-edital-info-loop
 *
 * Env:
 *   PROCESS_EDITAL_MODE=null | nao-informado | (vazio)  — igual ao process-edital-info
 *   PROCESS_EDITAL_MAX_RETRIES=3                        — tentativas por edital (padrão 3)
 *   PROCESS_EDITAL_RETRY_DELAY_MS=5000                 — delay base entre retries (padrão 5000)
 *   PROCESS_EDITAL_POLL_INTERVAL_MS=60000              — quando não há editais, esperar antes de buscar de novo (padrão 60s)
 *   DELAY_BETWEEN_EDITAIS_MS=30000                      — delay entre editais (sem setar: 30s n8n, 2s com USE_OLLAMA)
 */
import "../load-env";
import { createClient } from "@supabase/supabase-js";
import { getDelayBetweenEditaisMs } from "../lib/process-edital-delays";
import {
  processEditalInfo,
  updateEditalInfo,
  fetchEditaisToProcess,
  fetchEditaisWithNullFields,
  fetchEditaisOnlyNotInformed,
} from "./processEditalInfo";

type EditalRow = Awaited<ReturnType<typeof fetchEditaisToProcess>>[number];

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const MAX_RETRIES = Math.max(1, parseInt(process.env.PROCESS_EDITAL_MAX_RETRIES || "3", 10));
const RETRY_DELAY_MS = Math.max(1000, parseInt(process.env.PROCESS_EDITAL_RETRY_DELAY_MS || "5000", 10));
const POLL_INTERVAL_MS = Math.max(5000, parseInt(process.env.PROCESS_EDITAL_POLL_INTERVAL_MS || "60000", 10));

let cancelled = false;

function onSignal() {
  cancelled = true;
  console.log("\n⏹ Cancelado pelo usuário. Finalizando após o edital atual...");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchEditais(supabase: ReturnType<typeof createClient>): Promise<EditalRow[]> {
  const mode = (process.env.PROCESS_EDITAL_MODE || "").toLowerCase().trim();
  if (mode === "null") {
    return fetchEditaisWithNullFields(supabase);
  }
  if (mode === "nao-informado") {
    return fetchEditaisOnlyNotInformed(supabase);
  }
  return fetchEditaisToProcess(supabase, false, true);
}

async function processOneWithRetries(
  supabase: ReturnType<typeof createClient>,
  edital: EditalRow
): Promise<boolean> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (cancelled) return false;
    try {
      const processedInfo = await processEditalInfo(supabase, edital);
      await updateEditalInfo(supabase, edital.id, processedInfo);
      return true;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`  ❌ Tentativa ${attempt}/${MAX_RETRIES} falhou: ${lastError.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`  ⏳ Nova tentativa em ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }
  console.error(`  ❌ Edital não processado após ${MAX_RETRIES} tentativas. Último erro: ${lastError?.message}`);
  return false;
}

async function main() {
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const mode = (process.env.PROCESS_EDITAL_MODE || "").toLowerCase().trim();

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   PROCESS-EDITAL-INFO LOOP (retries + até cancelar)       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  console.log(`   Modo: ${mode || "não processados + não informado"}`);
  console.log(`   Retries por edital: ${MAX_RETRIES}`);
  console.log(`   Poll quando vazio: ${POLL_INTERVAL_MS / 1000}s`);
  console.log("   Pressione Ctrl+C para encerrar.\n");

  let totalProcessed = 0;
  let totalErrors = 0;

  while (!cancelled) {
    const editais = await fetchEditais(supabase);

    if (cancelled) break;

    if (!editais || editais.length === 0) {
      console.log(`⏳ Nenhum edital a processar. Próxima verificação em ${POLL_INTERVAL_MS / 1000}s...`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    console.log(`\n📊 ${editais.length} edital(is) a processar nesta rodada.`);
    for (let i = 0; i < editais.length && !cancelled; i++) {
      const edital = editais[i];
      console.log(`\n📄 [${i + 1}/${editais.length}] ${edital.numero || "N/A"} - ${(edital.titulo || "").substring(0, 50)}...`);
      const ok = await processOneWithRetries(supabase, edital);
      if (ok) {
        totalProcessed++;
        console.log(`  ✅ Edital processado com sucesso.`);
        if (i < editais.length - 1) {
          const betweenMs = getDelayBetweenEditaisMs();
          if (betweenMs > 0) {
            console.log(`  ⏳ Aguardando ${betweenMs / 1000}s antes do próximo...`);
            await sleep(betweenMs);
          }
        }
      } else {
        totalErrors++;
      }
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log("📊 RESUMO");
  console.log("═".repeat(50));
  console.log(`   Processados com sucesso: ${totalProcessed}`);
  console.log(`   Erros (após retries): ${totalErrors}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
