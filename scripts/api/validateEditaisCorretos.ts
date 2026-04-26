import "../load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  extractInfoViaOllama,
  getRagInvalidRetryTopKList,
  isRagCragEnabled,
  buildCragCorrectiveRagQuery,
} from "../lib/ollama-edital";

type EditalRow = {
  id: string;
  numero: string | null;
  titulo: string;
  descricao: string | null;
  processado_em: string | null;
  criado_em: string;
  atualizado_em: string | null;
  data_publicacao: string | null;
  data_encerramento: string | null;
  status: string | null;
  valor: string | null;
  area: string | null;
  orgao: string | null;
  fonte: string;
  link: string | null;
  informacoes_processadas_em: string | null;

  // extraídos
  valor_projeto: string | null;
  prazo_inscricao: string | null;
  localizacao: string | null;
  vagas: string | null;
  is_researcher: boolean | null;
  is_company: boolean | null;
  sobre_programa: string | null;
  criterios_elegibilidade: string | null;
  timeline_estimada: any | null;
};

// Validação/extrator: Ollama local (sem n8n).
// Requer: OLLAMA_BASE_URL e OLLAMA_MODEL no .env.local (ver scripts/lib/ollama-edital.ts).

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function supabaseEnv(): { url: string; key: string } {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const key =
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  if (!url || !key) {
    throw new Error(
      "Variáveis do Supabase não encontradas. Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.",
    );
  }
  return { url, key };
}

async function fetchEditalPdfIds(supabase: SupabaseClient, editalId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("edital_pdfs")
    .select("file_id")
    .eq("edital_id", editalId)
    .not("file_id", "is", null);
  if (error) {
    console.warn(`⚠️ Erro ao buscar PDFs do edital ${editalId}:`, error.message);
    return [];
  }
  return (data ?? []).map((r: any) => r.file_id).filter(Boolean);
}

function extractJsonBlock(s: string): string {
  const t = String(s || "").trim();
  if (!t) return "";
  if (t.includes("```")) {
    const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m?.[1]) return m[1].trim();
  }
  return t;
}

async function callExtractor(
  message: string,
  fileIds: string[],
  options?: {
    field?: string;
    ragQuery?: string;
    invalidRetryTopK?: number;
    invalidRetryContentVariant?: number;
    invalidRetryUsedContextSigs?: string[];
  },
): Promise<string> {
  const txt = await extractInfoViaOllama(message, fileIds, {
    field: options?.field || "validate-editais-corretos",
    ragQuery: (options?.ragQuery || message).slice(0, 600),
    invalidRetryTopK: options?.invalidRetryTopK,
    invalidRetryContentVariant: options?.invalidRetryContentVariant,
    invalidRetryUsedContextSigs: options?.invalidRetryUsedContextSigs,
  });
  if (!txt) throw new Error("Ollama retornou resposta vazia");
  return txt.trim();
}

function isTimelineEstimadaSiteShapeOk(v: any): boolean {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const fases = (v as any).fases;
  if (!Array.isArray(fases) || fases.length === 0) return false;
  for (const f of fases) {
    if (!f || typeof f !== "object") return false;
    if (typeof (f as any).nome !== "string" || !(f as any).nome.trim()) return false;
    if ((f as any).prazo != null && typeof (f as any).prazo !== "string") return false;
    if ((f as any).status != null && typeof (f as any).status !== "string") return false;
    if ((f as any).data_inicio != null && typeof (f as any).data_inicio !== "string") return false;
    if ((f as any).data_fim != null && typeof (f as any).data_fim !== "string") return false;
  }
  return true;
}

function validateFieldValueForSite(field: FieldKey, value: any): { ok: boolean; normalized: any } {
  if (value === undefined) return { ok: false, normalized: undefined };
  if (value === null) return { ok: true, normalized: null };

  const t = fieldType(field);
  if (t === "boolean") {
    return { ok: typeof value === "boolean", normalized: typeof value === "boolean" ? value : null };
  }
  if (t === "json") {
    if (field === "timeline_estimada") {
      if (!isTimelineEstimadaSiteShapeOk(value)) return { ok: false, normalized: null };
      return { ok: true, normalized: value };
    }
    if (typeof value === "object" && value !== null) return { ok: true, normalized: value };
    return { ok: false, normalized: null };
  }

  // string
  if (typeof value !== "string") return { ok: false, normalized: null };
  return { ok: true, normalized: normalizeMaybeString(value) };
}

