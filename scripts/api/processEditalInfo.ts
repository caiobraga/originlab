// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getDelayBetweenEditaisMs,
  getOllamaFieldConcurrency,
  getProcessEditalBatchConcurrency,
  getWebhookOrLocalApiDefaultDelayMs,
  sleepFieldExtractDelay,
} from '../lib/process-edital-delays';
import { runWithConcurrency } from '../lib/run-with-concurrency';

// Modo de extração: Ollama local > API local > n8n webhook
const USE_OLLAMA = process.env.USE_OLLAMA === 'true';
const USE_LOCAL_API = process.env.USE_LOCAL_API === 'true'; // Default: false (usa n8n)
const LOCAL_API_URL = process.env.LOCAL_API_URL || "http://localhost:3000/api/extract-edital-info";
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://n8n.srv652789.hstgr.cloud/webhook/basic";
const WEBHOOK_LIGHT_URL = process.env.N8N_WEBHOOK_LIGHT_URL || WEBHOOK_URL;

interface EditalInfo {
  id: string;
  numero: string | null;
  titulo: string;
  fonte?: string | null;
  valor_projeto?: string | null;
  prazo_inscricao?: string | null;
  localizacao?: string | null;
  vagas?: string | null;
  is_researcher?: boolean | null;
  is_company?: boolean | null;
  sobre_programa?: string | null;
  criterios_elegibilidade?: string | null;
  timeline_estimada?: any | null;
}

interface ProcessedInfo {
  valor_projeto?: string;
  prazo_inscricao?: string | string[]; // Pode ser string única ou array de prazos
  localizacao?: string;
  vagas?: string;
  is_researcher?: boolean;
  is_company?: boolean;
  sobre_programa?: string;
  criterios_elegibilidade?: string;
  timeline_estimada?: any;
}

/** Expõe mensagem do Postgrest e, em falhas de rede, códigos em `cause` (ex.: ENOTFOUND, ECONNREFUSED). */
function formatSupabaseRequestError(err: unknown): string {
  const chunks: string[] = [];
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
    cause?: unknown;
  };
  if (e?.message) chunks.push(String(e.message));
  if (e?.details) chunks.push(`details: ${e.details}`);
  if (e?.hint) chunks.push(`hint: ${e.hint}`);
  if (e?.code != null && String(e.code) !== "") chunks.push(`code: ${e.code}`);

  let c: unknown = e?.cause;
  let depth = 0;
  while (c != null && depth < 6) {
    if (typeof AggregateError !== "undefined" && c instanceof AggregateError && Array.isArray(c.errors)) {
      chunks.push(
        `causa (aggregate): ${c.errors
          .map((x) => {
            if (!(x instanceof Error)) return String(x);
            const ne = x as NodeJS.ErrnoException;
            return `${x.message}${ne.code ? ` [${ne.code}]` : ""}`;
          })
          .join("; ")}`,
      );
    } else if (c instanceof Error) {
      const ne = c as NodeJS.ErrnoException;
      const code = ne.code ? ` [${ne.code}]` : "";
      chunks.push(`causa: ${c.name}: ${c.message}${code}`);
    } else if (typeof c === "object" && c !== null && "message" in c) {
      chunks.push(`causa: ${String((c as { message: unknown }).message)}`);
    } else {
      chunks.push(`causa: ${String(c)}`);
    }
    c =
      typeof c === "object" && c !== null && "cause" in c
        ? (c as { cause: unknown }).cause
        : undefined;
    depth++;
  }

  return chunks.length > 0 ? chunks.join(" | ") : String(err);
}

/** Percorre `cause` / `AggregateError` para achar códigos `errno` (ex.: ENETUNREACH). */
function collectNetworkErrnoCodes(err: unknown, depth = 0): Set<string> {
  const out = new Set<string>();
  if (depth > 10 || err == null) return out;
  if (typeof err === "object") {
    const code = (err as NodeJS.ErrnoException).code;
    if (typeof code === "string" && code.length > 0) out.add(code);
    if (typeof AggregateError !== "undefined" && err instanceof AggregateError && Array.isArray(err.errors)) {
      for (const sub of err.errors) {
        for (const c of collectNetworkErrnoCodes(sub, depth + 1)) out.add(c);
      }
    }
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined && cause !== err) {
      for (const c of collectNetworkErrnoCodes(cause, depth + 1)) out.add(c);
    }
  }
  return out;
}

