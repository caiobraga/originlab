/**
 * Extração de informações de edital via Ollama local.
 * Busca PDFs no Supabase Storage (ou contexto da tabela documents) e envia ao modelo.
 * Use USE_OLLAMA=true no .env para ativar (em vez do webhook n8n).
 *
 * Timeout: causas comuns e o que fazer
 * - Contexto grande (muitos chars/tokens): reduza OLLAMA_MAX_CONTEXT_CHARS (ex: 40000).
 * - Modelo 7B em CPU é lento: aumente OLLAMA_TIMEOUT_MS (ex: 300000) ou use modelo menor (qwen2.5:3b).
 * - Rode com OLLAMA_VERBOSE=1 para ver tamanho do prompt e ajustar.
 * - `OLLAMA_TEMPERATURE` (default **0**): enviado em `options.temperature` no `/api/generate` da extração (menos variação entre execuções).
 * - Timeout na tabela documents: a coluna `content` existe, mas um SELECT gigante com texto grande estoura o statement timeout.
 *   O script usa 2 fases (só `id` → depois `content` em lotes). Ainda assim, crie índice: `scripts/db/migration-documents-index-file-id.sql`.
 *   `OLLAMA_RAG_CONTENT_BATCH_SIZE` (default 30) = linhas por pedido ao buscar `content`.
 * - RAG vazio: por defeito tenta PDF do storage (`OLLAMA_RAG_FALLBACK_PDF=0` para desligar).
 * - Heurísticas **fora** do vector top-k: no concat de `documents` (quando pgvector não preenche o contexto),
 *   pode omitir chunks que parecem «Código de Conduta»/integridade (`OLLAMA_RAG_DOCUMENTS_CONCAT_FILTER=0` desliga).
 *   Ordenação de PDFs no storage por `nome_arquivo`: `OLLAMA_PDF_CONTEXT_SORT_HEURISTIC=0` desliga (fallback / `OLLAMA_USE_RAG=0`).
 *   O top-k (`match_documents` → `--- Chunk`) **não** filtra por essas heurísticas de texto — só dedupe.
 * - `OLLAMA_LOG_RAG_DIAG=0`: não imprime `📋 RAG diagnóstico` (contagem em `documents`) quando pgvector/concat falham.
 * - Paralelismo (sem threads): `OLLAMA_FIELD_CONCURRENCY` (default 3) extrai vários campos por edital ao mesmo tempo; `PROCESS_EDITAL_CONCURRENCY` (default 2 com USE_OLLAMA) processa vários editais em paralelo no batch (`api:process-edital-info`). Ver `scripts/lib/process-edital-delays.ts`.
 * - `UPDATE_EDITAL_DEBUG_CONTENT=1`: imprime preview do bloco "CONTEÚDO DOS DOCUMENTOS" antes do Ollama (`api:update-edital-info` e `api:process-edital-info` no package.json). `UPDATE_EDITAL_DEBUG_CONTENT_CHARS` (default 1500) limita o preview. Mostra também a **fonte** (ex.: coluna `content` em `documents` vs PDF no storage). Para rodar sem preview no batch: `UPDATE_EDITAL_DEBUG_CONTENT=0 npx tsx scripts/api/processEditalInfo.ts`.
 * - `OLLAMA_RAG_CONTENT_ONLY=1`: só lê a coluna `content` em `documents` (não tenta name/data/text…).
 * - `OLLAMA_RAG_INCLUDE_NAME_COLUMN=1`: inclui a coluna `documents.name` na busca concat (default: off).
 *   Motivo: em muitos datasets `name` é só o nome do arquivo (ex.: `edital.pdf`), o que não é conteúdo útil para extração.
 * - RAG top-k: a similaridade usa um texto curto (`ragQuery` em `extractInfoViaOllama`), separado do prompt longo de extração.
 *   Motivo: prompts enormes viram embeddings “genéricos” e puxam chunks irrelevantes; também aumentam risco de erro de tamanho no embedder.
 * - **CRAG** (`OLLAMA_RAG_CRAG`, default **1**): Corrective RAG — uma embedding + `match_documents` por chamada; em falha de JSON ou resposta vazia, `processEditalInfo` refaz a busca com `ragQuery` corrigida (`buildCragCorrectiveRagQuery`). `OLLAMA_RAG_CRAG=0` desliga só a correção de consulta nesse script (o RAG continua uma única passagem vetorial).
 * - Ensemble de geração: `OLLAMA_GENERATION_ENSEMBLE_N` (2–10, 0=desligado) dispara várias chamadas **paralelas** ao `/api/generate` com o **mesmo prompt de pergunta** mas **fatias diferentes** do contexto RAG; escolhe a melhor resposta por heurística (JSON válido + campo). Útil quando um único recorte perde o trecho certo.
 *   - Para cobrir o documento inteiro (sem ficar só no “início” do texto), use `OLLAMA_GENERATION_ENSEMBLE_USE_FULL_CONTEXT=1`.
 * - `OLLAMA_NO_SANITIZE_PAGE_MARKERS=1`: não remove marcadores tipo `-- 1 of 48 --` do texto antes do prompt.
 * - `SAVE_PROCESS_EDITAL_DEBUG=1`: salva prompt + env (mascarado) + JSON bruto do Ollama em disco.
 *   Com ensemble (`OLLAMA_GENERATION_ENSEMBLE_N` ≥ 2), grava também `ensemble.json`, `ensemble.{i}.prompt.txt`, `ensemble.{i}.response.text.txt`, `ensemble.{i}.response.raw.json`.
 *   Com RAG em modo top-k (incl. vários `OLLAMA_RAG_TOP_K_TRY`), grava `topk-multi.json` e `topk.k{K}.v{V}.w{W}.*` por tentativa de k e janela.
 *   Lista unificada de prompts no dump: `prompt.all.{0,1,…}.txt` + `prompts-index.json` (mapeia cada ficheiro a ensemble ou topk-multi).
 *   Ancoragem no texto enviado: para `prazo_inscricao` e `valor_projeto`, penaliza-se no ensemble/RAG respostas com datas (DD/MM/AAAA ou ISO) ou valores monetários que não aparecem no trecho do documento da mesma chamada; antes de devolver ao caller, filtra-se JSON (remove prazos não ancorados; `valor` concreto sem âncora → null).
 *   `OLLAMA_RAG_INVALID_RETRY_TOP_K` (opcional, ex.: `12,24,36`): em `USE_OLLAMA`, se a resposta não passar na validação de JSON do campo, nova chamada com outro `top_k` no RAG. Com **CRAG** (default), a `ragQuery` de embedding é **corrigida** a cada tentativa com base na resposta inválida anterior. Sem CRAG, mantém-se a mesma `ragQuery` e só mudam `top_k` + janela. `OLLAMA_RAG_INVALID_RETRY_CONTENT_SHIFT` (default 1) aplica **outra janela aleatória** (`crypto.randomInt`) sobre o **texto completo** disponível (PDF concatenado ou `ctx` RAG), sem recorte lexical nem heurísticas tipo top-k de trecho; início/fim alinhados a quebras (até ~400 chars) para não cortar a meio de palavra. `0`/`false`/`off` desliga.
 *   `OLLAMA_PRAZO_ANCHOR_RETRY` (default 1, máx. 3, `0` desliga): se a 1.ª resposta de `prazo_inscricao` tiver datas removidas por ancoragem, chamada(s) extra ao `/api/generate` com reforço no prompt.
 *   `OLLAMA_PRAZO_SOURCE_HEURISTIC` (default 1, `0` desliga): se `{"prazos":[]}` após ancoragem, tenta listar datas DD/MM/AAAA do **próprio** texto-fonte perto de submissão/inscrição/cronograma/etc. (ex.: cronograma FAPESC quando o modelo alucina o ano).
 *   Com fallback PDF (sem `OLLAMA_GENERATION_ENSEMBLE_N` ≥ 2), quando o texto excede `OLLAMA_MAX_CONTEXT_CHARS`, escolhe-se um único trecho por relevância lexical ao `ragQuery` + campo (constantes internas de tamanho/overlap de fatia).
 *   Ordem de tentativa (gravável): `<repo>/teste` → `PROCESS_EDITAL_DEBUG_DIR` → `./teste` (cwd) → `${os.tmpdir()}/originlab-ollama-debug`.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "node:crypto";
import { access, constants, mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STORAGE_BUCKET = "edital-pdfs";

/** Raiz do repo (…/originlab), independente do `cwd` do processo. */
const REPO_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/** Texto fixo antes do CONTEÚDO — curto para maximizar espaço ao edital; `OLLAMA_PROMPT_PREAMBLE=long` volta ao prefácio antigo. */
function buildOllamaInstructionPreamble(): string {
  if (process.env.OLLAMA_PROMPT_PREAMBLE === "long") {
    return (
      "Você é um assistente que analisa editais. Use APENAS o conteúdo dos documentos abaixo para responder. " +
      "Se os trechos não tratarem do assunto da pergunta, responda no formato pedido usando null ou listas vazias onde couber — não invente com base em trechos irrelevantes. " +
      "Retorne somente o que for pedido (ex.: JSON quando solicitado).\n\n"
    );
  }
  return "Use só o CONTEÚDO abaixo. Siga o formato da PERGUNTA; sem dados úteis → null ou [].\n\n";
}

function compactRagQueryNote(ragQuery: string): string {
  const q = String(ragQuery || "").replace(/\s+/g, " ").trim();
  return q.length > 0 ? `RAG: ${q}\n\n` : "";
}