function makeRepairToJsonPrompt(field: FieldKey, raw: string): string {
  return [
    "Corrija a saída abaixo para ficar APENAS JSON válido, sem texto extra.",
    "Regras:",
    `- O JSON deve conter exatamente a chave "${field}".`,
    "- Não use markdown e não use ```.",
    "- Se não houver evidência/certeza, retorne null.",
    "",
    `Formato esperado: ${jsonExample(field)}`,
    "",
    "SAÍDA A CORRIGIR:",
    raw,
  ].join("\n");
}

async function callJsonForField(
  field: FieldKey,
  message: string,
  fileIds: string[],
  opts?: { maxRetries?: number; ragQuery?: string },
): Promise<{ ok: boolean; value: any; raw: string }> {
  const maxRetries = Math.max(0, opts?.maxRetries ?? 3);
  const invalidRetryContextSigHistory: string[] = [];
  const ragEnabled =
    process.env.OLLAMA_USE_RAG !== "0" &&
    process.env.OLLAMA_USE_RAG !== "false" &&
    String(process.env.OLLAMA_USE_RAG ?? "true").toLowerCase() !== "off";
  const invalidRetryKs = ragEnabled ? getRagInvalidRetryTopKList() : [];

  let raw = await callExtractor(message, fileIds, {
    field,
    ragQuery: opts?.ragQuery,
    invalidRetryUsedContextSigs: invalidRetryContextSigHistory,
  });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const json = safeJsonParse(raw);
    const value = json && typeof json === "object" ? (json as any)[field] : undefined;
    const checked = validateFieldValueForSite(field, value);
    if (json && value !== undefined && checked.ok) {
      return { ok: true, value: checked.normalized, raw };
    }
    if (attempt === maxRetries) break;

    const repairPrompt = makeRepairToJsonPrompt(field, raw);
    raw = await callExtractor(repairPrompt, fileIds, {
      field,
      ragQuery: opts?.ragQuery,
      invalidRetryUsedContextSigs: invalidRetryContextSigHistory,
    });

    const afterRepairJson = safeJsonParse(raw);
    const afterRepairValue =
      afterRepairJson && typeof afterRepairJson === "object" ? (afterRepairJson as any)[field] : undefined;
    const afterRepairChecked = validateFieldValueForSite(field, afterRepairValue);
    if (afterRepairJson && afterRepairValue !== undefined && afterRepairChecked.ok) {
      return { ok: true, value: afterRepairChecked.normalized, raw };
    }

    if (invalidRetryKs.length > 0) {
      let lastInvalid = raw;
      for (let ri = 0; ri < invalidRetryKs.length; ri++) {
        const k = invalidRetryKs[ri]!;
        const correctedRagQuery = isRagCragEnabled()
          ? buildCragCorrectiveRagQuery(field, (opts?.ragQuery || message).slice(0, 600), lastInvalid, ri)
          : opts?.ragQuery;
        const retry = await callExtractor(repairPrompt, fileIds, {
          field,
          ragQuery: correctedRagQuery,
          invalidRetryTopK: k,
          invalidRetryContentVariant: ri + 1,
          invalidRetryUsedContextSigs: invalidRetryContextSigHistory,
        });
        if (!retry?.trim()) continue;
        const jj = safeJsonParse(retry);
        const vv = jj && typeof jj === "object" ? (jj as any)[field] : undefined;
        const cc = validateFieldValueForSite(field, vv);
        if (jj && vv !== undefined && cc.ok) {
          return { ok: true, value: cc.normalized, raw: retry };
        }
        lastInvalid = retry;
      }
    }
  }

  return { ok: false, value: null, raw };
}

type FieldKey =
  | "valor_projeto"
  | "prazo_inscricao"
  | "localizacao"
  | "vagas"
  | "is_researcher"
  | "is_company"
  | "sobre_programa"
  | "criterios_elegibilidade"
  | "timeline_estimada";

function fieldType(field: FieldKey): "string" | "boolean" | "json" {
  if (field === "timeline_estimada") return "json";
  if (field === "is_researcher" || field === "is_company") return "boolean";
  return "string";
}

