// Carrega variáveis de ambiente primeiro
// Reprocessa via `processEditalInfo` (RAG com edital.id, fallback documents/PDF) — mesmo fluxo que api:update-edital-info.
import "../load-env";
import { createClient } from "@supabase/supabase-js";
import { processEditalInfo, updateEditalInfo } from "./processEditalInfo";

type EditalRow = {
  id: string;
  numero: string | null;
  titulo: string;
  prazo_inscricao: any;
  timeline_estimada: any;
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "");
}

function tryParseDateLoose(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // yyyy-mm-dd
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const y = Number(m1[1]);
    const mo = Number(m1[2]);
    const d = Number(m1[3]);
    return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }

  // dd/mm/yyyy ou dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m2) {
    const d = Number(m2[1]);
    const mo = Number(m2[2]);
    const y = Number(m2[3]);
    return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }

  // fallback: Date.parse (pode funcionar com meses por texto em PT/EN)
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const mo = dt.getMonth() + 1;
    const d = dt.getDate();
    return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  }

  return null;
}

function isNotFoundValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === "não informado" || s === "nao informado";
}

function getPrazoInscricaoFim(prazoValue: any): string | null {
  if (!prazoValue || isNotFoundValue(prazoValue)) return null;

  // Esperado: JSON string com { prazos: [{ fim: "..." }, ...] }
  // ou objeto equivalente (dependendo de como o Supabase devolve).
  try {
    const obj = typeof prazoValue === "string" ? JSON.parse(prazoValue) : prazoValue;
    if (!obj || typeof obj !== "object") return null;

    if (Array.isArray(obj.prazos) && obj.prazos.length > 0) {
      const last = [...obj.prazos].reverse().find((p: any) => p && typeof p === "object" && p.fim && String(p.fim).trim().length > 0);
      return last ? String(last.fim).trim() : null;
    }
  } catch {
    // caso "prazo_inscricao" tenha vindo como texto simples
    const s = typeof prazoValue === "string" ? prazoValue : null;
    return s && s.trim().length > 0 && !isNotFoundValue(s) ? s.trim() : null;
  }

  return null;
}

function getTimelineInscricaoFim(timelineValue: any): string | null {
  if (!timelineValue) return null;
  const phases = timelineValue?.fases;
  if (!Array.isArray(phases) || phases.length === 0) return null;

  const inscriptionPhase =
    phases.find((p: any) => {
      const nome = String(p?.nome ?? "").toLowerCase();
      return nome.includes("submiss") || nome.includes("inscri");
    }) ?? null;

  if (!inscriptionPhase) return null;

  const fim = inscriptionPhase?.data_fim ?? inscriptionPhase?.fim ?? inscriptionPhase?.prazo_fim;
  if (fim === null || fim === undefined) return null;
  const s = String(fim).trim();
  return s.length > 0 ? s : null;
}

function hasInconsistency(edital: EditalRow): boolean {
  // Só consideramos inconsistencia quando ambas as fontes têm dados.
  if (!edital.prazo_inscricao || isNotFoundValue(edital.prazo_inscricao)) return false;
  if (!edital.timeline_estimada) return false;

  const prazoFim = getPrazoInscricaoFim(edital.prazo_inscricao);
  const timelineFim = getTimelineInscricaoFim(edital.timeline_estimada);

  // Se não dá pra extrair o "fim" de uma das fontes, trata como inconsistência (pra reprocessar).
  if (!prazoFim || !timelineFim) return true;

  const d1 = tryParseDateLoose(prazoFim);
  const d2 = tryParseDateLoose(timelineFim);
  if (d1 && d2) return d1 !== d2;

  // Se não dá pra parsear datas, compara texto normalizado (menos estrito, mas evita "falso consistente").
  return normalizeText(prazoFim) !== normalizeText(timelineFim);
}

async function main() {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const delayBetweenEditaisMs = parseInt(process.env.DELAY_BETWEEN_EDITAIS_MS || "30000", 10);

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║   UPDATE-EDITAL-INFO (INCONSISTENTE)                    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Puxamos só os campos necessários; filtramos em memória por heurística de inconsistência.
  const { data, error } = await supabase
    .from("editais")
    .select("id, numero, titulo, prazo_inscricao, timeline_estimada")
    .not("prazo_inscricao", "is", null)
    .not("timeline_estimada", "is", null)
    .order("criado_em", { ascending: false });

  if (error) {
    throw new Error(`Erro ao buscar editais: ${error.message}`);
  }

  const editais = (data ?? []) as EditalRow[];
  const inconsistent = editais.filter(hasInconsistency);

  console.log(`Editais com possível inconsistência: ${inconsistent.length}/${editais.length}`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < inconsistent.length; i++) {
    const edital = inconsistent[i];
    console.log(
      `\n[${i + 1}/${inconsistent.length}] ${edital.numero ?? "N/A"} — ${String(edital.titulo).slice(0, 70)}...`
    );

    try {
      const processedInfo = await processEditalInfo(supabase, edital, {
        // força atualização para tentar corrigir, mas não sobrescreve por vazio
        forceReextract: true,
        keepExistingOnEmpty: true,
      });

      await updateEditalInfo(supabase, edital.id, processedInfo);
      ok++;
      console.log("   ✅ Atualizado");
    } catch (e) {
      fail++;
      console.error("   ❌ Erro:", e instanceof Error ? e.message : e);
    }

    if (i < inconsistent.length - 1) {
      console.log(`   ⏳ Aguardando ${delayBetweenEditaisMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, delayBetweenEditaisMs));
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log(`✅ Sucesso: ${ok}  ❌ Falhas: ${fail}`);
}

// Executa ao rodar como script
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