/** Limite de caracteres de contexto (lido ao carregar o módulo). */
function getMaxContextChars(): number {
  return parseInt(process.env.OLLAMA_MAX_CONTEXT_CHARS || "22000", 10);
}
/** Limite de chunks usados no prompt RAG (evita contexto gigante). Não afeta quantos trechos são salvos por PDF em documents. */
function getMaxChunks(): number | null {
  const v = process.env.OLLAMA_MAX_CHUNKS;
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

/** Se true, usa a tabela documents (RAG) para contexto; senão usa extração direta dos PDFs. */
const USE_RAG_DOCUMENTS = process.env.OLLAMA_USE_RAG !== "0" && process.env.OLLAMA_USE_RAG !== "false";

export type RagDocumentContextResult = {
  text: string;
  /** Ex.: `documents.content (match file_id)` — para debug / logs. */
  sourceLabel: string;
};

type MatchDocumentsRow = {
  id: string;
  file_id: string | null;
  metadata: Record<string, unknown> | null;
  content: string | null;
  similarity: number | null;
};

type DocumentContextFetchOpts = {
  editalId?: string;
  /** Texto curto para embedding / `match_documents` (quando diferente do prompt completo). */
  ragQuery?: string;
  /** Campo de extração (logs, grounding valor/prazo, etc.). */
  field?: string;
  /** Override do top-k do RAG vetorial (por tentativa). */
  topKOverride?: number;
};

/**
 * CRAG (Corrective RAG): uma consulta vetorial simples + correção da consulta após falha.
 * Default **ligado** (`OLLAMA_RAG_CRAG` omitido ou `1`). `0` / `false` / `off` / `no` permite `OLLAMA_RAG_TRY_MULTIPLE_TOP_K` na 1.ª passagem RAG.
 */
export function isRagCragEnabled(): boolean {
  const raw = (process.env.OLLAMA_RAG_CRAG ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

/**
 * Cabeçalho típico de PDF institucional (conduta/integridade) que não é o edital da chamada.
 * Usado quando `nome_arquivo` no BD é neutro mas o texto do chunk denuncia o documento.
 */
function ragChunkContentLooksInstitutional(text: string): boolean {
  const head = String(text || "")
    .slice(0, 3200)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (head.includes("codigo de conduta") && head.includes("fapesc")) return true;
  if (head.includes("codigo de conduta") && head.includes("sumario") && head.includes("preambulo")) return true;
  if (head.includes("plano de integridade") && head.includes("compliance")) return true;
  if (head.includes("programa de integridade e compliance")) return true;
  if (/\bmanual\s+de\s+conduta\b/.test(head)) return true;
  if (head.includes("matriz de riscos") && head.includes("integridade") && head.includes("fapesc")) return true;
  return false;
}

/** `OLLAMA_RAG_DOCUMENTS_CONCAT_FILTER=0`: não filtra chunks por texto no concat de `documents` (só heurística fora do vector). */
function isRagDocumentsConcatInstitutionalFilterOn(): boolean {
  const v = (process.env.OLLAMA_RAG_DOCUMENTS_CONCAT_FILTER ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/** `OLLAMA_PDF_CONTEXT_SORT_HEURISTIC=0`: não reordena PDFs por `nome_arquivo` no fallback storage / RAG=0. */
function isPdfContextSortHeuristicOn(): boolean {
  const v = (process.env.OLLAMA_PDF_CONTEXT_SORT_HEURISTIC ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/** Espelha `processEditalInfo` (tier por `nome_arquivo`) para ordenar PDFs no fallback/concat. */
function pdfNomeContextTierFromNomeArquivo(nomeArquivo: string): number {
  const n = String(nomeArquivo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    /\b(chamada\s+publica|chamada_publica|chamada-publica|edital|extrato|publicacao\s+de\s+chamada|retificacao)\b/.test(n)
  ) {
    return -1;
  }
  if (
    /\b(integridade|compliance|plano\s+de\s+integridade|codigo\s+de\s+etica|codigo\s+etica|politica\s+de\s+privacidade|protecao\s+de\s+dados|\blgpd\b|canal\s+de\s+denuncia)\b/.test(
      n,
    )
  ) {
    return 2;
  }
  if (/\bcodigo[\s_\-]+de[\s_\-]+conduta\b/.test(n) || /\bcodigo[\s_\-]+conduta\b/.test(n)) return 2;
  if (/\bconduta[\s_\-]+fapesc\b/.test(n) || /\bfapesc[\s_\-]+conduta\b/.test(n)) return 2;
  if (/\bmanual\s+de\s+conduta\b/.test(n)) return 2;
  if (/\b(anexo|declaracao|declarac|termo\s+de|modelo|formulario|formulari)\b/.test(n)) return 1;
  return 0;
}

type PdfOrderMeta = { tier: number; criado: number; nome: string };

async function sortResolvedStorageIdsForEditalContext(ids: string[]): Promise<string[]> {
  if (!supabase || ids.length <= 1) return ids;
  const uniq = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
  const order = new Map<string, PdfOrderMeta>();
  const ingest = (r: { id: string; file_id?: string | null; nome_arquivo?: string | null; criado_em?: string | null }) => {
    const nome = String(r.nome_arquivo || "").trim() || "(sem nome)";
    const tier = pdfNomeContextTierFromNomeArquivo(nome);
    const criado = r.criado_em ? Date.parse(String(r.criado_em)) : 0;
    const meta: PdfOrderMeta = { tier, criado, nome };
    order.set(String(r.id).trim(), meta);
    if (r.file_id && String(r.file_id).trim()) order.set(String(r.file_id).trim(), meta);
  };
  const { data: byId } = await supabase.from("edital_pdfs").select("id, file_id, nome_arquivo, criado_em").in("id", uniq);
  const { data: byFile } = await supabase.from("edital_pdfs").select("id, file_id, nome_arquivo, criado_em").in("file_id", uniq);
  for (const r of [...(byId || []), ...(byFile || [])]) {
    ingest(r as { id: string; file_id?: string | null; nome_arquivo?: string | null; criado_em?: string | null });
  }
  return [...uniq].sort((a, b) => {
    const oa = order.get(a) ?? { tier: 0, criado: 0, nome: "" };
    const ob = order.get(b) ?? { tier: 0, criado: 0, nome: "" };
    if (oa.tier !== ob.tier) return oa.tier - ob.tier;
    if (oa.criado !== ob.criado) return oa.criado - ob.criado;
    return oa.nome.localeCompare(ob.nome, "pt", { sensitivity: "base" });
  });
}

/** Remove marcadores de página comuns da extração PDF (`-- 1 of 48 --`) antes de enviar ao modelo. */
function sanitizePdfPageMarkersInContext(text: string): string {
  if (process.env.OLLAMA_NO_SANITIZE_PAGE_MARKERS === "1" || process.env.OLLAMA_NO_SANITIZE_PAGE_MARKERS === "true") {
    return text;
  }
  return text
    .replace(/\s*--\s*\d+\s+of\s+\d+\s+--\s*/gi, "\n")
    .replace(/\s*--\s*\d+\s*\/\s*\d+\s*--\s*/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Junta linhas de `documents` num único texto para o prompt (ordenando por chunk_index).
 * Opcionalmente omite chunks de conduta/integridade (só no concat, não no top-k vetorial): `OLLAMA_RAG_DOCUMENTS_CONCAT_FILTER=0` desliga.
 */
function joinDocumentRowsToContext(rows: Record<string, unknown>[], col: string): string {
  const withIndex = rows.map((r) => {
    const meta = r.metadata as Record<string, unknown> | undefined;
    const idx = typeof meta?.chunk_index === "number" ? meta.chunk_index : -1;
    return { row: r, chunkIndex: idx };
  });
  withIndex.sort((a, b) => a.chunkIndex - b.chunkIndex);
  let useIndex = withIndex;
  if (isRagDocumentsConcatInstitutionalFilterOn()) {
    const nonInst = withIndex.filter(({ row: r }) => {
      const content = r[col];
      return typeof content === "string" && content.trim().length > 0 && !ragChunkContentLooksInstitutional(content);
    });
    if (nonInst.length > 0) useIndex = nonInst;
  }
  const parts: string[] = [];
  for (const { row: r } of useIndex) {
    const content = r[col];
    if (typeof content === "string" && content.trim().length > 0) {
      const fileLabel =
        (r.file_id as string) ||
        (r.metadata as Record<string, unknown>)?.["file_id"] as string ||
        String(r.id);
      parts.push(`--- Documento ${String(fileLabel).slice(0, 8)} ---\n${content.trim()}`);
    }
  }
  if (parts.length === 0) return "";
  const maxCh = getMaxChunks();
  const limited = maxCh != null && maxCh > 0 ? parts.slice(0, maxCh) : parts;
  return limited.join("\n\n");
}

function compactChunkTextForDedup(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9áàâãéêíóôõúç\s]/gi, "")
    .trim();
}

function isMostlyDuplicateChunk(prev: string, next: string): boolean {
  const a = compactChunkTextForDedup(prev);
  const b = compactChunkTextForDedup(next);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length < 80) return false;
  // Se um chunk é quase totalmente substring do outro, costuma ser duplicata/overlap de chunking.
  if (long.includes(short)) return true;
  const head = short.slice(0, Math.min(240, short.length));
  return long.startsWith(head) && short.length / long.length >= 0.85;
}

function dedupeMatchDocumentRows(rows: MatchDocumentsRow[]): MatchDocumentsRow[] {
  // Preserva a ordem vinda do Postgres (`order by embedding <=> ...`), que já é a ordem de relevância.
  const out: MatchDocumentsRow[] = [];
  const bodies: string[] = [];
  for (const r of rows) {
    const txt = typeof r.content === "string" ? r.content.trim() : "";
    if (!txt) continue;
    let dup = false;
    for (const prev of bodies) {
      if (isMostlyDuplicateChunk(prev, txt)) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    out.push(r);
    bodies.push(txt);
  }
  return out;
}

function joinMatchedRowsToContext(rows: MatchDocumentsRow[]): string {
  /** Só dedupe: ranking já vem do pgvector — filtrar por texto aqui costuma degradar o RAG. */
  const deduped = dedupeMatchDocumentRows(rows);
  const parts: string[] = [];
  for (const r of deduped) {
    const txt = typeof r.content === "string" ? r.content.trim() : "";
    if (!txt) continue;
    const fileLabel =
      (typeof r.file_id === "string" && r.file_id.trim() ? r.file_id.trim() : "") ||
      (r.metadata && typeof r.metadata["file_id"] === "string" ? String(r.metadata["file_id"]) : "") ||
      String(r.id);
    const sim = typeof r.similarity === "number" ? r.similarity : null;
    const simLabel = sim != null ? ` sim=${sim.toFixed(3)}` : "";
    parts.push(`--- Chunk ${String(fileLabel).slice(0, 8)}${simLabel} ---\n${txt}`);
  }
  return parts.join("\n\n");
}

function getRagTopK(): number {
  return Math.max(1, parseInt(process.env.OLLAMA_RAG_TOP_K || "1", 10) || 1);
}

function getRagTopKTryList(): number[] {
  const raw = (process.env.OLLAMA_RAG_TOP_K_TRY ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(parts)].slice(0, 10);
}

/**
 * Top-k extra por retentativa quando a resposta do modelo não tem JSON aceitável para o campo
 * (`processEditalInfo` valida com `isValidJsonFormat`). Lista separada por vírgulas, ex.: `12,24,36`.
 * Vazio / `0` / `false` / `off` = desligado. Só tem efeito com RAG ligado (`OLLAMA_USE_RAG` ≠ 0).
 */
export function getRagInvalidRetryTopKList(): number[] {
  const raw = (process.env.OLLAMA_RAG_INVALID_RETRY_TOP_K ?? "").trim();
  if (!raw || raw === "0" || raw.toLowerCase() === "false" || raw.toLowerCase() === "off") return [];
  const parts = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(parts)].slice(0, 8);
}

function shouldTryMultipleTopK(field: string | undefined): boolean {
  if (isRagCragEnabled()) return false;
  const raw = (process.env.OLLAMA_RAG_TRY_MULTIPLE_TOPK ?? "").trim().toLowerCase();
  if (!raw || raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "all") return true;
  const allowed = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return field != null && allowed.includes(field.toLowerCase());
}

function getTruncationWindowMaxN(): number {
  const v = parseInt(process.env.OLLAMA_TRUNCATION_WINDOW_MAX_N || "5", 10);
  if (Number.isNaN(v)) return 5;
  return Math.max(1, Math.min(30, v));
}

let loggedOllamaHttps11434AutoFix = false;

/** Base do Ollama (sem barra final). O servidor expõe HTTP em :11434; `https://…:11434` provoca `fetch failed` no Node. */
function getOllamaBase(): string {
  let raw = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").trim().replace(/\/$/, "");
  if (/^https:/i.test(raw) && /(^|\/|:)11434(\/|$)/.test(raw)) {
    if (!loggedOllamaHttps11434AutoFix) {
      console.warn(
        "  ⚠️ Ollama: OLLAMA_BASE_URL usa https na porta 11434; o Ollama usa HTTP nessa porta. A corrigir para http:// (senão /api/embed e /api/generate falham com «fetch failed»).",
      );
      loggedOllamaHttps11434AutoFix = true;
    }
    raw = raw.replace(/^https:/i, "http:");
  }
  return raw;
}

function getEmbedModel(): string {
  // Manter alinhado com scripts/db/embed-documents.ts (default 1024d)
  return process.env.OLLAMA_EMBED_MODEL || "mxbai-embed-large:latest";
}

function getEmbedDimensions(): number | null {
  const v = process.env.EMBED_DIMENSIONS;
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function getRagQueryMaxChars(): number {
  return Math.max(100, parseInt(process.env.OLLAMA_RAG_QUERY_MAX_CHARS || "1200", 10) || 1200);
}

/**
 * Monta uma nova `ragQuery` para retentativa CRAG: mantém o foco base do campo e acrescenta
 * termos de desambiguação (por índice) + excerto curto da resposta inválida/vazia anterior.
 */
export function buildCragCorrectiveRagQuery(
  field: string,
  baseRagQuery: string,
  failedModelResponse: string,
  cragRetryIndex: number,
): string {
  const base = String(baseRagQuery || "").replace(/\s+/g, " ").trim();
  let fail = String(failedModelResponse || "").replace(/\s+/g, " ").trim();
  if (fail.length > 520) fail = fail.slice(0, 520);
  const hintsByField: Record<string, string[]> = {
    valor_projeto: [
      "dotação orçamento teto bolsa auxílio repasse R$ parcela desembolso anexo financeiro",
      "subvenção capital custeio montante faixa modalidade tabela valores contrapartida",
      "financiamento linha fomento percentual valor aprovado milhões reais",
    ],
    prazo_inscricao: [
      "inscrição submissão envio proposta cadastro sistema data limite encerramento",
      "prorrogação retificação publicação DOU dias corridos úteis horário cronograma",
      "abertura período etapas processo seletivo homologação calendário DD/MM",
    ],
    timeline_estimada: [
      "cronograma etapas fases prazos execução duração meses anos entregas marcos",
      "período vigência contrato desembolso relatórios",
    ],
    vagas: [
      "vagas quantidade bolsas beneficiários limite inscrições vagas disponíveis",
      "número de posições vagas previstas",
    ],
    localizacao: ["localização sede escopo geográfico estado município região país UF"],
    is_company: ["pessoa jurídica CNPJ PJ empresa MEI constituição participação"],
    is_researcher: ["pesquisador doutor mestrado formação acadêmica currículo titulação"],
    sobre_programa: [
      "apresentação contexto objeto da chamada linha fomento política pública justificativa",
      "objetivos específicos metas programa área temática eixo público-alvo instrumento",
      "finalidade do programa modalidade descrição da ação resumo da chamada",
    ],
    criterios_elegibilidade: [
      "quem pode concorrer requisitos habilitação documentação comprovação declaração anexos",
      "regularidade fiscal CND FGTS capacidade técnica contrapartida cofinanciamento enquadramento",
      "impedimento inelegível sanção perfil proponente coordenador instituição titulação vínculo",
    ],
    default: [
      "texto integral edital regulamento anexos normas principais",
      "condições participação documentação",
      "trechos com tabelas valores datas e requisitos explícitos",
    ],
  };
  const f = (field || "").trim().toLowerCase();
  const hints = hintsByField[f] ?? hintsByField.default!;
  const idx = Math.min(Math.max(0, cragRetryIndex), hints.length - 1);
  const hi = hints[idx]!;
  const suffix = fail.length > 12 ? ` resposta_previa_falhou: ${fail.slice(0, 280)}` : "";
  const merged = `${base} ${hi}${suffix}`.replace(/\s+/g, " ").trim();
  const max = getRagQueryMaxChars();
  return merged.length > max ? merged.slice(0, max) : merged;
}

/** Corrige typos comuns em `OLLAMA_MODEL` (ex.: qween → qwen). */
export function normalizeOllamaChatModelName(model: string): string {
  const m = String(model || "").trim();
  if (!m) return m;
  return m.replace(/^qween\b/i, "qwen");
}

/** Colunas `documents.*` que já sabemos não existir no Postgres — evita spam em `OLLAMA_DEBUG_RAG`. */
const documentsTextColumnsKnownMissing = new Set<string>();

function shortenQueryForEmbedding(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const max = getRagQueryMaxChars();
  return t.length > max ? t.slice(0, max) : t;
}

async function embedQueryWithOllama(text: string): Promise<number[] | null> {
  const raw = String(text || "");
  const t = shortenQueryForEmbedding(raw);
  if (!t) return null;
  if (process.env.OLLAMA_DEBUG_RAG === "1" && raw.trim().length > t.length) {
    console.log(`  [RAG debug] query embedding truncada: ${raw.trim().length} -> ${t.length} chars`);
  }
  const base = getOllamaBase();
  const model = getEmbedModel();
  const dimensions = getEmbedDimensions();

  // Preferir /api/embed (Ollama atual), fallback para /api/embeddings (algumas versões antigas)
  const tryEmbed = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`${res.status} ${err}`);
    }
    return res.json() as Promise<any>;
  };

  try {
    const body: { model: string; input: string; dimensions?: number } = { model, input: t };
    if (dimensions != null && dimensions > 0) body.dimensions = dimensions;
    const data = await tryEmbed(`${base}/api/embed`, body);
    const emb = (data?.embeddings?.[0] || data?.embedding) as number[] | undefined;
    return Array.isArray(emb) ? emb : null;
  } catch (e) {
    if (process.env.OLLAMA_DEBUG_RAG === "1") {
      console.warn(`  [RAG debug] /api/embed falhou; tentando /api/embeddings: ${(e as Error).message}`);
    }
    try {
      const data = await tryEmbed(`${base}/api/embeddings`, { model, prompt: t });
      const emb = (data?.embedding || data?.data?.[0]?.embedding) as number[] | undefined;
      return Array.isArray(emb) ? emb : null;
    } catch (e2) {
      console.warn(`  ⚠️ RAG: falha ao gerar embedding da pergunta no Ollama: ${(e2 as Error).message}`);
      return null;
    }
  }
}

async function fetchDocumentContextBySimilarityTopK(
  question: string,
  fileIds: string[],
  opts?: DocumentContextFetchOpts,
): Promise<RagDocumentContextResult | null> {
  const empty = (label: string): RagDocumentContextResult => ({ text: "", sourceLabel: label });
  if (!supabase) return empty("(sem supabase)");

  const embedPrimary = String((opts?.ragQuery && opts.ragQuery.trim()) || question || "").trim();
  if (!embedPrimary) return null;

  const resolvedIds = await resolveFileIdsForDocuments(fileIds);
  if (resolvedIds.length === 0) return null;

  const topK = Math.max(1, opts?.topKOverride ?? getRagTopK());

  const runVectorMatchForQuery = async (q: string): Promise<MatchDocumentsRow[]> => {
    const queryEmbedding = await embedQueryWithOllama(q);
    if (!queryEmbedding) return [];
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: queryEmbedding,
      match_count: topK,
      filter_file_ids: resolvedIds,
      filter_edital_id: opts?.editalId || null,
    });
    if (error) {
      if (process.env.OLLAMA_DEBUG_RAG === "1") {
        console.warn(`  [RAG debug] rpc match_documents falhou: ${error.message}`);
      }
      return [];
    }
    return (data || []) as MatchDocumentsRow[];
  };

  const merged = await runVectorMatchForQuery(embedPrimary);
  if (merged.length === 0) {
    if (process.env.OLLAMA_LOG_RAG_DIAG !== "0") {
      console.warn(
        "  📋 RAG pgvector: `match_documents` devolveu 0 linhas (embed falhou, RPC ausente/erro, sem chunks para estes file_id, ou dimensão do vector ≠ tabela). Verifique `documents` + populate e OLLAMA_DEBUG_RAG=1.",
      );
    }
    return null;
  }

  const rows = merged.slice(0, topK);
  const ctx = joinMatchedRowsToContext(rows);
  if (!ctx.trim()) {
    if (process.env.OLLAMA_LOG_RAG_DIAG !== "0") {
      console.warn(
        "  📋 RAG pgvector: `match_documents` devolveu linhas mas o texto concatenado ficou vazio após dedupe — verifique `documents.content`.",
      );
    }
    return null;
  }

  const crag = isRagCragEnabled();
  const labelBase = crag
    ? `documents.content (pgvector CRAG top-k=${topK})`
    : `documents.content (pgvector top-k=${topK})`;
  const label = labelBase;
  return { text: ctx, sourceLabel: label };
}

/**
 * Resolve IDs para consultar `documents.file_id`.
 * Inclui SEMPRE, por linha de edital_pdfs, tanto `id` (UUID da linha) quanto `file_id` (storage),
 * porque o populate pode ter gravado documents com um ou outro — se só buscarmos o storage UUID
 * e os chunks estiverem com o id do edital_pdf, o RAG fica vazio.
 */
async function resolveFileIdsForDocuments(fileIds: string[]): Promise<string[]> {
  if (!supabase || fileIds.length === 0) return fileIds;
  const trimmed = fileIds.map((id) => id.trim()).filter(Boolean);
  const docFileIds = new Set<string>(trimmed);

  const { data: byId } = await supabase.from("edital_pdfs").select("id, file_id").in("id", trimmed);
  const { data: byFileId } = await supabase.from("edital_pdfs").select("id, file_id").in("file_id", trimmed);

  const addRow = (r: { id: string; file_id?: string | null }) => {
    docFileIds.add(String(r.id));
    if (r.file_id && String(r.file_id).trim()) docFileIds.add(String(r.file_id).trim());
  };
  for (const p of byId || []) addRow(p as { id: string; file_id?: string | null });
  for (const p of byFileId || []) addRow(p as { id: string; file_id?: string | null });

  return [...docFileIds];
}

/** 1ª fase: só UUIDs — leve; com índice em file_id evita scan completo. */
async function listDocumentIdsByFileIdIn(
  client: SupabaseClient,
  resolvedIds: string[],
  maxIds: number,
): Promise<{ ids: string[]; error: { message: string } | null }> {
  const { data, error } = await client
    .from("documents")
    .select("id")
    .in("file_id", resolvedIds)
    .order("id", { ascending: true })
    .limit(maxIds);
  if (error) return { ids: [], error };
  const rows = (data ?? []) as unknown as Array<{ id: string }>;
  return { ids: rows.map((r) => String(r.id)), error: null };
}

async function listDocumentIdsByMetadataFileIdOr(
  client: SupabaseClient,
  resolvedIds: string[],
  maxIds: number,
): Promise<{ ids: string[]; error: { message: string } | null }> {
  if (resolvedIds.length === 0) return { ids: [], error: null };
  const orFilter = resolvedIds.map((id) => `metadata->>file_id.eq.${id}`).join(",");
  const { data, error } = await client
    .from("documents")
    .select("id")
    .or(orFilter)
    .order("id", { ascending: true })
    .limit(maxIds);
  if (error) return { ids: [], error };
  const rows = (data ?? []) as unknown as Array<{ id: string }>;
  return { ids: rows.map((r) => String(r.id)), error: null };
}

async function listDocumentIdsByEditalId(
  client: SupabaseClient,
  editalId: string,
  maxIds: number,
): Promise<{ ids: string[]; error: { message: string } | null }> {
  const { data, error } = await client
    .from("documents")
    .select("id")
    .eq("metadata->>edital_id", editalId)
    .order("id", { ascending: true })
    .limit(maxIds);
  if (error) return { ids: [], error };
  const rows = (data ?? []) as unknown as Array<{ id: string }>;
  return { ids: rows.map((r) => String(r.id)), error: null };
}

/** 2ª fase: traz coluna de texto em lotes (evita timeout num único SELECT com milhares de `content`). */
async function fetchDocumentRowsByIdsBatched(
  client: SupabaseClient,
  ids: string[],
  col: string,
): Promise<{ rows: Record<string, unknown>[]; error: { message: string } | null }> {
  const selectCols = "id, file_id, metadata, " + col;
  const batchSize = Math.max(5, parseInt(process.env.OLLAMA_RAG_CONTENT_BATCH_SIZE || "30", 10) || 30);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const { data, error } = await client.from("documents").select(selectCols).in("id", slice);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return { rows, error: null };
}

function logRagTimeoutHint(msg: string): void {
  const m = msg.toLowerCase();
  if (m.includes("timeout") || m.includes("canceling statement")) {
    console.warn(
      "  💡 RAG: timeout no Postgres ao ler `documents`. Rode no Supabase: scripts/db/migration-documents-index-file-id.sql (índice em file_id).",
    );
  }
}

/**
 * Busca conteúdo na tabela `documents` (RAG). Usa 2 fases: listar só `id`, depois buscar `content` (etc.) em lotes.
 */
async function fetchDocumentContextByFileIds(
  question: string,
  fileIds: string[],
  opts?: DocumentContextFetchOpts,
): Promise<RagDocumentContextResult> {
  const empty = (label: string): RagDocumentContextResult => ({ text: "", sourceLabel: label });

  if (!supabase || fileIds.length === 0) return empty("(sem supabase ou file ids)");

  // RAG “de verdade” (top-k por similaridade) — parecido com LlamaIndex similarity_top_k.
  // Se a RPC não existir/der erro, cai no modo antigo (concat por file_id).
  const mode = (process.env.OLLAMA_RAG_MODE || "topk").toLowerCase().trim();
  if (mode !== "concat") {
    const hit = await fetchDocumentContextBySimilarityTopK(question, fileIds, opts).catch(() => null);
    if (hit && hit.text.trim().length > 0) return hit;
    await logRagDocumentsAndVectorHint(fileIds, opts, "pgvector_ou_join_sem_texto");
  } else {
    console.warn(
      "  📋 RAG: `OLLAMA_RAG_MODE=concat` — a saltar `match_documents`; segue concatenação de linhas em `documents` por file_id.",
    );
  }

  const resolvedIds = await resolveFileIdsForDocuments(fileIds);
  if (resolvedIds.length === 0) return empty("(nenhum id resolvido em edital_pdfs)");

  if (process.env.OLLAMA_DEBUG_RAG === "1") {
    const sample = resolvedIds.slice(0, 10);
    console.log(
      `  [RAG debug] resolvedIds count=${resolvedIds.length} sample=${sample.map((x) => String(x)).join(", ")}`,
    );
  }

  const contentOnly =
    process.env.OLLAMA_RAG_CONTENT_ONLY === "1" || process.env.OLLAMA_RAG_CONTENT_ONLY === "true";
  const includeNameColumn =
    process.env.OLLAMA_RAG_INCLUDE_NAME_COLUMN === "1" || process.env.OLLAMA_RAG_INCLUDE_NAME_COLUMN === "true";
  const contentColumns = contentOnly
    ? ["content"]
    : [
        "content",
        "data",
        "value",
        "text",
        "body",
        "page_content",
        "chunk",
        ...(includeNameColumn ? ["name"] : []),
      ];
  const ragSelectLimit = Math.max(100, parseInt(process.env.OLLAMA_RAG_DOCUMENTS_LIMIT || "2000", 10) || 2000);

  const tryColumnWithIds = async (
    col: string,
    candidateIds: string[],
    sourceHint: string,
  ): Promise<RagDocumentContextResult | null> => {
    if (candidateIds.length === 0) return null;
    if (documentsTextColumnsKnownMissing.has(col)) return null;
    const { rows, error } = await fetchDocumentRowsByIdsBatched(supabase, candidateIds, col);
    if (error) {
      const em = String(error.message || "").toLowerCase();
      const missingCol =
        em.includes("does not exist") || em.includes("undefined column") || (em.includes("column ") && em.includes("not exist"));
      if (missingCol) {
        const firstTime = !documentsTextColumnsKnownMissing.has(col);
        documentsTextColumnsKnownMissing.add(col);
        if (process.env.OLLAMA_DEBUG_RAG === "1" && firstTime) {
          console.log(`  [RAG debug] coluna documents.${col} não existe no schema — omitindo nas próximas buscas (neste processo).`);
        }
        return null;
      }
      if (process.env.OLLAMA_DEBUG_RAG === "1") {
        console.warn(`  [RAG debug] lote coluna "${col}": ${error.message}`);
        logRagTimeoutHint(error.message);
      }
      return null;
    }
    const joined = joinDocumentRowsToContext(rows, col);
    if (joined.length > 0) {
      if (process.env.OLLAMA_DEBUG_RAG === "1") {
        console.log(
          `  [RAG debug] col=${col} ids=${candidateIds.length} rows=${rows.length} joinedChars=${joined.length} (${sourceHint})`,
        );
      }
      return {
        text: joined,
        sourceLabel: `documents.${col} (${sourceHint})`,
      };
    }
    if (process.env.OLLAMA_DEBUG_RAG === "1" && rows.length > 0) {
      console.log(`  [RAG debug] col=${col} ${rows.length} linha(s) mas texto vazio em "${col}"`);
    }
    return null;
  };

  const idByFile = await listDocumentIdsByFileIdIn(supabase, resolvedIds, ragSelectLimit);
  if (idByFile.error && process.env.OLLAMA_DEBUG_RAG === "1") {
    console.warn(`  [RAG debug] listagem id por file_id: ${idByFile.error.message}`);
    logRagTimeoutHint(idByFile.error.message);
  }

  let candidateIds = idByFile.ids;
  if (candidateIds.length === 0) {
    const idByMeta = await listDocumentIdsByMetadataFileIdOr(supabase, resolvedIds, ragSelectLimit);
    candidateIds = idByMeta.ids;
    if (idByMeta.error && process.env.OLLAMA_DEBUG_RAG === "1") {
      console.warn(`  [RAG debug] listagem id por metadata.file_id: ${idByMeta.error.message}`);
      logRagTimeoutHint(idByMeta.error.message);
    }
  }

  const uniqueIds = [...new Set(candidateIds)];

  for (const col of contentColumns) {
    const hit = await tryColumnWithIds(col, uniqueIds, "file_id ou metadata.file_id → ids → coluna em lotes");
    if (hit) return hit;
  }

  if (opts?.editalId) {
    const { ids: editalIds, error: eErr } = await listDocumentIdsByEditalId(
      supabase,
      opts.editalId,
      ragSelectLimit,
    );
    if (eErr && process.env.OLLAMA_DEBUG_RAG === "1") {
      console.warn(`  [RAG debug] listagem id por edital_id: ${eErr.message}`);
      logRagTimeoutHint(eErr.message);
    }
    const editalUnique = [...new Set(editalIds)];
    if (editalUnique.length > 0) {
      for (const col of contentColumns) {
        const hit = await tryColumnWithIds(col, editalUnique, "metadata.edital_id → ids → coluna em lotes");
        if (hit) {
          console.log(
            `  📑 Ollama RAG: ${hit.sourceLabel} (${editalUnique.length} id(s) por edital)`,
          );
          return hit;
        }
      }
    }
  }

  if (process.env.OLLAMA_DEBUG_RAG === "1") {
    const byCol = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .in("file_id", resolvedIds);
    let count = byCol.count ?? 0;
    if (byCol.error != null) {
      const orFilter = resolvedIds.map((id) => `metadata->>file_id.eq.${id}`).join(",");
      const byMeta = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .or(orFilter);
      count = byMeta.count ?? 0;
    }
    console.warn(
      `  [RAG debug] resolvedIds (${resolvedIds.length}): ${resolvedIds.slice(0, 2).map((x) => x.slice(0, 8)).join(", ")}...; documentos (count): ${count}`,
    );
    if (uniqueIds.length === 0) {
      console.warn(
        "  [RAG debug] Nenhum id de document encontrado para estes file_ids — a coluna content existe, mas não há linhas que correspondam (ou falhou a listagem por timeout).",
      );
    }
  }

  await logRagDocumentsAndVectorHint(fileIds, opts, "documents_sem_coluna_util");
  return empty("(nenhuma coluna com texto útil em documents)");
}

async function fetchPdfBuffer(fileId: string): Promise<Buffer | null> {
  if (!supabase) return null;
  const ref = String(fileId || "").trim();
  if (!ref) return null;

  let storagePath = ref;
  if (!ref.includes("/")) {
    // O ref pode ser:
    // - edital_pdfs.id (UUID da linha)
    // - edital_pdfs.file_id (UUID do storage object)
    // - caminho_storage (já tem "/")
    const { data: byId } = await supabase
      .from("edital_pdfs")
      .select("caminho_storage")
      .eq("id", ref)
      .maybeSingle();
    const { data: byFileId } = byId?.caminho_storage
      ? { data: null }
      : await supabase
          .from("edital_pdfs")
          .select("caminho_storage")
          .eq("file_id", ref)
          .maybeSingle();
    const caminho = byId?.caminho_storage || byFileId?.caminho_storage;
    if (caminho) storagePath = caminho;
  }

  const { data: fileData, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (error || !fileData) return null;
  const arrayBuffer = await fileData.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return (result?.text || "").trim().replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

/** `OLLAMA_LOG_RAG_DIAG=0` desliga contagens no log ao falhar RAG. */
async function logRagDocumentsAndVectorHint(
  fileIds: string[],
  opts: DocumentContextFetchOpts | undefined,
  reason: string,
): Promise<void> {
  if (process.env.OLLAMA_LOG_RAG_DIAG === "0" || !supabase) return;
  const resolved = await resolveFileIdsForDocuments(fileIds).catch(() => fileIds);
  const slice = resolved.length > 60 ? resolved.slice(0, 60) : resolved;
  const { count, error } = await supabase.from("documents").select("id", { count: "exact", head: true }).in("file_id", slice);
  const n = error ? null : (count ?? 0);
  console.warn(
    `  📋 RAG diagnóstico [${reason}] edital_id=${opts?.editalId ?? "—"} resolved_uuids=${resolved.length} ` +
      `documents(file_id∈amostra)=${n ?? "?"}${error ? ` err=${String(error.message).slice(0, 100)}` : ""}. ` +
      "Populate? RPC match_documents? Índice file_id? OLLAMA_DEBUG_RAG=1",
  );
}

/**
 * Ordena PDFs do fallback por relevância ao **edital da chamada** (palavras-chave no texto extraído),
 * depois de uma pré-ordenação opcional por `nome_arquivo`. Assim a janela truncada não fica presa ao Código de Conduta.
 */
function pdfExtractedTextEditalRelevanceScore(raw: string): number {
  if (ragChunkContentLooksInstitutional(raw)) return -100;
  const h = String(raw || "")
    .slice(0, 6000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let s = 0;
  if (h.includes("chamada publica") || h.includes("chamada public")) s += 14;
  if (h.includes("r$")) s += 10;
  if (h.includes("orcamento") || h.includes("oramento")) s += 7;
  if (h.includes("valor mensal") || h.includes(" bolsa ") || h.includes("bolsa ")) s += 6;
  if (h.includes("submissao") || h.includes("inscricao") || h.includes("periodo de")) s += 5;
  if (/\bedital\b/.test(h)) s += 4;
  if (h.includes("financiamento") || h.includes("repasse") || h.includes("teto")) s += 4;
  if (h.includes("cronograma")) s += 3;
  if (h.includes("codigo de conduta")) s -= 12;
  return s;
}

async function buildPdfFallbackContextSections(fileIds: string[]): Promise<string[]> {
  const fallbackIdsRaw = await resolveFileIdsForDocuments(fileIds).catch(() => fileIds);
  const nameOrdered = isPdfContextSortHeuristicOn()
    ? await sortResolvedStorageIdsForEditalContext(fallbackIdsRaw)
    : fallbackIdsRaw;
  const entries: { id: string; text: string; score: number }[] = [];
  for (const fileId of nameOrdered) {
    const buffer = await fetchPdfBuffer(fileId);
    if (!buffer) {
      console.warn(`  ⚠️ Fallback PDF: não foi possível baixar ${String(fileId).slice(0, 8)}…`);
      continue;
    }
    const text = await extractTextFromPdf(buffer);
    if (text.length === 0) continue;
    entries.push({ id: fileId, text, score: pdfExtractedTextEditalRelevanceScore(text) });
  }
  if (entries.length === 0) return [];
  if (entries.length >= 2) {
    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.text.length - a.text.length;
    });
    console.warn(
      `  📋 Fallback PDF: ordem final por relevância ao edital: ${entries.map((e) => `${String(e.id).slice(0, 8)}(score=${e.score})`).join(" → ")}`,
    );
  }
  return entries.map((e) => `--- Documento ${String(e.id).slice(0, 8)} ---\n${e.text}`);
}

function stripMarkdownCodeFences(text: string): string {
  let t = String(text || "").trim();
  // Remove ```json ... ``` wrappers commonly returned by chatty models.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const m = t.match(fence);
  if (m?.[1]) t = m[1].trim();
  return t;
}

/** Uma chamada não-stream a `/api/generate` (extração). */
async function callOllamaGenerateRaw(
  baseUrl: string,
  model: string,
  promptStr: string,
  timeoutMs: number,
  ollamaNumOpts: Record<string, number>,
): Promise<{ ok: boolean; status: number; json?: unknown; text: string; errText?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const body: { model: string; prompt: string; stream: boolean; options?: Record<string, number> } = {
    model,
    prompt: promptStr,
    stream: false,
    options: ollamaNumOpts,
  };
  try {
    let res: Response;
    const undici = (await import("undici").catch(() => null)) as {
      fetch: typeof fetch;
      Agent: new (opts?: { headersTimeout?: number; bodyTimeout?: number }) => unknown;
    } | null;
    if (undici?.Agent) {
      const dispatcher = new undici.Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
      res = await undici.fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        dispatcher,
      } as RequestInit & { dispatcher: unknown });
    } else {
      res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    }
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, status: res.status, text: "", errText };
    }
    const json = (await res.json()) as { response?: string };
    const text = stripMarkdownCodeFences(String(json?.response || ""));
    return { ok: true, status: res.status, json, text };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, text: "", errText: (err as Error).message };
  }
}