/** Dicas quando o Supabase falha antes do PostgREST (fetch / TLS / rota). */
function supabaseNetworkUserHint(err: unknown): string {
  const codes = collectNetworkErrnoCodes(err);
  const triggers = new Set(["ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "ECONNRESET"]);
  if (![...codes].some((c) => triggers.has(c))) return "";
  const lines = [
    "",
    "💡 Falha de rede até o Supabase (não é SQL):",
    "  · Teste (use a mesma URL do .env.local): curl -sI \"https://<projeto>.supabase.co/rest/v1/\" | head -5",
    "  · Confirme internet, VPN e firewall (rede corporativa costuma bloquear *.supabase.co).",
  ];
  if (codes.has("ENETUNREACH") || codes.has("EHOSTUNREACH")) {
    lines.push(
      "  · ENETUNREACH: sem rota ao host — às vezes DNS/IPv6 no Node; tente: NODE_OPTIONS=--dns-result-order=ipv4first npm run api:process-edital-info",
    );
  }
  if (codes.has("ENOTFOUND") || codes.has("EAI_AGAIN")) {
    lines.push("  · DNS: verifique resolução do hostname (ex.: dig +short <projeto>.supabase.co).");
  }
  return `\n${lines.join("\n")}`;
}

/** Linha de `edital_pdfs` usada para ordem/filtro antes de montar o contexto PDF no Ollama. */
type EditalPdfRef = {
  /** `file_id` do storage quando existir; senão `id` da linha (compatível com `documents` / Ollama). */
  storageKey: string;
  nome_arquivo: string;
  criado_em: string | null;
};

function normalizeEditalPdfNomeArquivo(nomeArquivo: string): string {
  return String(nomeArquivo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * PDF institucional anexado ao processo mas que não é o texto da chamada (integridade, conduta, LGPD…).
 * Usado em ordenação (tier 2) e filtro quando há ≥2 ficheiros.
 */
function editalPdfNomeLooksInstitutionalNoise(nomeArquivo: string): boolean {
  const n = normalizeEditalPdfNomeArquivo(nomeArquivo);
  if (
    /\b(integridade|compliance|plano\s+de\s+integridade|codigo\s+de\s+etica|codigo\s+etica|politica\s+de\s+privacidade|protecao\s+de\s+dados|\blgpd\b|canal\s+de\s+denuncia)\b/.test(
      n,
    )
  ) {
    return true;
  }
  // «Código de Conduta», variações com _ ou - no nome do ficheiro (com ou sem «de»)
  if (/\bcodigo[\s_\-]+de[\s_\-]+conduta\b/.test(n) || /\bcodigo[\s_\-]+conduta\b/.test(n)) return true;
  if (/\bconduta[\s_\-]+fapesc\b/.test(n) || /\bfapesc[\s_\-]+conduta\b/.test(n)) return true;
  if (/\bmanual\s+de\s+conduta\b/.test(n)) return true;
  return false;
}

/**
 * Ordem no contexto PDF concatenado: **menor = mais à frente** (ganha a janela truncada).
 * -1: nome sugere edital/chamada/extrato (prioridade).
 * 0: neutro.
 * 1: anexo/modelo de formulário.
 * 2: documentos institucionais — muita densidade de texto sem valores/prazos do edital.
 */
function editalPdfContextSortTier(nomeArquivo: string): number {
  const n = normalizeEditalPdfNomeArquivo(nomeArquivo);
  if (
    /\b(chamada\s+publica|chamada_publica|chamada-publica|edital|extrato|publicacao\s+de\s+chamada|retificacao)\b/.test(
      n,
    )
  ) {
    return -1;
  }
  if (editalPdfNomeLooksInstitutionalNoise(nomeArquivo)) return 2;
  if (/\b(anexo|declaracao|declarac|termo\s+de|modelo|formulario|formulari)\b/.test(n)) return 1;
  return 0;
}

function sortEditalPdfRefs(refs: EditalPdfRef[]): EditalPdfRef[] {
  return [...refs].sort((a, b) => {
    const w = editalPdfContextSortTier(a.nome_arquivo) - editalPdfContextSortTier(b.nome_arquivo);
    if (w !== 0) return w;
    const ta = a.criado_em ? Date.parse(a.criado_em) : 0;
    const tb = b.criado_em ? Date.parse(b.criado_em) : 0;
    if (ta !== tb) return ta - tb;
    return a.nome_arquivo.localeCompare(b.nome_arquivo, "pt", { sensitivity: "base" });
  });
}

/**
 * Omitir PDFs cujo `nome_arquivo` sugira: (a) anexo/modelo de declaração ou (b) documento institucional
 * (Plano de Integridade, compliance, LGPD, etc.) — ruído no modo PDF concatenado / RAG=0.
 * Usado na extração de campos do edital; anexos com valores podem ficar de fora só quando há outro PDF.
 * Com um único PDF não filtra; se o filtro removesse tudo, mantém a lista completa ordenada.
 */
function filterPdfRefsOmitFormAnnexByFileName(refs: EditalPdfRef[]): EditalPdfRef[] {
  if (refs.length <= 1) return refs;
  const looksLikeNoise = (nome: string) => {
    const n = normalizeEditalPdfNomeArquivo(nome);
    if (/\b(anexo|declaracao|declarac|termo\s+de|modelo|formulario|formulari)\b/.test(n)) return true;
    if (editalPdfNomeLooksInstitutionalNoise(nome)) return true;
    return false;
  };
  const kept = refs.filter((r) => !looksLikeNoise(r.nome_arquivo));
  return kept.length > 0 ? kept : refs;
}

/** `OLLAMA_EXTRACT_PDF_NOME_FILTER=0`: não omite PDFs por nome (lista completa para RAG/concat). Default: filtra. */
function isExtractPdfNomeFilterOn(): boolean {
  const v = (process.env.OLLAMA_EXTRACT_PDF_NOME_FILTER ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

function filterPdfRefsForExtract(refs: EditalPdfRef[]): EditalPdfRef[] {
  return isExtractPdfNomeFilterOn() ? filterPdfRefsOmitFormAnnexByFileName(refs) : refs;
}

/**
 * Busca PDFs do edital com `nome_arquivo` e `criado_em` para ordenação estável (principal antes de anexos-modelo).
 */
async function fetchEditalPdfRefs(supabase: SupabaseClient, editalId: string): Promise<EditalPdfRef[]> {
  try {
    const { data, error } = await supabase
      .from("edital_pdfs")
      .select("file_id, id, nome_arquivo, criado_em")
      .eq("edital_id", editalId);

    if (error) {
      console.error(`Erro ao buscar PDFs do edital ${editalId}:`, error);
      return [];
    }

    const refs: EditalPdfRef[] = (data || [])
      .map((pdf: { file_id?: string | null; id?: string; nome_arquivo?: string | null; criado_em?: string | null }) => {
        const key = String(pdf.file_id || pdf.id || "").trim();
        if (!key) return null;
        return {
          storageKey: key,
          nome_arquivo: String(pdf.nome_arquivo || "").trim() || "(sem nome)",
          criado_em: pdf.criado_em != null ? String(pdf.criado_em) : null,
        };
      })
      .filter((r): r is EditalPdfRef => r != null);

    return sortEditalPdfRefs(refs);
  } catch (error) {
    console.error(`Erro ao buscar PDFs do edital ${editalId}:`, error);
    return [];
  }
}

/**
 * Busca os IDs dos PDFs de um edital para uso no RAG (documents) e no Ollama.
 * Retorna file_id (storage) quando existir, senão edital_pdfs.id, para bater com documents.file_id.
 * Ordem: edital/chamada no nome primeiro; depois neutros; anexos-modelo; por último integridade/compliance/LGPD; `criado_em` asc como desempate.
 */
async function fetchEditalPdfIds(supabase: SupabaseClient, editalId: string): Promise<string[]> {
  const refs = await fetchEditalPdfRefs(supabase, editalId);
  return refs.map((r) => r.storageKey);
}

/**
 * Verifica se o valor indica "não encontrado"
 */
function isNotFoundMessage(value: string): boolean {
  const lowerValue = value.toLowerCase();
  
  // Padrões que definitivamente indicam "não encontrado"
  const definitiveNotFoundPatterns = [
    'não foi possível encontrar',
    'não foi possível determinar',
    'não foi possível identificar',
    'não foi possível obter',
    'não consegui obter',
    'não consegui encontrar',
    'não retornou nenhuma informação',
    'não posso fornecer',
    'ferramenta de consulta não retornou',
    'não há informações sobre',
    'não há dados disponíveis sobre',
    'informação não está disponível',
    'informação não está disponível para',
    'dados não estão disponíveis',
    'sem informação',
    'não localizado',
    'não encontrada',
    'não encontrado',
    'não disponível',
    'file_id fornecido',
    'file_id especificado',
    'file_id não foi encontrado',
    'identificador não foi encontrado',
    'não foi encontrado nas informações',
    'não contém esses dados',
    'não continham esses dados',
    'não especifica o número',
    'não foram encontradas quantidades',
    'não especifica',
  ];
  
  // Verificar se contém padrões definitivos de "não encontrado"
  const hasDefinitiveNotFound = definitiveNotFoundPatterns.some(pattern => 
    lowerValue.includes(pattern)
  );
  
  // Se tem padrão definitivo, verificar se NÃO contém informações válidas
  if (hasDefinitiveNotFound) {
    // Se contém informações válidas (números, datas, localizações conhecidas), não é "não encontrado"
    // Regex para detectar valores monetários com várias moedas
    const currencyRegex = /(r\$|us\$|\$|€|£|¥|chf|cad|aud|nzd|brl|eur|gbp|jpy)\s*[\d.,]+/i;
    const hasValidInfo = 
      /\d+/.test(value) || // Contém números
      /espírito santo|brasil|es|rj|mg|sp/i.test(value) || // Contém localizações
      /\d{2}\/\d{2}\/\d{4}/.test(value) || // Contém datas
      currencyRegex.test(value); // Contém valores monetários (qualquer moeda)
    
    // Se tem informações válidas, não é "não encontrado"
    if (hasValidInfo) {
      return false;
    }
    
    return true;
  }
  
  // Se não tem padrão definitivo, não é "não encontrado"
  return false;
}

/** Texto explicativo do modelo sobre ausência de dados — não persistir como valor de campo estruturado. */
const META_ABSENCE_PROSE_RE =
  /não especificad|não contém|documento (fornecido )?não|o documento fornecido|sem (uma )?(cronograma|data|valor)|observa(ç|c)ão textual|portanto, o campo|preenchendo com (uma )?observa|não há (informa|cronograma)|valor único para o projeto/i;

function hasLikelyCalendarOrNumericHint(s: string): boolean {
  const t = String(s || "").trim();
  return (
    /\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(t) ||
    /\d{4}-\d{2}-\d{2}/.test(t) ||
    /\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/i.test(t) ||
    /\d+\s*dias?\b/i.test(t) ||
    /\b\d{1,3}\s*(?:h|horas)\b/i.test(t)
  );
}

function looksLikeValorProjetoSnippet(s: string, maxLen = 320): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.length > maxLen) return false;
  if (META_ABSENCE_PROSE_RE.test(t) && !/(R\$|US\$|€|\bEUR\b|\bUSD\b|\d+[.,]\d{3})/i.test(t)) {
    return false;
  }
  return (
    /(r\$|us\$|€|£|\$|eur|usd|brl|\bvalor\b.{0,40}\d)/i.test(t) ||
    /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?/.test(t) ||
    /^\s*[\d]+(?:[.,]\d+)?\s*$/.test(t)
  );
}

/** Evita gravar objeto {"valor":"parágrafo dizendo que não há valor"...} ou só meta-texto. */
function isSubstantiveValorProjetoPayload(jsonData: unknown): boolean {
  if (jsonData === null || jsonData === undefined) return false;
  if (typeof jsonData === 'string') return looksLikeValorProjetoSnippet(jsonData);
  if (typeof jsonData !== 'object' || Array.isArray(jsonData)) return false;
  const o = jsonData as Record<string, unknown>;
  const list = o.valores;
  if (Array.isArray(list) && list.length > 0) {
    const ok = list.some((item) =>
      typeof item === 'string'
        ? looksLikeValorProjetoSnippet(item, 420)
        : typeof item === 'number' && Number.isFinite(item),
    );
    if (ok) return true;
  }
  const inner = o.valor ?? o.valor_projeto ?? o.value;
  if (typeof inner === 'string') return looksLikeValorProjetoSnippet(inner);
  if (typeof inner === 'number') return Number.isFinite(inner);
  if (Array.isArray(inner)) return inner.length > 0 && inner.some((x) => typeof x === 'string' && looksLikeValorProjetoSnippet(x, 420));
  if (typeof inner === 'object' && inner !== null && Object.keys(inner).length > 0) return true;
  return false;
}

/** `{"valor":null}` / `{"valores":[]}` — resposta explícita de “sem valor”, não JSON inválido. */
function isExplicitEmptyValorProjetoJson(jsonData: unknown): boolean {
  if (typeof jsonData !== 'object' || jsonData === null || Array.isArray(jsonData)) return false;
  const o = jsonData as Record<string, unknown>;
  const allowedKeys = new Set(['valor', 'valores', 'valor_projeto', 'value']);
  const keys = Object.keys(o);
  if (keys.length === 0) return true;
  if (!keys.every((k) => allowedKeys.has(k))) return false;

  const rawValor = o.valor ?? o.valor_projeto ?? o.value;
  const valorEmpty =
    rawValor == null ||
    (typeof rawValor === 'string' && !looksLikeValorProjetoSnippet(rawValor)) ||
    (typeof rawValor === 'number' && !Number.isFinite(rawValor));

  const list = o.valores;
  const valsEmpty =
    !Array.isArray(list) ||
    list.length === 0 ||
    list.every((item) => {
      if (item == null) return true;
      if (typeof item === 'number') return !Number.isFinite(item);
      if (typeof item === 'string') return !looksLikeValorProjetoSnippet(item, 420);
      return true;
    });

  return valorEmpty && valsEmpty;
}

/** timeline_estimada deve ter fases com dados úteis, não só {"timeline":"<meta>"}. */
function isSubstantiveTimelinePayload(timeline: unknown): boolean {
  if (timeline === null) return true;
  if (typeof timeline !== 'object' || timeline === null) return false;
  const o = timeline as Record<string, unknown>;
  if (o.fases && Array.isArray(o.fases)) {
    if (o.fases.length === 0) return false;
    return o.fases.some((f) => {
      if (!f || typeof f !== 'object') return false;
      const fo = f as Record<string, unknown>;
      const nome = typeof fo.nome === 'string' ? fo.nome.trim() : '';
      const prazo = typeof fo.prazo === 'string' ? fo.prazo.trim() : '';
      const blob = `${nome} ${prazo} ${typeof fo.descricao === 'string' ? fo.descricao : ''}`;
      if (nome.length >= 2 && hasLikelyCalendarOrNumericHint(blob)) return true;
      if (typeof fo.data_inicio === 'string' && hasLikelyCalendarOrNumericHint(fo.data_inicio)) return true;
      if (typeof fo.data_fim === 'string' && hasLikelyCalendarOrNumericHint(fo.data_fim)) return true;
      if (nome.length >= 3 && blob.length <= 900 && !META_ABSENCE_PROSE_RE.test(blob)) return true;
      return false;
    });
  }
  if (typeof o.timeline === 'string') {
    const ts = o.timeline.trim();
    if (ts.length > 0 && META_ABSENCE_PROSE_RE.test(ts)) return false;
    if (hasLikelyCalendarOrNumericHint(ts)) return true;
    return ts.length >= 8 && ts.length <= 280 && !META_ABSENCE_PROSE_RE.test(ts);
  }
  return false;
}

function sanitizePrazoEntries(prazos: unknown[]): unknown[] {
  return prazos.filter((p) => {
    if (p == null) return false;
    if (typeof p === 'object') {
      const po = p as Record<string, unknown>;
      const blob = `${po.inicio ?? ''} ${po.fim ?? ''} ${po.chamada ?? ''} ${po.prazo ?? ''}`;
      if (hasLikelyCalendarOrNumericHint(blob)) return true;
      if (po.inicio || po.fim || po.chamada || po.prazo) return true;
      return false;
    }
    if (typeof p === 'string') {
      const s = p.trim();
      if (!s) return false;
      if (hasLikelyCalendarOrNumericHint(s)) return true;
      if (s.length <= 120 && !META_ABSENCE_PROSE_RE.test(s)) return true;
      return false;
    }
    return false;
  });
}

function isSubstantivePrazoPayload(jsonData: unknown): boolean {
  if (jsonData === null || jsonData === undefined) return false;
  let raw: unknown[] = [];
  if (Array.isArray(jsonData)) raw = jsonData;
  else if (typeof jsonData === 'object' && jsonData !== null && Array.isArray((jsonData as { prazos?: unknown }).prazos)) {
    raw = (jsonData as { prazos: unknown[] }).prazos;
  } else return false;
  return sanitizePrazoEntries(raw).length > 0;
}

/**
 * Extrai um objeto JSON “de campo” da resposta bruta do modelo (markdown, n8n com `output`, etc.).
 * Usado só para validação rápida antes de retentar o RAG com outro top_k.
 */
function tryExtractJsonDataFromOllamaResponse(responseText: string): any | null {
  let t = String(responseText || "").trim();
  if (!t) return null;

  try {
    const p = JSON.parse(t);
    if (Array.isArray(p) && p.length > 0) {
      const first = p[0] as Record<string, unknown>;
      if (first && typeof first.output === "string") {
        t = first.output.trim();
      } else if (first && first.output != null) {
        t = typeof first.output === "object" ? JSON.stringify(first.output) : String(first.output);
      }
    }
  } catch {
    // continua com texto bruto
  }

  const fb = t.indexOf("```");
  if (fb !== -1) {
    const lb = t.lastIndexOf("```");
    if (lb > fb) {
      let inner = t.slice(fb + 3, lb).replace(/^json\s*/i, "").trim();
      const i0 = inner.indexOf("{");
      const i1 = inner.lastIndexOf("}");
      if (i0 !== -1 && i1 > i0) inner = inner.slice(i0, i1 + 1);
      if (inner.startsWith("{")) t = inner;
    }
  }

  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    let j = JSON.parse(m[0]);
    if (j && typeof j === "object" && !Array.isArray(j) && typeof (j as { output?: unknown }).output === "string") {
      const out = String((j as { output: string }).output).trim();
      if (out.startsWith("{")) {
        try {
          j = JSON.parse(out);
        } catch {
          // mantém j
        }
      }
    }
    return j;
  } catch {
    return null;
  }
}

/**
 * `{"valor":null}` na resposta, mas o modelo cita montantes na prosa (ex.: explicação com «R$ …») —
 * tratar como “ainda inválido” para permitir retentativa com outro recorte/top_k.
 */
function valorExplicitEmptyContradictsResponseProse(responseText: string): boolean {
  const raw = String(responseText || "");
  if (/\bR\$\s*[\d]{1,3}(?:[.\d]*,[\d]{2}|[.\d]{2,})\b/i.test(raw)) return true;
  if (/\bR\$\s*\d+/i.test(raw)) return true;
  if (/(?:US\$|\$|€|£)\s*[\d.,]+/i.test(raw)) return true;
  if (/valor\s+(mensal|total|da\s+bolsa)|bolsa\s+de|teto\s+(de\s+)?R\$/i.test(raw) && /\d/.test(raw)) return true;
  return false;
}

/** Com `OLLAMA_RAG_INVALID_RETRY_INCLUDE_EXPLICIT_NULL_VALOR=1`, `{"valor":null}` puro também dispara retentativas (útil quando o PDF tem valores noutro recorte). */
function invalidRetryIncludeExplicitNullValor(): boolean {
  const raw = (process.env.OLLAMA_RAG_INVALID_RETRY_INCLUDE_EXPLICIT_NULL_VALOR ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

/** Com `OLLAMA_RAG_INVALID_RETRY_INCLUDE_EMPTY_PRAZO=1` (default), `{"prazos":[]}` conta como inválido e dispara retentativas. */
function invalidRetryIncludeEmptyPrazo(): boolean {
  const raw = (process.env.OLLAMA_RAG_INVALID_RETRY_INCLUDE_EMPTY_PRAZO ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

function isExplicitEmptyPrazoInscricaoJson(j: unknown): boolean {
  if (!j) return false;
  if (Array.isArray(j)) return j.length === 0;
  if (typeof j === "object") {
    const o = j as any;
    return Array.isArray(o.prazos) && o.prazos.length === 0;
  }
  return false;
}

function prazoExplicitEmptyContradictsResponseProse(responseText: string): boolean {
  const raw = String(responseText || "");
  if (/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(raw)) return true;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(raw)) return true;
  if (/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i.test(raw))
    return true;
  if (/\b(fase|etapa)\s*\d+\b/i.test(raw)) return true;
  return false;
}

/** True se a resposta contém JSON parseável que satisfaz `isValidJsonFormat` para o campo. */
function isOllamaModelResponseStructurallyValid(field: string, responseText: string): boolean {
  const j = tryExtractJsonDataFromOllamaResponse(responseText);
  if (j == null) return false;
  // `valor_projeto`: `{"valor":null}` / `{"valores":[]}` sem contradição na prosa = válido (não retentar).
  // Se o JSON está vazio mas o texto da resposta menciona R$/teto/bolsa com dígitos, retentar (resposta “errada”).
  if (
    field === "valor_projeto" &&
    typeof j === "object" &&
    j !== null &&
    !Array.isArray(j) &&
    isExplicitEmptyValorProjetoJson(j)
  ) {
    if (valorExplicitEmptyContradictsResponseProse(responseText)) return false;
    if (invalidRetryIncludeExplicitNullValor()) return false;
    return true;
  }
  // `prazo_inscricao`: `{"prazos":[]}` (ou array vazio) por defeito conta como inválido para permitir retentativas,
  // porque frequentemente o recorte RAG não trouxe o cronograma certo. Se a prosa menciona datas/meses/fase,
  // também é sinal claro de falha do JSON.
  if (field === "prazo_inscricao" && isExplicitEmptyPrazoInscricaoJson(j)) {
    if (prazoExplicitEmptyContradictsResponseProse(responseText)) return false;
    if (invalidRetryIncludeEmptyPrazo()) return false;
    return true;
  }
  return isValidJsonFormat(j, field);
}

/**
 * Valida se o JSON tem a estrutura esperada para o campo
 * Retorna true apenas se estiver no formato JSON correto
 */
function isValidJsonFormat(jsonData: any, field: string): boolean {
  // Para valor_projeto, aceitar objeto JSON (pode ser complexo como {"valor": {...}})
  // OU array dentro de chave "valor" (ex: {"valor": [...]})
  if (field === 'valor_projeto') {
    // Aceitar string (ex.: {"valor":"3.000,00"} extraído como string)
    if (typeof jsonData === 'string' && jsonData.trim().length > 0) {
      return looksLikeValorProjetoSnippet(jsonData);
    }
    // Deve ser um objeto JSON válido (não string, não array simples)
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      return isSubstantiveValorProjetoPayload(jsonData);
    }
    // Array no topo = lista de montantes (mesmo formato que chave "valores")
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      return isSubstantiveValorProjetoPayload({ valores: jsonData });
    }
    return false;
  }
  
  // Para prazo_inscricao, aceitar objeto com array "prazos" ou array direto de objetos
  if (field === 'prazo_inscricao') {
    if (Array.isArray(jsonData)) {
      if (jsonData.length === 0) return true;
      return isSubstantivePrazoPayload(jsonData);
    }
    if (typeof jsonData === 'object' && jsonData !== null) {
      if (!Array.isArray(jsonData.prazos)) return false;
      if (jsonData.prazos.length === 0) return true;
      return isSubstantivePrazoPayload(jsonData);
    }
    return false; // Não aceitar string simples
  }
  
  // Para localizacao, aceitar APENAS objeto JSON com chave "localizacao": {"localizacao": "valor"}
  if (field === 'localizacao') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "localizacao" com valor string não vazio
      return typeof jsonData.localizacao === 'string' && jsonData.localizacao.trim().length > 0;
    }
    return false; // Não aceitar string simples ou outros formatos
  }
  
  // Para vagas, aceitar APENAS objeto JSON com chave "vagas": {"vagas": "valor"}
  if (field === 'vagas') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "vagas" com valor string não vazio
      return typeof jsonData.vagas === 'string' && jsonData.vagas.trim().length > 0;
    }
    return false; // Não aceitar string simples ou outros formatos
  }
  
  // Para is_researcher, aceitar objeto JSON com chave "is_researcher": {"is_researcher": true/false/null}
  if (field === 'is_researcher') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "is_researcher" com valor boolean ou null
      return jsonData.is_researcher !== undefined && (typeof jsonData.is_researcher === 'boolean' || jsonData.is_researcher === null);
    }
    return false;
  }
  
  // Para is_company, aceitar objeto JSON com chave "is_company": {"is_company": true/false/null}
  if (field === 'is_company') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "is_company" com valor boolean ou null
      return jsonData.is_company !== undefined && (typeof jsonData.is_company === 'boolean' || jsonData.is_company === null);
    }
    return false;
  }
  
  // Para sobre_programa, aceitar objeto JSON com chave "sobre_programa": {"sobre_programa": "texto"}
  if (field === 'sobre_programa') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "sobre_programa" com valor string (ou null)
      return jsonData.sobre_programa !== undefined && (typeof jsonData.sobre_programa === 'string' || jsonData.sobre_programa === null);
    }
    return false;
  }
  
  // Para criterios_elegibilidade, aceitar objeto JSON com chave "criterios_elegibilidade": {"criterios_elegibilidade": "texto"}
  if (field === 'criterios_elegibilidade') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "criterios_elegibilidade" com valor string (ou null)
      return jsonData.criterios_elegibilidade !== undefined && (typeof jsonData.criterios_elegibilidade === 'string' || jsonData.criterios_elegibilidade === null);
    }
    return false;
  }
  
  // Para timeline_estimada, aceitar objeto JSON com chave "timeline_estimada": {"timeline_estimada": {"fases": [...]}}
  if (field === 'timeline_estimada') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      if (jsonData.timeline_estimada === undefined) return false;
      if (jsonData.timeline_estimada === null) return true;
      return typeof jsonData.timeline_estimada === 'object' && isSubstantiveTimelinePayload(jsonData.timeline_estimada);
    }
    return false;
  }
  
  return false; // Por padrão, rejeitar formatos não especificados
}

/**
 * Normaliza uma resposta removendo prefixos comuns e limpando formatação
 */
function normalizeResponse(value: string, field: string): string {
  let normalized = value.trim();
  
  // Remover prefixos comuns que não agregam informação
  const prefixesToRemove = [
    /^com base nas informações (obtidas|consultadas|recuperadas|fornecidas),?\s*/i,
    /^com base nas informações dos documentos fornecidos,?\s*/i,
    /^com base nas informações consultadas,?\s*/i,
    /^a localização, região ou área geográfica onde o edital é válido é\s*/i,
    /^a localização onde o edital é válido é\s*/i,
    /^o valor financeiro disponível neste edital é\s*/i,
    /^os valores financeiros disponíveis neste edital são:?\s*/i,
    /^os prazos de inscrição ou submissão (são|para este edital são):?\s*/i,
    /^com base nas informações obtidas anteriormente,?\s*/i,
    /^conforme informações obtidas,?\s*/i,
    /^conforme informações consultadas,?\s*/i,
  ];
  
  for (const prefix of prefixesToRemove) {
    normalized = normalized.replace(prefix, '');
  }
  
  // Limpar formatação markdown desnecessária
  normalized = normalized
    .replace(/\*\*/g, '') // Remove **bold**
    .replace(/\*/g, '')   // Remove *italic*
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Para localização, extrair apenas o nome do lugar se houver
  if (field === 'localizacao') {
    const locationMatch = normalized.match(/(?:é|são|localizado em|válido em|válido para)\s*([^,\.]+)/i);
    if (locationMatch) {
      normalized = locationMatch[1].trim();
    }
    // Remover "Brasil" se vier depois de um estado
    normalized = normalized.replace(/,\s*brasil\.?$/i, '');
  }
  
  return normalized.trim();
}

/**
 * Faz uma requisição ao webhook para extrair uma informação específica
 */