function jsonExample(field: FieldKey): string {
  if (field === "timeline_estimada") {
    return `{"timeline_estimada":{"fases":[{"nome":"Inscrição","prazo":"...","status":"aberto|fechado|pendente","data_inicio":"YYYY-MM-DD","data_fim":"YYYY-MM-DD"}]}} ou {"timeline_estimada":null}`;
  }
  if (field === "is_researcher" || field === "is_company") {
    return `{"${field}": true} ou {"${field}": false} ou {"${field}": null}`;
  }
  return `{"${field}":"texto..."} ou {"${field}": null}`;
}

function makeValidateAndImproveCurrentPrompt(field: FieldKey, edital: EditalRow): string {
  const current = (edital as any)[field];
  const currentText = current == null ? "null" : JSON.stringify(current);
  const base = [
    "Você é um auditor/normalizador de dados de editais.",
    "Use SOMENTE o conteúdo dos PDFs anexados (file_ids). Procure pelo edital inteiro.",
    "Objetivo: validar se o VALOR ATUAL (do banco) tem evidência explícita no edital. Se tiver, melhore/padronize sem mudar o significado. Se não tiver evidência (ou estiver contraditório), retorne null.",
    "",
    `Edital: ${edital.numero || "N/A"} — ${edital.titulo}`,
    `Fonte: ${edital.fonte}`,
    "",
    `Campo: ${field}`,
    `Valor atual (banco): ${currentText}`,
  ];

  const fieldGuidance: Record<FieldKey, string> = {
    valor_projeto:
      "Valide e padronize o valor por projeto/bolsa/recursos. Preserve a unidade e a regra (por projeto, por bolsa, total, etc.).",
    prazo_inscricao:
      "Valide e padronize o(s) prazo(s) de inscrição/submissão. Se houver datas e horários, preserve. Se houver múltiplas janelas/etapas, resuma em uma string única clara.",
    localizacao:
      "Valide e padronize a elegibilidade geográfica/alcance (ex: 'Brasil', 'Estado do Ceará', 'Região Nordeste', 'Municípios do ES').",
    vagas:
      "Valide e padronize número de vagas/projetos/bolsas/selecionados. Se houver faixas, descreva (ex: 'até 30 projetos').",
    is_researcher:
      "Valide se o público-alvo inclui pesquisadores/ICTs/universidades como proponentes elegíveis. true/false/null (null se não houver evidência explícita).",
    is_company:
      "Valide se o público-alvo inclui empresas/startups como proponentes elegíveis. true/false/null (null se não houver evidência explícita).",
    sobre_programa:
      "Valide e melhore um parágrafo curto e objetivo sobre o programa/objetivo do edital, fiel ao texto.",
    criterios_elegibilidade:
      "Valide e padronize critérios/requisitos de elegibilidade em texto corrido (ou linhas separadas por \\n) com linguagem fiel ao edital. Não invente.",
    timeline_estimada:
      "Valide se existe cronograma/timeline no edital. Se sim, normalize para o formato do site (fases com datas/prazos quando existirem). Se não houver, retorne null.",
  };

  return [
    ...base,
    fieldGuidance[field],
    "",
    "Formato de saída obrigatório: APENAS JSON válido.",
    `Exemplo: ${jsonExample(field)}`,
  ].join("\n");
}

function normalizeMaybeString(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.toLowerCase() === "não informado") return null;
  return s;
}

function safeJsonParse(s: string): any | null {
  const t = extractJsonBlock(s);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Desembrulha JSON guardado como string (incl. dupla serialização). */
function unwrapJsonLayers(v: any, maxDepth = 5): any {
  let cur = v;
  for (let d = 0; d < maxDepth; d++) {
    if (typeof cur !== "string") return cur;
    const t = cur.trim();
    if (!t) return null;
    const looksJson =
      (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
    if (!looksJson) return cur;
    try {
      cur = JSON.parse(t);
    } catch {
      return cur;
    }
  }
  return cur;
}

/** Uma única string JSON para `prazo_inscricao` (TEXT), ou texto simples, ou null. */
function canonicalizePrazoInscricaoForSite(v: any): string | null {
  if (v == null) return null;
  const unwrapped = unwrapJsonLayers(v);
  if (unwrapped == null) return null;
  if (typeof unwrapped === "object") {
    try {
      return JSON.stringify(unwrapped);
    } catch {
      return null;
    }
  }
  return normalizeMaybeString(String(unwrapped));
}

function hasAnyDateSignalInText(text: string): boolean {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(t)) return true;
  if (/\b\d{1,2}\s+de\s+[a-zA-ZÀ-ÿçÇ]+\s+de\s+\d{4}\b/i.test(t)) return true;
  if (/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}\b/.test(t)) return true;
  return false;
}