/** Temperatura do `/api/generate` na extração de campos (editais). Default 0 (equivalente a `ollama run … --temperature 0`). */
function getOllamaExtractionTemperature(): number {
  const raw = process.env.OLLAMA_TEMPERATURE?.trim();
  if (raw === undefined || raw === "") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(2, n));
}

function getGenerationEnsembleN(): number {
  const v = process.env.OLLAMA_GENERATION_ENSEMBLE_N;
  if (v == null || String(v).trim() === "") return 0;
  const n = parseInt(String(v), 10);
  if (Number.isNaN(n) || n < 2) return 0;
  return Math.min(10, n);
}

function isGenerationEnsembleAuto(): boolean {
  const v = (process.env.OLLAMA_GENERATION_ENSEMBLE_AUTO ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on" || v === "auto";
}

function getGenerationEnsembleMaxN(): number {
  const v = parseInt(process.env.OLLAMA_GENERATION_ENSEMBLE_MAX_N || "30", 10);
  if (Number.isNaN(v)) return 30;
  return Math.min(60, Math.max(2, v));
}

function getGenerationEnsembleOverlapRatio(): number {
  const raw = parseFloat(process.env.OLLAMA_GENERATION_ENSEMBLE_OVERLAP || "0.18");
  if (!Number.isFinite(raw)) return 0.18;
  return Math.max(0, Math.min(0.6, raw));
}

function computeAutoEnsembleN(fullTextChars: number, maxContextChars: number): number {
  const window = Math.min(maxContextChars, Math.max(2000, Math.floor(maxContextChars * 0.92)));
  if (fullTextChars <= window) return 1;
  const overlap = getGenerationEnsembleOverlapRatio();
  const step = Math.max(500, Math.floor(window * (1 - overlap)));
  const n = Math.ceil((fullTextChars - window) / step) + 1;
  return Math.max(2, Math.min(getGenerationEnsembleMaxN(), n));
}

function getDebugContextPreviewChars(): number {
  return Math.max(200, parseInt(process.env.UPDATE_EDITAL_DEBUG_CONTENT_CHARS || "1500", 10) || 1500);
}

function useFullContextForEnsemble(): boolean {
  const v = (process.env.OLLAMA_GENERATION_ENSEMBLE_USE_FULL_CONTEXT ?? "").trim().toLowerCase();
  // `AUTO` implica varrer o documento inteiro.
  if (isGenerationEnsembleAuto()) return true;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Máximo de caracteres a avançar/recuar ao alinhar início/fim de janela (invalid-retry-shift, truncagem). */
const CONTEXT_BOUNDARY_SCAN = 400;

function isAlphanumWordChar(ch: string): boolean {
  return ch.length === 1 && /[A-Za-zÀ-ÿ0-9]/.test(ch);
}

/** Índice `j` é início “seguro” de fatia se não continua uma palavra a partir de `j-1`. */
function isSafeSliceStartIndex(t: string, j: number): boolean {
  if (j <= 0 || j >= t.length) return true;
  return !(isAlphanumWordChar(t[j - 1]!) && isAlphanumWordChar(t[j]!));
}

/** A partir de `rawStart`, avança até ao próximo limite preferencial (parágrafo, linha, espaço) ou fim do teto. */
function snapSliceStartForward(t: string, rawStart: number, maxAdvance = CONTEXT_BOUNDARY_SCAN): number {
  const n = t.length;
  if (n === 0) return 0;
  let s = Math.max(0, Math.min(rawStart | 0, n - 1));
  if (s === 0) return 0;
  if (isSafeSliceStartIndex(t, s)) return s;
  const cap = Math.min(n, s + maxAdvance);
  const seg = t.slice(s, cap);
  const pp = seg.indexOf("\n\n");
  if (pp !== -1) return s + pp + 2;
  const nl = seg.indexOf("\n");
  if (nl !== -1) return s + nl + 1;
  for (let i = 1; i < seg.length; i++) {
    if (/\s/.test(seg[i]!)) return s + i + 1;
  }
  for (let j = s + 1; j < cap; j++) {
    if (/\s/.test(t[j]!)) return j + 1;
    if (isSafeSliceStartIndex(t, j)) return j;
  }
  return s;
}

/** Recua a partir de `anchor` (inclusivo) até um início seguro, para caber numa janela fixa. */
function snapSliceStartBackward(t: string, anchor: number, maxBack = CONTEXT_BOUNDARY_SCAN): number {
  const n = t.length;
  const a = Math.max(0, Math.min(anchor | 0, n));
  const lo = Math.max(0, a - maxBack);
  for (let j = a; j >= lo; j--) {
    if (isSafeSliceStartIndex(t, j)) return j;
  }
  return lo;
}

/** Fim exclusivo `e`: texto visível `t.slice(0,e)` não deve terminar com sílaba ligada a `t[e]` (meio de palavra). */
function isSafeSliceEndExclusive(t: string, e: number): boolean {
  const n = t.length;
  if (e <= 0 || e >= n) return true;
  return !(isAlphanumWordChar(t[e - 1]!) && isAlphanumWordChar(t[e]!));
}

/** Recua `rawEndExclusive` até um fim exclusivo seguro (até `maxBack` chars). */
function snapSliceEndExclusiveBackward(t: string, rawEndExclusive: number, maxBack = CONTEXT_BOUNDARY_SCAN): number {
  const n = t.length;
  const e0 = Math.max(0, Math.min(rawEndExclusive | 0, n));
  const lo = Math.max(0, e0 - maxBack);
  for (let e = e0; e >= lo; e--) {
    if (isSafeSliceEndExclusive(t, e)) return e;
  }
  return e0;
}

function snapStartToFitWindow(t: string, preferred: number, windowLen: number): number {
  const n = t.length;
  const span = Math.max(0, n - windowLen);
  let s = Math.min(Math.max(0, preferred | 0), span);
  s = snapSliceStartForward(t, s, CONTEXT_BOUNDARY_SCAN);
  if (s > span) s = snapSliceStartBackward(t, span, CONTEXT_BOUNDARY_SCAN);
  return Math.min(Math.max(0, s), span);
}

/** Início uniformemente aleatório em [0, span] (cada retentativa vê outro troço do corpus completo). */
function randomInvalidRetrySliceStart(span: number): number {
  if (span <= 0) return 0;
  return randomInt(0, span + 1);
}

function truncateContextForModel(ctx: string, maxChars: number): string {
  const c = String(ctx || "").replace(/\r\n/g, "\n").trim();
  if (!c) return "";
  if (c.length <= maxChars) return c;
  let end = Math.min(c.length, maxChars);
  const aligned = snapSliceEndExclusiveBackward(c, end, CONTEXT_BOUNDARY_SCAN);
  const floor = Math.max(1, maxChars - CONTEXT_BOUNDARY_SCAN);
  end = aligned < floor ? Math.min(c.length, maxChars) : aligned;
  return c.slice(0, end) + "\n\n[... texto truncado ...]";
}

/** Parte o contexto RAG nas unidades `--- Chunk …` / `--- Documento …` (como montado por `joinMatchedRowsToContext`). */
function splitContextIntoRagBlocks(fullContext: string): string[] {
  const t = String(fullContext || "").replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (!/\n---/.test(t) && !t.startsWith("---")) return [t];
  const splitOk = (re: RegExp): string[] =>
    t
      .split(re)
      .map((p) => p.trim())
      .filter(Boolean);
  let parts = splitOk(/\n\n(?=--- )/);
  if (parts.length > 1) return parts;
  parts = splitOk(/\n(?=---\s+(?:Documento|Chunk)\b)/);
  if (parts.length > 1) return parts;
  parts = splitOk(/(?<=.)(?=---\s+(?:Documento|Chunk)\b)/);
  return parts.length > 0 ? parts : [t];
}

/** Parte blocos em N grupos contíguos com tamanho total parecido (cada request vê um “pedaço” diferente do edital). */
function partitionBlocksForEnsemble(blocks: string[], n: number): string[][] {
  const nn = Math.max(1, Math.min(10, n));
  if (nn === 1 || blocks.length === 0) return [blocks];
  const total = blocks.reduce((s, b) => s + b.length, 0);
  const target = total / nn;
  const groups: string[][] = Array.from({ length: nn }, () => []);
  let gi = 0;
  let acc = 0;
  for (const b of blocks) {
    while (gi < nn - 1 && groups[gi].length > 0 && acc + b.length > target * 1.2) {
      gi++;
      acc = 0;
    }
    groups[gi].push(b);
    acc += b.length;
  }
  return groups.filter((g) => g.length > 0);
}

function stridePartitionBlocks(blocks: string[], n: number): string[][] {
  const nn = Math.max(1, Math.min(10, n));
  const groups: string[][] = Array.from({ length: nn }, () => []);
  blocks.forEach((b, i) => groups[i % nn].push(b));
  return groups.filter((g) => g.length > 0);
}

/** Ligado por defeito: nas retentativas `invalidRetry*`, outra janela aleatória sobre o corpus completo (não só subir top_k). `0`/`false`/`off` desliga. */
function isInvalidRetryContextDiversifyEnabled(): boolean {
  const raw = (process.env.OLLAMA_RAG_INVALID_RETRY_CONTENT_SHIFT ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

/** Retentativa por JSON inválido: combina `invalidRetryTopK` + `invalidRetryContentVariant` + env de janela aleatória. */
function shouldApplyInvalidRetryContentDiversify(opts?: {
  invalidRetryTopK?: number;
  invalidRetryContentVariant?: number;
}): boolean {
  const divBase = opts?.invalidRetryContentVariant ?? 0;
  return (
    divBase > 0 &&
    isInvalidRetryContextDiversifyEnabled() &&
    opts?.invalidRetryTopK != null &&
    Number.isFinite(opts.invalidRetryTopK) &&
    opts.invalidRetryTopK > 0
  );
}

/**
 * Com o texto completo a caber em `maxChars`, aplica **sub-janela** aleatória (tamanho e início variáveis) para
 * mostrar troços bem diferentes entre retentativas.
 */
function applyInvalidRetrySlidingWindow(body: string, maxC: number): string {
  const u = String(body || "").replace(/\r\n/g, "\n").trim();
  const n = u.length;
  if (n === 0) return "";
  const cap = Math.max(400, maxC);
  const minWin = Math.min(cap, Math.max(1600, Math.floor(cap * 0.26)));
  const winHi = Math.min(
    cap,
    Math.max(minWin + 400, Math.min(Math.floor(n * 0.82), Math.floor(cap * (0.48 + randomInt(0, 36) / 100)))),
  );
  let win = minWin >= winHi ? minWin : randomInt(minWin, winHi + 1);
  win = Math.min(win, n);
  if (win >= n) return truncateContextForModel(u, cap);
  const span = Math.max(0, n - win);
  const rawStart = randomInvalidRetrySliceStart(span);
  let start = snapStartToFitWindow(u, rawStart, win);
  let endEx = Math.min(n, start + win);
  endEx = snapSliceEndExclusiveBackward(u, endEx, CONTEXT_BOUNDARY_SCAN);
  const minSpan = Math.min(1400, Math.floor(win * 0.36));
  if (endEx - start < minSpan) endEx = Math.min(n, start + win);
  return truncateContextForModel(u.slice(start, endEx), cap);
}

/** Corpus curto nas retentativas: uma janela aleatória sobre o texto inteiro (alinhada a quebras). */
function diversifyShortContextForInvalidRetryOnce(t: string, maxC: number): string {
  const t0 = String(t || "").replace(/\r\n/g, "\n").trim();
  if (!t0) return "";
  return applyInvalidRetrySlidingWindow(t0, maxC);
}

/** Retentativas: corpus = texto completo concatenado (PDF/RAG) quando existir — não o recorte lexical sozinho. */
function pickCorpusForInvalidRetryDiversify(bodySlice: string, fullCorpus: string): string {
  const f = String(fullCorpus || "").trim();
  if (f.length > 0) return f;
  return String(bodySlice || "").trim();
}

/** FNV-1a 32-bit em hex (trecho do texto) — comparação de diversidade entre prompts. */
function fnv1a32Hex(s: string, maxChars = 6000): string {
  let h = 2166136261 >>> 0;
  const n = Math.min(s.length, maxChars);
  for (let i = 0; i < n; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function fnv1a32(s: string, maxChars = 12000): number {
  let h = 2166136261 >>> 0;
  const n = Math.min(s.length, maxChars);
  for (let i = 0; i < n; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/** PRNG simples e determinístico para evitar aleatoriedade entre execuções. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededInt(rand: () => number, lo: number, hiExclusive: number): number {
  const loN = Math.floor(lo);
  const hiN = Math.floor(hiExclusive);
  if (hiN <= loN) return loN;
  const span = hiN - loN;
  return loN + Math.floor(rand() * span);
}

/** Chave mais estrita que `contextBodyStructuralTag` (início + fim + meio) para não aceitar prompts quase iguais. */
function contextInvalidRetryDiversityKey(body: string): string {
  const b = String(body || "");
  if (!b) return "0";
  const tag = contextBodyStructuralTag(b);
  const head = b.slice(0, 3800);
  const tail = b.slice(Math.max(0, b.length - 3800));
  const mid0 = Math.max(0, Math.floor(b.length / 2) - 1400);
  const mid = b.slice(mid0, mid0 + 2800);
  return `${tag}|h${fnv1a32Hex(head)}|t${fnv1a32Hex(tail)}|m${fnv1a32Hex(mid)}`;
}

/**
 * Com vários `--- Documento` / `--- Chunk`, altera o que entra na janela: só um PDF, ordem invertida, dois blocos
 * aleatórios, ou o texto completo — para as retentativas não ficarem quase sempre a mesma secção repetida.
 */
function reshapeCorpusForInvalidRetryMultiDoc(corpus: string): string {
  const u = String(corpus || "").replace(/\r\n/g, "\n").trim();
  if (!u) return "";
  const blocks = splitContextIntoRagBlocks(u);
  if (blocks.length < 2) return u;
  const roll = randomInt(0, 100);
  if (roll < 34) {
    return blocks[randomInt(0, blocks.length)]!;
  }
  if (roll < 54) {
    return [...blocks].reverse().join("\n\n\n");
  }
  if (roll < 76) {
    let i = randomInt(0, blocks.length);
    let j = randomInt(0, blocks.length);
    for (let guard = 0; guard < 8 && blocks.length >= 2 && i === j; guard++) j = randomInt(0, blocks.length);
    return `${blocks[i]}\n\n\n${blocks[j]}`;
  }
  return u;
}

function reshapeCorpusForInvalidRetryMultiDocDeterministic(corpus: string, seedKey: string): string {
  const u = String(corpus || "").replace(/\r\n/g, "\n").trim();
  if (!u) return "";
  const blocks = splitContextIntoRagBlocks(u);
  if (blocks.length < 2) return u;
  const rand = mulberry32(fnv1a32(seedKey));
  const roll = seededInt(rand, 0, 100);
  if (roll < 34) {
    return blocks[seededInt(rand, 0, blocks.length)]!;
  }
  if (roll < 54) {
    return [...blocks].reverse().join("\n\n\n");
  }
  if (roll < 76) {
    let i = seededInt(rand, 0, blocks.length);
    let j = seededInt(rand, 0, blocks.length);
    for (let guard = 0; guard < 8 && blocks.length >= 2 && i === j; guard++) j = seededInt(rand, 0, blocks.length);
    return `${blocks[i]}\n\n\n${blocks[j]}`;
  }
  return u;
}

function diversifyContextSliceForInvalidRetryOnce(fullText: string, maxChars: number): string {
  const reshaped = reshapeCorpusForInvalidRetryMultiDoc(fullText);
  const t0 = String(reshaped || "").replace(/\r\n/g, "\n").trim();
  if (!t0) return "";
  const maxC = Math.max(400, maxChars);
  const n = t0.length;

  if (n <= maxC) {
    return diversifyShortContextForInvalidRetryOnce(t0, maxC);
  }

  const winLo = Math.max(2200, Math.floor(maxC * 0.48));
  const winLen = Math.min(maxC, Math.max(winLo, randomInt(winLo, maxC + 1)));
  const span = Math.max(0, n - winLen);
  const rawStart = randomInvalidRetrySliceStart(span);

  let start = snapStartToFitWindow(t0, rawStart, winLen);
  let endEx = Math.min(n, start + winLen);
  endEx = snapSliceEndExclusiveBackward(t0, endEx, CONTEXT_BOUNDARY_SCAN);
  const minSpan = Math.min(600, Math.floor(winLen * 0.4));
  if (endEx - start < minSpan) {
    endEx = Math.min(n, start + winLen);
  }
  return truncateContextForModel(t0.slice(start, endEx), maxC);
}

function diversifyContextSliceForInvalidRetryOnceDeterministic(
  fullText: string,
  maxChars: number,
  seedKey: string,
): string {
  const reshaped = reshapeCorpusForInvalidRetryMultiDocDeterministic(fullText, `${seedKey}|reshape`);
  const t0 = String(reshaped || "").replace(/\r\n/g, "\n").trim();
  if (!t0) return "";
  const maxC = Math.max(400, maxChars);
  const n = t0.length;
  const rand = mulberry32(fnv1a32(`${seedKey}|slice|n=${n}|c=${maxC}`));

  if (n <= maxC) {
    // Corpo curto: ainda recortar, mas determinístico.
    const winLo = Math.min(maxC, Math.max(1600, Math.floor(maxC * 0.26)));
    const winHi = Math.min(
      maxC,
      Math.max(winLo + 400, Math.min(Math.floor(n * 0.82), Math.floor(maxC * (0.48 + seededInt(rand, 0, 36) / 100)))),
    );
    let win = winLo >= winHi ? winLo : seededInt(rand, winLo, winHi + 1);
    win = Math.min(win, n);
    if (win >= n) return truncateContextForModel(t0, maxC);
    const span = Math.max(0, n - win);
    const rawStart = seededInt(rand, 0, span + 1);
    let start = snapStartToFitWindow(t0, rawStart, win);
    let endEx = Math.min(n, start + win);
    endEx = snapSliceEndExclusiveBackward(t0, endEx, CONTEXT_BOUNDARY_SCAN);
    const minSpan = Math.min(1400, Math.floor(win * 0.36));
    if (endEx - start < minSpan) endEx = Math.min(n, start + win);
    return truncateContextForModel(t0.slice(start, endEx), maxC);
  }

  const winLo = Math.max(2200, Math.floor(maxC * 0.48));
  const winLen = Math.min(maxC, Math.max(winLo, seededInt(rand, winLo, maxC + 1)));
  const span = Math.max(0, n - winLen);
  const rawStart = seededInt(rand, 0, span + 1);

  let start = snapStartToFitWindow(t0, rawStart, winLen);
  let endEx = Math.min(n, start + winLen);
  endEx = snapSliceEndExclusiveBackward(t0, endEx, CONTEXT_BOUNDARY_SCAN);
  const minSpan = Math.min(600, Math.floor(winLen * 0.4));
  if (endEx - start < minSpan) {
    endEx = Math.min(n, start + winLen);
  }
  return truncateContextForModel(t0.slice(start, endEx), maxC);
}

const MAX_INVALID_RETRY_CONTEXT_SAMPLES = 30;

/** Reamostra janelas aleatórias até a chave de diversidade difrer de `avoidKeys` (retentativas anteriores). */
function diversifyContextSliceForInvalidRetry(
  fullText: string,
  maxChars: number,
  avoidKeys?: string[],
  seedKey?: string,
): string {
  const avoid = (avoidKeys || []).filter(Boolean);
  let last = "";
  for (let i = 0; i < MAX_INVALID_RETRY_CONTEXT_SAMPLES; i++) {
    last = seedKey
      ? diversifyContextSliceForInvalidRetryOnceDeterministic(fullText, maxChars, `${seedKey}|try=${i}`)
      : diversifyContextSliceForInvalidRetryOnce(fullText, maxChars);
    const key = contextInvalidRetryDiversityKey(last);
    if (avoid.length === 0 || !avoid.includes(key) || i >= MAX_INVALID_RETRY_CONTEXT_SAMPLES - 1) break;
  }
  return last;
}

function recordInvalidRetrySentContextFingerprints(
  opts: { invalidRetryUsedContextSigs?: string[] } | undefined,
  bodies: string[],
): void {
  const acc = opts?.invalidRetryUsedContextSigs;
  if (!acc || bodies.length === 0) return;
  for (const b of bodies) {
    const key = contextInvalidRetryDiversityKey(String(b || ""));
    if (key && key !== "0" && !acc.includes(key)) acc.push(key);
  }
}

/** N strings de contexto (~mesmo tamanho cada), para N chamadas paralelas ao modelo. */
function buildEnsembleContexts(fullContext: string, n: number, maxChars: number): string[] {
  const nn = Math.max(2, n);
  const trunc = (s: string) => truncateContextForModel(s, maxChars);

  // Se o objetivo é “varrer o documento inteiro”, a estratégia mais estável é janelar o texto bruto
  // igualmente espaçado — evita viés do chunking e evita truncar sempre o início de cada grupo.
  if (useFullContextForEnsemble()) {
    const t = String(fullContext || "").trim();
    if (!t) return [];
    const window = Math.min(maxChars, Math.max(2000, Math.floor(maxChars * 0.92)));
    if (t.length <= window) return [trunc(t)];
    const overlap = getGenerationEnsembleOverlapRatio();
    const step = Math.max(500, Math.floor(window * (1 - overlap)));
    const out: string[] = [];
    // Janelas sequenciais com overlap: cobre o texto inteiro e o N pode ser grande (5, 10, 30…)
    for (let start = 0; start < t.length && out.length < nn; start += step) {
      const s = Math.min(start, Math.max(0, t.length - window));
      out.push(trunc(t.slice(s, s + window)));
    }
    // Garantir que o final do documento seja coberto, mesmo quando o loop termina por limite de N.
    if (out.length > 0) {
      const last = trunc(t.slice(Math.max(0, t.length - window), t.length));
      if (out.length < nn && out[out.length - 1] !== last) out.push(last);
    }
    return out;
  }

  const blocks = splitContextIntoRagBlocks(fullContext);
  if (blocks.length >= nn) {
    return partitionBlocksForEnsemble(blocks, nn).map((g) => trunc(g.join("\n\n")));
  }
  if (blocks.length > 1) {
    return stridePartitionBlocks(blocks, nn).map((g) => trunc(g.join("\n\n")));
  }

  const t = String(fullContext || "").trim();
  if (!t) return [];
  const window = Math.min(maxChars, Math.max(1500, Math.ceil(t.length / nn) + Math.floor(maxChars * 0.08)));
  if (t.length <= window || nn === 1) return [trunc(t)];
  const step = Math.max(1, Math.floor((t.length - window) / Math.max(1, nn - 1)));
  const out: string[] = [];
  for (let i = 0; i < nn; i++) {
    const start = Math.min(i * step, Math.max(0, t.length - window));
    out.push(trunc(t.slice(start, start + window)));
  }
  return out;
}

function isFullDocumentScanOn(field: string | undefined): boolean {
  const raw = (process.env.OLLAMA_FULL_DOCUMENT_SCAN ?? "1").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "all") return true;
  const allowed = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return field != null && allowed.includes(field.toLowerCase());
}

function getFullDocumentScanPasses(): number {
  return Math.max(2, Math.min(6, parseInt(process.env.OLLAMA_FULL_DOCUMENT_SCAN_PASSES ?? "2", 10) || 2));
}

function getFullDocumentScanMaxWindows(): number {
  return Math.max(2, Math.min(60, parseInt(process.env.OLLAMA_FULL_DOCUMENT_SCAN_MAX_WINDOWS ?? "8", 10) || 8));
}

function buildFullDocumentScanWindows(fullText: string, maxChars: number, passes: number): string[] {
  const t = String(fullText || "").trim();
  if (!t) return [];
  const maxWindows = getFullDocumentScanMaxWindows();
  const window = Math.min(maxChars, Math.max(2200, Math.floor(maxChars * 0.92)));
  if (t.length <= window) return [truncateContextForModel(t, maxChars)];
  const overlap = getGenerationEnsembleOverlapRatio(); // reutiliza o ratio já existente (default ~0.18)
  const step = Math.max(500, Math.floor(window * (1 - overlap)));
  const out: string[] = [];

  const buildPass = (offset: number) => {
    for (let start = offset; start < t.length; start += step) {
      const s = Math.min(start, Math.max(0, t.length - window));
      out.push(truncateContextForModel(t.slice(s, s + window), maxChars));
      if (out.length >= maxWindows) break;
      if (s + window >= t.length) break;
    }
  };

  // 1ª passada: início = 0. Passadas seguintes: offset para pegar cortes “entre janelas”.
  for (let p = 0; p < Math.max(2, passes); p++) {
    const off = p === 0 ? 0 : Math.floor((p * step) / 2);
    buildPass(off);
    if (out.length >= maxWindows) break;
  }
  return out;
}

function extractionLooksExpectedForField(field: string | undefined, groundedJsonText: string): boolean {
  const f = (field || "").toLowerCase();
  const t = stripMarkdownCodeFences(String(groundedJsonText || "")).trim();
  if (!t) return false;
  try {
    const j = JSON.parse(t) as any;
    if (!j || typeof j !== "object" || Array.isArray(j)) return false;
    if (f === "prazo_inscricao") return Array.isArray(j.prazos) && j.prazos.length > 0;
    if (f === "vagas") return typeof j.vagas === "string" && /\d/.test(j.vagas);
    if (f === "criterios_elegibilidade") return typeof j.criterios_elegibilidade === "string" && j.criterios_elegibilidade.trim().length > 40;
    if (f === "valor_projeto") {
      const v = j.valor ?? j.valor_projeto;
      const arr = j.valores;
      if (typeof v === "string" && /R\$\s*\d/.test(v)) return true;
      if (Array.isArray(arr)) return arr.some((x) => typeof x === "string" && /R\$\s*\d/.test(String(x)));
      return false;
    }
  } catch {
    return false;
  }
  return false;
}

/** Identificador curto do corpo enviado ao modelo (para distinguir prompts em debug). */
function contextBodyStructuralTag(body: string): string {
  const b = String(body || "");
  if (!b) return "0c";
  let h = 2166136261;
  const parts = [b.slice(0, 500), b.slice(Math.max(0, Math.floor(b.length / 2) - 200), Math.floor(b.length / 2) + 200), b.slice(Math.max(0, b.length - 400))];
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) h = Math.imul(h ^ part.charCodeAt(i), 16777619);
  }
  return `${b.length}c~${(h >>> 0).toString(16).slice(0, 10)}`;
}

/** Trecho curto centrado num padrão útil ao campo — melhor que só os primeiros 96 caracteres do bloco. */
function extractFieldFocusPreview(raw: string, field: string | undefined): string | null {
  const f = (field || "").trim().toLowerCase();
  if (!f || !raw.trim()) return null;
  const linear = raw.replace(/\s+/g, " ").trim();

  const clipFromLinear = (start: number, len: number): string => {
    const a = Math.max(0, Math.min(start, Math.max(0, linear.length - 1)));
    let x = linear.slice(a, a + len).trim();
    if (x.length > 118) x = `${x.slice(0, 115)}…`;
    return x.length >= 10 ? x : "";
  };

  if (f === "vagas") {
    const tried: RegExp[] = [
      /\b(?:até|ate|máximo|maximo|mínimo|minimo|total|ser[aã]o)\s+[^.]{0,80}?\d{1,4}[^.]{0,60}?(?:vagas?|bolsas?|benefici[aá]rios?|propostas?|projetos?)/i,
      /\b\d{1,4}\s*(?:\([^)]{2,40}\))?\s*(?:vagas?|bolsas?|benefici[aá]rios?|propostas?|projetos?)\b/i,
      /\b(?:vagas?|bolsas?)\s+(?:previstas|oferecidas|disponíveis|abertas)?\s*[:(]?\s*\d{1,4}/i,
      /\bselecionar\s+\d{1,3}(?:\s*\([^)]+\))?/i,
    ];
    for (const re of tried) {
      const m = linear.match(re);
      if (m?.index != null) return clipFromLinear(m.index, 130);
    }
  }

  if (f === "valor_projeto") {
    const m =
      linear.match(/R\$\s*[\d.,\s]+(?:,\d{2})?/i) ||
      linear.match(/\bUS\$\s*[\d.,]+/i) ||
      linear.match(/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/);
    if (m?.index != null) return clipFromLinear(m.index, 120);
  }

  if (f === "prazo_inscricao") {
    const m = linear.match(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
    if (m?.index != null) return clipFromLinear(m.index, 120);
  }

  if (f === "localizacao") {
    const m = linear.match(/\b(?:abrangência|abrangencia|localiza|território|territorio|estado|região|regiao|nacional)\b[^.]{0,100}/i);
    if (m?.index != null) return clipFromLinear(m.index, 130);
  }

  return null;
}

/** Keywords por campo para debug — além das tags genéricas. */
function collectFieldAwareHitTags(s: string, field: string | undefined): string[] {
  const f = (field || "").trim().toLowerCase();
  const extra: string[] = [];
  if (!f) return extra;

  if (f === "vagas") {
    if (/selecionar|selecionad/i.test(s)) extra.push("selecionar");
    if (/limite|teto|m[aá]ximo\s+de|no\s+m[aá]ximo/i.test(s)) extra.push("limite");
    if (/cota/i.test(s)) extra.push("cotas");
    if (/proposta|projeto\s+aprovad|benefici[aá]rio/i.test(s)) extra.push("propostas");
  }
  if (f === "valor_projeto") {
    if (/or[cç]amento|faixa|r\$|mensal|anuidade/i.test(s)) extra.push("orcamento");
  }
  if (f === "prazo_inscricao") {
    if (/inscri[cç][aã]o|submiss|encerram|abertura/i.test(s)) extra.push("inscricao");
  }
  if (f === "localizacao") {
    if (/abrang[eê]ncia|territ[oó]rio|domic[ií]lio|sede/i.test(s)) extra.push("abrangencia");
  }

  return extra;
}

function contextDebugSignature(ctxBody: string, field?: string): string {
  const s = String(ctxBody || "").trim();
  if (!s) return "(vazio)";
  // O trecho pode começar no meio do PDF; o cabeçalho `--- Documento` / `--- Chunk` pode estar mais à frente.
  const marker = s.match(/---\s+(?:Chunk|Documento)\s+[^\n]+/i);
  const headerFromMarker = marker?.[0]?.trim().slice(0, 120) ?? "";
  const firstLine = s.split("\n", 1)[0]?.trim() || "";
  const compact = s.replace(/\s+/g, " ").trim();
  const focus = extractFieldFocusPreview(s, field);
  const focusPart = focus ? ` focus:«${focus}»` : "";

  const header =
    headerFromMarker ||
    (firstLine.startsWith("---") ? firstLine.slice(0, 120) : "") ||
    (focus
      ? `[trecho ${s.length}c${focusPart}]`
      : `[trecho ${s.length}c] ${compact.slice(0, 88)}${compact.length > 88 ? "…" : ""}`);

  const hits: string[] = [];
  if (/\bvagas?\b/i.test(s)) hits.push("vagas");
  if (/\bbolsas?\b/i.test(s)) hits.push("bolsas");
  if (/\bbenefici[aá]rios?\b/i.test(s)) hits.push("beneficiarios");
  // Sinais de valor / orçamento (útil em ensemble p.ex. valor_projeto)
  if (/\$|R\$|€|£|US\$|\bBRL\b|\bUSD\b|\bEUR\b/i.test(s)) hits.push("$");
  // Montantes / datas numéricas; códigos longos (ex. 123456789, verificadores); dígitos separados por espaço (OCR).
  const hasNumeros =
    /\d{3,}|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,4})?\b|\d+[.,]\d{1,4}\b/.test(s) ||
    /\b\d{6,}\b/.test(s) ||
    /(?:\d[\s.\u00ad-]*){9,}\d/.test(s);
  if (hasNumeros) hits.push("numeros");

  for (const t of collectFieldAwareHitTags(s, field)) {
    if (!hits.includes(t)) hits.push(t);
  }

  const contains = hits.join(",");
  const ctxTag = contextBodyStructuralTag(s);
  const core = contains ? `${header} [hits:${contains}] [${ctxTag}]` : `${header} [${ctxTag}]`;
  if (!focus && !headerFromMarker && compact.length > 92) {
    return `${core} | head:${compact.slice(0, 64)}…`;
  }
  return core;
}

const PT_MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

function stripAccentsLower(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Parte o texto completo do PDF em chunks para pontuação por relevância ao foco (ragQuery / campo). */
function splitFullTextIntoRelevanceChunks(fullText: string, maxChunk: number, overlap: number): string[] {
  const t = String(fullText || "").trim();
  if (!t) return [];
  const blocks = splitContextIntoRagBlocks(t);
  const sourceBlocks = blocks.length > 0 ? blocks : [t];
  const flat: string[] = [];
  const step = Math.max(400, maxChunk - overlap);
  for (const b of sourceBlocks) {
    const blk = b.trim();
    if (!blk) continue;
    if (blk.length <= maxChunk) flat.push(blk);
    else {
      for (let i = 0; i < blk.length; i += step) {
        flat.push(blk.slice(i, i + maxChunk));
      }
    }
  }
  return flat.filter((c) => c.trim().length > 80);
}

function relevanceChunkKey(ch: string): string {
  const t = ch.trim();
  return `${t.length}:${t.slice(0, 96)}`;
}

function scorePdfChunkForFocus(chunk: string, focusText: string, field: string | undefined): number {
  const c = stripAccentsLower(chunk.replace(/\s+/g, " "));
  const focus = stripAccentsLower(String(focusText || "").replace(/\s+/g, " "));
  const words = [...new Set(focus.split(/\W+/).filter((w) => w.length >= 3))];
  let s = 0;
  for (const w of words) {
    if (!w) continue;
    const n = c.split(w).length - 1;
    if (n > 0) s += w.length >= 6 ? 4 + Math.min(6, n) : w.length >= 4 ? 3 + Math.min(4, n) : 2 + Math.min(3, n);
  }
  const f = (field || "").toLowerCase();
  if (f === "prazo_inscricao") {
    if (/\b(prazo|inscri|submiss|cronogram|data\s*limite|encerr|homologa)/i.test(chunk)) s += 8;
    if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(chunk)) s += 5;
  } else if (f === "valor_projeto") {
    if (/\b(valor|orçamento|faixa|bolsa|r\$|mensal|total)/i.test(chunk)) s += 8;
    if (/\$|R\$|€|£|\d{1,3}(?:[.,]\d{3})+/.test(chunk)) s += 4;
  } else if (f === "localizacao") {
    if (/\b(estado|município|municipio|região|regiao|sede|local|abrangência|continente)/i.test(chunk)) s += 7;
  } else if (f === "vagas") {
    if (/\b(vagas?|bolsas?|bolsistas?|beneficiari|quantitat|ofertad|remanescente|teto|limite\s+de)\b/i.test(chunk)) s += 14;
    if (
      /(?:\bmáximo\b|\bmaximo\b|\baté\b|\bate\b)\s+[^.\n]{0,40}\d|\d{1,3}\s*(vagas?|bolsas?|benefici[aá]rios?)|\d+\s+propostas?\s+(a\s+)?(serem\s+)?(selecionad|aprovad)/i.test(
        chunk,
      )
    )
      s += 16;
    if (/\bprojeto\s+mais\s+bem\s+classificado|ser[aã]o\s+contratad|unica\s+proposta|somente\s+uma\s+[uú]nica|uma\s+[uú]nica\s+proposta/i.test(chunk))
      s += 18;
    if (/\bser[aã]o\s+selecionad|\bclassifica[cç][aã]o\b|\branking\b|\bremanescente/i.test(chunk)) s += 8;
    if (/\bcronograma\b/i.test(chunk) && !/\bvagas?\b|\bbolsas?\b|\bbolsistas?\b|\bbeneficiari|\bselecionad|\blimite\b|\bquantitat/i.test(chunk))
      s -= 14;
    const dateHits = (chunk.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || []).length;
    if (dateHits >= 4 && !/\bvagas?\b|\bbolsas?\b|\bbolsistas?\b|\bbeneficiari\b/i.test(chunk)) s -= 12;
  } else if (f === "criterios_elegibilidade") {
    if (
      /\b(elegibil|admissibil|habilita[cç][aã]o|requisitos?|pre[-\s]?requisit|documenta(c[cç][aã]o|ção)|ineleg|impedimento|desclassifica|enquadramento|comprovat|anu[eê]ncia|v[ií]nculo|institui[cç][aã]o\s+interveniente|proponente)\b/i.test(
        chunk,
      )
    )
      s += 16;
    if (/\b(doutorado|mestrado|doutor|mestre|titula[cç][aã]o|lattes|orcid|h-index)\b/i.test(chunk)) s += 7;
    if (/\bcronograma\b/i.test(chunk) && !/\belegibil|admissibil|habilita|requisito/i.test(chunk)) s -= 12;
    const dh = (chunk.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || []).length;
    if (dh >= 5 && !/\badmissibil|elegibil|habilita/i.test(chunk)) s -= 10;
  } else if (f === "sobre_programa") {
    if (/\b(objetivo|finalidade|justificativa|apresenta[cç][aã]o|contexto|p[uú]blico[-\s]?alvo|introdu[cç][aã]o|escopo)\b/i.test(chunk))
      s += 14;
    if (/\bDO OBJETIVO|objetivos espec[ií]ficos|sobre (o )?programa|sobre (o )?edital|objeto\s+da\s+chamada/i.test(chunk))
      s += 14;
    if (/\bprograma\s+de\s+fomento|pol[ií]tica\s+de\s+ci[eê]ncia/i.test(chunk)) s += 8;
    if (/\bcrit[eé]rios\s+de\s+admissibilidade\b/i.test(chunk) && !/\bobjetivo|finalidade|justificat|p[uú]blico/i.test(chunk))
      s -= 8;
  } else if (f === "is_researcher") {
    if (
      /\b(doutorado|mestrado|doutor|mestre|pesquisador|docente|ICT|universidade|lattes|orcid|bolsista|p[oó]s[-\s]?doutor|postdoc|coordenador[^\n]{0,48}proposta)\b/i.test(
        chunk,
      )
    )
      s += 14;
    if (/\b(MSCA|Marie|Horizon|ERC|fellowship|fellow|research grant|bolsa de pesquisa)\b/i.test(chunk)) s += 16;
    if (/\b(CNPJ obrigat[oó]rio|pessoa jur[ií]dica obrigat|formação de empresa|microempresa|startup\s+obrigat)\b/i.test(chunk))
      s += 8;
    if (/\bcronograma\b/i.test(chunk) && !/\bdoutor|mestrado|pesquisador|ICT|bols|lattes/i.test(chunk)) s -= 10;
  }
  return s;
}

const PDF_RELEVANCE_MAX_CHUNK = 4800;
const PDF_RELEVANCE_OVERLAP = 450;

/**
 * Um único corpo de texto a partir do PDF completo, por relevância lexical ao foco (`ragQuery` / pergunta) e ao campo.
 */
function pickPdfWindowByRelevance(
  fullText: string,
  focusText: string,
  maxChars: number,
  field: string | undefined,
): string {
  const t = String(fullText || "").trim();
  if (!t) return "";
  const maxChunk = Math.max(2000, Math.min(maxChars, PDF_RELEVANCE_MAX_CHUNK));
  const overlap = Math.max(200, PDF_RELEVANCE_OVERLAP);
  const chunks = splitFullTextIntoRelevanceChunks(t, maxChunk, overlap);
  if (chunks.length === 0) {
    const nWin = Math.min(getTruncationWindowMaxN(), Math.max(2, computeAutoEnsembleN(t.length, maxChars)));
    const wins = buildEnsembleContexts(t, nWin, maxChars);
    return truncateContextForModel(wins[0] ?? t.slice(0, maxChars), maxChars);
  }

  const fv = String(focusText || "").trim();
  const scored = chunks.map((ch) => ({
    ch,
    key: relevanceChunkKey(ch),
    sc: scorePdfChunkForFocus(ch, fv, field),
  }));
  scored.sort((a, b) => b.sc - a.sc || b.ch.length - a.ch.length);

  const picked: string[] = [];
  const pickedKeys = new Set<string>();
  let total = 0;
  for (const { ch, key, sc } of scored) {
    if (picked.length > 0 && sc < 1 && total > maxChars * 0.35) break;
    if (pickedKeys.has(key)) continue;
    if (total + ch.length + 4 > maxChars && picked.length > 0) break;
    picked.push(ch);
    pickedKeys.add(key);
    total += ch.length + 4;
    if (total >= maxChars - 120) break;
  }

  let body = truncateContextForModel(picked.join("\n\n"), maxChars);
  const minWant = Math.min(1200, Math.max(400, Math.floor(t.length * 0.1)));
  if (body.trim().length < minWant && t.length > minWant) {
    const fb = truncateContextForModel(t.slice(0, maxChars), maxChars);
    if (fb.trim().length > body.trim().length + 80) {
      body = truncateContextForModel(
        body.trim().length > 120 ? `${body}\n\n[…complemento por cobertura…]\n\n${fb}` : fb,
        maxChars,
      );
    }
  }
  return body;
}

/** Trecho “CONTEÚDO DOS DOCUMENTOS” exatamente como foi enviado ao modelo (para ancoragem). */
function extractOllamaPromptDocumentBody(prompt: string): string {
  const m = String(prompt || "").match(
    /CONTEÚDO DOS DOCUMENTOS \(editais\):\s*\n([\s\S]*?)\n---\s*\nPERGUNTA:/i,
  );
  return m?.[1]?.trim() ?? "";
}

function pad2(n: number): string {
  return n >= 10 ? String(n) : `0${n}`;
}

/** Datas DD/MM/AAAA (e ISO) encontradas num texto livre ou JSON. */
function extractCalendarTriplesFromText(text: string): Array<{ d: number; m: number; y: number }> {
  const out: Array<{ d: number; m: number; y: number }> = [];
  const seen = new Set<string>();
  const push = (d: number, m: number, y: number) => {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return;
    const k = `${y}-${m}-${d}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ d, m, y });
  };
  const s = String(text || "");
  let rm: RegExpExecArray | null;
  const reSlash = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g;
  while ((rm = reSlash.exec(s)) != null) {
    push(parseInt(rm[1], 10), parseInt(rm[2], 10), parseInt(rm[3], 10));
  }
  const reIso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((rm = reIso.exec(s)) != null) {
    push(parseInt(rm[3], 10), parseInt(rm[2], 10), parseInt(rm[1], 10));
  }
  return out;
}

function dateTripleGroundedInSource(d: number, m: number, y: number, source: string): boolean {
  const src = String(source || "");
  if (!src.trim()) return true;
  const sn = stripAccentsLower(src);
  const forms = new Set<string>([
    `${pad2(d)}/${pad2(m)}/${y}`,
    `${d}/${m}/${y}`,
    `${d}/${pad2(m)}/${y}`,
    `${pad2(d)}/${m}/${y}`,
    `${pad2(d)}-${pad2(m)}-${y}`,
    `${pad2(d)}.${pad2(m)}.${y}`,
  ]);
  for (const f of forms) {
    if (src.includes(f)) return true;
    if (sn.includes(f.toLowerCase())) return true;
  }
  const month = PT_MONTH_NAMES[m - 1];
  if (month) {
    const head3 = month.slice(0, 3);
    const reWritten = new RegExp(
      `\\b${d}\\s*de\\s*(${month}|${head3}[a-zç]*)\\s*de\\s*${y}\\b`,
      "i",
    );
    if (reWritten.test(sn)) return true;
  }
  return false;
}

const VALOR_NEGATION_RE =
  /\b(não|nao|não\s+foi|nao\s+foi|não\s+consta|nao\s+consta|não\s+especific|nao\s+especific|não\s+inform|nao\s+inform|indetermin|n\/a)\b/i;

function isPlaceholderMoneyString(val: string): boolean {
  const v = String(val || "").trim();
  if (!v) return false;
  const n = stripAccentsLower(v);
  if (/insira o valor/.test(n)) return true;
  if (/\br\$\s*[xX]\b/.test(v)) return true;
  // Modelos tipo «R$ XXXXXXX (Valor global…)» / «R$ XX (teto)» sem dígito algum no item
  if (/\br\$\s*[xX]{1,}\b/i.test(v) && !/\d/.test(v)) return true;
  if (/\br\$\s*[xX]{1,}\s*\(/i.test(v) && !/\d/.test(v)) return true;
  if (/\br\$\s*(?:\.\.\.|---|—)\b/.test(v)) return true;
  if (/\br\$\s*(?:a definir|a confirmar|a informar|a indicar)\b/i.test(v)) return true;
  // Máscara genérica de montante (só letras X no lugar de números)
  if (/\b[xX]{4,}\b/.test(v) && /r\$/i.test(v) && !/\d/.test(v)) return true;
  return false;
}

function valorStringClaimsConcreteAmount(val: string): boolean {
  const v = String(val || "").trim();
  if (!v || VALOR_NEGATION_RE.test(v)) return false;
  if (isPlaceholderMoneyString(v)) return false;
  // Símbolo de moeda sozinho não basta (ex.: "R$ X"). Exigir dígitos OU valor por extenso (mil/milhão/…).
  if (/(R\$|US\$|\$|€|£)/i.test(v) && !/\d/.test(v) && !/\b(mil|milh(ões|oes)|bilh(ões|oes))\b/i.test(v)) {
    return false;
  }
  return /\d|\b(mil|milh(ões|oes)|bilh(ões|oes))\b/i.test(v) || /(R\$|US\$|\$|€|£)/i.test(v);
}

function valorMonetaryGroundedInSource(val: string, source: string): boolean {
  const v = String(val || "").trim();
  const src = String(source || "");
  if (!v || !src.trim()) return true;
  if (!valorStringClaimsConcreteAmount(v)) return true;
  const sn = stripAccentsLower(src);
  const vn = stripAccentsLower(v);
  const money = [...v.matchAll(/(?:R\$|US\$|\$|€|£)\s*[\d.,\s]+(?:,\d{2})?/gi)].map((x) => stripAccentsLower(x[0].replace(/\s+/g, " ").trim()));
  for (const tok of money) {
    if (tok.length >= 4 && sn.includes(tok)) return true;
  }
  const brNum = [...v.matchAll(/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/g)].map((x) => x[0]);
  for (const tok of brNum) {
    if (sn.includes(tok)) return true;
  }
  const simple = [...v.matchAll(/\b\d{4,}\b/g)].map((x) => x[0]);
  for (const tok of simple) {
    if (sn.includes(tok)) return true;
  }
  const written = [...v.matchAll(/\(([^)]{8,120})\)/g)].map((x) => stripAccentsLower(x[1].replace(/\s+/g, " ").trim()));
  for (const w of written) {
    if (w.length >= 12 && sn.includes(w.slice(0, Math.min(40, w.length)))) return true;
  }
  return false;
}

/** Penalidade ≤ 0: resposta com datas/valores que não aparecem no trecho de documento usado na chamada. */
function extractionGroundingAdjustment(field: string | undefined, rawJsonText: string, sourceChunk?: string): number {
  const src = String(sourceChunk || "").trim();
  if (!src) return 0;
  const f = (field || "").toLowerCase();
  let t: string;
  try {
    t = stripMarkdownCodeFences(rawJsonText).trim();
    JSON.parse(t);
  } catch {
    return 0;
  }
  if (f === "prazo_inscricao") {
    let pen = 0;
    for (const trip of extractCalendarTriplesFromText(t)) {
      if (!dateTripleGroundedInSource(trip.d, trip.m, trip.y, src)) pen += 12_000;
    }
    return -Math.min(pen, 36_000);
  }
  if (f === "valor_projeto") {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      let pen = 0;
      const list = j.valores;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (typeof item !== "string") continue;
          const s = item.trim();
          if (!valorStringClaimsConcreteAmount(s)) continue;
          if (!valorMonetaryGroundedInSource(s, src)) pen += 14_000;
        }
      }
      const v = j.valor ?? j.valor_projeto;
      if (typeof v === "string" && valorStringClaimsConcreteAmount(v) && !valorMonetaryGroundedInSource(v, src)) {
        pen += 14_000;
      }
      return -Math.min(pen, 42_000);
    } catch {
      return 0;
    }
  }
  if (f === "localizacao") {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const loc = j.localizacao;
      if (loc == null) return 0;
      if (typeof loc !== "string") return 0;
      const s = stripAccentsLower(loc).trim();
      if (!s) return 0;
      // Respostas “meta/ausência” não precisam ser ancoradas.
      if (/\b(n[aã]o\s+especificad|n[aã]o\s+informad|n[aã]o\s+consta|indeterminad|n\/a)\b/i.test(s)) return 0;

      const sn = stripAccentsLower(src);
      // Exige ao menos 1 termo “forte” (>=4) da resposta aparecer no chunk.
      const words = s
        .split(/[^a-z0-9ç]+/i)
        .map((w) => w.trim())
        .filter(Boolean)
        .filter((w) => w.length >= 4)
        .filter(
          (w) =>
            !/^(para|pela|pelo|com|sem|entre|sobre|sendo|onde|deste|desta|destes|destas|regiao|estado|municipio|cidade|pais)$/.test(
              w,
            ),
        );
      if (words.length === 0) return 0;
      const hit = words.some((w) => sn.includes(w));
      return hit ? 0 : -6_000;
    } catch {
      return 0;
    }
  }
  if (f === "vagas") {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const v = j.vagas;
      if (v == null) return 0;
      if (typeof v !== "string") return 0;
      const s = stripAccentsLower(v).trim();
      if (!s) return 0;
      if (/\b(n[aã]o\s+especificad|n[aã]o\s+informad|n[aã]o\s+consta|indeterminad|n\/a)\b/i.test(s)) return 0;
      const sn = stripAccentsLower(src);
      const nums = [...s.matchAll(/\b\d{1,4}\b/g)].map((m) => m[0]);
      // Se há número(s), exige que pelo menos um apareça no chunk.
      if (nums.length > 0 && !nums.some((n) => sn.includes(n))) return -9_000;
      // Se há “vaga/bolsa”, exige que a palavra exista no chunk.
      if (/\b(vaga|bolsa|beneficiari)\b/i.test(s) && !/\b(vaga|bolsa|beneficiari)\b/i.test(sn)) return -4_000;
      return 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/** Remove de `prazos` entradas cujas datas DD/MM/AAAA não estão ancoradas no texto-fonte. */
function filterPrazoJsonByDocumentSource(rawText: string, source: string): string {
  const src = String(source || "").trim();
  const t = stripMarkdownCodeFences(rawText).trim();
  if (!src || !t) return rawText;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const p = j.prazos;
    if (!Array.isArray(p)) return rawText;
    const next: string[] = [];
    for (const item of p) {
      if (typeof item !== "string") continue;
      const s = item.trim();
      if (!s) continue;
      const trips = extractCalendarTriplesFromText(s);
      if (trips.length === 0) {
        next.push(s);
        continue;
      }
      if (trips.every((tr) => dateTripleGroundedInSource(tr.d, tr.m, tr.y, src))) next.push(s);
    }
    if (p.length > 0 && next.length === 0) {
      const preview = p
        .filter((x): x is string => typeof x === "string")
        .map((x) => String(x).replace(/\s+/g, " ").trim().slice(0, 160))
        .join(" | ");
      console.warn(
        `  ⚠️ prazo_inscricao: ancoragem removeu ${p.length} entrada(s) — cada data DD/MM/AAAA na resposta tem de existir no trecho enviado ao modelo (evita alucinação). Resposta: ${preview || "(vazio)"}`,
      );
    }
    j.prazos = next;
    return JSON.stringify(j);
  } catch {
    return rawText;
  }
}

function countNonemptyPrazoStringsInJson(s: string): number {
  try {
    const j = JSON.parse(stripMarkdownCodeFences(String(s || "")).trim()) as Record<string, unknown>;
    const p = j.prazos;
    if (!Array.isArray(p)) return 0;
    return p.filter((x) => typeof x === "string" && String(x).trim().length > 0).length;
  } catch {
    return 0;
  }
}

/** `OLLAMA_PRAZO_SOURCE_HEURISTIC=0`: não preenche `prazos` a partir do texto do edital quando o modelo/ancoragem devolvem vazio. */
function isPrazoSourceHeuristicFallbackOn(): boolean {
  const v = (process.env.OLLAMA_PRAZO_SOURCE_HEURISTIC ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

/**
 * Datas literais DD/MM/AAAA no texto, só quando próximas de vocabulário de prazo/cronograma
 * (evita puxar números soltos fora de contexto).
 */
function extractHeuristicPrazoStringsFromEditalSource(source: string): string[] {
  const src = String(source || "").replace(/\s+/g, " ");
  if (src.length < 40) return [];
  const nearRe =
    /submiss|inscri|sigfapesc|data[\s-]*limite|candidat|encerr|prazo|portal|cronograma|\betapas\b|\bdatas\b|abertura|homologa|divulg|resultad|selecion|merito|recurso|outorga|confap|chamada|lan[cç]amento|lancamento|suplementar|selecionad/i;
  const dateRe = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;
  type Row = { y: number; m: number; d: number; label: string };
  const rows: Row[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(src)) != null) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2004 || y > 2038) continue;
    const lo = Math.max(0, m.index - 110);
    const hi = Math.min(src.length, m.index + m[0].length + 110);
    const ctx = src.slice(lo, hi);
    if (!nearRe.test(ctx)) continue;
    const k = `${y}-${mo}-${d}`;
    if (seen.has(k)) continue;
    seen.add(k);
    let tail = src.slice(m.index + m[0].length).trim();
    tail = tail.replace(/^[\s,.;:—-]+/, "").slice(0, 78).trim();
    const lit = `${pad2(d)}/${pad2(mo)}/${y}`;
    const label =
      tail.length > 0 ? `${lit} (${tail}${tail.length >= 78 ? "…" : ""})` : lit;
    rows.push({ y, m: mo, d, label: label.length > 200 ? `${label.slice(0, 197)}…` : label });
  }
  rows.sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d);
  return rows.map((r) => r.label).slice(0, 12);
}

function maybeSupplementPrazoJsonFromSource(filteredJson: string, docSource: string): string {
  if (!isPrazoSourceHeuristicFallbackOn()) return filteredJson;
  try {
    JSON.parse(stripMarkdownCodeFences(String(filteredJson || "")).trim());
  } catch {
    return filteredJson;
  }
  if (countNonemptyPrazoStringsInJson(filteredJson) > 0) return filteredJson;
  const inferred = extractHeuristicPrazoStringsFromEditalSource(docSource);
  if (inferred.length === 0) return filteredJson;
  console.warn(
    `  📌 prazo_inscricao: ${inferred.length} data(s) inferida(s) do texto do documento (submissão/cronograma) — resposta do modelo estava vazia após ancoragem.`,
  );
  return JSON.stringify({ prazos: inferred });
}

/** A 1.ª resposta tinha strings em `prazos`; após ancoragem não sobrou nenhuma (datas inventadas / ausentes do trecho). */
function prazoGroundingRemovedAllRawPrazos(rawModel: string, grounded: string): boolean {
  return countNonemptyPrazoStringsInJson(rawModel) > 0 && countNonemptyPrazoStringsInJson(grounded) === 0;
}

/** Chamadas **extra** após ancoragem esvaziar prazos (default 1). `OLLAMA_PRAZO_ANCHOR_RETRY=0` desliga. */
function getPrazoAnchorRetryMax(): number {
  const v = (process.env.OLLAMA_PRAZO_ANCHOR_RETRY ?? "1").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return 0;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(3, n);
}

const PRAZO_ANCHOR_RETRY_CONTEXT_HINT =
  "\n\n⚠️ Regra: no array `prazos` inclua **somente** intervalos ou datas que apareçam **literalmente** no CONTEÚDO acima (mesmo dia, mês e ano). Se citou datas que não estão escritas no texto, corrija. Sem datas literais de inscrição/submissão → {\"prazos\":[]}.";

function filterValorJsonByDocumentSource(rawText: string, source: string): string {
  const src = String(source || "").trim();
  const t = stripMarkdownCodeFences(rawText).trim();
  if (!src || !t) return rawText;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const vals = j.valores;
    if (Array.isArray(vals)) {
      const next: string[] = [];
      for (const item of vals) {
        if (typeof item !== "string") continue;
        const s = item.trim();
        if (!s) continue;
        if (isPlaceholderMoneyString(s)) continue;
        if (!valorStringClaimsConcreteAmount(s)) {
          next.push(s);
          continue;
        }
        if (valorMonetaryGroundedInSource(s, src)) next.push(s);
      }
      j.valores = next;
    }
    const key = "valor" in j ? "valor" : "valor_projeto" in j ? "valor_projeto" : null;
    if (key) {
      const v = j[key];
      if (typeof v === "string") {
        if (isPlaceholderMoneyString(v)) {
          j[key] = null;
        } else if (valorStringClaimsConcreteAmount(v) && !valorMonetaryGroundedInSource(v, src)) {
          j[key] = null;
        }
      }
    }
    if (Array.isArray(j.valores) && (j.valores as unknown[]).length === 0 && j.valor == null && j.valor_projeto == null) {
      j.valor = null;
    }
    return JSON.stringify(j);
  } catch {
    return rawText;
  }
}

function applyDocumentGroundingToOllamaReplyWithSource(
  field: string | undefined,
  rawText: string,
  sourceText: string,
): string {
  const f = (field || "").toLowerCase();
  const src = String(sourceText || "").trim();
  if (!src) return rawText;
  if (f === "prazo_inscricao")
    return maybeSupplementPrazoJsonFromSource(filterPrazoJsonByDocumentSource(rawText, src), src);
  if (f === "valor_projeto") return filterValorJsonByDocumentSource(rawText, src);
  return rawText;
}

function applyDocumentGroundingToOllamaReply(
  field: string | undefined,
  rawText: string,
  promptUsedForCall: string,
): string {
  const f = (field || "").toLowerCase();
  const doc = extractOllamaPromptDocumentBody(promptUsedForCall).trim();
  if (!doc) return rawText;
  if (f === "prazo_inscricao")
    return maybeSupplementPrazoJsonFromSource(filterPrazoJsonByDocumentSource(rawText, doc), doc);
  if (f === "valor_projeto") return filterValorJsonByDocumentSource(rawText, doc);
  return rawText;
}

/** Desempate quando várias respostas têm score parecido (ex.: todas com JSON válido mas `null`). */
function extractionQualityTieBreak(field: string | undefined, rawText: string): number {
  const t = stripMarkdownCodeFences(rawText).trim();
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    const f = (field || "").toLowerCase();
    if (f === "valor_projeto") {
      const arr = j.valores;
      if (Array.isArray(arr) && arr.length > 0) {
        const strs = arr.filter((x) => typeof x === "string").map((x) => String(x).trim()).filter(Boolean);
        const concrete = strs.filter((s) => valorStringClaimsConcreteAmount(s)).length;
        const placeholders = strs.filter((s) => isPlaceholderMoneyString(s)).length;
        const joined = strs.join(" ");
        return 2000 + concrete * 220 - placeholders * 400 + Math.min(400, joined.length);
      }
      const v = j.valor ?? j.valor_projeto;
      if (v != null && typeof v === "string" && /R\$|[0-9]/.test(v)) return 2000 + Math.min(400, v.length);
      return 0;
    }
    if (f === "localizacao") {
      const loc = j.localizacao;
      if (typeof loc === "string" && loc.trim().length > 1) return 800 + Math.min(200, loc.trim().length);
      return 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

/** Heurística simples para escolher a “melhor” resposta sem segundo modelo juiz. */
function scoreOllamaExtractionResponse(
  field: string | undefined,
  rawText: string,
  sourceChunk?: string,
  scoreOpts?: { groundingSource?: string },
): number {
  const t = stripMarkdownCodeFences(rawText).trim();
  if (!t) return -1_000_000;
  const groundSrc = scoreOpts?.groundingSource?.trim() ? scoreOpts.groundingSource : sourceChunk;
  const groundAdj = extractionGroundingAdjustment(field, t, groundSrc);
  let score = 0;
  if (t.includes("{") && t.includes("}")) score += 4;
  try {
    const j = JSON.parse(t) as Record<string, unknown>;
    if (!j || typeof j !== "object" || Array.isArray(j)) return score + groundAdj;
    score += 35;
    const f = (field || "").toLowerCase();
    if (f === "vagas") {
      const src = String(sourceChunk || "");
      let ctxBonus = 0;
      if (src) {
        if (/\bselecionar\s+\d{1,3}\b/i.test(src)) ctxBonus = 24;
        else if (/\b\d{1,4}\s*(?:\([^)]{2,50}\))?\s*(?:vagas?|bolsas?|benefici[aá]rios?)\b/i.test(src)) ctxBonus = 20;
        else if (/\b(?:máximo|maximo|até|ate|limite)\s+[^.\n]{0,50}\d{1,4}/i.test(src)) ctxBonus = 14;
      }
      if (!("vagas" in j)) return score + groundAdj + ctxBonus;
      const v = j.vagas;
      if (v === null) score += 12;
      else if (typeof v === "string" && /\d/.test(v)) score += 80;
      else if (typeof v === "string" && v.trim().length > 0) score += 40;
      return score + groundAdj + ctxBonus;
    }
    if (f === "valor_projeto") {
      const vals = j.valores;
      if (Array.isArray(vals) && vals.length > 0) {
        const strItems = vals.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
        const placeholderItems = strItems.filter((s) => isPlaceholderMoneyString(s)).length;
        const concreteItems = strItems.filter((s) => valorStringClaimsConcreteAmount(s)).length;
        // Não recompensar listas longas só com «R$ XXXXX»; priorizar linhas com montante real (dígitos / extenso).
        score += 28 + Math.min(55, concreteItems * 18) + Math.min(24, strItems.length * 3);
        score += Math.min(50, concreteItems * 12);
        score -= Math.min(220, placeholderItems * 55);
        const joined = strItems.join(" ");
        if (concreteItems > 0 && /R\$|\$|€|£/.test(joined)) score += 48;
        return score + groundAdj;
      }
      const v = j.valor ?? j.valor_projeto;
      if (v === null) score += 10;
      else if (typeof v === "string" && /R\$|\$|€|£|\d/.test(v)) score += 75;
      else if (typeof v === "string" && v.trim().length > 0) score += 35;
      // Se o chunk tem valor monetário claro, penaliza um pouco `null`/vazio.
      const src = String(sourceChunk || "");
      if (src && (v === null || (typeof v === "string" && !/\d/.test(v)))) {
        if (
          /(?:R\$|US\$|\$|€|£)\s*[\d.,]{2,}/.test(src) &&
          /\b(valor|or[cç]amento|recursos|total|montante|bolsa|mensal|aux[ií]lio|subs[ií]dio|di[aá]ria)\b/i.test(src)
        ) {
          score -= 18;
        }
      }
      return score + groundAdj;
    }
    if (f === "prazo_inscricao") {
      const p = j.prazos;
      if (Array.isArray(p)) score += 25 + Math.min(40, p.length * 4);
      // Se o chunk tem datas + menção a inscrição/submissão, penaliza levemente resposta vazia.
      const src = String(sourceChunk || "");
      if (src && Array.isArray(p) && p.length === 0) {
        if (/\b(inscri[cç][aã]o|submiss[aã]o|encerr|prazo|at[eé])\b/i.test(src) && /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b/.test(src)) {
          score -= 22;
        }
      }
      return score + groundAdj;
    }
    if (f === "localizacao") {
      const loc = j.localizacao;
      if (loc === null) score += 8;
      else if (typeof loc === "string" && loc.trim().length > 0) {
        const s = stripAccentsLower(loc).trim();
        if (/\b(n[aã]o\s+especificad|n[aã]o\s+informad|n[aã]o\s+consta|indeterminad|n\/a)\b/i.test(s)) score += 5;
        else score += 45;
      }
      score += Math.min(20, Object.keys(j).length);
      return score + groundAdj;
    }
    if (f === "sobre_programa" && typeof j.sobre_programa === "string" && j.sobre_programa.trim().length > 8) score += 40;
    if (f === "criterios_elegibilidade" && typeof j.criterios_elegibilidade === "string" && j.criterios_elegibilidade.trim().length > 8)
      score += 40;
    if (f === "timeline_estimada" && j.timeline_estimada != null && typeof j.timeline_estimada === "object") score += 40;
    if (f === "is_researcher" && typeof j.is_researcher === "boolean") score += 50;
    if (f === "is_company" && typeof j.is_company === "boolean") score += 50;
    score += Math.min(20, Object.keys(j).length);
    return score + groundAdj;
  } catch {
    return score + groundAdj;
  }
}

/**
 * Busca PDFs pelos file_ids, extrai texto e chama o Ollama com a pergunta.
 * Retorna o texto gerado pelo modelo ou null em caso de erro.
 */
export async function extractInfoViaOllama(
  message: string,
  fileIds: string[],
  options?: {
    editalId?: string;
    field?: string;
    ragQuery?: string;
    invalidRetryTopK?: number;
    /** 1..N — índice da retentativa (logs); o CONTEÚDO muda por `randomInt` a cada chamada, sobre o texto completo. */
    invalidRetryContentVariant?: number;
    /**
     * O mesmo array em todas as chamadas ao campo (1.ª extração + retentativas): fingerprints dos contextos já
     * enviados ao modelo, para a próxima retentativa reamostrar janela até ser diferente.
     */
    invalidRetryUsedContextSigs?: string[];
  },
): Promise<string | null> {
  const baseUrl = getOllamaBase();
  const model = normalizeOllamaChatModelName(process.env.OLLAMA_MODEL || "qwen2.5:7b");

  if (!fileIds || fileIds.length === 0) return null;
  if (!supabase) {
    console.warn("  ⚠️ Ollama: Supabase não configurado.");
    return null;
  }

  const saveDebug =
    process.env.SAVE_PROCESS_EDITAL_DEBUG === "1" ||
    process.env.SAVE_PROCESS_EDITAL_DEBUG === "true";

  const debugDirFromEnv = process.env.PROCESS_EDITAL_DEBUG_DIR?.trim() || "";
  const debugBaseDirRepo = path.join(REPO_ROOT_DIR, "teste");
  const debugBaseDirCwd = path.resolve(process.cwd(), "teste");
  const debugBaseDirTmp = path.join(os.tmpdir(), "originlab-ollama-debug");

  const resolveWritableDebugBaseDir = async (): Promise<string | null> => {
    const candidates: string[] = [];
    candidates.push(debugBaseDirRepo);
    if (debugDirFromEnv) candidates.push(debugDirFromEnv);
    candidates.push(debugBaseDirCwd, debugBaseDirTmp);

    const uniq = [...new Set(candidates.map((d) => path.resolve(d)))];
    for (const dir of uniq) {
      try {
        await mkdir(dir, { recursive: true });
        await access(dir, constants.W_OK);
        const probe = path.join(dir, `.write-probe-${randomUUID().slice(0, 8)}`);
        await writeFile(probe, "ok", "utf8");
        await unlink(probe).catch(() => undefined);

        if (debugDirFromEnv) {
          const wanted = path.resolve(debugDirFromEnv);
          if (dir !== wanted) {
            console.warn(
              `  ⚠️ [process-edital-debug] PROCESS_EDITAL_DEBUG_DIR não será usado ("${wanted}"). Salvando em: ${dir}`,
            );
          }
        }
        return dir;
      } catch {
        // try next
      }
    }
    return null;
  };

  const maskEnvValue = (k: string, v: string): string => {
    const key = k.toLowerCase();
    if (
      key.includes("key") ||
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("password") ||
      key.includes("service_role")
    ) {
      if (v.length <= 8) return "***";
      return `${v.slice(0, 4)}***${v.slice(-4)}`;
    }
    return v;
  };

  const pickDebugEnv = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v == null) continue;
      const key = String(k);
      if (
        key.startsWith("OLLAMA_") ||
        key.startsWith("USE_") ||
        key.startsWith("N8N_") ||
        key.startsWith("API_") ||
        key.startsWith("FIELD_") ||
        key.startsWith("DELAY_") ||
        key.startsWith("PROCESS_") ||
        key.startsWith("UPDATE_EDITAL_") ||
        key === "VITE_SUPABASE_URL" ||
        key === "SUPABASE_URL"
      ) {
        out[key] = maskEnvValue(key, String(v));
      }
    }
    return out;
  };

  type EnsembleDebugRun = {
    idx: number;
    ok: boolean;
    status: number;
    score: number | null;
    contextChars: number;
    contextSignature: string;
    errText?: string;
    responseText: string | null;
    responseJson?: unknown;
    promptChars: number;
  };

  type TopKMultiDebugRun = {
    windowIndex: number;
    retrievalVariant: number;
    retrievalSeedPreview?: string;
    ok: boolean;
    status: number;
    score: number | null;
    contextChars: number;
    contextSignature: string;
    errText?: string;
    responseText: string | null;
    responseJson?: unknown;
    promptChars: number;
  };

  type TopKMultiDebugAttempt = {
    topK: number;
    sourceLabel: string;
    contextChars: number;
    windowCount: number;
    prompts: string[];
    runs: TopKMultiDebugRun[];
  };

  const writeDebugFiles = async (payload: {
    promptText: string;
    request: Record<string, unknown>;
    responseJson?: unknown;
    responseText?: string | null;
    error?: { message: string; name?: string; cause?: string };
    ensembleDebug?: {
      winnerIndex: number | null;
      winnerScore: number | null;
      runs: EnsembleDebugRun[];
      prompts: string[];
    };
    topKMultiDebug?: {
      winner: {
        topK: number;
        windowIndex: number;
        retrievalVariant: number;
        score: number;
        sourceLabel: string;
      };
      attempts: TopKMultiDebugAttempt[];
    };
  }): Promise<void> => {
    if (!saveDebug) return;
    try {
      const debugBaseDir = await resolveWritableDebugBaseDir();
      if (!debugBaseDir) {
        console.warn(
          `  ⚠️ [process-edital-debug] não foi possível criar diretório de dumps. Tentativas: ${[
            debugBaseDirRepo,
            debugDirFromEnv,
            debugBaseDirCwd,
            debugBaseDirTmp,
          ]
            .filter(Boolean)
            .join(" | ")}`,
        );
        return;
      }
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const edital = (options?.editalId || "unknown").slice(0, 32);
      const field = (options?.field || "unknown").replace(/[^\w.-]+/g, "_").slice(0, 64);
      const dir = path.join(debugBaseDir, `${ts}__${edital}__${field}__${randomUUID().slice(0, 8)}`);
      await mkdir(dir, { recursive: true });
      console.log(`  🧪 [process-edital-debug] dump salvo em: ${dir}`);

      await writeFile(path.join(dir, "env.json"), JSON.stringify(pickDebugEnv(), null, 2), "utf8");
      await writeFile(path.join(dir, "prompt.txt"), String(payload.promptText ?? ""), "utf8");
      await writeFile(path.join(dir, "request.json"), JSON.stringify(payload.request, null, 2), "utf8");
      if (payload.responseJson !== undefined) {
        await writeFile(
          path.join(dir, "response.raw.json"),
          JSON.stringify(payload.responseJson, null, 2),
          "utf8",
        );
      }
      if (payload.responseText != null) {
        await writeFile(path.join(dir, "response.text.txt"), String(payload.responseText), "utf8");
      }
      if (payload.topKMultiDebug && payload.topKMultiDebug.attempts.length > 0) {
        const md = payload.topKMultiDebug;
        await writeFile(
          path.join(dir, "topk-multi.json"),
          JSON.stringify(
            {
              winner: md.winner,
              attempts: md.attempts.map((a) => ({
                topK: a.topK,
                sourceLabel: a.sourceLabel,
                contextChars: a.contextChars,
                windowCount: a.windowCount,
                runs: a.runs.map((r) => ({
                  windowIndex: r.windowIndex,
                  retrievalVariant: r.retrievalVariant,
                  retrievalSeedPreview: r.retrievalSeedPreview,
                  ok: r.ok,
                  status: r.status,
                  score: r.score,
                  contextChars: r.contextChars,
                  contextSignature: r.contextSignature,
                  errText: r.errText,
                  promptChars: r.promptChars,
                  responseTextChars: r.responseText ? r.responseText.length : 0,
                  responsePreview: r.responseText ? r.responseText.slice(0, 800) : "",
                })),
              })),
            },
            null,
            2,
          ),
          "utf8",
        );
        for (const a of md.attempts) {
          for (let ri = 0; ri < a.runs.length; ri++) {
            const r = a.runs[ri]!;
            const v = r.retrievalVariant ?? 0;
            const prefix = `topk.k${a.topK}.v${v}.w${r.windowIndex}`;
            const p = a.prompts[ri] ?? "";
            await writeFile(path.join(dir, `${prefix}.prompt.txt`), p, "utf8");
            await writeFile(
              path.join(dir, `${prefix}.response.text.txt`),
              r.responseText != null ? String(r.responseText) : "",
              "utf8",
            );
            if (r.responseJson !== undefined) {
              await writeFile(
                path.join(dir, `${prefix}.response.raw.json`),
                JSON.stringify(r.responseJson, null, 2),
                "utf8",
              );
            }
            if (r.errText) {
              await writeFile(path.join(dir, `${prefix}.error.txt`), String(r.errText), "utf8");
            }
          }
        }
      }
      if (payload.ensembleDebug && payload.ensembleDebug.runs.length > 0) {
        const ed = payload.ensembleDebug;
        await writeFile(
          path.join(dir, "ensemble.json"),
          JSON.stringify(
            {
              winnerIndex: ed.winnerIndex,
              winnerScore: ed.winnerScore,
              runs: ed.runs.map((r) => ({
                idx: r.idx,
                ok: r.ok,
                status: r.status,
                score: r.score,
                contextChars: r.contextChars,
                contextSignature: r.contextSignature,
                errText: r.errText,
                promptChars: r.promptChars,
                responseTextChars: r.responseText ? r.responseText.length : 0,
                responsePreview: r.responseText ? r.responseText.slice(0, 800) : "",
              })),
            },
            null,
            2,
          ),
          "utf8",
        );
        for (const r of ed.runs) {
          const p = ed.prompts[r.idx] ?? "";
          await writeFile(path.join(dir, `ensemble.${r.idx}.prompt.txt`), p, "utf8");
          await writeFile(
            path.join(dir, `ensemble.${r.idx}.response.text.txt`),
            r.responseText != null ? String(r.responseText) : "",
            "utf8",
          );
          if (r.responseJson !== undefined) {
            await writeFile(
              path.join(dir, `ensemble.${r.idx}.response.raw.json`),
              JSON.stringify(r.responseJson, null, 2),
              "utf8",
            );
          }
          if (r.errText) {
            await writeFile(path.join(dir, `ensemble.${r.idx}.error.txt`), String(r.errText), "utf8");
          }
        }
      }

      const indexEntries: Array<{ file: string; kind: string; detail?: string }> = [
        {
          file: "prompt.txt",
          kind: "winner",
          detail: "Prompt da resposta escolhida (response.text / response.raw).",
        },
      ];
      let flatN = 0;
      if (payload.ensembleDebug && payload.ensembleDebug.prompts.length > 0) {
        for (let i = 0; i < payload.ensembleDebug.prompts.length; i++) {
          const fn = `prompt.all.${flatN}.txt`;
          await writeFile(path.join(dir, fn), payload.ensembleDebug.prompts[i] ?? "", "utf8");
          indexEntries.push({ file: fn, kind: "ensemble", detail: `ensembleIdx=${i}` });
          flatN++;
        }
      } else if (payload.topKMultiDebug && payload.topKMultiDebug.attempts.length > 0) {
        for (const att of payload.topKMultiDebug.attempts) {
          for (let j = 0; j < att.prompts.length; j++) {
            const fn = `prompt.all.${flatN}.txt`;
            await writeFile(path.join(dir, fn), att.prompts[j] ?? "", "utf8");
            const r = att.runs[j];
            indexEntries.push({
              file: fn,
              kind: "topk-multi",
              detail: `topK=${att.topK} variant=${r?.retrievalVariant ?? 0} window=${r?.windowIndex ?? j}`,
            });
            flatN++;
          }
        }
      }
      if (flatN > 0) {
        await writeFile(path.join(dir, "prompts-index.json"), JSON.stringify({ prompts: indexEntries }, null, 2), "utf8");
      }

      if (payload.error) {
        await writeFile(path.join(dir, "error.json"), JSON.stringify(payload.error, null, 2), "utf8");
      }
    } catch (e) {
      console.warn(
        `  ⚠️ [process-edital-debug] falha ao salvar dump (tentativas: ${[
          debugBaseDirRepo,
          debugDirFromEnv,
          debugBaseDirCwd,
          debugBaseDirTmp,
        ]
          .filter(Boolean)
          .join(" | ")}): ${(e as Error).message}`,
      );
    }
  };

  let fullContext = "";
  let contextSourceLabel = "";

  const ragFallbackPdf =
    process.env.OLLAMA_RAG_FALLBACK_PDF !== "0" && process.env.OLLAMA_RAG_FALLBACK_PDF !== "false";

  if (USE_RAG_DOCUMENTS) {
    const ragQuery = String(options?.ragQuery || "").trim();
    const field = options?.field;
    const ragGenerateTimeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || "120000", 10);

    // Retentativa dirigida pelo caller: um único top_k (não misturar com OLLAMA_RAG_TOP_K_TRY).
    const forcedInvalidK = options?.invalidRetryTopK;
    const tryTopKs =
      forcedInvalidK != null && Number.isFinite(forcedInvalidK) && forcedInvalidK > 0
        ? [Math.max(1, Math.floor(forcedInvalidK))]
        : process.env.OLLAMA_RAG_MODE?.toLowerCase().trim() === "topk" && shouldTryMultipleTopK(field)
          ? getRagTopKTryList()
          : [];
    const topKAttempts = tryTopKs.length > 0 ? tryTopKs : [getRagTopK()];

    const buildRagOpts = (topKOverride?: number) => ({
      editalId: options?.editalId,
      ...(ragQuery ? { ragQuery } : {}),
      ...(field ? { field } : {}),
      ...(topKOverride ? { topKOverride } : {}),
    });

    let bestText: string | null = null;
    let bestScore = -1_000_000;
    let bestLabel = "";
    let bestK = 0;
    let bestWindows = 0;
    let bestWinIdx = 0;
    let bestVariantIdx = 0;
    let bestWinnerJson: unknown = undefined;
    let bestWinnerPrompt = "";
    /** União do texto recuperado neste `k` (variantes de embedding) — filtro/score de valor/prazo alinhados ao RAG completo. */
    let lastRagMergeGroundingSource = "";
    const topKMultiAttempts: TopKMultiDebugAttempt[] = [];

    const defaultRagNote =
      USE_RAG_DOCUMENTS && ragQuery && ragQuery.replace(/\s+/g, " ") !== message.replace(/\s+/g, " ").trim()
        ? compactRagQueryNote(ragQuery)
        : "";

    /** Teto de prompts /api/generate por valor de top_k (várias janelas sobre o mesmo ctx RAG). */
    const maxRagGenJobsPerTopK = 48;

    for (const k of topKAttempts) {
      const seedList = ragQuery.trim().length > 0 ? [ragQuery.trim()] : [""];

      const rags = await Promise.all(
        seedList.map((seed) =>
          fetchDocumentContextByFileIds(message, fileIds, {
            ...buildRagOpts(k),
            ...(seed ? { ragQuery: seed } : {}),
          }),
        ),
      );

      const ragMergeGroundingSource = rags
        .map((x) => x.text)
        .filter((t) => String(t || "").trim().length > 0)
        .join("\n\n\n---\n\n\n");
      const fieldLowerK = (field || "").toLowerCase();
      const useRagMergedGrounding =
        (fieldLowerK === "valor_projeto" || fieldLowerK === "prazo_inscricao") &&
        ragMergeGroundingSource.trim().length > 0;
      const groundedForRagScore = (raw: string) =>
        useRagMergedGrounding
          ? applyDocumentGroundingToOllamaReplyWithSource(field, raw, ragMergeGroundingSource)
          : raw;

      type GenJob = {
        prompt: string;
        variantIdx: number;
        windowIdx: number;
        ctxChars: number;
        ctxText: string;
        ctxSig: string;
        seedPreview: string;
        sourceLabel: string;
      };
      const maxCalls = maxRagGenJobsPerTopK;
      const jobs: GenJob[] = [];

      type VariantSlice = {
        vi: number;
        seed: string;
        sourceLabel: string;
        noteBlock: string;
        windows: string[];
      };
      const variantSlices: VariantSlice[] = [];
      for (let vi = 0; vi < rags.length; vi++) {
        const rag = rags[vi]!;
        const ctx = rag.text;
        if (!ctx.trim()) continue;
        const seed = seedList[vi] ?? "";

        const maxContextChars = getMaxContextChars();
        const needsWindows = ctx.length > maxContextChars;
        const winN = needsWindows
          ? Math.min(getTruncationWindowMaxN(), computeAutoEnsembleN(ctx.length, maxContextChars))
          : 1;
        let windows = needsWindows
          ? buildEnsembleContexts(ctx, winN, maxContextChars)
          : [truncateContextForModel(ctx, maxContextChars)];

        if (shouldApplyInvalidRetryContentDiversify(options)) {
          const avoidSnap = options?.invalidRetryUsedContextSigs?.slice() ?? [];
          const seedKey = `${options?.editalId ?? ""}|${String(field || "")}|k${options?.invalidRetryTopK ?? 0}|v${options?.invalidRetryContentVariant ?? 0}`;
          windows = [diversifyContextSliceForInvalidRetry(ctx, maxContextChars, avoidSnap, seedKey)];
        }

        variantSlices.push({
          vi,
          seed,
          sourceLabel: rag.sourceLabel,
          noteBlock: defaultRagNote,
          windows,
        });
      }

      const maxWin = variantSlices.reduce((m, v) => Math.max(m, v.windows.length), 0);
      for (let wi = 0; wi < maxWin && jobs.length < maxCalls; wi++) {
        for (const vs of variantSlices) {
          if (jobs.length >= maxCalls) break;
          if (wi >= vs.windows.length) continue;
          const ctxSlice = vs.windows[wi]!;
          const nb = vs.noteBlock;
          const shiftNote = shouldApplyInvalidRetryContentDiversify(options)
            ? ` [invalid-retry-shift=v${options?.invalidRetryContentVariant ?? 1}]`
            : "";
          const docSrc =
            vs.sourceLabel.trim().length > 0
              ? `Fonte: ${vs.sourceLabel.trim()}${shiftNote}\n\n`
              : shiftNote
                ? `Fonte: (RAG)${shiftNote}\n\n`
                : "";
          const promptStr = `${buildOllamaInstructionPreamble()}${nb}${docSrc}CONTEÚDO DOS DOCUMENTOS (editais):\n${ctxSlice}\n\n---\nPERGUNTA:\n${message}`;
          jobs.push({
            prompt: promptStr,
            variantIdx: vs.vi,
            windowIdx: wi,
            ctxChars: ctxSlice.length,
            ctxText: ctxSlice,
            ctxSig: contextDebugSignature(ctxSlice, field),
            seedPreview: vs.seed.slice(0, 140),
            sourceLabel: vs.sourceLabel,
          });
        }
      }

      if (jobs.length === 0) continue;

      const ollamaNumOpts: Record<string, number> = { temperature: getOllamaExtractionTemperature() };
      const numCtx = process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : undefined;
      if (numCtx != null && numCtx > 0) ollamaNumOpts.num_ctx = numCtx;
      const numPredict = process.env.OLLAMA_NUM_PREDICT ? parseInt(process.env.OLLAMA_NUM_PREDICT, 10) : 256;
      if (numPredict > 0) ollamaNumOpts.num_predict = numPredict;

      const runOne = (promptStr: string) => callOllamaGenerateRaw(baseUrl, model, promptStr, ragGenerateTimeoutMs, ollamaNumOpts);

      const rawWindows = await Promise.all(jobs.map((j) => runOne(j.prompt)));
      const prompts = jobs.map((j) => j.prompt);
      const runs: TopKMultiDebugRun[] = rawWindows.map((r, ji) => {
        const job = jobs[ji]!;
        const trimmed = r.text.trim();
        const scoredText = r.ok && trimmed ? groundedForRagScore(r.text) : "";
        const score =
          r.ok && scoredText.trim()
            ? scoreOllamaExtractionResponse(field, scoredText, job.ctxText, {
                groundingSource: useRagMergedGrounding ? ragMergeGroundingSource : undefined,
              })
            : null;
        return {
          windowIndex: job.windowIdx,
          retrievalVariant: job.variantIdx,
          retrievalSeedPreview: job.seedPreview || undefined,
          ok: r.ok,
          status: r.status,
          score,
          contextChars: job.ctxChars,
          contextSignature: job.ctxSig,
          errText: r.errText,
          responseText: r.ok ? r.text : null,
          responseJson: r.ok ? r.json : undefined,
          promptChars: job.prompt.length,
        };
      });

      const labelJoin = [...new Set(jobs.map((j) => j.sourceLabel))].join(" | ");
      topKMultiAttempts.push({
        topK: k,
        sourceLabel: labelJoin,
        contextChars: Math.max(...jobs.map((j) => j.ctxChars), 0),
        windowCount: jobs.length,
        prompts,
        runs,
      });

      const byQuality = (a: TopKMultiDebugRun, b: TopKMultiDebugRun) => {
        const ds = (b.score ?? 0) - (a.score ?? 0);
        if (ds !== 0) return ds;
        const ga = groundedForRagScore(String(a.responseText || ""));
        const gb = groundedForRagScore(String(b.responseText || ""));
        const tb = extractionQualityTieBreak(field, gb) - extractionQualityTieBreak(field, ga);
        if (tb !== 0) return tb;
        return (
          gb.length - ga.length ||
          a.retrievalVariant - b.retrievalVariant ||
          a.windowIndex - b.windowIndex
        );
      };

      let bestInK = [...runs]
        .filter((r) => r.score != null && String(r.responseText || "").trim().length > 0)
        .sort(byQuality)[0];

      if (!bestInK || bestInK.score == null) {
        bestInK = [...runs]
          .filter((r) => r.ok && String(r.responseText || "").trim().length > 0)
          .sort(byQuality)[0];
      }
      if (!bestInK || bestInK.score == null) continue;
      const candidate = String(bestInK.responseText || "").trim();
      if (!candidate) continue;
      const score = bestInK.score;
      const winPromptIdx = runs.indexOf(bestInK);
      if (score > bestScore) {
        bestScore = score;
        bestText = candidate;
        bestLabel = jobs[winPromptIdx]?.sourceLabel ?? labelJoin;
        bestK = k;
        bestWindows = jobs.length;
        bestWinIdx = bestInK.windowIndex;
        bestVariantIdx = bestInK.retrievalVariant;
        bestWinnerJson = bestInK.responseJson;
        bestWinnerPrompt = prompts[winPromptIdx] ?? "";
        lastRagMergeGroundingSource = useRagMergedGrounding ? ragMergeGroundingSource : "";
      }
    }

    if (bestText) {
      contextSourceLabel = `${bestLabel} [topk-try winner k=${bestK} variant=${bestVariantIdx} win#=${bestWinIdx + 1}/${bestWindows} score=${bestScore}]`;
      if (process.env.OLLAMA_VERBOSE === "1" || saveDebug) {
        console.log(`  📑 Ollama RAG: ${contextSourceLabel}`);
        if (saveDebug && topKMultiAttempts.length > 0) {
          for (const att of topKMultiAttempts) {
            for (const r of att.runs) {
              const prev = (r.responseText || "").replace(/\s+/g, " ").trim().slice(0, 360);
              console.log(
                `  🐛 [topk-try] k=${att.topK} v=${r.retrievalVariant} w=${r.windowIndex + 1}/${att.windowCount} ok=${r.ok} score=${r.score}${r.errText ? ` err=${String(r.errText).slice(0, 120)}` : ""}`,
              );
              if (r.ok && prev.length > 0) {
                console.log(`      resposta: ${prev}${(r.responseText || "").trim().length > 360 ? "…" : ""}`);
              }
            }
          }
          console.log(
            `  🐛 [topk-try] vencedor: k=${bestK} variante=#${bestVariantIdx} janela=#${bestWinIdx + 1} score=${bestScore} (${bestLabel})`,
          );
        }
      }
      if (saveDebug && topKMultiAttempts.length > 0) {
        let winnerPromptForDebug = bestWinnerPrompt;
        if (!winnerPromptForDebug) {
          for (const att of topKMultiAttempts) {
            if (att.topK !== bestK) continue;
            const wi = att.runs.findIndex(
              (r) => r.windowIndex === bestWinIdx && r.retrievalVariant === bestVariantIdx,
            );
            if (wi >= 0) {
              winnerPromptForDebug = att.prompts[wi] ?? "";
              break;
            }
          }
        }
        if (!winnerPromptForDebug) {
          winnerPromptForDebug = topKMultiAttempts[0]?.prompts?.[0] ?? "";
        }
        await writeDebugFiles({
          promptText: winnerPromptForDebug,
          request: {
            baseUrl,
            model,
            field: options?.field ?? null,
            editalId: options?.editalId ?? null,
            fileIds,
            contextSourceLabel,
            mode: "rag-topk-attempts",
            topKTried: topKAttempts,
            winner: {
              topK: bestK,
              windowIndex: bestWinIdx,
              retrievalVariant: bestVariantIdx,
              score: bestScore,
              sourceLabel: bestLabel,
              windowsTried: bestWindows,
            },
            attemptsCount: topKMultiAttempts.length,
            timeoutMs: ragGenerateTimeoutMs,
            options: (() => {
              const o: Record<string, number> = { temperature: getOllamaExtractionTemperature() };
              const numCtx = process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : undefined;
              if (numCtx != null && numCtx > 0) o.num_ctx = numCtx;
              const numPredict = process.env.OLLAMA_NUM_PREDICT ? parseInt(process.env.OLLAMA_NUM_PREDICT, 10) : 256;
              if (numPredict > 0) o.num_predict = numPredict;
              return o;
            })(),
          },
          responseJson: bestWinnerJson,
          responseText: bestText,
          topKMultiDebug: {
            winner: {
              topK: bestK,
              windowIndex: bestWinIdx,
              retrievalVariant: bestVariantIdx,
              score: bestScore,
              sourceLabel: bestLabel,
            },
            attempts: topKMultiAttempts,
          },
        });
      }
      const flRag = (options?.field || "").toLowerCase();
      const mergedRag = lastRagMergeGroundingSource.trim();
      const applyRagGround = (raw: string) =>
        mergedRag && (flRag === "valor_projeto" || flRag === "prazo_inscricao")
          ? applyDocumentGroundingToOllamaReplyWithSource(options?.field, raw, mergedRag)
          : applyDocumentGroundingToOllamaReply(options?.field, raw, bestWinnerPrompt);

      let groundedRag = applyRagGround(bestText);
      if (flRag === "prazo_inscricao" && prazoGroundingRemovedAllRawPrazos(bestText, groundedRag)) {
        const nExtra = getPrazoAnchorRetryMax();
        const ragOpts: Record<string, number> = { temperature: getOllamaExtractionTemperature() };
        const numCtxR = process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : undefined;
        if (numCtxR != null && numCtxR > 0) ragOpts.num_ctx = numCtxR;
        const numPredictR = process.env.OLLAMA_NUM_PREDICT ? parseInt(process.env.OLLAMA_NUM_PREDICT, 10) : 256;
        if (numPredictR > 0) ragOpts.num_predict = numPredictR;
        let basePrompt = bestWinnerPrompt || "";
        for (let ri = 0; ri < nExtra; ri++) {
          const retryPrompt = basePrompt.includes("\n---\nPERGUNTA:\n")
            ? basePrompt.replace(/\n---\nPERGUNTA:\n/, `${PRAZO_ANCHOR_RETRY_CONTEXT_HINT}\n\n---\nPERGUNTA:\n`)
            : `${basePrompt}${PRAZO_ANCHOR_RETRY_CONTEXT_HINT}`;
          console.warn(`  🔁 prazo_inscricao: retentativa RAG ${ri + 1}/${nExtra} (1.ª resposta tinha datas sem âncora no documento).`);
          const r2 = await callOllamaGenerateRaw(baseUrl, model, retryPrompt, ragGenerateTimeoutMs, ragOpts);
          if (!r2.ok || !r2.text.trim()) continue;
          const g2 = applyRagGround(r2.text);
          if (countNonemptyPrazoStringsInJson(g2) > countNonemptyPrazoStringsInJson(groundedRag)) {
            groundedRag = g2;
          }
          if (countNonemptyPrazoStringsInJson(groundedRag) > 0) break;
        }
      }
      return groundedRag;
    }

    // Se nenhuma tentativa top-k deu bom, cai no fallback PDF abaixo.
    if (ragFallbackPdf) {
      console.warn(
        "  ℹ️ Ollama RAG: `documents`/pgvector sem texto útil nesta chamada; usando PDF no storage (pdf-parse). " +
          "Veja aviso `RAG diagnóstico` acima se existir. Ordenação: nome_arquivo + relevância ao texto do edital.",
      );
      const sections = await buildPdfFallbackContextSections(fileIds);
      fullContext = sections.join("\n\n");
      contextSourceLabel =
        fullContext.length > 0
          ? "PDF via storage + pdf-parse (fallback; não veio de documents.content)"
          : "(RAG vazio)";
    }

    if (fullContext.length === 0) {
      console.warn(
        "  ⚠️ Ollama RAG: sem contexto (documents vazio e fallback PDF falhou). Confirme índice em documents(file_id), rode populate, ou defina OLLAMA_USE_RAG=0 para só PDF.",
      );
      return null;
    }
  } else {
    const sections = await buildPdfFallbackContextSections(fileIds);
    fullContext = sections.join("\n\n");
    contextSourceLabel = "PDF via storage (OLLAMA_USE_RAG=0)";
    if (fullContext.length === 0) {
      console.warn("  ⚠️ Ollama: nenhum texto extraído dos PDFs.");
      return null;
    }
  }

  fullContext = sanitizePdfPageMarkersInContext(fullContext);

  const maxContextChars = getMaxContextChars();
  const ragQuery = String(options?.ragQuery || "").trim();
  const fieldForContext = options?.field;
  const configuredEnsembleN = getGenerationEnsembleN();
  const autoEnsemble = isGenerationEnsembleAuto();
  if (autoEnsemble && configuredEnsembleN >= 2 && process.env.OLLAMA_VERBOSE === "1") {
    console.warn(
      `  ⚠️ Ollama ensemble: OLLAMA_GENERATION_ENSEMBLE_AUTO está ligado; ignorando OLLAMA_GENERATION_ENSEMBLE_N=${configuredEnsembleN} (usando N automático).`,
    );
  }
  const ensembleN = autoEnsemble
    ? computeAutoEnsembleN(fullContext.length, maxContextChars)
    : configuredEnsembleN >= 2
      ? configuredEnsembleN
      : 0;
  const poolMult = Math.max(2, parseInt(process.env.OLLAMA_GENERATION_ENSEMBLE_POOL_MULT || "3", 10) || 3);

  let contextBodies: string[];
  const scanOn = isFullDocumentScanOn(fieldForContext);
  const scanPasses = getFullDocumentScanPasses();
  const shouldScan = scanOn && fullContext.length > maxContextChars;

  if (shouldScan) {
    contextBodies = buildFullDocumentScanWindows(fullContext, maxContextChars, scanPasses);
    if (process.env.OLLAMA_VERBOSE === "1") {
      console.log(
        `  🔎 Ollama scan: varrendo documento inteiro em janelas (passes=${scanPasses}, windows=${contextBodies.length}, max_ctx=${maxContextChars})`,
      );
    }
  } else if (ensembleN >= 2) {
    const poolCap = useFullContextForEnsemble() ? fullContext.length : Math.min(fullContext.length, maxContextChars * poolMult);
    const pool = useFullContextForEnsemble() ? fullContext : fullContext.slice(0, poolCap);
    contextBodies = buildEnsembleContexts(pool, ensembleN, maxContextChars);
    if (process.env.OLLAMA_VERBOSE === "1") {
      console.log(
        `  🧩 Ollama ensemble: ${contextBodies.length} chamadas paralelas ao /api/generate (pool=${poolCap} chars, max_ctx=${maxContextChars})`,
      );
    }
  } else {
    if (fullContext.length <= maxContextChars) {
      contextBodies = [fullContext];
    } else {
      const focusSeed =
        ragQuery ||
        String(message || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 480);
      const minRelChars = Math.max(1600, Math.floor(maxContextChars * 0.12));
      const rel =
        focusSeed.length >= 8
          ? pickPdfWindowByRelevance(fullContext, focusSeed, maxContextChars, fieldForContext).trim()
          : "";
      if (rel.length >= minRelChars) {
        contextBodies = [rel];
        if (!contextSourceLabel.includes("recorte lexical")) {
          contextSourceLabel = `${contextSourceLabel} +recorte lexical (ragQuery+campo; não substitui pgvector)`;
        }
      } else {
        contextBodies = [
          fullContext.slice(0, maxContextChars) + "\n\n[... texto truncado ...]",
        ];
      }
    }
  }

  // IMPORTANT: quando estamos em modo scan (varrer documento inteiro), não devemos colapsar as janelas
  // num único recorte aleatório do corpus completo, senão todas as janelas ficam iguais e perdemos cobertura.
  if (shouldApplyInvalidRetryContentDiversify(options) && contextBodies.length > 0 && !shouldScan) {
    const v0 = Math.max(1, Math.floor(options?.invalidRetryContentVariant ?? 1));
    const avoidSnap = options?.invalidRetryUsedContextSigs?.slice() ?? [];
    const seedKeyBase = `${options?.editalId ?? ""}|${String(options?.field || "")}|k${options?.invalidRetryTopK ?? 0}|v${options?.invalidRetryContentVariant ?? 0}`;
    contextBodies = contextBodies.map((b, wi) =>
      diversifyContextSliceForInvalidRetry(
        pickCorpusForInvalidRetryDiversify(b, fullContext),
        maxContextChars,
        avoidSnap,
        `${seedKeyBase}|w${wi}`,
      ),
    );
    if (!contextSourceLabel.includes("invalid-retry-shift")) {
      contextSourceLabel = `${contextSourceLabel} [invalid-retry-shift=v${v0}]`;
    }
  }

  const context = contextBodies[0] || "";

  // Debug: UPDATE_EDITAL_DEBUG_CONTENT=1 (package.json em update/process-edital-info ou .env)
  const updateEditalContentDebug =
    process.env.UPDATE_EDITAL_DEBUG_CONTENT === "1" ||
    process.env.UPDATE_EDITAL_DEBUG_CONTENT === "true";
  if (updateEditalContentDebug && context.length > 0) {
    const maxDbg = getDebugContextPreviewChars();
    const preview = (body: string) =>
      body.length > maxDbg
        ? `${body.slice(0, maxDbg)}\n... [debug: +${body.length - maxDbg} caracteres omitidos]`
        : body;
    const sanitizedNote =
      process.env.OLLAMA_NO_SANITIZE_PAGE_MARKERS === "1"
        ? " (sanitização de marcadores de página desligada)"
        : " (marcadores tipo «-- N of M --» removidos antes do prompt, se existirem)";
    if (contextBodies.length > 1) {
      const sigs = contextBodies
        .map((b, i) => `  - #${i + 1}: ${contextDebugSignature(b, options?.field)} (chars=${b.length})`)
        .join("\n");
      console.log(`  🐛 [update-edital-debug] ensemble context signatures:\n${sigs}`);
    }
    console.log(
      `  🐛 [update-edital-debug] FONTE: ${contextSourceLabel}${sanitizedNote}\n` +
        `  🐛 [update-edital-debug] CONTEÚDO enviado ao Ollama (preview do #1): ${context.length} caracteres (preview até ${maxDbg}):\n${"─".repeat(60)}\n${preview(context)}\n${"─".repeat(60)}`,
    );
  }

  const ragQueryNote =
    USE_RAG_DOCUMENTS && ragQuery && ragQuery.replace(/\s+/g, " ") !== message.replace(/\s+/g, " ").trim()
      ? compactRagQueryNote(ragQuery)
      : "";

  const sentBodiesForRetrySig = contextBodies;
  const primaryCtxKey =
    (sentBodiesForRetrySig[0] || "").length > 0
      ? contextInvalidRetryDiversityKey(sentBodiesForRetrySig[0]!).slice(0, 72)
      : "";
  if (
    primaryCtxKey &&
    shouldApplyInvalidRetryContentDiversify(options) &&
    !contextSourceLabel.includes("[ctx~")
  ) {
    contextSourceLabel = `${contextSourceLabel} [ctx~${primaryCtxKey}]`;
  }
  recordInvalidRetrySentContextFingerprints(options, sentBodiesForRetrySig);

  const buildPromptForContextBody = (
    ctxBody: string,
    readingFocus?: string,
    readingFocusDistinctSlices?: boolean,
    relevanceBasedPdfSlices?: boolean,
    documentSourceLine?: string,
  ) => {
    const focusTrim = readingFocus && String(readingFocus).trim().length > 0 ? String(readingFocus).trim() : "";
    const focusHead =
      focusTrim.length > 720 ? `${focusTrim.slice(0, 720)}…` : focusTrim;
    const focusNote =
      focusTrim.length > 0
        ? relevanceBasedPdfSlices
          ? `Relevância: ${focusHead}\n\n`
          : readingFocusDistinctSlices
            ? `Trecho: ${focusHead}\n\n`
            : `Foco: ${focusHead}\n\n`
        : "";
    const docSrc =
      documentSourceLine && documentSourceLine.trim().length > 0
        ? `Fonte: ${documentSourceLine.trim()}\n\n`
        : "";
    return `${buildOllamaInstructionPreamble()}${ragQueryNote}${docSrc}${focusNote}CONTEÚDO DOS DOCUMENTOS (editais):
${ctxBody}

---
PERGUNTA:
${message}`;
  };

  const prompts = contextBodies.map((b) =>
    buildPromptForContextBody(b, undefined, undefined, undefined, contextSourceLabel),
  );
  let debugPromptDump = prompts[0] || "";
  const promptChars = prompts.reduce((m, p) => Math.max(m, p.length), 0);
  const estimatedTokens = Math.ceil(promptChars / 3);
  console.log(
    `  📐 Ollama: até ${promptChars} chars/prompt (~${estimatedTokens} tokens max), contexto max=${maxContextChars} chars, ensemble=${prompts.length}, timeout ${process.env.OLLAMA_TIMEOUT_MS || "120000"}ms`,
  );

  const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || "120000", 10);

  try {
    const ollamaNumOpts: Record<string, number> = { temperature: getOllamaExtractionTemperature() };
    const numCtx = process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : undefined;
    if (numCtx != null && numCtx > 0) ollamaNumOpts.num_ctx = numCtx;
    const numPredict = process.env.OLLAMA_NUM_PREDICT ? parseInt(process.env.OLLAMA_NUM_PREDICT, 10) : 256;
    if (numPredict > 0) ollamaNumOpts.num_predict = numPredict;

    const runOneGenerate = async (promptStr: string, idx: number) => {
      const r = await callOllamaGenerateRaw(baseUrl, model, promptStr, timeoutMs, ollamaNumOpts);
      return { idx, ...r };
    };

    // Modo scan: executar sequencialmente (para parar cedo quando “pegou”).
    const rawResults: Array<{ idx: number; ok: boolean; status: number; text: string; json?: unknown; errText?: string }> = [];
    if (shouldScan) {
      const fieldLower = (options?.field || "").toLowerCase();
      const minPasses = scanPasses;
      const windowsPerPass =
        fullContext.length > maxContextChars ? Math.max(1, Math.ceil(contextBodies.length / minPasses)) : contextBodies.length;

      let foundExpected = false;
      for (let i = 0; i < prompts.length; i++) {
        const r = await runOneGenerate(prompts[i]!, i);
        rawResults.push(r);
        if (!r.ok || !String(r.text || "").trim()) continue;
        const grounded = applyDocumentGroundingToOllamaReplyWithSource(options?.field, r.text, fullContext);
        const score = scoreOllamaExtractionResponse(options?.field, grounded, contextBodies[i] || "", {
          groundingSource:
            (fieldLower === "valor_projeto" || fieldLower === "prazo_inscricao") && fullContext.trim() ? fullContext : undefined,
        });
        if (score >= 105 && extractionLooksExpectedForField(options?.field, grounded)) {
          foundExpected = true;
          // “Pelo menos duas vezes”: só parar cedo depois de completar 2 passagens (ou se já passámos 2 janelas do documento todo).
          const passIdx = Math.floor(i / windowsPerPass);
          if (passIdx + 1 >= 2) break;
        }
      }
      if (!foundExpected && process.env.OLLAMA_VERBOSE === "1") {
        console.warn(`  ⚠️ Ollama scan: nenhuma janela atingiu o critério de “esperado”; devolvendo o melhor score.`);
      }
    } else {
      rawResults.push(...(await Promise.all(prompts.map((p, i) => runOneGenerate(p, i)))));
    }

    const ctxBodyForRun = (idx: number) => contextBodies[idx] || "";

    const fieldLowerEns = (options?.field || "").toLowerCase();
    const ensembleGroundingSource =
      (fieldLowerEns === "valor_projeto" || fieldLowerEns === "prazo_inscricao") && fullContext.trim()
        ? fullContext
        : undefined;

    const ensembleRunsDebug: EnsembleDebugRun[] = rawResults.map((r) => {
      const raw = r.ok ? String(r.text || "") : "";
      const grounded = r.ok ? applyDocumentGroundingToOllamaReplyWithSource(options?.field, raw, fullContext) : "";
      return {
        idx: r.idx,
        ok: r.ok,
        status: r.status,
        score:
          r.ok && raw.trim()
            ? scoreOllamaExtractionResponse(options?.field, grounded, ctxBodyForRun(r.idx), {
                groundingSource: ensembleGroundingSource,
              })
            : null,
        contextChars: ctxBodyForRun(r.idx).length,
        contextSignature: contextDebugSignature(ctxBodyForRun(r.idx), options?.field),
        errText: r.errText,
        responseText: r.ok ? raw : null,
        responseJson: r.ok ? r.json : undefined,
        promptChars: prompts[r.idx]?.length ?? 0,
      };
    });

    const requestDebugBase = {
      baseUrl,
      model,
      field: options?.field ?? null,
      editalId: options?.editalId ?? null,
      fileIds,
      contextSourceLabel,
      fullContextChars: fullContext.length,
      sentContextCharsEach: contextBodies.map((c) => c.length),
      ensemble: prompts.length,
      promptChars,
      estimatedTokens,
      timeoutMs,
      options: Object.keys(ollamaNumOpts).length > 0 ? ollamaNumOpts : {},
    };

    const scored = rawResults
      .filter((r) => r.ok && r.text.trim().length > 0)
      .map((r) => {
        const grounded = applyDocumentGroundingToOllamaReplyWithSource(options?.field, r.text, fullContext);
        return {
          ...r,
          groundedText: grounded,
          score: scoreOllamaExtractionResponse(options?.field, grounded, ctxBodyForRun(r.idx), {
            groundingSource: ensembleGroundingSource,
          }),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          extractionQualityTieBreak(options?.field, b.groundedText || b.text) -
            extractionQualityTieBreak(options?.field, a.groundedText || a.text) ||
          (b.groundedText || b.text).length - (a.groundedText || a.text).length ||
          a.idx - b.idx,
      );

    const best = scored[0];

    const logEnsembleToConsole =
      prompts.length > 1 &&
      (updateEditalContentDebug || saveDebug || process.env.OLLAMA_VERBOSE === "1");
    if (logEnsembleToConsole) {
      for (const r of ensembleRunsDebug) {
        const prev = (r.responseText || "").replace(/\s+/g, " ").trim().slice(0, 420);
        console.log(
          `  🐛 [ensemble] #${r.idx + 1}/${prompts.length} ok=${r.ok} score=${r.score}${r.errText ? ` err=${String(r.errText).slice(0, 160)}` : ""}`,
        );
        if (r.ok && prev.length > 0) {
          console.log(
            `      resposta: ${prev}${(r.responseText || "").trim().length > 420 ? "…" : ""}`,
          );
        }
      }
      if (best) {
        console.log(`  🐛 [ensemble] vencedor: #${best.idx + 1} score=${best.score}`);
      } else {
        console.log(`  🐛 [ensemble] vencedor: (nenhuma resposta válida para pontuar)`);
      }
    }

    if (best) {
      debugPromptDump = prompts[best.idx] || debugPromptDump;
      if (prompts.length > 1 && process.env.OLLAMA_VERBOSE === "1") {
        console.log(
          `  🏆 Ollama ensemble: vencedor prompt #${best.idx + 1}/${prompts.length} score=${best.score}`,
        );
      }
      let grounded =
        (best.groundedText ?? "").trim().length > 0
          ? (best.groundedText as string)
          : applyDocumentGroundingToOllamaReplyWithSource(options?.field, best.text, fullContext);
      let responseJsonOut: unknown = best.json;
      let prazoAnchorExtraCalls = 0;
      if (
        (options?.field || "").toLowerCase() === "prazo_inscricao" &&
        prazoGroundingRemovedAllRawPrazos(best.text, grounded)
      ) {
        const nExtra = getPrazoAnchorRetryMax();
        const basePrompt = prompts[best.idx] || "";
        for (let ri = 0; ri < nExtra; ri++) {
          const retryPrompt = basePrompt.includes("\n---\nPERGUNTA:\n")
            ? basePrompt.replace(/\n---\nPERGUNTA:\n/, `${PRAZO_ANCHOR_RETRY_CONTEXT_HINT}\n\n---\nPERGUNTA:\n`)
            : `${basePrompt}${PRAZO_ANCHOR_RETRY_CONTEXT_HINT}`;
          console.warn(`  🔁 prazo_inscricao: retentativa PDF/ensemble ${ri + 1}/${nExtra} (1.ª resposta tinha datas sem âncora no documento).`);
          const r2 = await runOneGenerate(retryPrompt, best.idx);
          prazoAnchorExtraCalls++;
          if (!r2.ok || !r2.text.trim()) continue;
          const g2 = applyDocumentGroundingToOllamaReplyWithSource(options?.field, r2.text, fullContext);
          if (countNonemptyPrazoStringsInJson(g2) > countNonemptyPrazoStringsInJson(grounded)) {
            grounded = g2;
            responseJsonOut = r2.json;
          }
          if (countNonemptyPrazoStringsInJson(grounded) > 0) break;
        }
      }
      await writeDebugFiles({
        promptText: prompts[best.idx] || "",
        request: {
          ...requestDebugBase,
          status: best.status,
          ensembleWinner: { index: best.idx, score: best.score },
          ensembleScores: ensembleRunsDebug.map((r) => ({
            idx: r.idx,
            ok: r.ok,
            score: r.score,
            contextChars: r.contextChars,
          })),
          prazoAnchorExtraCalls: prazoAnchorExtraCalls > 0 ? prazoAnchorExtraCalls : undefined,
        },
        responseJson: responseJsonOut,
        responseText: grounded,
        ensembleDebug:
          prompts.length > 1
            ? {
                winnerIndex: best.idx,
                winnerScore: best.score,
                runs: ensembleRunsDebug,
                prompts,
              }
            : undefined,
      });
      return grounded.trim().length > 0 ? grounded : null;
    }

    const summary = rawResults.map((r) => `${r.idx}:${r.ok ? "ok" : "err"}:${r.errText || r.status}`).join(" | ");
    console.warn(`  ⚠️ Ollama ensemble: todas as ${prompts.length} chamadas falharam ou vieram vazias. ${summary.slice(0, 500)}`);
    await writeDebugFiles({
      promptText: prompts[0] || "",
      request: {
        ...requestDebugBase,
        status: rawResults[0]?.status ?? 0,
        ensembleWinner: null,
        ensembleScores: ensembleRunsDebug.map((r) => ({
          idx: r.idx,
          ok: r.ok,
          err: r.errText,
          score: r.score,
          contextChars: r.contextChars,
        })),
      },
      responseText: null,
      ensembleDebug:
        prompts.length > 1
          ? {
              winnerIndex: null,
              winnerScore: null,
              runs: ensembleRunsDebug,
              prompts,
            }
          : undefined,
    });
    return null;
  } catch (e) {
    const err = e as Error & { name?: string; cause?: Error };
    if (err.name === "AbortError") {
      console.warn(`  ⚠️ Ollama timeout após ${timeoutMs}ms (~${estimatedTokens} tokens no prompt).`);
      console.warn(`  💡 Limite a saída: OLLAMA_NUM_PREDICT=200 no .env.local. Se ainda falhar: aumente OLLAMA_TIMEOUT_MS ou use modelo menor (ex.: qwen2.5:0.5b).`);
    } else {
      const msg = err.message || String(e);
      console.warn("  ⚠️ Erro ao chamar Ollama:", msg);
      const causeMsg = (err.cause as Error)?.message || "";
      if (causeMsg.includes("Headers Timeout") || msg.toLowerCase().includes("headers timeout")) {
        console.warn(`  💡 O cliente HTTP cortou a conexão antes do Ollama responder (timeout de headers ~5 min). O script agora usa undici com headersTimeout=${timeoutMs}ms; se ainda falhar, reduza OLLAMA_MAX_CONTEXT_CHARS ou OLLAMA_MAX_CHUNKS.`);
      } else if (msg.toLowerCase().includes("fetch failed") || msg.toLowerCase().includes("econnrefused") || msg.toLowerCase().includes("enotfound")) {
        const base = getOllamaBase();
        console.warn(`  💡 Verifique: (1) Ollama está rodando? (2) URL correta? OLLAMA_BASE_URL deve ser http://host:11434 (não https nessa porta). Atual: ${base} (3) curl ${base}/api/tags`);
        if (causeMsg) console.warn("  Causa:", causeMsg);
      }
    }
    await writeDebugFiles({
      promptText: debugPromptDump,
      request: {
        baseUrl,
        model,
        field: options?.field ?? null,
        editalId: options?.editalId ?? null,
        fileIds,
        contextSourceLabel,
        fullContextChars: fullContext.length,
        sentContextChars: context.length,
        promptChars,
        estimatedTokens,
        timeoutMs,
      },
      error: { message: err.message || String(e), name: err.name, cause: (err.cause as Error | undefined)?.message },
    });
    return null;
  }
}