async function extractInfoFromWebhook(
  field: 'valor_projeto' | 'prazo_inscricao' | 'localizacao' | 'vagas' | 'is_researcher' | 'is_company' | 'sobre_programa' | 'criterios_elegibilidade' | 'timeline_estimada',
  fileIds: string[],
  editalId?: string,
): Promise<string | string[] | boolean | any | null> {
  try {
    const extractPrazoRangesFromText = (input: string): string[] => {
      const s = String(input || '');

      const isValidBrDate = (dmy: string): boolean => {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
        if (!m) return false;
        const dd = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const yyyy = parseInt(m[3], 10);
        if (yyyy < 1900 || yyyy > 2100) return false;
        if (mm < 1 || mm > 12) return false;
        if (dd < 1 || dd > 31) return false;
        const daysInMonth = new Date(yyyy, mm, 0).getDate();
        return dd <= daysInMonth;
      };

      const normalizeDateToken = (tok: string): string | null => {
        const t = String(tok || '').trim();
        if (!t) return null;

        // DD/MM/AAAA
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return isValidBrDate(t) ? t : null;

        // MM/AAAA -> assumir dia 01
        if (/^\d{2}\/\d{4}$/.test(t)) {
          const d = `01/${t}`;
          return isValidBrDate(d) ? d : null;
        }

        return null;
      };

      // Captura intervalos: "DD/MM/AAAA a DD/MM/AAAA" e também "MM/AAAA a DD/MM/AAAA" etc.
      const token = String.raw`(?:\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4})`;
      const re = new RegExp(`(${token})\\s*(?:a|-|até|ate)\\s*(${token})`, 'gi');

      const out: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) != null) {
        const start = normalizeDateToken(m[1]);
        const end = normalizeDateToken(m[2]);
        if (start && end) out.push(`${start} a ${end}`);
      }

      return [...new Set(out)];
    };

    const repairJsonCandidate = (input: string): string | null => {
      const s = String(input || '').trim();
      if (!s.startsWith('{') && !s.startsWith('[')) return null;

      // Limpar code fences se existirem
      let cand = s.replace(/```(?:json)?/gi, '').trim();

      // Balancear colchetes/chaves (saída truncada por num_predict)
      const count = (str: string, re: RegExp) => (str.match(re) || []).length;
      const openBraces = count(cand, /\{/g);
      const closeBraces = count(cand, /\}/g);
      const openBrackets = count(cand, /\[/g);
      const closeBrackets = count(cand, /\]/g);

      const missingBrackets = Math.max(0, openBrackets - closeBrackets);
      const missingBraces = Math.max(0, openBraces - closeBraces);

      if (missingBrackets === 0 && missingBraces === 0) return cand;
      return cand + ']'.repeat(missingBrackets) + '}'.repeat(missingBraces);
    };

    const extractFirstIntegerLike = (input: string): string | null => {
      const s = String(input || '');
      // pegar primeiro número inteiro "razoável" (1..100000), ignorando anos 19xx/20xx quando possível
      const matches = s.match(/\b\d{1,6}\b/g) || [];
      for (const m of matches) {
        const n = parseInt(m, 10);
        if (!Number.isFinite(n)) continue;
        if (n >= 1900 && n <= 2099) continue; // provavelmente ano
        if (n <= 0) continue;
        return String(n);
      }
      return null;
    };

    const extractCurrencyLike = (input: string): string | null => {
      const s = String(input || '');
      // Suporta: $12.6M, US$ 1.2B, R$ 3.000,00, R$ 1.500.000,00, € 120k, etc.
      // Regra: preferir o match mais "longo" (ex.: 1.500.000,00 ao invés de 1.500).
      const patterns: RegExp[] = [
        // Com símbolo + formato BR/Europeu (milhares com "." ou espaço e decimais com ",")
        /(R\$|US\$|\$|€|£|¥)\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\b/gi,
        // Com símbolo + formato simples (ponto/vírgula como decimal) + sufixos (K/M/B/mil/mi/...)
        /(R\$|US\$|\$|€|£|¥)\s*\d+(?:[.,]\d+)?\s*(?:[KMB]|mil|mi|milhões|milhoes|bilhões|bilhoes)?\b/gi,
        // Sem símbolo + sufixos (K/M/B/mil/mi/...)
        /\b\d+(?:[.,]\d+)?\s*(?:[KMB]|mil|mi|milhões|milhoes|bilhões|bilhoes)\b/gi,
        // Fallback sem símbolo (formato BR/Europeu)
        /\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})\b/gi,
      ];

      const candidates: string[] = [];
      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(s)) != null) candidates.push(m[0].trim());
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.length - a.length);
      return candidates[0];
    };

    const extractTruncatedJsonStringField = (input: string, key: string): string | null => {
      const s = String(input || '');
      const keyPos = s.indexOf(`"${key}"`);
      if (keyPos < 0) return null;
      const colonPos = s.indexOf(':', keyPos);
      if (colonPos < 0) return null;

      let i = colonPos + 1;
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length || s[i] !== '"') return null;
      i++; // pula aspas iniciais

      let out = '';
      let escaped = false;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (escaped) {
          // preservar escapes comuns
          if (ch === 'n') out += '\n';
          else if (ch === 'r') out += '\r';
          else if (ch === 't') out += '\t';
          else out += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        // se a string fechou corretamente, parar
        if (ch === '"') break;
        out += ch;
      }

      const cleaned = out.replace(/\s+/g, ' ').trim();
      return cleaned.length > 0 ? cleaned : null;
    };

    const tryParseTopLevelJsonEvenIfTruncated = (txt: string): any | null => {
      const s = String(txt || '').trim();
      if (!s.startsWith('{') && !s.startsWith('[')) return null;
      try {
        return JSON.parse(s);
      } catch {
        const repaired = repairJsonCandidate(s);
        if (!repaired) return null;
        try {
          return JSON.parse(repaired);
        } catch {
          return null;
        }
      }
    };

    const extractTimelineFromTruncatedText = (input: string): { fases: any[] } | null => {
      const s = String(input || '');
      if (!s.includes('"timeline_estimada"') && !s.includes('"fases"')) return null;

      const fases: any[] = [];
      const objRegex = /\{[^{}]*"nome"\s*:\s*"[^"]+"[^{}]*\}/g;
      const matches = s.match(objRegex) || [];

      for (const rawObj of matches) {
        try {
          const obj = JSON.parse(rawObj);
          if (!obj || typeof obj !== 'object') continue;
          if (typeof obj.nome !== 'string' || obj.nome.trim().length === 0) continue;

          const fase: any = {
            nome: obj.nome.trim(),
          };
          if (typeof obj.prazo === 'string' && obj.prazo.trim().length > 0) fase.prazo = obj.prazo.trim();
          if (typeof obj.status === 'string' && obj.status.trim().length > 0) fase.status = obj.status.trim();
          if (typeof obj.data_inicio === 'string' && obj.data_inicio.trim().length > 0) fase.data_inicio = obj.data_inicio.trim();
          if (typeof obj.data_fim === 'string' && obj.data_fim.trim().length > 0) fase.data_fim = obj.data_fim.trim();
          fases.push(fase);
        } catch {
          // ignora objeto inválido/parcial
        }
      }

      if (fases.length === 0) return null;

      // Dedup básico por (nome + prazo + status + datas)
      const seen = new Set<string>();
      const dedup = fases.filter((f) => {
        const key = `${f.nome}|${f.prazo || ''}|${f.status || ''}|${f.data_inicio || ''}|${f.data_fim || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return { fases: dedup };
    };

    // Mapear campos para perguntas em português (melhoradas e mais específicas)
    const fieldQuestions: Record<string, string> = {
      valor_projeto:
        "Use **somente** o bloco **«CONTEÚDO DOS DOCUMENTOS (editais):»** deste prompt (antes de «PERGUNTA:»). " +
        "Ache valores monetários **com R$** nesse bloco (ex.: \"R$ 1.000\", \"R$ 1.000,00\", \"R$ 1.000.000,00\"). " +
        "Se não existir **nenhum** \"R$\" no bloco: {\"valor\":null}. " +
        "Se existir 1 valor principal: {\"valor\":\"R$ …\"}. " +
        "Se existirem vários valores distintos (bolsa mensal + teto, modalidades, faixas): {\"valores\":[\"R$ … (rótulo curto)\",\"R$ … (rótulo curto)\"]}. " +
        "IMPORTANTE: em {\"valor\":...} e em cada item de {\"valores\":...} o texto **deve conter \"R$\"**. " +
        "Para ajudar a busca, procure também por números e padrões próximos de \"R$\": 1 2 3 4 5 6 7 8 9. " +
        "Retorne APENAS JSON válido (sem texto fora do JSON).",
      prazo_inscricao:
        "FONTE ÚNICA: use **somente** o texto do bloco **«CONTEÚDO DOS DOCUMENTOS (editais):»** (antes de «PERGUNTA:»). " +
        "TAREFA (modo scanner): varra esse bloco procurando **linhas/frases** que contenham QUALQUER um destes gatilhos: " +
        "inscri, inscrição, inscrições, submiss, submeter, envio, enviar, proposta, propostas, candidatura, candidaturas, cadastro, registrar, registro, protocolo, manifestação de interesse, chamada, abertura, encerramento, prazo, prorroga, retificação, cronograma, calendário, fase, etapa. " +
        "Depois, dentro dessas mesmas linhas/frases (ou no trecho imediatamente adjacente), capture o que parecer PRAZO/DATA, com estes padrões-alvo: " +
        "1 2 3 4 5 6 7 8 9; DD/MM/AAAA; D/M/AAAA; DD-MM-AAAA; AAAA-MM-DD; \"até\" + data; \"de\"...\"a\"...; \"entre\"...\"e\"...; \"às\"/\"até\" + hora (ex.: 18h, 23h59). " +
        "Meses por extenso também contam como data: janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro. " +
        "Se houver cronograma por fases/etapas, priorize itens que mencionem explicitamente: Fase 1, Fase 2, Fase 3, Etapa 1, Etapa 2, Etapa 3. " +
        "SAÍDA: devolva um array de strings, cada string sendo uma **cópia curta** do próprio texto do bloco que contém o prazo (pode incluir o rótulo, ex.: \"Fase 1 — inscrições: 10/01/2026 a 20/02/2026\" ou \"Inscrições até 23h59 de 31/08/2026\"). " +
        "NÃO normalize formato, NÃO complete ano, NÃO invente. Se não houver nada com gatilhos + data/prazo no bloco: {\"prazos\":[]}." +
        "Retorne SOMENTE JSON válido: {\"prazos\":[\"...\",\"...\"]}.",
      localizacao: "Do edital, qual localização preciso estar para participar desse edital? Ou posso participar de qualquer lugar do Brasil? Procure por informações sobre requisitos de localização, residência, ou área geográfica necessária para participar. IMPORTANTE: Você DEVE retornar SEMPRE em formato JSON válido, nunca em texto livre. Se o edital aceita participantes de qualquer lugar do Brasil (sem restrição geográfica), retorne: {\"localizacao\": \"Brasil\"} ou {\"localizacao\": \"Nacional\"}. Se houver restrição geográfica específica (ex: apenas Espírito Santo, apenas São Paulo, apenas região Sudeste), retorne: {\"localizacao\": \"Espírito Santo\"} ou {\"localizacao\": \"São Paulo\"} ou {\"localizacao\": \"Região Sudeste\"} com o estado, cidade ou região específica encontrada. Procure também por termos como 'localização', 'residência', 'área de atuação', 'abrangência', 'região', 'estado', 'município', 'nacional', 'brasileiro'. Se não encontrar nenhuma informação sobre restrição geográfica, retorne: {\"localizacao\": \"Brasil\"} (assumindo que não há restrição). Se não encontrar nenhuma informação no documento, retorne: {\"localizacao\": null}. LEMBRE-SE: Retorne APENAS o JSON, sem texto adicional antes ou depois.",
      vagas:
        'FONTE ÚNICA: use **somente** o texto do bloco **«CONTEÚDO DOS DOCUMENTOS (editais):»** (antes de «PERGUNTA:»). ' +
        'TAREFA (modo scanner): encontre no bloco frases/linhas com gatilhos de quantitativo/limite: "vagas", "bolsas", "bolsistas", "beneficiários", "propostas", "selecionados", "aprovadas", "contempladas", "contratadas", "classificadas", "limite", "teto", "máximo", "mínimo", "até", "no máximo", "serão selecionados", "será selecionada", "uma única", "apenas uma", "somente uma". ' +
        'Dentro dessas mesmas frases/linhas, procure números explícitos (1 2 3 4 5 6 7 8 9) e padrões tipo "N vagas", "até N propostas", "máximo de N", "serão selecionados N", "N bolsistas". ' +
        'REGRA: devolva o **limite máximo** claro do edital (um inteiro). Se o texto disser "uma única" / "apenas 1" / "somente um projeto" / "o projeto mais bem classificado" (único), retorne 1. ' +
        'NÃO use: números de edital/ano/CEP/página, datas, valores monetários (R$), percentuais de orçamento (ex.: 30% do valor do projeto) a menos que o próprio texto diga que isso é limite de propostas/vagas. ' +
        'Não infira vagas dividindo orçamento por valor. ' +
        'SAÍDA: Retorne SOMENTE JSON válido: {"vagas":"N"} com N inteiro em string, ou {"vagas":null} se o bloco não trouxer nenhum limite/quantitativo claro.'
        ,
      is_researcher: `Determine se o edital é relevante para PESQUISADORES / BOLSISTAS DE PESQUISA / PERFIL ACADÊMICO-CIENTÍFICO (incluindo ICT, docentes, pós-graduação, PD&I com pessoas em pesquisa).

Use {"is_researcher": true} quando QUALQUER um destes sinais aparecer no texto (não precisa ser exclusivo nem “programa europeu”):
- Bolsas ou auxílios ligados a pesquisa, inovação científica/tecnológica, desenvolvimento tecnológico, PD&I com bolsistas ou pesquisadores (ex.: «bolsas de inovação e pesquisa», «bolsa de pesquisa», «bolsista», «auxílio a pesquisa»).
- Público-alvo ou proponente típico: pesquisador, docente, estudante de pós-graduação, ICT, instituição de ensino/universidade como sede ou vínculo do beneficiário, Lattes/ORCID como documentação, titulação (mestrado/doutorado) ainda que não seja escrita como «obrigatório».
- Programas internacionais de pesquisa: MSCA, Horizon, Marie Curie, ERC, fellowship, research grant (sempre true).
- Iniciação científica, IC, bolsa CNPq/CAPES/FAPESP etc. quando claramente no âmbito de pesquisa acadêmica.

Use {"is_researcher": false} quando o edital for claramente só para PJ/empresa, sem linha de bolsa ou seleção de pessoas em pesquisa:
- CNPJ/pessoa jurídica como ÚNICO proponente elegível, ou «somente empresas», sem menção a pesquisador/bolsista/ICT/universidade como beneficiário de bolsa ou de projeto de pesquisa.
- Foco exclusivo em comercialização/contratação empresarial sem componente de pesquisa ou bolsas.

Use {"is_researcher": null} APENAS quando o trecho analisado não trouxer quase nenhuma pista (texto genérico, só cronograma, fragmento insuficiente). NÃO use null só porque não citou MSCA/Horizon nem «doutorado obrigatório»: editais brasileiros de bolsa/PD&I costumam ser true com «bolsas», «pesquisa», «bolsista» ou ICT.

Se empresas e pesquisadores coexistem mas há bolsas ou seleção de bolsistas/pesquisadores/ICT, prefira {"is_researcher": true}. Reserve null para ausência real de sinais.

Retorne APENAS JSON válido, sem texto extra: {"is_researcher": true} ou {"is_researcher": false} ou {"is_researcher": null}`,
      is_company: `Analise o edital COMPLETO e determine se ele é direcionado EXCLUSIVA ou PRINCIPALMENTE para EMPRESAS ou requer CNPJ como requisito obrigatório.

REGRAS CRÍTICAS DE CLASSIFICAÇÃO:

RETORNE {"is_company": true} APENAS SE:
1. O edital EXIGE EXPLICITAMENTE CNPJ ou Pessoa Jurídica como REQUISITO OBRIGATÓRIO:
   - "CNPJ obrigatório", "CNPJ é obrigatório", "requer CNPJ", "necessário CNPJ"
   - "pessoa jurídica obrigatória", "PJ obrigatória", "requer pessoa jurídica"
   - "inscrição como pessoa jurídica obrigatória"
   IMPORTANTE: Apenas se for REQUISITO OBRIGATÓRIO, não apenas menção casual.

2. O edital EXIGE formação ou constituição de empresa como REQUISITO:
   - "formação de empresa obrigatória", "constituição de empresa obrigatória"
   - "deve constituir empresa", "deve formar empresa", "deve abrir empresa"
   - "obrigatório constituir empresa", "exige formação de empresa"
   IMPORTANTE: Apenas se for REQUISITO, não apenas menção casual.

3. O edital menciona tipos específicos de empresa como público-alvo PRINCIPAL:
   - "microempresa", "pequena empresa", "média empresa", "grande empresa"
   - "startup", "startups", "MEI", "microempreendedor individual"
   - "empresa de base tecnológica", "EBT", "ME", "EPP", "MPE"
   IMPORTANTE: Apenas se forem o público-alvo PRINCIPAL, não apenas mencionados.

RETORNE {"is_company": false} SE:
- O edital menciona PROGRAMAS ACADÊMICOS CONHECIDOS (MSCA, Horizon Europe, ERC, Marie Skłodowska-Curie) mesmo que também mencione empresas
- O edital EXIGE títulos acadêmicos (doutorado, mestrado) como requisito obrigatório E NÃO exige CNPJ/empresa como requisito obrigatório
- O edital EXIGE vínculo com instituição de ensino (universidade, faculdade) como requisito E NÃO exige CNPJ/empresa como requisito obrigatório
- O edital menciona apenas "pesquisadores acadêmicos", "bolsas de pesquisa científica" SEM mencionar CNPJ ou empresa como requisito obrigatório
- Não houver menção clara a CNPJ obrigatório, formação de empresa obrigatória, ou empresas como público-alvo principal

RETORNE {"is_company": null} SE:
- Não houver informação suficiente no documento
- O edital menciona tanto empresas quanto pesquisadores sem deixar claro qual é o público principal
- Não for possível determinar com certeza baseado no conteúdo disponível

REGRA DE PRIORIDADE:
- Se o edital menciona programas acadêmicos conhecidos (MSCA, Horizon, ERC), SEMPRE retorne false, mesmo que também mencione empresas
- Se o edital exige CNPJ/empresa como requisito obrigatório E NÃO exige títulos acadêmicos ou vínculo institucional como requisito obrigatório, retorne true
- Se o edital exige títulos acadêmicos como requisito obrigatório E NÃO exige CNPJ/empresa como requisito obrigatório, retorne false
- Se o edital exige ambos (CNPJ E títulos acadêmicos), avalie qual é o requisito PRINCIPAL ou retorne null se não for claro

EXEMPLOS ESPECÍFICOS:
- "CNPJ obrigatório para empresas inovadoras" → true (requisito empresarial explícito)
- "Formação de startup obrigatória para receber o recurso" → true (requisito empresarial explícito)
- "MSCA - Marie Skłodowska-Curie Intercâmbio de Pessoal" → false (programa acadêmico conhecido)
- "Edital para pesquisadores com doutorado vinculados a universidade" → false (requisito acadêmico sem requisito empresarial)
- "Horizon Europe - Research and Innovation" → false (programa acadêmico conhecido)
- "Edital para startups e pesquisadores" → null (ambos mencionados, não é claro qual é o principal)
- "CNPJ obrigatório E título de doutor obrigatório" → null (ambos são requisitos, precisa avaliar qual é o principal)

Retorne APENAS o JSON válido: {"is_company": true/false/null}`,
      sobre_programa:
        "Use **apenas** o bloco «CONTEÚDO DOS DOCUMENTOS» acima. Não invente objetivos nem copie requisitos de elegibilidade como se fossem descrição do programa. " +
        "Quais são as informações sobre o **PROGRAMA** da chamada (o quê / para quê / em que contexto institucional ou político)? " +
        "Procure por secções ou parágrafos tipo: «Sobre o Programa», «Sobre o Edital», «Objetivo», «Justificativa», «Apresentação», «Introdução», «Contexto», «Público-alvo», «Objeto da chamada», «Objetivos gerais ou específicos», «Área de atuação», «Linha de fomento», «Instrumento», «Finalidades». " +
        "Extraia um resumo substantivo **só com base no texto fornecido** (finalidade, público, fundamento, metas quando vierem como narrativa do programa — não como lista seca de pré-requisitos). " +
        "IGNORE: anexos-modelo em branco; tabelas só de valores/orçamento; cronograma só de datas sem narrativa do programa; listas longas só de documentação/titulação sem descrever o programa. " +
        "Se o trecho acima não descrever o programa de forma útil: {\"sobre_programa\": null}. " +
        "IMPORTANTE: Retorne APENAS JSON válido: {\"sobre_programa\": \"texto completo sobre o programa\"} ou {\"sobre_programa\": null}. Sem texto fora do JSON.",
      criterios_elegibilidade:
        "FONTE ÚNICA: use **somente** o texto do bloco **«CONTEÚDO DOS DOCUMENTOS (editais):»** (antes de «PERGUNTA:»). " +
        "TAREFA (modo extrator literal): encontre e COPIE do bloco todas as frases/itens que imponham regra de participação, usando estes gatilhos (se aparecer, provavelmente é elegibilidade): " +
        "\"requisito\", \"pré-requisito\", \"condição\", \"obrigatório\", \"deverá\", \"deve\", \"somente\", \"apenas\", \"vedado\", \"não poderá\", \"impedimento\", \"inelegível\", \"habilitação\", \"admissibilidade\", \"enquadramento\", \"documentação\", \"comprovação\", \"declaração\", \"regularidade\", \"CND\", \"FGTS\", \"certidão\". " +
        "Inclua também itens que definam QUEM pode concorrer (proponente/beneficiário/público-alvo) e QUEM não pode. " +
        "Se houver lista com marcadores/numeração no bloco, preserve a lista (pode unir com quebras de linha). " +
        "NÃO resuma demais: prefira **colar trechos** do bloco (até onde couber) em vez de reescrever com suas palavras. " +
        "SAÍDA: {\"criterios_elegibilidade\":\"...\"} contendo essas cópias (separadas por \\n). " +
        "Use {\"criterios_elegibilidade\": null} somente se, após procurar pelos gatilhos acima, não existir no bloco nenhuma regra/requisito/documento obrigatório/impedimento. " +
        "Retorne APENAS JSON válido (sem texto fora do JSON).",
      timeline_estimada:
        "Quais são as FASES e o CRONOGRAMA deste edital (datas e etapas do processo)? " +
        "Procure por: 'Cronograma', 'Calendário', 'Fases do Edital', 'Etapas', 'Linha do tempo', 'Datas importantes', 'Cronograma de atividades', 'Execução'. " +
        "Para cada fase/atividade relevante, extraia quando possível: nome, prazo (dias ou datas), status (aberto/fechado/pendente), data_inicio, data_fim. " +
        "IGNORE: anexos-modelo em branco; tabelas só de valores/orçamento; listas longas só de pré-requisitos sem datas; texto só de elegibilidade sem calendário. " +
        "IMPORTANTE: Retorne APENAS JSON válido: {\"timeline_estimada\": {\"fases\": [{\"nome\": \"...\", \"prazo\": \"...\", \"status\": \"...\", \"data_inicio\": \"...\", \"data_fim\": \"...\"}, ...]}} ou {\"timeline_estimada\": null}. Sem texto fora do JSON.",
    };

    /** Consulta curta só para embedding/RAG (top-k). Mantém o prompt longo para o modelo, sem “poluir” o vetor da busca. */
    const fieldRagQueries: Record<string, string> = {
      valor_projeto:
        "orçamento teto dotação montante máximo mínimo faixa bolsa auxílio diária subsídio valor mensal parcela repasse subvenção aporte financiamento capital custeio contrapartida percentual sobre valor aprovado modalidade tabela valores recursos financeiros anexo financeiro cronograma financeiro linha fomento desembolso R$ reais milhões mil reais US$ €",
      prazo_inscricao:
        "prazo inscrição submissão candidatura proposta envio cadastro manifestação interesse pré-inscrição registro protocolo sistema portal eletrônico etapa fase período abertura encerramento limite final último dia útil corrido horário prorrogação suspensão retificação republicação publicação DOU calendário cronograma tabela etapas processo seletivo homologação preliminar recurso contrarrazões DD/MM AAAA-MM-DD",
      localizacao:
        "abrangência localização residência domicílio sede estado município região nacional internacional território",
      vagas:
        "limite máximo vagas bolsas bolsistas beneficiários quantitativo ofertadas teto seleção mérito classificação ranking remanescentes contratações vagas na chamada quantidade selecionados (evitar só cronograma de datas)",
      is_researcher:
        "pesquisador coordenador proponente ICT universidade doutorado mestrado titulação vínculo Lattes ORCID bolsista docente PD&I CTI requisito acadêmico CNPJ obrigatório empresa",
      is_company:
        "CNPJ pessoa jurídica empresa startup MEI microempresa constituição formação de empresa obrigatório PJ",
      sobre_programa:
        "sobre o programa sobre o edital apresentação introdução objetivo finalidade justificativa contexto público-alvo escopo objeto da chamada linha de fomento instrumento modalidade CTI inovação política pública metas específicas área temática eixo prioritário finalidades descrição da ação resumo da chamada",
      criterios_elegibilidade:
        "elegibilidade admissibilidade habilitação qualificação requisitos pré-requisitos condições participação quem pode concorrer perfil proponente coordenador executor instituição proposta enquadramento documentação comprovação anexos obrigatórios declaração CNPJ CPF vínculo titulação experiência capacidade técnica econômica regularidade fiscal trabalhista CND FGTS impedimento inelegível sanção incompatibilidade contrapartida cofinanciamento cota PCD mulher MEI PJ ICT não poderão concorrer",
      timeline_estimada:
        "cronograma calendário fases etapas datas prazos publicação divulgação homologação recurso entrevista resultado seleção execução marcos entregas início fim",
    };
    const fieldFallbackQuestions: Partial<Record<keyof typeof fieldQuestions, string>> = {
      localizacao:
        'Extraia APENAS a localização geográfica do edital (estado/cidade/região/país). Retorne somente JSON válido: {"localizacao":"..."}; se não encontrar, {"localizacao":null}.',
      vagas:
        'Extraia APENAS número de vagas/quantidade de bolsas/beneficiários do edital. Retorne somente JSON válido: {"vagas":"..."}; se não encontrar, {"vagas":null}.',
      prazo_inscricao:
        'Use só o bloco «CONTEÚDO DOS DOCUMENTOS (editais):» deste prompt (texto antes de PERGUNTA). Copie prazos de inscrição/submissão/cadastro/envio de proposta como aparecem. JSON: {"prazos":["..."]} ou {"prazos":[]} se o bloco não tiver nenhum.',
      valor_projeto:
        'Liste montantes do edital (R$, reais, tabela). JSON apenas: {"valor":"…"} ou {"valores":["…"]}; se nada no texto: {"valor":null}.',
      criterios_elegibilidade:
        'Use só o bloco «CONTEÚDO DOS DOCUMENTOS (editais):» (antes de PERGUNTA). Reúna requisitos e elegibilidade **desse** texto numa única string. JSON: {"criterios_elegibilidade":"…"} ou {"criterios_elegibilidade":null} se não houver regra ao participante no bloco.',
    };

    // Verificar se file_ids está vazio
    if (!fileIds || fileIds.length === 0) {
      console.error(`  ❌ ERRO: Nenhum file_id disponível para ${field}! Não é possível extrair informações sem os arquivos.`);
      return null;
    }

    console.log(`  📝 Mensagem: ${fieldQuestions[field].substring(0, 80)}...`);
    console.log(`  📁 File IDs: ${fileIds.length} arquivo(s)`);

    let responseText = '';
    let contentType: string | null = null;
    let response: Response | null = null;

    if (USE_OLLAMA) {
      const {
        extractInfoViaOllama,
        normalizeOllamaChatModelName,
        getRagInvalidRetryTopKList,
        isRagCragEnabled,
        buildCragCorrectiveRagQuery,
      } = await import('../lib/ollama-edital');
      const model = normalizeOllamaChatModelName(process.env.OLLAMA_MODEL || 'qwen2.5:7b');
      console.log(`  📤 Extraindo via Ollama (${model}) para: ${field}`);
      const maxEmptyRetries = Math.max(0, parseInt(process.env.OLLAMA_EMPTY_RESPONSE_RETRIES || '1', 10) || 1);
      let finalPrompt = fieldQuestions[field];
      let finalRagQuery: string = fieldRagQueries[field];
      /** Fingerprints do CONTEÚDO já enviado ao Ollama (1.ª extração + retentativas JSON) para forçar janela diferente. */
      const invalidRetryContextSigHistory: string[] = [];
      for (let attempt = 0; attempt <= maxEmptyRetries; attempt++) {
        const useFallback = attempt > 0;
        const prompt = useFallback && fieldFallbackQuestions[field]
          ? fieldFallbackQuestions[field]!
          : fieldQuestions[field];
        finalPrompt = prompt;
        if (useFallback && fieldFallbackQuestions[field]) {
          finalRagQuery = prompt;
        } else if (isRagCragEnabled() && attempt > 0) {
          finalRagQuery = buildCragCorrectiveRagQuery(
            field,
            fieldRagQueries[field],
            responseText.trim() ? responseText : '(resposta vazia do modelo)',
            attempt - 1,
          );
        } else {
          finalRagQuery = fieldRagQueries[field];
        }
        const ollamaText = await extractInfoViaOllama(prompt, fileIds, {
          editalId: editalId || undefined,
          field,
          // No fallback, o prompt muda bastante — alinhar o embedding ao texto realmente usado.
          ragQuery: finalRagQuery,
          invalidRetryUsedContextSigs: invalidRetryContextSigHistory,
        });
        responseText = ollamaText ?? '';
        if (responseText.trim()) break;
        if (attempt < maxEmptyRetries) {
          console.warn(`  ⚠️ Resposta vazia do Ollama para ${field}. Tentando novamente com prompt simplificado (${attempt + 1}/${maxEmptyRetries})...`);
        }
      }
      if (!responseText.trim()) {
        console.warn(`  ⚠️ Resposta vazia do Ollama para ${field} (após retries)`);
        return null;
      }

      const ragEnabled =
        process.env.OLLAMA_USE_RAG !== '0' &&
        process.env.OLLAMA_USE_RAG !== 'false' &&
        String(process.env.OLLAMA_USE_RAG ?? 'true').toLowerCase() !== 'off';
      const invalidRetryKs = ragEnabled ? getRagInvalidRetryTopKList() : [];
      if (invalidRetryKs.length > 0 && !isOllamaModelResponseStructurallyValid(field, responseText)) {
        console.warn(
          isRagCragEnabled()
            ? `  🔁 ${field}: resposta sem JSON aceitável (CRAG): retentativas com ragQuery corrigida + RAG top_k ∈ [${invalidRetryKs.join(', ')}] + janela sobre o texto completo.`
            : `  🔁 ${field}: resposta sem JSON aceitável para o campo; retentativas com RAG top_k ∈ [${invalidRetryKs.join(', ')}] + janela aleatória sobre o texto completo (mesma PERGUNTA).`,
        );
        let recovered = false;
        let lastInvalidResponse = responseText;
        for (let ri = 0; ri < invalidRetryKs.length; ri++) {
          const k = invalidRetryKs[ri]!;
          const ragQueryRetry = isRagCragEnabled()
            ? buildCragCorrectiveRagQuery(field, fieldRagQueries[field], lastInvalidResponse, ri)
            : finalRagQuery;
          const retryText = await extractInfoViaOllama(finalPrompt, fileIds, {
            editalId: editalId || undefined,
            field,
            ragQuery: ragQueryRetry,
            invalidRetryTopK: k,
            invalidRetryContentVariant: ri + 1,
            invalidRetryUsedContextSigs: invalidRetryContextSigHistory,
          });
          if (!retryText?.trim()) continue;
          if (isOllamaModelResponseStructurallyValid(field, retryText)) {
            responseText = retryText;
            recovered = true;
            console.log(`  ✅ ${field}: retentativa top_k=${k} produziu JSON estruturalmente válido.`);
            break;
          }
          if (retryText?.trim()) lastInvalidResponse = retryText;
        }
        if (!recovered) {
          console.warn(
            `  ⚠️ ${field}: após retentativas com top_k alternativos, a resposta ainda não passa na validação estrutural — mantendo a 1.ª resposta para o parser tentar recuperar.`,
          );
        }
      }

      console.log(`  📥 Resposta Ollama: ${responseText.length} caracteres`);
    } else {
    // Formato esperado pelo n8n: o body HTTP é acessado como $json.body
    const requestBody = {
      message: fieldQuestions[field],
      file_ids: fileIds,
    };
    console.log(`  📋 IDs completos sendo enviados:`, fileIds);
    const apiUrl = USE_LOCAL_API ? LOCAL_API_URL : WEBHOOK_URL;
    console.log(`  📤 Enviando requisição para extrair: ${field}`);
    console.log(`  🔗 URL: ${apiUrl} ${USE_LOCAL_API ? '(API Local)' : '(n8n)'}`);
    console.log(`  📦 Request body completo:`, JSON.stringify(requestBody, null, 2));

    // Adicionar delay entre requisições para evitar rate limiting e sobrecarga do n8n
    // Cloudflare tem timeout de 100s; n8n pode demorar se houver muitas requisições
    const delayMs = parseInt(
      process.env.API_REQUEST_DELAY_MS || String(getWebhookOrLocalApiDefaultDelayMs()),
      10,
    );
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const isVectorInsertError = (txt: string) =>
      String(txt || '').toLowerCase().includes('vector must have at least 1 dimension');

    const isCloudflareTimeout = (status: number, txt: string) =>
      status === 524 || (status >= 520 && status <= 530 && txt.toLowerCase().includes('cloudflare'));

    const webhookTimeoutMs = parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS || '240000', 10);
    const maxEmptyRetries = parseInt(process.env.N8N_EMPTY_RESPONSE_RETRIES || '2', 10);
    const emptyRetryDelayMs = parseInt(process.env.N8N_EMPTY_RETRY_DELAY_MS || '15000', 10);
    const max524Retries = parseInt(process.env.N8N_524_RETRIES || '3', 10);
    const initial524BackoffMs = parseInt(process.env.N8N_524_BACKOFF_MS || '30000', 10);

    const doRequest = (url: string, signal?: AbortSignal) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal,
      });

    let response: Response;
    let attempt524 = 0;

    const tryRequest = async (): Promise<Response | null> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhookTimeoutMs);
      try {
        const res = await doRequest(apiUrl, controller.signal);
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        const isTimeout = (err as Error & { name?: string }).name === 'AbortError';
        console.error(`  ❌ Erro ao chamar webhook para ${field}: ${isTimeout ? `timeout após ${webhookTimeoutMs}ms` : (err as Error).message}`);
        if (isTimeout) {
          console.warn(`     Dica: Aumente N8N_WEBHOOK_TIMEOUT_MS (ex: 180000) se o workflow n8n demorar mais.`);
        }
        return null;
      }
    };

    let firstRes = await tryRequest();
    if (!firstRes) return null;
    response = firstRes;

    // Retry com backoff exponencial para erro 524 (Cloudflare timeout)
    while (!response.ok && attempt524 < max524Retries) {
      const errorText = await response.text().catch(() => '');
      if (!isCloudflareTimeout(response.status, errorText)) break;

      attempt524++;
      const backoff = initial524BackoffMs * Math.pow(2, attempt524 - 1);
      console.warn(`  ⚠️ Cloudflare timeout (524) para ${field}. Tentativa ${attempt524}/${max524Retries} após ${backoff / 1000}s...`);
      console.warn(`     O servidor n8n está sobrecarregado. Aguardando antes de tentar novamente.`);
      await new Promise((r) => setTimeout(r, backoff));

      const retryRes = await tryRequest();
      if (!retryRes) return null;
      response = retryRes;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      
      // Verificar se é erro 404 (webhook não registrado)
      if (response.status === 404) {
        console.warn(`  ⚠️ Webhook não registrado (404) para ${field}. O workflow do n8n precisa estar ativo.`);
        console.warn(`     Dica: Execute o workflow no n8n ou ative-o em produção.`);
        return null;
      }

      // Erro 524 após todas as tentativas
      if (isCloudflareTimeout(response.status, errorText)) {
        console.error(`  ❌ Cloudflare timeout (524) persistente para ${field} após ${attempt524} tentativa(s).`);
        console.warn(`     O servidor n8n está muito sobrecarregado. Sugestões:`);
        console.warn(`     1. Aumente API_REQUEST_DELAY_MS (ex: 20000 ou 30000)`);
        console.warn(`     2. Processe menos editais por vez`);
        console.warn(`     3. Verifique se há outros processos usando o n8n`);
        return null;
      }

      // Fallback para webhook "light" quando o n8n falha ao inserir embeddings no vector store (pgvector)
      if (!USE_LOCAL_API && response.status === 400 && isVectorInsertError(errorText) && WEBHOOK_LIGHT_URL !== WEBHOOK_URL) {
        console.warn(`  ⚠️ n8n vector store falhou (embedding vazio) ao extrair ${field}. Tentando fallback (light)...`);
        response = await doRequest(WEBHOOK_LIGHT_URL);
        if (!response.ok) {
          const errorText2 = await response.text().catch(() => '');
          console.error(`  ❌ Erro HTTP ${response.status} (light) ao extrair ${field}:`, errorText2);
          return null;
        }
      } else {
        console.error(`  ❌ Erro HTTP ${response.status} ao extrair ${field}:`, errorText);
        return null;
      }
    }

    // Processar resposta
    let contentType = response.headers.get('content-type');
    let responseText = await response.text();

    // Retry quando resposta é 200 mas corpo vazio (n8n às vezes responde antes de preencher o body)
    let emptyAttempt = 0;
    while ((!responseText || responseText.trim() === '') && emptyAttempt < maxEmptyRetries) {
      emptyAttempt++;
      console.warn(`  ⚠️ Resposta vazia para ${field}. Tentativa ${emptyAttempt}/${maxEmptyRetries} em ${emptyRetryDelayMs}ms...`);
      await new Promise((r) => setTimeout(r, emptyRetryDelayMs));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhookTimeoutMs);
      try {
        response = await doRequest(apiUrl, controller.signal);
        clearTimeout(timeoutId);
        if (!response.ok) break;
        contentType = response.headers.get('content-type');
        responseText = await response.text();
      } catch {
        clearTimeout(timeoutId);
        break;
      }
    }
    
    // Se estiver usando API local, extrair o campo "result" do JSON
    if (USE_LOCAL_API && contentType?.includes('application/json')) {
      try {
        const jsonResponse = JSON.parse(responseText);
        responseText = jsonResponse.result || responseText;
      } catch (e) {
        // Se não for JSON válido, usar o texto original
      }
    }

    if (!responseText || responseText.trim() === '') {
      console.warn(`  ⚠️ Resposta vazia para ${field} (após ${emptyAttempt > 0 ? emptyAttempt + 1 : 1} tentativa(s))`);
      console.warn(`     Status: ${response.status}, Content-Type: ${contentType || 'não especificado'}`);
      console.warn(`     O webhook está respondendo, mas o corpo da resposta está vazio.`);
      console.warn(`     Possíveis causas:`);
      console.warn(`     1. No n8n, no nó "Respond to Webhook" use "Respond When" = "When Last Node Finishes"`);
      console.warn(`     2. O nó de resposta deve retornar o output do AI (ex: {{ $json.output }}) no body`);
      console.warn(`     3. O workflow pode estar falhando antes do nó de resposta`);
      console.warn(`     Ação: Verifique os logs do workflow no n8n e certifique-se de que há um nó de resposta retornando os dados`);
      return null;
    }
    } // fim else (n8n / API local)

    // Log detalhado da resposta
    const statusLabel = USE_OLLAMA ? 'Ollama' : (response ? String(response.status) : '');
    console.log(`  📥 Status: ${statusLabel}`);
    console.log(`  📥 Content-Type: ${contentType || 'não especificado'}`);
    console.log(`  📥 Tamanho da resposta: ${responseText?.length || 0} caracteres`);

    // Log da resposta bruta para debug (apenas primeiros 500 caracteres)
    const preview = responseText.substring(0, 500);
    console.log(`  📥 Resposta recebida: ${preview}${responseText.length > 500 ? '...' : ''}`);

    // Tentar extrair JSON da resposta (pode estar dentro de texto)
    responseText = responseText.trim();
    
    // PRIMEIRO: Se a resposta é um array JSON (formato n8n comum), extrair o primeiro item
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(responseText);
      if (Array.isArray(parsedResponse) && parsedResponse.length > 0) {
        const firstItem = parsedResponse[0];
        if (firstItem.output) {
          // Se output é uma string, verificar se contém markdown code blocks
          if (typeof firstItem.output === 'string') {
            let outputContent = firstItem.output;
            
            // Extrair JSON de markdown code blocks se presente
            if (outputContent.includes('```')) {
              const codeBlockMatch = outputContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
              if (codeBlockMatch && codeBlockMatch[1]) {
                outputContent = codeBlockMatch[1];
              } else {
                // Tentar com regex mais permissivo
                const codeBlockPermissive = outputContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (codeBlockPermissive && codeBlockPermissive[1]) {
                  const extracted = codeBlockPermissive[1].trim();
                  if (extracted.startsWith('{')) {
                    outputContent = extracted;
                  }
                }
              }
            }
            
            // Se output (processado) é uma string JSON, tentar parsear
            if (outputContent.trim().startsWith('{')) {
            try {
                const innerJson = JSON.parse(outputContent);
              // Se parseou com sucesso, usar o JSON interno
              parsedResponse = innerJson;
              responseText = JSON.stringify(innerJson);
            } catch (e) {
                // Se não conseguir parsear, usar o texto original processado
                responseText = outputContent;
              }
            } else {
              responseText = outputContent;
            }
          } else {
            responseText = String(firstItem.output);
          }
        } else {
          responseText = JSON.stringify(firstItem);
        }
      } else if (typeof parsedResponse === 'object') {
        // Se já é um objeto, usar diretamente
        responseText = JSON.stringify(parsedResponse);
      }
    } catch (e) {
      // Se não for JSON válido, continuar com o texto original
    }
    
    // Procurar por JSON na resposta (pode estar em markdown code blocks ou texto puro)
    let jsonMatch: RegExpMatchArray | null = null;
    
    // 1. Tentar extrair de markdown code blocks primeiro (mais comum no n8n)
    // Primeiro, tentar encontrar code blocks com ```json ou apenas ```
    // Usar abordagem mais robusta para capturar JSON completo
    const codeBlockStart = responseText.indexOf('```');
    if (codeBlockStart !== -1) {
      const codeBlockEnd = responseText.lastIndexOf('```');
      if (codeBlockEnd !== -1 && codeBlockEnd > codeBlockStart) {
        // Extrair conteúdo entre os code blocks
        const codeContent = responseText.substring(codeBlockStart + 3, codeBlockEnd).trim();
        // Remover "json" se presente
        const jsonContent = codeContent.replace(/^json\s*/i, '').trim();
        if (jsonContent.startsWith('{')) {
          jsonMatch = [jsonContent];
        }
      }
    }
    
    // Se não encontrou com a abordagem acima, tentar regex
    if (!jsonMatch) {
      const codeBlockPatterns = [
        /```json\s*(\{[\s\S]*?\})\s*```/,  // ```json {...} ```
        /```\s*(\{[\s\S]*?\})\s*```/,      // ``` {...} ```
      ];
      
      for (const pattern of codeBlockPatterns) {
        const match = responseText.match(pattern);
        if (match && match[1]) {
          const codeContent = match[1].trim();
        if (codeContent.startsWith('{')) {
          jsonMatch = [codeContent];
            break;
          }
        }
      }
    }
    
    // 2. Se não encontrou, tentar encontrar JSON completo no texto
    if (!jsonMatch) {
      jsonMatch = responseText.match(/\{[\s\S]*\}/);
    }

    // Se começa com "{" mas está truncado (sem "}" no fim), ainda assim tentar parse/repair
    if (!jsonMatch && responseText.trim().startsWith('{')) {
      jsonMatch = [responseText.trim()];
    }
    
    // 3. Tentar encontrar JSON dentro de strings escapadas (ex: "output": "{\"key\": \"value\"}")
    if (!jsonMatch) {
      const stringJsonMatch = responseText.match(/"output"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (stringJsonMatch) {
        try {
          // Desescapar JSON dentro da string
          const escaped = stringJsonMatch[1];
          const unescaped = escaped.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
          if (unescaped.trim().startsWith('{')) {
            jsonMatch = [unescaped];
          }
        } catch (e) {
          // Ignorar erro de desescape
        }
      }
    }


    // Se encontrou JSON, tentar parsear
    if (jsonMatch) {
      try {
        let jsonData = JSON.parse(jsonMatch[0]);
        
        // Se o JSON parseado tem uma chave "output" que é string JSON, tentar parsear novamente
        if (typeof jsonData === 'object' && jsonData !== null && jsonData.output && typeof jsonData.output === 'string') {
          try {
            let outputContent = jsonData.output;
            
            // Se o output contém markdown code blocks, extrair o JSON de dentro
            if (outputContent.includes('```')) {
              // Método robusto: encontrar primeiro { e último } dentro do code block
              const firstBrace = outputContent.indexOf('{');
              const lastBrace = outputContent.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                outputContent = outputContent.substring(firstBrace, lastBrace + 1).trim();
                console.log(`  🔍 JSON extraído do code block (${outputContent.length} chars)`);
              } else {
                // Fallback: tentar regex
                const codeBlockMatch = outputContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (codeBlockMatch && codeBlockMatch[1]) {
                  outputContent = codeBlockMatch[1].trim();
                }
              }
            }
            
            const innerJson = JSON.parse(outputContent);
            console.log(`  ✅ JSON parseado do output com sucesso`);
            jsonData = innerJson;
          } catch (e) {
            console.warn(`  ⚠️ Erro ao parsear output como JSON: ${e}`);
            // Se não conseguir parsear, usar o JSON original
          }
        }
        
        // Para localizacao e vagas, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'localizacao' && jsonData.localizacao !== undefined) {
          if (jsonData.localizacao === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const locValue = String(jsonData.localizacao).trim();
          if (locValue.length > 0 && !isNotFoundMessage(locValue)) {
            console.log(`  ✅ Extraído ${field} do JSON: ${locValue}`);
            return locValue;
          }
        }
        
        if (field === 'vagas' && jsonData.vagas !== undefined) {
          if (jsonData.vagas === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const vagasValue = String(jsonData.vagas).trim();
          if (vagasValue.length > 0 && !isNotFoundMessage(vagasValue)) {
            console.log(`  ✅ Extraído ${field} do JSON: ${vagasValue}`);
            return vagasValue;
          }
        }
        
        // Para is_researcher, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'is_researcher' && jsonData.is_researcher !== undefined) {
          if (jsonData.is_researcher === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          if (typeof jsonData.is_researcher === 'boolean') {
            console.log(`  ✅ Extraído ${field} do JSON: ${jsonData.is_researcher}`);
            return jsonData.is_researcher;
          }
        }
        
        // Para is_company, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'is_company' && jsonData.is_company !== undefined) {
          if (jsonData.is_company === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          if (typeof jsonData.is_company === 'boolean') {
            console.log(`  ✅ Extraído ${field} do JSON: ${jsonData.is_company}`);
            return jsonData.is_company;
          }
        }
        
        // Para sobre_programa, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'sobre_programa' && jsonData.sobre_programa !== undefined) {
          if (jsonData.sobre_programa === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const sobreRaw = String(jsonData.sobre_programa).trim();
          if (sobreRaw.length > 0 && !isNotFoundMessage(sobreRaw)) {
            // Alguns modelos devolvem {"sobre_programa":"{\"sobre_programa\":\"...\"}"} (JSON dentro de string)
            if (sobreRaw.startsWith('{') && sobreRaw.includes('sobre_programa')) {
              try {
                const repaired = repairJsonCandidate(sobreRaw) || sobreRaw;
                const inner = JSON.parse(repaired);
                if (inner && typeof inner === 'object' && inner.sobre_programa !== undefined) {
                  const innerText = inner.sobre_programa === null ? null : String(inner.sobre_programa).trim();
                  if (innerText && !isNotFoundMessage(innerText)) {
                    console.log(`  ✅ Extraído ${field} (inner JSON string)`);
                    return innerText;
                  }
                  if (inner.sobre_programa === null) return null;
                }
              } catch {
                // se falhar, cair no raw
              }
            }
            console.log(`  ✅ Extraído ${field} do JSON: ${sobreRaw.substring(0, 100)}...`);
            return sobreRaw;
          }
        }
        
        // Para criterios_elegibilidade, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'criterios_elegibilidade' && jsonData.criterios_elegibilidade !== undefined) {
          if (jsonData.criterios_elegibilidade === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const criteriosValue = String(jsonData.criterios_elegibilidade).trim();
          if (criteriosValue.length > 0 && !isNotFoundMessage(criteriosValue)) {
            console.log(`  ✅ Extraído ${field} do JSON: ${criteriosValue.substring(0, 100)}...`);
            return criteriosValue;
          }
        }
        
        // Para timeline_estimada, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'timeline_estimada' && jsonData.timeline_estimada !== undefined) {
          const timeline = jsonData.timeline_estimada;
          if (timeline === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          if (typeof timeline === 'object' && timeline !== null) {
            if (!isSubstantiveTimelinePayload(timeline)) {
              console.warn(`  ⚠️ ${field}: objeto timeline só com texto explicativo/meta — ignorando`);
              return null;
            }
            const fasesCount = timeline.fases && Array.isArray(timeline.fases) ? timeline.fases.length : 0;
            console.log(`  ✅ Extraído ${field} do JSON: objeto timeline com ${fasesCount} fase(s)`);
            return JSON.stringify(timeline);
          }
        }

        // valor_projeto: modelo costuma devolver {"valor":null} — é JSON válido e significa “não achei”.
        if (field === 'valor_projeto' && jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
          if (!isSubstantiveValorProjetoPayload(jsonData) && isExplicitEmptyValorProjetoJson(jsonData)) {
            console.log(`  ℹ️ ${field}: null/vazio (não encontrado)`);
            return null;
          }
        }
        
        // Tentar extrair o valor do campo específico
        const fieldKeys: Record<string, string[]> = {
          valor_projeto: ['valor', 'valores', 'valor_projeto', 'value', 'output', 'result'],
          prazo_inscricao: ['prazo', 'prazos', 'prazo_inscricao', 'deadline', 'output', 'result'],
          localizacao: ['localizacao', 'localização', 'location', 'regiao', 'região', 'output', 'result'],
          vagas: ['vagas', 'vagas_disponiveis', 'projects', 'numero_vagas', 'output', 'result'],
          is_researcher: ['is_researcher', 'isResearcher', 'pesquisador', 'researcher', 'output', 'result'],
          is_company: ['is_company', 'isCompany', 'empresa', 'company', 'output', 'result'],
          sobre_programa: ['sobre_programa', 'sobrePrograma', 'sobre_programa', 'about_program', 'output', 'result'],
          criterios_elegibilidade: ['criterios_elegibilidade', 'criteriosElegibilidade', 'critérios_elegibilidade', 'elegibilidade', 'output', 'result'],
          timeline_estimada: ['timeline_estimada', 'timelineEstimada', 'timeline', 'cronograma', 'fases', 'output', 'result'],
        };

        const keysToTry = fieldKeys[field] || ['output', 'result', 'value', field];
        
        for (const key of keysToTry) {
          if (jsonData[key] !== undefined && jsonData[key] !== null) {
            const extractedValue = jsonData[key];
            
            // Para localizacao e vagas, se a chave é o nome do campo e o valor é string, aceitar diretamente
            if ((field === 'localizacao' && key === 'localizacao') || (field === 'vagas' && key === 'vagas')) {
              if (typeof extractedValue === 'string' && extractedValue.trim().length > 0) {
                const value = extractedValue.trim();
                if (!isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value}`);
                  return value;
                }
              }
              // Se for null, aceitar também (indica que não foi encontrado)
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
            }
            
            // Validar se o formato é válido para o campo
            if (!isValidJsonFormat(extractedValue, field)) {
              console.warn(`  ⚠️ JSON encontrado mas formato inválido para ${field}, tentando próximo...`);
              continue; // Tentar próxima chave
            }
            // Para prazo_inscricao, verificar se é array de prazos ou objeto { prazos }
            if (field === 'prazo_inscricao' && Array.isArray(extractedValue)) {
              const cleaned = sanitizePrazoEntries(extractedValue);
              if (cleaned.length > 0) {
                console.log(`  ✅ Extraído array de ${cleaned.length} prazo(s) em formato válido`);
                return JSON.stringify({ prazos: cleaned });
              }
              if (extractedValue.length === 0) {
                console.log(
                  `  ℹ️ ${field}: {"prazos":[]} — nenhum prazo extraído (resposta vazia do modelo ou datas removidas por ancoragem no Ollama).`,
                );
              } else {
                console.log(
                  `  ℹ️ ${field}: entradas em "prazos" não passaram na sanitização (formato/data) — tratando como não encontrado`,
                );
              }
              return null;
            }
            if (
              field === 'prazo_inscricao' &&
              typeof extractedValue === 'object' &&
              extractedValue !== null &&
              !Array.isArray(extractedValue) &&
              Array.isArray((extractedValue as { prazos?: unknown[] }).prazos)
            ) {
              const cleaned = sanitizePrazoEntries((extractedValue as { prazos: unknown[] }).prazos);
              if (cleaned.length > 0) {
                console.log(`  ✅ Extraído objeto prazos com ${cleaned.length} entrada(s) válida(s)`);
                return JSON.stringify({ prazos: cleaned });
              }
              console.log(`  ℹ️ ${field}: {"prazos":[]} ou entradas removidas na sanitização — tratando como não encontrado`);
              return null;
            }
            
            // Para valor_projeto: string (chave valor), objeto {valor}/{valores}, ou array → {valores}
            if (field === 'valor_projeto') {
              if (typeof extractedValue === 'string') {
                const s = extractedValue.trim();
                if (s.length > 0 && looksLikeValorProjetoSnippet(s)) {
                  return JSON.stringify({ valor: s });
                }
                continue;
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && !Array.isArray(extractedValue)) {
                if (!isSubstantiveValorProjetoPayload(extractedValue)) {
                  console.warn(`  ⚠️ ${field}: objeto sem valor monetário/dados concretos — ignorando`);
                  continue;
                }
                console.log(`  ✅ Extraído objeto JSON válido para ${field}`);
                return JSON.stringify(extractedValue);
              }
              if (Array.isArray(extractedValue) && extractedValue.length > 0) {
                if (!isSubstantiveValorProjetoPayload({ valores: extractedValue })) {
                  continue;
                }
                console.log(`  ✅ Extraído array de valores para ${field}`);
                return JSON.stringify({ valores: extractedValue });
              }
            }
            
            // Para localizacao, deve ter chave "localizacao" com valor string
            if (field === 'localizacao' && typeof extractedValue === 'object' && extractedValue !== null) {
              if (typeof extractedValue.localizacao === 'string' && extractedValue.localizacao.trim().length > 0) {
                const locValue = extractedValue.localizacao.trim();
                if (!isNotFoundMessage(locValue)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${locValue}`);
                  return locValue;
                }
              }
              console.warn(`  ⚠️ JSON não contém "localizacao" válida`);
              continue; // Tentar próxima chave
            }
            
            // Para vagas, deve ter chave "vagas" com valor string
            if (field === 'vagas' && typeof extractedValue === 'object' && extractedValue !== null) {
              if (typeof extractedValue.vagas === 'string' && extractedValue.vagas.trim().length > 0) {
                const vagasValue = extractedValue.vagas.trim();
                if (!isNotFoundMessage(vagasValue)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${vagasValue}`);
                  return vagasValue;
                }
              }
              console.warn(`  ⚠️ JSON não contém "vagas" válida`);
              continue; // Tentar próxima chave
            }
            
            // Para is_researcher, deve ter chave "is_researcher" com valor boolean
            if (field === 'is_researcher') {
              if (typeof extractedValue === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue}`);
                return extractedValue;
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.is_researcher === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue.is_researcher}`);
                return extractedValue.is_researcher;
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "is_researcher" válido`);
              continue;
            }
            
            // Para is_company, deve ter chave "is_company" com valor boolean
            if (field === 'is_company') {
              if (typeof extractedValue === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue}`);
                return extractedValue;
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.is_company === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue.is_company}`);
                return extractedValue.is_company;
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "is_company" válido`);
              continue;
            }
            
            // Para sobre_programa, deve ter chave "sobre_programa" com valor string
            if (field === 'sobre_programa') {
              if (typeof extractedValue === 'string' && extractedValue.trim().length > 0) {
                const value = extractedValue.trim();
                if (!isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.sobre_programa === 'string') {
                const value = extractedValue.sobre_programa.trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "sobre_programa" válido`);
              continue;
            }
            
            // Para criterios_elegibilidade, deve ter chave "criterios_elegibilidade" com valor string
            if (field === 'criterios_elegibilidade') {
              if (typeof extractedValue === 'string' && extractedValue.trim().length > 0) {
                const value = extractedValue.trim();
                if (!isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.criterios_elegibilidade === 'string') {
                const value = extractedValue.criterios_elegibilidade.trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "criterios_elegibilidade" válido`);
              continue;
            }
            
            // Para timeline_estimada, deve ter chave "timeline_estimada" com valor objeto
            if (field === 'timeline_estimada') {
              if (typeof extractedValue === 'object' && extractedValue !== null) {
                // Se extractedValue já é o objeto timeline_estimada completo
                if (extractedValue.timeline_estimada !== undefined) {
                  const timeline = extractedValue.timeline_estimada;
                  if (timeline === null) {
                    console.log(`  ℹ️ ${field}: null (não encontrado)`);
                    return null;
                  }
                  if (typeof timeline === 'object' && timeline !== null) {
                  if (!isSubstantiveTimelinePayload(timeline)) {
                    console.warn(`  ⚠️ ${field}: timeline sem fases/datas úteis — ignorando`);
                    continue;
                  }
                    console.log(`  ✅ Extraído ${field} do JSON: objeto com fases`);
                    return JSON.stringify(timeline);
                  }
                }
                // Se extractedValue é o objeto timeline_estimada diretamente (sem chave wrapper)
                if (extractedValue.fases && Array.isArray(extractedValue.fases)) {
                  if (!isSubstantiveTimelinePayload(extractedValue)) {
                    console.warn(`  ⚠️ ${field}: fases sem conteúdo útil — ignorando`);
                    continue;
                  }
                  console.log(`  ✅ Extraído ${field} do JSON: objeto com fases`);
                  return JSON.stringify(extractedValue);
                }
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "timeline_estimada" válido`);
              continue;
            }
            
            // Se chegou aqui, o formato não é válido para este campo
            console.warn(`  ⚠️ Formato inválido para ${field}, tentando próxima chave...`);
            continue;
          }
        }

        // Se não encontrou nas chaves específicas, verificar se o JSON tem a estrutura esperada
        // Para localizacao, vagas e novos campos, tentar extrair de "output" se contiver JSON válido
        if (field === 'localizacao' || field === 'vagas' || field === 'is_researcher' || field === 'is_company' || field === 'sobre_programa' || field === 'criterios_elegibilidade' || field === 'timeline_estimada') {
          // Tentar extrair de "output" se for uma string JSON
          if (jsonData.output && typeof jsonData.output === 'string') {
            try {
              const outputJson = JSON.parse(jsonData.output);
              if (field === 'localizacao' && outputJson.localizacao) {
                const locValue = String(outputJson.localizacao).trim();
                if (!isNotFoundMessage(locValue)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${locValue}`);
                  return locValue;
                }
              }
              if (field === 'vagas' && outputJson.vagas) {
                const vagasValue = String(outputJson.vagas).trim();
                if (!isNotFoundMessage(vagasValue)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${vagasValue}`);
                  return vagasValue;
                }
              }
              if (field === 'is_researcher' && outputJson.is_researcher !== undefined) {
                if (typeof outputJson.is_researcher === 'boolean') {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${outputJson.is_researcher}`);
                  return outputJson.is_researcher;
                }
                if (outputJson.is_researcher === null) {
                  console.log(`  ℹ️ ${field}: null (não encontrado)`);
                  return null;
                }
              }
              if (field === 'is_company' && outputJson.is_company !== undefined) {
                if (typeof outputJson.is_company === 'boolean') {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${outputJson.is_company}`);
                  return outputJson.is_company;
                }
                if (outputJson.is_company === null) {
                  console.log(`  ℹ️ ${field}: null (não encontrado)`);
                  return null;
                }
              }
              if (field === 'sobre_programa' && outputJson.sobre_programa) {
                const value = String(outputJson.sobre_programa).trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (field === 'criterios_elegibilidade' && outputJson.criterios_elegibilidade) {
                const value = String(outputJson.criterios_elegibilidade).trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (field === 'timeline_estimada' && outputJson.timeline_estimada !== undefined) {
                const timeline = outputJson.timeline_estimada;
                if (timeline === null) {
                  console.log(`  ℹ️ ${field}: null (não encontrado)`);
                  return null;
                }
                if (typeof timeline === 'object' && timeline !== null) {
                  if (!isSubstantiveTimelinePayload(timeline)) {
                    console.warn(`  ⚠️ ${field}: output JSON com timeline não substantiva — ignorando`);
                    return null;
                  }
                  if (timeline.fases && Array.isArray(timeline.fases)) {
                    console.log(`  ✅ Extraído ${field} de output JSON: objeto com ${timeline.fases.length} fase(s)`);
                    return JSON.stringify(timeline);
                  }
                    console.log(`  ✅ Extraído ${field} de output JSON: objeto timeline`);
                    return JSON.stringify(timeline);
                }
              }
            } catch (e) {
              // Se não conseguir parsear, continuar
            }
          }
          console.warn(`  ⚠️ JSON não contém a chave "${field}" no formato esperado`);
          return null; // Retornar null para usar valor default
        }
        
        // Para outros campos, tentar qualquer valor string no JSON
        for (const key in jsonData) {
          if (typeof jsonData[key] === 'string' && jsonData[key].trim()) {
            const value = jsonData[key].trim();
            // Verificar se é uma mensagem de "não encontrado"
            if (isNotFoundMessage(value)) {
              console.log(`  ⚠️ Resposta indica que informação não foi encontrada: ${value}`);
              return null; // Retornar null para usar valor default
            }
            console.log(`  ✅ Extraído de JSON (chave genérica): ${value}`);
            return value;
          }
        }
      } catch (parseError) {
        // Campo textual longo pode vir truncado como {"sobre_programa":"... sem fechar aspas/chaves
        if (field === 'sobre_programa' || field === 'criterios_elegibilidade') {
          const key = field === 'sobre_programa' ? 'sobre_programa' : 'criterios_elegibilidade';
          const partial = extractTruncatedJsonStringField(responseText, key);
          if (partial && !isNotFoundMessage(partial)) {
            console.warn(`  ⚠️ ${field}: JSON truncado; usando conteúdo parcial extraído (${partial.length} chars).`);
            return partial;
          }
        }

        // Ajuda quando faltou só o "}" final (ou estava truncado no fim)
        const repairedData = tryParseTopLevelJsonEvenIfTruncated(jsonMatch[0]);
        if (repairedData != null && isValidJsonFormat(repairedData, field)) {
          console.warn(`  ⚠️ JSON reparado automaticamente (truncado no fim)`);
          responseText = JSON.stringify(repairedData);
          // e segue para os próximos estágios de extração abaixo
        }

        // Caso especial: prazo_inscricao frequentemente vem truncado dentro de string.
        // Em vez de depender do JSON, reconstruímos a lista a partir do texto bruto.
        if (field === 'prazo_inscricao') {
          const ranges = extractPrazoRangesFromText(responseText);
          if (ranges.length > 0) {
            console.warn(`  ⚠️ prazo_inscricao: JSON inválido/truncado; reconstruindo a partir de ${ranges.length} intervalo(s) detectado(s).`);
            return JSON.stringify({ prazos: ranges });
          }
        }

        // Caso especial: timeline_estimada truncada no meio do array fases.
        if (field === 'timeline_estimada') {
          const timeline = extractTimelineFromTruncatedText(responseText);
          if (
            timeline &&
            Array.isArray(timeline.fases) &&
            timeline.fases.length > 0 &&
            isSubstantiveTimelinePayload(timeline)
          ) {
            console.warn(`  ⚠️ timeline_estimada: JSON inválido/truncado; reconstruindo ${timeline.fases.length} fase(s) válidas.`);
            return JSON.stringify(timeline);
          }
        }

        // Tentar reparar JSON truncado (muito comum com num_predict baixo)
        try {
          const repaired = repairJsonCandidate(jsonMatch[0]);
          if (repaired) {
            const jsonData2 = JSON.parse(repaired);
            if (isValidJsonFormat(jsonData2, field)) {
              console.warn(`  ⚠️ JSON reparado automaticamente (saída truncada)`);
              // Reusar fluxo padrão: converter para texto e deixar o pipeline extrair
              responseText = JSON.stringify(jsonData2);
            }
          }
        } catch {
          // ignore
        }
        console.warn(`  ⚠️ Erro ao parsear JSON encontrado: ${parseError}`);
        // Continuar para tentar outros métodos
      }
    }

    // Se não encontrou JSON ou não conseguiu parsear, tentar processar como resposta normal
    // Verificar se é JSON direto (array com output)
    if (contentType && contentType.includes('application/json')) {
      try {
        const data = JSON.parse(responseText);
        
        if (Array.isArray(data) && data.length > 0) {
          const firstItem = data[0];
          if (typeof firstItem === 'object' && firstItem.output) {
            // Tentar extrair JSON do output
            const outputValue = firstItem.output;
            if (typeof outputValue === 'string' && outputValue.trim().startsWith('{')) {
              try {
                const outputJson = JSON.parse(outputValue);
                // Validar formato
                if (isValidJsonFormat(outputJson, field)) {
                  if (field === 'localizacao' && outputJson.localizacao) {
                    const locValue = outputJson.localizacao.trim();
                    if (!isNotFoundMessage(locValue)) {
                      console.log(`  ✅ Extraído ${field} do output: ${locValue}`);
                      return locValue;
                    }
                  }
                  if (field === 'vagas' && outputJson.vagas) {
                    const vagasValue = outputJson.vagas.trim();
                    if (!isNotFoundMessage(vagasValue)) {
                      console.log(`  ✅ Extraído ${field} do output: ${vagasValue}`);
                      return vagasValue;
                    }
                  }
                  if (field === 'is_researcher' && outputJson.is_researcher !== undefined) {
                    if (typeof outputJson.is_researcher === 'boolean') {
                      console.log(`  ✅ Extraído ${field} do output: ${outputJson.is_researcher}`);
                      return outputJson.is_researcher;
                    }
                  }
                  if (field === 'is_company' && outputJson.is_company !== undefined) {
                    if (typeof outputJson.is_company === 'boolean') {
                      console.log(`  ✅ Extraído ${field} do output: ${outputJson.is_company}`);
                      return outputJson.is_company;
                    }
                  }
                  if (field === 'sobre_programa' && outputJson.sobre_programa) {
                    const value = String(outputJson.sobre_programa).trim();
                    if (value.length > 0 && !isNotFoundMessage(value)) {
                      console.log(`  ✅ Extraído ${field} do output: ${value.substring(0, 100)}...`);
                      return value;
                    }
                  }
                  if (field === 'criterios_elegibilidade' && outputJson.criterios_elegibilidade) {
                    const value = String(outputJson.criterios_elegibilidade).trim();
                    if (value.length > 0 && !isNotFoundMessage(value)) {
                      console.log(`  ✅ Extraído ${field} do output: ${value.substring(0, 100)}...`);
                      return value;
                    }
                  }
                  if (field === 'valor_projeto') {
                    if (!isSubstantiveValorProjetoPayload(outputJson)) {
                      console.warn(`  ⚠️ ${field}: output sem valor monetário concreto — ignorando`);
                      return null;
                    }
                    console.log(`  ✅ Extraído ${field} do output`);
                    return JSON.stringify(outputJson);
                  }
                  if (field === 'prazo_inscricao' && outputJson.prazos) {
                    const cleaned = sanitizePrazoEntries(outputJson.prazos as unknown[]);
                    if (cleaned.length === 0) {
                      console.warn(`  ⚠️ ${field}: prazos só com texto meta — ignorando`);
                      return null;
                    }
                    console.log(`  ✅ Extraído ${field} do output`);
                    return JSON.stringify({ prazos: cleaned });
                  }
                  if (field === 'timeline_estimada' && outputJson.timeline_estimada !== undefined) {
                    const timeline = outputJson.timeline_estimada;
                    if (timeline === null) {
                      console.log(`  ℹ️ ${field}: null (não encontrado)`);
                      return null;
                    }
                    if (typeof timeline === 'object' && timeline !== null && isSubstantiveTimelinePayload(timeline)) {
                      console.log(`  ✅ Extraído ${field} do output (array)`);
                      return JSON.stringify(timeline);
                    }
                    console.warn(`  ⚠️ ${field}: output sem cronograma útil — ignorando`);
                    return null;
                  }
                }
              } catch (e) {
                // Se não conseguir parsear, continuar
              }
            }
          }
        }
      } catch (parseError) {
        console.warn(`  ⚠️ Erro ao parsear resposta JSON: ${parseError}`);
      }
    }

    // Fallbacks quando o modelo ignora o formato JSON (principalmente em modelos menores)
    if (field === 'vagas') {
      const n = extractFirstIntegerLike(responseText);
      if (n) {
        console.warn(`  ⚠️ vagas: resposta em texto; extraindo número ${n}`);
        return n;
      }
    }
    if (field === 'valor_projeto') {
      const v = extractCurrencyLike(responseText);
      if (v) {
        console.warn(`  ⚠️ valor_projeto: resposta fora do JSON; extraindo valor ${v}`);
        return JSON.stringify({ valor: v });
      }
    }

    // Se não conseguiu extrair JSON no formato esperado, retornar null
    console.warn(`  ⚠️ Resposta não está no formato JSON esperado para ${field}`);
    return null;
  } catch (error) {
    console.error(`  ❌ Erro ao extrair ${field}:`, error);
    return null;
  }
}