function dateFromEncerramento(dataEnc: string | null | undefined): Date | null {
  if (!dataEnc) return null;
  const d = new Date(String(dataEnc).trim());
  return isNaN(d.getTime()) ? null : d;
}

/** Algo que o painel consiga usar como prazo (data_encerramento, prazo_inscricao ou timeline). */
function hasParseableSubmissionDeadline(row: {
  data_encerramento?: string | null;
  prazo_inscricao?: string | null;
  timeline_estimada?: any;
}): boolean {
  if (dateFromEncerramento(row.data_encerramento)) return true;

  const prazo = row.prazo_inscricao;
  if (prazo && hasAnyDateSignalInText(typeof prazo === "string" ? prazo : JSON.stringify(prazo))) return true;

  const tl = unwrapJsonLayers(row.timeline_estimada);
  if (tl && typeof tl === "object" && Array.isArray((tl as any).fases)) {
    for (const f of (tl as any).fases) {
      if (!f || typeof f !== "object") continue;
      const bits = [f.data_fim, f.data_inicio, f.prazo, f.fim].filter(Boolean).map(String);
      if (bits.some((b) => hasAnyDateSignalInText(b))) return true;
    }
  }
  return false;
}

function assessEditalCorretoPresentable(row: {
  titulo: string;
  descricao?: string | null;
  sobre_programa?: string | null;
  link?: string | null;
  fonte: string;
  is_researcher?: boolean | null;
  is_company?: boolean | null;
  data_encerramento?: string | null;
  prazo_inscricao?: string | null;
  timeline_estimada?: any;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const minResumo = Math.max(20, parseInt(process.env.VALIDATE_MIN_RESUMO_CHARS || "50", 10) || 50);

  const titulo = String(row.titulo || "").trim();
  if (titulo.length < 5) reasons.push("titulo_curto");

  const link = String(row.link || "").trim();
  if (!/^https?:\/\//i.test(link)) reasons.push("link_invalido");

  if (!String(row.fonte || "").trim()) reasons.push("fonte_ausente");

  const resumo = String(row.sobre_programa || row.descricao || "").trim();
  if (resumo.length < minResumo) reasons.push("resumo_insuficiente");

  if (row.is_researcher === false && row.is_company === false) {
    reasons.push("publico_alvo_exclui_pesquisador_e_empresa");
  }

  if (!hasParseableSubmissionDeadline(row)) {
    reasons.push("sem_prazo_parseavel");
  }

  return { ok: reasons.length === 0, reasons };
}

async function updateOriginalEditalField(
  supabase: SupabaseClient,
  editalId: string,
  field: FieldKey,
  value: any,
): Promise<void> {
  const patch: any = { [field]: value };
  const { error } = await supabase.from("editais").update(patch).eq("id", editalId);
  if (error) {
    throw new Error(`Erro ao atualizar edital (editais.${field}): ${error.message}`);
  }
}

async function validateOneEdital(supabase: SupabaseClient, edital: EditalRow) {
  const fileIds = await fetchEditalPdfIds(supabase, edital.id);
  const fieldList = [
    "valor_projeto",
    "prazo_inscricao",
    "localizacao",
    "vagas",
    "is_researcher",
    "is_company",
    "sobre_programa",
    "criterios_elegibilidade",
    "timeline_estimada",
  ] as const;

  const validated: Record<string, any> = {};
  const report: any = { file_ids_count: fileIds.length, fields: {} as any };

  /** Estado consolidado dos campos extraídos (para upsert e para “apresentável”). */
  const current: Record<string, any> = {};
  for (const f of fieldList) {
    current[f] = (edital as any)[f] ?? null;
  }

  for (const field of fieldList) {
    const before = (edital as any)[field] ?? null;
    if (before == null) {
      report.fields[field] = { skipped: true, reason: "before_is_null", before, after: null };
      validated[field] = null;
      current[field] = null;
      continue;
    }

    const ragQuery = `${field}: evidência do valor no edital. valor_atual=${String(before).slice(0, 180)}`;
    const prompt = makeValidateAndImproveCurrentPrompt(field, edital);
    const validatedJson = await callJsonForField(field, prompt, fileIds, { maxRetries: 4, ragQuery });
    const finalValue = validatedJson.ok ? validatedJson.value : null;

    report.fields[field] = {
      validated_ok: validatedJson.ok,
      before,
      after: finalValue,
      validate_raw: validatedJson.raw?.slice?.(0, 800) ?? null,
    };

    if (!validatedJson.ok) continue;

    validated[field] = finalValue;
    current[field] = finalValue;

    // Se inválido => atualizar o edital antigo, setando null.
    // Se válido e diferente => atualizar edital antigo com versão melhorada.
    const shouldNull =
      finalValue === null &&
      before !== null &&
      before !== undefined;

    const changed =
      finalValue !== null &&
      JSON.stringify(before) !== JSON.stringify(finalValue);

    if (shouldNull) {
      await updateOriginalEditalField(supabase, edital.id, field, null);
    } else if (changed) {
      await updateOriginalEditalField(supabase, edital.id, field, finalValue);
    }
  }

  current.prazo_inscricao = canonicalizePrazoInscricaoForSite(current.prazo_inscricao);

  // Montar row final (copiando metadados do edital original)
  const rowToUpsert: any = {
    id: edital.id,
    numero: edital.numero,
    titulo: edital.titulo,
    descricao: edital.descricao,
    processado_em: edital.processado_em,
    criado_em: edital.criado_em,
    atualizado_em: edital.atualizado_em,
    data_publicacao: edital.data_publicacao,
    data_encerramento: edital.data_encerramento,
    status: edital.status,
    valor: edital.valor,
    area: edital.area,
    orgao: edital.orgao,
    fonte: edital.fonte,
    link: edital.link,

    origem_informacoes_processadas_em: edital.informacoes_processadas_em,
    validado_em: new Date().toISOString(),
    validation_report: report,

    valor_projeto: typeof current.valor_projeto === "string" ? normalizeMaybeString(current.valor_projeto) : current.valor_projeto,
    prazo_inscricao: current.prazo_inscricao,
    localizacao: typeof current.localizacao === "string" ? normalizeMaybeString(current.localizacao) : current.localizacao,
    vagas: typeof current.vagas === "string" ? normalizeMaybeString(current.vagas) : current.vagas,
    is_researcher: typeof current.is_researcher === "boolean" ? current.is_researcher : null,
    is_company: typeof current.is_company === "boolean" ? current.is_company : null,
    sobre_programa:
      typeof current.sobre_programa === "string" ? normalizeMaybeString(current.sobre_programa) : current.sobre_programa,
    criterios_elegibilidade:
      typeof current.criterios_elegibilidade === "string"
        ? normalizeMaybeString(current.criterios_elegibilidade)
        : current.criterios_elegibilidade,
    timeline_estimada: current.timeline_estimada == null ? null : current.timeline_estimada,
  };

  // Guard rails mínimos: não inserir linha “vazia”
  const hasAnyUsefulField = Boolean(
    rowToUpsert.valor_projeto ||
      rowToUpsert.prazo_inscricao ||
      rowToUpsert.sobre_programa ||
      rowToUpsert.criterios_elegibilidade ||
      rowToUpsert.timeline_estimada ||
      rowToUpsert.localizacao ||
      rowToUpsert.vagas ||
      rowToUpsert.is_researcher != null ||
      rowToUpsert.is_company != null,
  );
  if (!hasAnyUsefulField) {
    console.warn(`⚠️ Pulando ${edital.id}: validação não gerou campos úteis.`);
    return { inserted: false };
  }

  const present = assessEditalCorretoPresentable(rowToUpsert);
  report.presentable = present.ok;
  report.presentable_reasons = present.reasons;
  if (!present.ok) {
    console.warn(
      `  ⚠️ Não salvo em editais_corretos (não apresentável no site): ${present.reasons.join(", ")}`,
    );
    return { inserted: false };
  }

  const { error } = await supabase.from("editais_corretos").upsert(rowToUpsert, { onConflict: "id" });
  if (error) {
    const hint =
      /column.*editais_corretos|schema cache/i.test(error.message)
        ? " A tabela no projeto pode estar desatualizada: execute no Supabase `scripts/db/migration-editais-corretos-add-missing-columns.sql` (e confira `migration-add-editais-corretos.sql`)."
        : "";
    throw new Error(`Erro ao upsert em editais_corretos: ${error.message}.${hint}`);
  }
  return { inserted: true };
}

async function main() {
  const { url, key } = supabaseEnv();
  const supabase = createClient(url, key);

  /**
   * Por padrão, processa TODOS os editais elegíveis (com paginação).
   * - VALIDATE_EDITAIS_LIMIT > 0: limita o total (útil para testes)
   * - VALIDATE_EDITAIS_LIMIT = 0: sem limite (processar tudo)
   * - VALIDATE_EDITAIS_BATCH: tamanho do batch de paginação (default 200)
   */
  const limitRaw = Number.parseInt(process.env.VALIDATE_EDITAIS_LIMIT || "0", 10);
  const totalLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : Infinity;
  const batchSize = Math.max(20, Number.parseInt(process.env.VALIDATE_EDITAIS_BATCH || "200", 10) || 200);
  // Requisito: se o edital já estiver em editais_corretos ("confirmado"), não reavaliar.
  // Para revalidar manualmente, use VALIDATE_FORCE_REVALIDATE=1.
  const forceRevalidate = String(process.env.VALIDATE_FORCE_REVALIDATE ?? "0") === "1";
  const onlyNew = !forceRevalidate;

  console.log("🔎 Validando editais para editais_corretos");
  console.log(`🔗 Supabase: ${new URL(url).host}`);
  console.log(`📦 Limite: ${Number.isFinite(totalLimit) ? totalLimit : "sem limite"}`);
  console.log(`📄 Batch: ${batchSize}`);
  console.log(`🧠 Extrator: Ollama (OLLAMA_BASE_URL)`);

  const delayMs = Number.parseInt(process.env.API_REQUEST_DELAY_MS || "3000", 10);
  const betweenEditaisMs = Number.parseInt(process.env.DELAY_BETWEEN_EDITAIS_MS || "6000", 10);

  let ok = 0;
  let fail = 0;
  let skipped = 0;
  let seen = 0;

  const selectCols =
    "id,numero,titulo,descricao,processado_em,criado_em,atualizado_em,data_publicacao,data_encerramento,status,valor,area,orgao,fonte,link,informacoes_processadas_em,valor_projeto,prazo_inscricao,localizacao,vagas,is_researcher,is_company,sobre_programa,criterios_elegibilidade,timeline_estimada";

  const existsInEditaisCorretos = async (ids: string[]): Promise<Set<string>> => {
    const out = new Set<string>();
    const chunkSize = 200; // evita URL grande e limites de IN
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase.from("editais_corretos").select("id").in("id", chunk);
      if (error) throw new Error(`Erro ao verificar editais_corretos: ${error.message}`);
      for (const r of data ?? []) {
        const id = (r as any)?.id;
        if (id) out.add(String(id));
      }
    }
    return out;
  };

  for (let offset = 0; seen < totalLimit; offset += batchSize) {
    const remaining = Number.isFinite(totalLimit) ? Math.max(0, totalLimit - seen) : batchSize;
    const pageLimit = Math.min(batchSize, remaining || batchSize);

    const { data: editaisPage, error } = await supabase
      .from("editais")
      .select(selectCols)
      .not("informacoes_processadas_em", "is", null)
      .order("informacoes_processadas_em", { ascending: false })
      .range(offset, offset + pageLimit - 1);
    if (error) throw new Error(`Erro ao buscar editais: ${error.message}`);
    const page = (editaisPage ?? []) as EditalRow[];
    if (page.length === 0) break;

    let existingSet = new Set<string>();
    if (onlyNew) {
      existingSet = await existsInEditaisCorretos(page.map((e) => e.id));
    }

    for (const edital of page) {
      if (seen >= totalLimit) break;
      seen++;

      if (onlyNew && existingSet.has(edital.id)) {
        skipped++;
        continue;
      }

      console.log(`\n🧾 ${edital.numero || "N/A"} — ${edital.titulo} (${edital.fonte})`);
      try {
        const r = await validateOneEdital(supabase, edital);
        if (r.inserted) {
          ok++;
          console.log("  ✅ Salvo em editais_corretos");
        } else {
          skipped++;
          console.log("  ⚠️ Nada para salvar");
        }
      } catch (err) {
        fail++;
        console.error("  ❌ Falhou:", err instanceof Error ? err.message : String(err));
      }
      if (delayMs > 0) await delay(delayMs);
      if (betweenEditaisMs > 0) await delay(betweenEditaisMs);
    }
  }

  console.log(`\n✅ Concluído. Sucesso: ${ok} | Pulados: ${skipped} | Falhas: ${fail}`);
}

main().catch((e) => {
  console.error("❌ Erro fatal:", e);
  process.exitCode = 1;
});

