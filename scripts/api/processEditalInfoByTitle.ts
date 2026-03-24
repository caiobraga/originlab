/**
 * Processa informações (como api:process-edital-info) apenas para editais cujo título
 * contém pelo menos uma das frases configuradas (case insensitive).
 *
 * Uso:
 *   npm run api:process-edital-info-by-title
 *
 * Env:
 *   TITLE_MATCH_ONLY_PENDING=true  — só editais que ainda precisam de processamento
 *                                    (não processados ou com "Não informado"), como o fluxo normal.
 *   DELAY_BETWEEN_EDITAIS_MS=30000
 */
import "../load-env";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  processEditalInfo,
  updateEditalInfo,
  fetchEditaisToProcess,
} from "./processEditalInfo";

/** Frases que devem aparecer no título (qualquer uma basta). */
const TITLE_SUBSTRINGS = [
  "Cooperação CNPq",
  "Epidemiologia",
  "MCTI/FINEP/FNDCT",
  "Programa de Cooperação Latino-Americana",
  "Segurança Alimentar",
  "egurança Alimentar",
  "Pós-Graduados para o Interior do",
  "Estado do Amazonas",
  "Fundação Cargill",
  "Seleção Pública MCTI/FINEP/FNDCT",
  "Iniciação ao Empreendedorismo",
  "Jovem Cientista da Pesca Artesanal",
];

const SELECT_COLS =
  "id, numero, titulo, fonte, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company, sobre_programa, criterios_elegibilidade, timeline_estimada, informacoes_processadas_em";

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

async function fetchEditaisByTitleMatch(supabase: SupabaseClient) {
  const byId = new Map<string, Record<string, unknown>>();
  for (const sub of TITLE_SUBSTRINGS) {
    const term = sub.trim();
    if (!term) continue;
    const { data, error } = await supabase
      .from("editais")
      .select(SELECT_COLS)
      .ilike("titulo", `%${escapeLike(term)}%`);
    if (error) {
      console.warn(`   ⚠️ Busca por "${term.slice(0, 40)}...": ${error.message}`);
      continue;
    }
    for (const row of data || []) {
      const r = row as Record<string, unknown>;
      if (r.id) byId.set(String(r.id), r);
    }
  }
  return Array.from(byId.values());
}

async function main() {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const onlyPending = process.env.TITLE_MATCH_ONLY_PENDING === "true";
  const delayMs = parseInt(process.env.DELAY_BETWEEN_EDITAIS_MS || "30000", 10);

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   PROCESS-EDITAL-INFO POR TÍTULO (frases configuradas)    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  let editais = await fetchEditaisByTitleMatch(supabase);
  console.log(`   Encontrados ${editais.length} edital(is) com título contendo alguma das frases.`);

  if (onlyPending) {
    const pending = await fetchEditaisToProcess(supabase, false, true);
    const pendingIds = new Set(pending.map((e) => e.id));
    editais = editais.filter((e) => pendingIds.has(String(e.id)));
    console.log(`   Com TITLE_MATCH_ONLY_PENDING=true: ${editais.length} ainda pendentes de processamento.\n`);
  } else {
    console.log("   (Processando todos os que batem no título. Use TITLE_MATCH_ONLY_PENDING=true para só pendentes.)\n");
  }

  if (editais.length === 0) {
    console.log("⚠️ Nenhum edital a processar.");
    process.exit(0);
  }

  editais.sort((a, b) => {
    const ta = String(a.titulo || "");
    const tb = String(b.titulo || "");
    return ta.localeCompare(tb, "pt-BR");
  });

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < editais.length; i++) {
    const edital = editais[i] as Parameters<typeof processEditalInfo>[1];
    console.log(`\n[${i + 1}/${editais.length}] ${edital.numero || "N/A"} — ${(edital.titulo || "").slice(0, 70)}...`);
    try {
      const info = await processEditalInfo(supabase, edital);
      await updateEditalInfo(supabase, edital.id, info);
      ok++;
      console.log("   ✅ OK");
    } catch (e) {
      fail++;
      console.error("   ❌", e instanceof Error ? e.message : e);
    }
    if (i < editais.length - 1) {
      console.log(`   ⏳ ${delayMs / 1000}s até o próximo...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log(`✅ Sucesso: ${ok}  ❌ Falhas: ${fail}`);
}

if (process.argv[1]?.includes("processEditalInfoByTitle")) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