/**
 * Processa as informações de um edital
 */
export async function processEditalInfo(
  supabase: SupabaseClient,
  edital: EditalInfo,
  options?: {
    /** Reextrair todos os campos mesmo que já estejam preenchidos. */
    forceReextract?: boolean;
    /**
     * Se a reextração vier vazia (null/""/[]), manter o valor antigo vindo do banco.
     * Normalmente faz sentido junto com `forceReextract`.
     */
    keepExistingOnEmpty?: boolean;
  }
): Promise<ProcessedInfo> {
  console.log(`\n📄 Processando edital: ${edital.numero || 'N/A'} - ${edital.titulo.substring(0, 50)}...`);

  const forceReextract = options?.forceReextract ?? false;
  const keepExistingOnEmpty = options?.keepExistingOnEmpty ?? false;

  // Buscar PDFs (ordenados: texto principal antes de anexos-modelo; ver `fetchEditalPdfRefs`)
  const pdfRefs = await fetchEditalPdfRefs(supabase, edital.id);
  const pdfIds = pdfRefs.map((r) => r.storageKey);
  
  if (pdfIds.length === 0) {
    console.log(`  ⚠️ Nenhum PDF encontrado para este edital`);
    return {};
  }

  console.log(`  📁 Encontrados ${pdfIds.length} PDF(s)`);

  // Verificar se é edital do CNPq pela fonte
  const isCNPqEdital = edital.fonte?.toLowerCase().includes('cnpq') || false;
  
  // Verificar quais campos precisam ser extraídos (só extrair se for null, undefined ou "Não informado")
  const needsValorProjeto = forceReextract
    ? true
    : !edital.valor_projeto || edital.valor_projeto === 'Não informado';
  const needsPrazoInscricao = forceReextract
    ? true
    : !edital.prazo_inscricao || edital.prazo_inscricao === 'Não informado';
  const needsLocalizacao = forceReextract
    ? true
    : !edital.localizacao || edital.localizacao === 'Não informado';
  const needsVagas = forceReextract
    ? true
    : !edital.vagas || edital.vagas === 'Não informado';
  
  // Para CNPq: sempre considerar como pesquisador, não perguntar sobre empresa
  const needsIsResearcher = isCNPqEdital ? false : (edital.is_researcher === null || edital.is_researcher === undefined);
  const needsIsCompany = isCNPqEdital ? false : (edital.is_company === null || edital.is_company === undefined);
  const needsSobrePrograma = forceReextract ? true : (!edital.sobre_programa || edital.sobre_programa === 'Não informado');
  const needsCriteriosElegibilidade = forceReextract
    ? true
    : !edital.criterios_elegibilidade || edital.criterios_elegibilidade === 'Não informado';
  const needsTimelineEstimada = forceReextract ? true : (!edital.timeline_estimada || edital.timeline_estimada === null);
  
  let valor_projeto: string | string[] | null = null;
  let prazo_inscricao: string | string[] | null = null;
  let localizacao: string | string[] | null = null;
  let vagas: string | string[] | null = null;
  let is_researcher: boolean | null = null;
  let is_company: boolean | null = null;
  let sobre_programa: string | null = null;
  let criterios_elegibilidade: string | null = null;
  let timeline_estimada: any | null = null;

  // Campos que não precisam de nova extração: manter valor + log
  if (!needsValorProjeto) {
    valor_projeto = edital.valor_projeto || null;
    console.log(`  ⏭️  Valor por Projeto já possui valor válido, mantendo valor existente`);
  }
  if (!needsPrazoInscricao) {
    prazo_inscricao = edital.prazo_inscricao || null;
    console.log(`  ⏭️  Prazo de Inscrição já possui valor válido, mantendo valor existente`);
  }
  if (!needsLocalizacao) {
    localizacao = edital.localizacao || null;
    console.log(`  ⏭️  Localização já possui valor válido, mantendo valor existente`);
  }
  if (!needsVagas) {
    vagas = edital.vagas || null;
    console.log(`  ⏭️  Vagas já possui valor válido, mantendo valor existente`);
  }

  if (isCNPqEdital) {
    is_researcher = true;
    is_company = false;
    console.log(`  ✅ Edital CNPq: definido automaticamente como pesquisador (is_researcher=true, is_company=false)`);
  } else {
    if (!needsIsResearcher) {
      is_researcher = edital.is_researcher ?? null;
      console.log(`  ⏭️  Is Researcher já possui valor válido, mantendo valor existente`);
    }
    if (!needsIsCompany) {
      is_company = edital.is_company ?? null;
      console.log(`  ⏭️  Is Company já possui valor válido, mantendo valor existente`);
    }
  }

  if (!needsSobrePrograma) {
    sobre_programa = edital.sobre_programa || null;
    console.log(`  ⏭️  Sobre Programa já possui valor válido, mantendo valor existente`);
  }
  if (!needsCriteriosElegibilidade) {
    criterios_elegibilidade = edital.criterios_elegibilidade || null;
    console.log(`  ⏭️  Critérios de Elegibilidade já possui valor válido, mantendo valor existente`);
  }
  if (!needsTimelineEstimada) {
    timeline_estimada = edital.timeline_estimada || null;
    console.log(`  ⏭️  Timeline Estimada já possui valor válido, mantendo valor existente`);
  }

  const extractionTasks: (() => Promise<void>)[] = [];

  if (needsValorProjeto) {
    const valorPdfRefs = filterPdfRefsForExtract(pdfRefs);
    const valorPdfIds = valorPdfRefs.map((r) => r.storageKey);
    if (valorPdfIds.length !== pdfIds.length) {
      console.log(
        `  📎 Valor projeto: ${valorPdfIds.length}/${pdfIds.length} PDF(s) após omitir anexos/modelos e PDFs institucionais (por nome_arquivo).`,
      );
    }
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook("valor_projeto", valorPdfIds, edital.id);
      valor_projeto = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!valor_projeto || (Array.isArray(valor_projeto) ? valor_projeto.length === 0 : valor_projeto.trim().length === 0))) {
        valor_projeto = edital.valor_projeto || null;
      }
    });
  }
  if (needsPrazoInscricao) {
    const prazoPdfRefs = filterPdfRefsForExtract(pdfRefs);
    const prazoPdfIds = prazoPdfRefs.map((r) => r.storageKey);
    if (prazoPdfIds.length !== pdfIds.length) {
      console.log(
        `  📎 Prazo inscrição: ${prazoPdfIds.length}/${pdfIds.length} PDF(s) após omitir anexos/modelos e PDFs institucionais (por nome_arquivo).`,
      );
    }
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook("prazo_inscricao", prazoPdfIds, edital.id);
      prazo_inscricao = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!prazo_inscricao || (Array.isArray(prazo_inscricao) ? prazo_inscricao.length === 0 : prazo_inscricao.trim().length === 0))) {
        prazo_inscricao = edital.prazo_inscricao || null;
      }
    });
  }
  if (needsLocalizacao) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('localizacao', pdfIds, edital.id);
      localizacao = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!localizacao || (Array.isArray(localizacao) ? localizacao.length === 0 : localizacao.trim().length === 0))) {
        localizacao = edital.localizacao || null;
      }
    });
  }
  if (needsVagas) {
    const vagasPdfRefs = filterPdfRefsForExtract(pdfRefs);
    const vagasPdfIds = vagasPdfRefs.map((r) => r.storageKey);
    if (vagasPdfIds.length !== pdfIds.length) {
      console.log(
        `  📎 Vagas: ${vagasPdfIds.length}/${pdfIds.length} PDF(s) após omitir anexos/modelos e PDFs institucionais (por nome_arquivo).`,
      );
    }
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook("vagas", vagasPdfIds, edital.id);
      vagas = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!vagas || (Array.isArray(vagas) ? vagas.length === 0 : vagas.trim().length === 0))) {
        vagas = edital.vagas || null;
      }
    });
  }

  if (!isCNPqEdital) {
    if (needsIsResearcher) {
      extractionTasks.push(async () => {
        const result = await extractInfoFromWebhook('is_researcher', pdfIds, edital.id);
        is_researcher = typeof result === 'boolean' ? result : null;
      });
    }
    if (needsIsCompany) {
      extractionTasks.push(async () => {
        const result = await extractInfoFromWebhook('is_company', pdfIds, edital.id);
        is_company = typeof result === 'boolean' ? result : null;
      });
    }
  }

  if (needsSobrePrograma) {
    const sobrePdfRefs = filterPdfRefsForExtract(pdfRefs);
    const sobrePdfIds = sobrePdfRefs.map((r) => r.storageKey);
    if (sobrePdfIds.length !== pdfIds.length) {
      console.log(
        `  📎 Sobre o programa: ${sobrePdfIds.length}/${pdfIds.length} PDF(s) após omitir anexos/modelos ou institucionais (nome_arquivo).`,
      );
    }
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook("sobre_programa", sobrePdfIds, edital.id);
      sobre_programa = typeof result === 'string' ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!sobre_programa || !sobre_programa.trim())) {
        sobre_programa = edital.sobre_programa || null;
      }
    });
  }
  if (needsCriteriosElegibilidade) {
    const criteriosPdfRefs = filterPdfRefsForExtract(pdfRefs);
    const criteriosPdfIds = criteriosPdfRefs.map((r) => r.storageKey);
    if (criteriosPdfIds.length !== pdfIds.length) {
      console.log(
        `  📎 Critérios de elegibilidade: ${criteriosPdfIds.length}/${pdfIds.length} PDF(s) após omitir anexos/modelos (por nome_arquivo).`,
      );
    }
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook("criterios_elegibilidade", criteriosPdfIds, edital.id);
      criterios_elegibilidade = typeof result === 'string' ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!criterios_elegibilidade || !criterios_elegibilidade.trim())) {
        criterios_elegibilidade = edital.criterios_elegibilidade || null;
      }
    });
  }
  if (needsTimelineEstimada) {
    const timelinePdfRefs = filterPdfRefsForExtract(pdfRefs);
    const timelinePdfIds = timelinePdfRefs.map((r) => r.storageKey);
    if (timelinePdfIds.length !== pdfIds.length) {
      console.log(
        `  📎 Timeline estimada: ${timelinePdfIds.length}/${pdfIds.length} PDF(s) após omitir anexos/modelos ou institucionais (nome_arquivo).`,
      );
    }
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook("timeline_estimada", timelinePdfIds, edital.id);
      if (typeof result === 'string' && result.trim().length > 0) {
        try {
          const parsedTimeline = JSON.parse(result);
          if (typeof parsedTimeline === 'object' && parsedTimeline !== null) {
            if (isSubstantiveTimelinePayload(parsedTimeline)) {
              timeline_estimada = parsedTimeline;
            console.log(`  ✅ Timeline Estimada extraída com sucesso`);
          } else {
              timeline_estimada = null;
              console.warn(`  ⚠️ Timeline Estimada: resposta só com texto explicativo — não gravando`);
            }
          } else {
            timeline_estimada = null;
            console.log(`  ℹ️ Timeline Estimada: null (não encontrado)`);
          }
        } catch (e) {
          console.warn(`  ⚠️ Erro ao parsear timeline_estimada: ${e}`);
          timeline_estimada = null;
        }
      } else if (typeof result === 'object' && result !== null) {
        timeline_estimada = isSubstantiveTimelinePayload(result) ? result : null;
        if (!timeline_estimada) {
          console.warn(`  ⚠️ Timeline Estimada: objeto inválido/meta — não gravando`);
        }
      } else {
        timeline_estimada = null;
        console.log(`  ℹ️ Timeline Estimada: null (não encontrado)`);
      }
      if (forceReextract && keepExistingOnEmpty && !timeline_estimada) {
        timeline_estimada = edital.timeline_estimada || null;
      }
    });
  }

  const fieldConcurrency = getOllamaFieldConcurrency();
  if (fieldConcurrency <= 1 || !USE_OLLAMA) {
    for (const t of extractionTasks) {
      await t();
      await sleepFieldExtractDelay();
    }
  } else {
    if (extractionTasks.length > 0) {
      console.log(`  ⚡ Extração paralela: até ${fieldConcurrency} campo(s) ao mesmo tempo (OLLAMA_FIELD_CONCURRENCY)`);
    }
    await runWithConcurrency(extractionTasks, fieldConcurrency);
  }

  const processedInfo: ProcessedInfo = {};
  
  // Função auxiliar para processar e validar campo
  const processField = (value: string | string[] | null, field: string, fieldName: string): string => {
    if (!value) {
      console.log(`  ⚠️ ${fieldName}: não encontrado (usando default)`);
      return 'Não informado';
    }
    
    // Se for array (prazos), converter para JSON stringificado
    if (Array.isArray(value)) {
      if (field === 'prazo_inscricao') {
        const jsonStr = JSON.stringify({ prazos: value });
        console.log(`  ✅ ${fieldName} (${value.length} prazo(s)): ${jsonStr.substring(0, 100)}...`);
        return jsonStr;
      }
      return value.join(', ');
    }
    
    // Se for string, verificar se é JSON válido
    const stringValue = String(value).trim();
    
    // Se começa com {, tentar parsear e validar formato
    if (stringValue.startsWith('{')) {
      try {
        const parsed = JSON.parse(stringValue);
        if (isValidJsonFormat(parsed, field)) {
          // Extrair valor da chave específica para localizacao e vagas
          if (field === 'localizacao' && parsed.localizacao) {
            console.log(`  ✅ ${fieldName}: ${parsed.localizacao}`);
            return parsed.localizacao;
          }
          if (field === 'vagas' && parsed.vagas) {
            if (!isNotFoundMessage(parsed.vagas)) {
              console.log(`  ✅ ${fieldName}: ${parsed.vagas}`);
              return parsed.vagas;
            }
            console.warn(`  ⚠️ ${fieldName}: valor indica não encontrado (usando default)`);
            return 'Não informado';
          }
          // Para valor_projeto e prazo_inscricao, retornar JSON stringificado
          console.log(`  ✅ ${fieldName}: JSON válido extraído`);
          return JSON.stringify(parsed);
        } else {
          console.warn(`  ⚠️ ${fieldName}: JSON encontrado mas formato inválido (usando default)`);
          return 'Não informado';
        }
      } catch (e) {
        // Se não conseguir parsear, usar default
        console.warn(`  ⚠️ ${fieldName}: JSON inválido (usando default)`);
        return 'Não informado';
      }
    }
    
    // Para localizacao e vagas, aceitar strings simples (não precisam estar em JSON)
    if (field === 'localizacao' || field === 'vagas') {
      if (stringValue.length > 0 && !isNotFoundMessage(stringValue)) {
        console.log(`  ✅ ${fieldName}: ${stringValue}`);
        return stringValue;
      }
      console.warn(`  ⚠️ ${fieldName}: valor inválido ou não encontrado (usando default)`);
      return 'Não informado';
    }
    
    // Para sobre_programa e criterios_elegibilidade, aceitar strings simples
    if (field === 'sobre_programa' || field === 'criterios_elegibilidade') {
      if (stringValue.length > 0 && !isNotFoundMessage(stringValue)) {
        console.log(`  ✅ ${fieldName}: ${stringValue.substring(0, 100)}...`);
        return stringValue;
      }
      console.warn(`  ⚠️ ${fieldName}: valor inválido ou não encontrado (usando default)`);
      return 'Não informado';
    }
    
    // Se não é JSON, usar default (todos os campos devem estar em formato JSON)
    console.warn(`  ⚠️ ${fieldName}: resposta não está em formato JSON (usando default)`);
    return 'Não informado';
  };

  processedInfo.valor_projeto = processField(valor_projeto, 'valor_projeto', 'Valor por Projeto');
  processedInfo.prazo_inscricao = processField(prazo_inscricao, 'prazo_inscricao', 'Prazo de Inscrição');
  processedInfo.localizacao = processField(localizacao, 'localizacao', 'Localização');
  processedInfo.vagas = processField(vagas, 'vagas', 'Vagas');
  
  // Processar campos booleanos
  if (is_researcher !== null && is_researcher !== undefined) {
    processedInfo.is_researcher = is_researcher;
    console.log(`  ✅ Is Researcher: ${is_researcher}`);
  } else {
    console.log(`  ⚠️ Is Researcher: não encontrado (usando null)`);
  }
  
  if (is_company !== null && is_company !== undefined) {
    processedInfo.is_company = is_company;
    console.log(`  ✅ Is Company: ${is_company}`);
  } else {
    console.log(`  ⚠️ Is Company: não encontrado (usando null)`);
  }
  
  // Processar campos de texto
  processedInfo.sobre_programa = sobre_programa && sobre_programa.trim().length > 0 && !isNotFoundMessage(sobre_programa)
    ? sobre_programa
    : (needsSobrePrograma ? 'Não informado' : undefined);
  
  if (processedInfo.sobre_programa) {
    console.log(`  ✅ Sobre Programa: ${processedInfo.sobre_programa.substring(0, 100)}...`);
  } else if (needsSobrePrograma) {
    console.log(`  ⚠️ Sobre Programa: não encontrado (usando default)`);
  }
  
  processedInfo.criterios_elegibilidade = criterios_elegibilidade && criterios_elegibilidade.trim().length > 0 && !isNotFoundMessage(criterios_elegibilidade)
    ? criterios_elegibilidade
    : (needsCriteriosElegibilidade ? 'Não informado' : undefined);
  
  if (processedInfo.criterios_elegibilidade) {
    console.log(`  ✅ Critérios de Elegibilidade: ${processedInfo.criterios_elegibilidade.substring(0, 100)}...`);
  }
  
  // Processar timeline_estimada
  processedInfo.timeline_estimada = timeline_estimada && typeof timeline_estimada === 'object' && timeline_estimada !== null
    ? timeline_estimada
    : undefined;
  
  if (processedInfo.timeline_estimada) {
    const fasesCount = processedInfo.timeline_estimada.fases && Array.isArray(processedInfo.timeline_estimada.fases) 
      ? processedInfo.timeline_estimada.fases.length 
      : 0;
    console.log(`  ✅ Timeline Estimada: ${fasesCount} fase(s) encontrada(s)`);
  } else if (needsTimelineEstimada) {
    console.log(`  ⚠️ Timeline Estimada: não encontrada (usando null)`);
  }

  return processedInfo;
}

/**
 * Atualiza as informações processadas no banco de dados
 */
export async function updateEditalInfo(
  supabase: SupabaseClient,
  editalId: string,
  info: ProcessedInfo
): Promise<void> {
  const updateData: Record<string, any> = {
    ...info,
    informacoes_processadas_em: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('editais')
    .update(updateData)
    .eq('id', editalId);

  if (error) {
    throw new Error(`Erro ao atualizar informações do edital: ${error.message}`);
  }
}

/**
 * Busca editais para processar
 * @param supabase Cliente Supabase
 * @param includeProcessed Se true, inclui editais já processados (para atualização)
 * @param includeNotInformed Se true, também inclui editais com "Não informado" (para reprocessar)
 */
export async function fetchEditaisToProcess(
  supabase: SupabaseClient,
  includeProcessed: boolean = false,
  includeNotInformed: boolean = false
): Promise<EditalInfo[]> {
  let query = supabase
    .from('editais')
    .select('id, numero, titulo, fonte, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company, sobre_programa, criterios_elegibilidade, timeline_estimada, informacoes_processadas_em')
    .order('criado_em', { ascending: false });

  // Se includeNotInformed, buscar TODOS os editais (incluindo processados)
  // porque queremos reprocessar os que têm "Não informado"
  if (includeNotInformed) {
    // Não aplicar filtro de processados aqui, vamos filtrar depois
  } else if (!includeProcessed) {
    // Se não incluir processados e não incluir "Não informado", filtrar apenas não processados
    query = query.is('informacoes_processadas_em', null);
  }

  const { data: editais, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(
      `Erro ao buscar editais: ${formatSupabaseRequestError(fetchError)}. ` +
        "Confira rede/VPN, firewall e se VITE_SUPABASE_URL / SUPABASE_URL apontam para o projeto correto." +
        supabaseNetworkUserHint(fetchError),
    );
  }

  if (!editais || editais.length === 0) {
    return [];
  }

  // Se includeNotInformed, filtrar editais que têm "Não informado" em qualquer campo
  // OU que não foram processados (mesmo que includeProcessed seja false)
  if (includeNotInformed) {
    return editais.filter(edital => {
      // Incluir se não foi processado ainda
      const notProcessed = !edital.informacoes_processadas_em;
      if (notProcessed) {
        return true; // Sempre processar editais não processados
      }
      
      // Se já foi processado, só incluir se tem "Não informado" em qualquer campo
      // E se o campo não é null (null significa que não foi processado ainda)
      const hasNotInformed = 
        (edital.valor_projeto === 'Não informado') ||
        (edital.prazo_inscricao === 'Não informado') ||
        (edital.localizacao === 'Não informado') ||
        (edital.vagas === 'Não informado') ||
        (edital.sobre_programa === 'Não informado') ||
        (edital.criterios_elegibilidade === 'Não informado') ||
        (edital.timeline_estimada === null || edital.timeline_estimada === undefined) ||
        (edital.is_researcher === null || edital.is_researcher === undefined) ||
        (edital.is_company === null || edital.is_company === undefined);
      
      return hasNotInformed;
    });
  }

  // Se não incluir processados, filtrar apenas os não processados
  if (!includeProcessed) {
    return editais.filter(edital => !edital.informacoes_processadas_em);
  }

  return editais;
}

/** Retorna true se o edital tem "Não informado" (ou null em campos chave) em algum campo. */
function editalHasNotInformed(edital: EditalInfo): boolean {
  return (
    edital.valor_projeto === 'Não informado' ||
    edital.prazo_inscricao === 'Não informado' ||
    edital.localizacao === 'Não informado' ||
    edital.vagas === 'Não informado' ||
    edital.sobre_programa === 'Não informado' ||
    edital.criterios_elegibilidade === 'Não informado' ||
    (edital.timeline_estimada == null) ||
    (edital.is_researcher == null) ||
    (edital.is_company == null)
  );
}

/**
 * Busca editais que tenham pelo menos um dos campos (valor_projeto, prazo_inscricao, localizacao,
 * vagas, sobre_programa, criterios_elegibilidade, timeline_estimada, is_researcher, is_company) = null.
 */
export async function fetchEditaisWithNullFields(supabase: SupabaseClient): Promise<EditalInfo[]> {
  const { data: editais, error } = await supabase
    .from('editais')
    .select('id, numero, titulo, fonte, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company, sobre_programa, criterios_elegibilidade, timeline_estimada, informacoes_processadas_em')
    .or('valor_projeto.is.null,prazo_inscricao.is.null,localizacao.is.null,vagas.is.null,sobre_programa.is.null,criterios_elegibilidade.is.null,timeline_estimada.is.null,is_researcher.is.null,is_company.is.null')
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error(
      `Erro ao buscar editais: ${formatSupabaseRequestError(error)}. ` +
        "Confira rede/VPN e variáveis do Supabase no .env.local." +
        supabaseNetworkUserHint(error),
    );
  }
  return editais ?? [];
}

/**
 * Busca apenas editais já processados que tenham "Não informado" em algum campo (para reprocessar).
 */
export async function fetchEditaisOnlyNotInformed(supabase: SupabaseClient): Promise<EditalInfo[]> {
  const { data: editais, error } = await supabase
    .from('editais')
    .select('id, numero, titulo, fonte, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company, sobre_programa, criterios_elegibilidade, timeline_estimada, informacoes_processadas_em')
    .not('informacoes_processadas_em', 'is', null)
    .order('criado_em', { ascending: false });

  if (error) {
    throw new Error(
      `Erro ao buscar editais: ${formatSupabaseRequestError(error)}. ` +
        "Confira rede/VPN e variáveis do Supabase no .env.local." +
        supabaseNetworkUserHint(error),
    );
  }
  if (!editais?.length) return [];

  return editais.filter(editalHasNotInformed);
}

/**
 * Processa informações de todos os editais (modo definido por PROCESS_EDITAL_MODE).
 * PROCESS_EDITAL_MODE=null → somente editais com algum campo null (valor_projeto, prazo_inscricao, sobre_programa, criterios_elegibilidade, timeline_estimada, etc.)
 * PROCESS_EDITAL_MODE=nao-informado → somente editais já processados com "Não informado" em algum campo
 * Caso contrário → editais não processados + editais com "Não informado" (comportamento anterior)
 */
export async function processAllEditaisInfo(): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                      process.env.SUPABASE_URL;
  
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Variáveis de ambiente não encontradas!');
    console.error('   Configure no arquivo .env.local:');
    console.error('   VITE_SUPABASE_URL=https://seu-projeto.supabase.co');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role\n');
    throw new Error('Variáveis de ambiente do Supabase não configuradas');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const host = new URL(supabaseUrl).host;
    console.log(`🔗 Supabase (host): ${host}`);
  } catch {
    console.warn("⚠️  VITE_SUPABASE_URL / SUPABASE_URL não parece uma URL válida.");
  }

  const mode = (process.env.PROCESS_EDITAL_MODE || '').toLowerCase().trim();
  let editais: EditalInfo[];

  if (mode === 'null') {
    console.log('\n🔄 Processamento: somente editais com algum campo null (sobre_programa, criterios_elegibilidade, timeline_estimada, etc.).\n');
    editais = await fetchEditaisWithNullFields(supabase);
  } else if (mode === 'nao-informado') {
    console.log('\n🔄 Processamento: somente editais já processados com "Não informado" em algum campo.\n');
    editais = await fetchEditaisOnlyNotInformed(supabase);
  } else {
    console.log('\n🔄 Iniciando processamento de informações dos editais...\n');
    console.log('ℹ️  Processando editais não processados e editais com "Não informado".\n');
    editais = await fetchEditaisToProcess(supabase, false, true);
  }

  if (!editais || editais.length === 0) {
    if (mode === 'null') {
      console.log('⚠️ Nenhum edital com campos null (sobre_programa, criterios_elegibilidade, timeline_estimada, etc.) encontrado.');
    } else if (mode === 'nao-informado') {
      console.log('⚠️ Nenhum edital já processado com "Não informado" encontrado.');
    } else {
      console.log('⚠️ Nenhum edital a processar encontrado no banco de dados.');
    }
    return;
  }

  console.log(`📊 Total de editais a processar: ${editais.length}`);
  if (USE_OLLAMA) {
    console.log(
      `⚡ Paralelismo: até ${getOllamaFieldConcurrency()} campo(s) por edital · ${getProcessEditalBatchConcurrency()} edital(is) por lote (OLLAMA_FIELD_CONCURRENCY / PROCESS_EDITAL_CONCURRENCY)`,
    );
  }
  console.log('');

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ edital: string; error: string }> = [];

  type OneResult = { ok: true } | { ok: false; edital: string; error: string };

  async function runOneEdital(edital: EditalInfo): Promise<OneResult> {
    try {
      const processedInfo = await processEditalInfo(supabase, edital);
      await updateEditalInfo(supabase, edital.id, processedInfo);
      console.log(`  ✅ Edital processado com sucesso\n`);
      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Erro ao processar edital: ${errorMsg}\n`);
      return {
        ok: false,
        edital: `${edital.numero || 'N/A'} - ${edital.titulo}`,
        error: errorMsg,
      };
    }
  }

  function accumulateResults(results: OneResult[]) {
    for (const r of results) {
      if (r.ok) successCount++;
      else {
        errorCount++;
        errors.push({ edital: r.edital, error: r.error });
      }
    }
  }

  const batchConc = getProcessEditalBatchConcurrency();
  if (batchConc <= 1) {
    for (let i = 0; i < editais.length; i++) {
      const r = await runOneEdital(editais[i]);
      accumulateResults([r]);
      if (i < editais.length - 1) {
        const delayBetweenEditais = getDelayBetweenEditaisMs();
        if (delayBetweenEditais > 0) {
          console.log(`⏳ Aguardando ${delayBetweenEditais / 1000}s antes do próximo edital...\n`);
          await new Promise((resolve) => setTimeout(resolve, delayBetweenEditais));
        }
      }
    }
  } else {
    console.log(`⚡ PROCESS_EDITAL_CONCURRENCY=${batchConc}: processando editais em lotes paralelos (USE_OLLAMA).\n`);
    for (let i = 0; i < editais.length; i += batchConc) {
      const chunk = editais.slice(i, i + batchConc);
      const results = await Promise.all(chunk.map((e) => runOneEdital(e)));
      accumulateResults(results);
      if (i + batchConc < editais.length) {
        const delayBetweenEditais = getDelayBetweenEditaisMs();
        if (delayBetweenEditais > 0) {
          console.log(`⏳ Aguardando ${delayBetweenEditais / 1000}s antes do próximo lote...\n`);
          await new Promise((resolve) => setTimeout(resolve, delayBetweenEditais));
        }
      }
    }
  }

  // Resumo
  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO DO PROCESSAMENTO');
  console.log('═'.repeat(50));
  console.log(`📥 Editais processados: ${editais.length}`);
  console.log(`✅ Editais processados com sucesso: ${successCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Detalhes dos erros:');
    errors.forEach(({ edital, error }) => {
      console.log(`   - ${edital}: ${error}`);
    });
  }
}

// Executar se chamado diretamente (compatível com ESM)
// Usa endsWith para evitar execução duplicada quando importado por processEditalInfoNull.ts
const scriptFile = process.argv[1] || '';
const isDirectRun = import.meta.url === `file://${scriptFile}` || 
                    (scriptFile.endsWith('processEditalInfo.ts') && !scriptFile.includes('Null') && !scriptFile.includes('NaoInformado'));
if (isDirectRun) {
  processAllEditaisInfo()
    .then(() => {
      console.log('\n✅ Processamento concluído!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}

