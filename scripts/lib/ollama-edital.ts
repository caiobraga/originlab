/**
 * Extração de informações de edital via Ollama local.
 * Busca PDFs no Supabase Storage (ou contexto da tabela documents) e envia ao modelo.
 * Use USE_OLLAMA=true no .env para ativar (em vez do webhook n8n).
 *
 * Timeout: causas comuns e o que fazer
 * - Contexto grande (muitos chars/tokens): reduza OLLAMA_MAX_CONTEXT_CHARS (ex: 40000).
 * - Modelo 7B em CPU é lento: aumente OLLAMA_TIMEOUT_MS (ex: 300000) ou use modelo menor (qwen2.5:3b).
 * - Rode com OLLAMA_VERBOSE=1 para ver tamanho do prompt e ajustar.
 * - Timeout na tabela documents: a coluna `content` existe, mas um SELECT gigante com texto grande estoura o statement timeout.
 *   O script usa 2 fases (só `id` → depois `content` em lotes). Ainda assim, crie índice: `scripts/db/migration-documents-index-file-id.sql`.
 *   `OLLAMA_RAG_CONTENT_BATCH_SIZE` (default 30) = linhas por pedido ao buscar `content`.
 * - RAG vazio: por defeito tenta PDF do storage (`OLLAMA_RAG_FALLBACK_PDF=0` para desligar).
 * - Paralelismo (sem threads): `OLLAMA_FIELD_CONCURRENCY` (default 3) extrai vários campos por edital ao mesmo tempo; `PROCESS_EDITAL_CONCURRENCY` (default 2 com USE_OLLAMA) processa vários editais em paralelo no batch (`api:process-edital-info`). Ver `scripts/lib/process-edital-delays.ts`.
 * - `UPDATE_EDITAL_DEBUG_CONTENT=1`: imprime preview do bloco "CONTEÚDO DOS DOCUMENTOS" antes do Ollama (`api:update-edital-info` e `api:process-edital-info` no package.json). `UPDATE_EDITAL_DEBUG_CONTENT_CHARS` (default 1500) limita o preview. Mostra também a **fonte** (ex.: coluna `content` em `documents` vs PDF no storage). Para rodar sem preview no batch: `UPDATE_EDITAL_DEBUG_CONTENT=0 npx tsx scripts/api/processEditalInfo.ts`.
 * - `OLLAMA_RAG_CONTENT_ONLY=1`: só lê a coluna `content` em `documents` (não tenta name/data/text…).
 * - `OLLAMA_NO_SANITIZE_PAGE_MARKERS=1`: não remove marcadores tipo `-- 1 of 48 --` do texto antes do prompt.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "edital-pdfs";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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
 */
function joinDocumentRowsToContext(rows: Record<string, unknown>[], col: string): string {
  const withIndex = rows.map((r) => {
    const meta = r.metadata as Record<string, unknown> | undefined;
    const idx = typeof meta?.chunk_index === "number" ? meta.chunk_index : -1;
    return { row: r, chunkIndex: idx };
  });
  withIndex.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const parts: string[] = [];
  for (const { row: r } of withIndex) {
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

function joinMatchedRowsToContext(rows: MatchDocumentsRow[]): string {
  const parts: string[] = [];
  for (const r of rows) {
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
  return Math.max(1, parseInt(process.env.OLLAMA_RAG_TOP_K || "6", 10) || 6);
}

function getOllamaBase(): string {
  return (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
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
  opts?: { editalId?: string },
): Promise<RagDocumentContextResult | null> {
  const empty = (label: string): RagDocumentContextResult => ({ text: "", sourceLabel: label });
  if (!supabase) return empty("(sem supabase)");

  const queryEmbedding = await embedQueryWithOllama(question);
  if (!queryEmbedding) return null;

  const resolvedIds = await resolveFileIdsForDocuments(fileIds);
  if (resolvedIds.length === 0) return null;

  const topK = getRagTopK();
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
    return null;
  }

  const rows = (data || []) as MatchDocumentsRow[];
  const ctx = joinMatchedRowsToContext(rows);
  if (!ctx.trim()) return null;
  return {
    text: ctx,
    sourceLabel: `documents.content (pgvector top-k=${topK})`,
  };
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
  opts?: { editalId?: string },
): Promise<RagDocumentContextResult> {
  const empty = (label: string): RagDocumentContextResult => ({ text: "", sourceLabel: label });

  if (!supabase || fileIds.length === 0) return empty("(sem supabase ou file ids)");

  // RAG “de verdade” (top-k por similaridade) — parecido com LlamaIndex similarity_top_k.
  // Se a RPC não existir/der erro, cai no modo antigo (concat por file_id).
  const mode = (process.env.OLLAMA_RAG_MODE || "topk").toLowerCase().trim();
  if (mode !== "concat") {
    const hit = await fetchDocumentContextBySimilarityTopK(question, fileIds, opts).catch(() => null);
    if (hit && hit.text.trim().length > 0) return hit;
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
  const contentColumns = contentOnly
    ? ["content"]
    : ["content", "data", "value", "text", "body", "page_content", "chunk", "name"];
  const ragSelectLimit = Math.max(100, parseInt(process.env.OLLAMA_RAG_DOCUMENTS_LIMIT || "2000", 10) || 2000);

  const tryColumnWithIds = async (
    col: string,
    candidateIds: string[],
    sourceHint: string,
  ): Promise<RagDocumentContextResult | null> => {
    if (candidateIds.length === 0) return null;
    const { rows, error } = await fetchDocumentRowsByIdsBatched(supabase, candidateIds, col);
    if (error) {
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

  return empty("(nenhuma coluna com texto útil em documents)");
}

async function fetchPdfBuffer(fileId: string): Promise<Buffer | null> {
  if (!supabase) return null;
  const ref = String(fileId || "").trim();
  if (!ref) return null;

  let storagePath = ref;
  if (!ref.includes("/")) {
    const { data: pdfRecord } = await supabase
      .from("edital_pdfs")
      .select("caminho_storage")
      .eq("id", ref)
      .maybeSingle();
    if (pdfRecord?.caminho_storage) {
      storagePath = pdfRecord.caminho_storage;
    } else {
      const { data: obj } = await supabase
        .from("storage.objects")
        .select("name")
        .eq("id", ref)
        .maybeSingle();
      if (obj?.name) storagePath = obj.name;
    }
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

/**
 * Busca PDFs pelos file_ids, extrai texto e chama o Ollama com a pergunta.
 * Retorna o texto gerado pelo modelo ou null em caso de erro.
 */
export async function extractInfoViaOllama(
  message: string,
  fileIds: string[],
  options?: { editalId?: string },
): Promise<string | null> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";

  if (!fileIds || fileIds.length === 0) return null;
  if (!supabase) {
    console.warn("  ⚠️ Ollama: Supabase não configurado.");
    return null;
  }

  let fullContext = "";
  let contextSourceLabel = "";

  const ragFallbackPdf =
    process.env.OLLAMA_RAG_FALLBACK_PDF !== "0" && process.env.OLLAMA_RAG_FALLBACK_PDF !== "false";

  if (USE_RAG_DOCUMENTS) {
    const rag = await fetchDocumentContextByFileIds(message, fileIds, { editalId: options?.editalId });
    fullContext = rag.text;
    if (fullContext.length > 0) {
      contextSourceLabel = rag.sourceLabel;
      if (process.env.OLLAMA_VERBOSE === "1") {
        console.log(`  📑 Ollama RAG: ${contextSourceLabel} — ${fullContext.length} caracteres`);
      }
    } else if (ragFallbackPdf) {
      console.warn(
        "  ℹ️ Ollama RAG: documents sem texto útil; usando extração direta do PDF no storage (não é a coluna content).",
      );
      const textParts: string[] = [];
      for (const fileId of fileIds) {
        const buffer = await fetchPdfBuffer(fileId);
        if (!buffer) {
          console.warn(`  ⚠️ Ollama fallback: não foi possível baixar PDF ${fileId}`);
          continue;
        }
        const text = await extractTextFromPdf(buffer);
        if (text.length > 0) {
          textParts.push(`--- Documento ${fileId.slice(0, 8)} ---\n${text}`);
        }
      }
      fullContext = textParts.join("\n\n");
      contextSourceLabel =
        fullContext.length > 0
          ? "PDF via storage + pdf-parse (fallback; não veio de documents.content)"
          : rag.sourceLabel || "(RAG vazio)";
    }

    if (fullContext.length === 0) {
      console.warn(
        "  ⚠️ Ollama RAG: sem contexto (documents vazio e fallback PDF falhou). Confirme índice em documents(file_id), rode populate, ou defina OLLAMA_USE_RAG=0 para só PDF.",
      );
      return null;
    }
  } else {
    const textParts: string[] = [];
    for (const fileId of fileIds) {
      const buffer = await fetchPdfBuffer(fileId);
      if (!buffer) {
        console.warn(`  ⚠️ Ollama: não foi possível baixar PDF ${fileId}`);
        continue;
      }
      const text = await extractTextFromPdf(buffer);
      if (text.length > 0) {
        textParts.push(`--- Documento ${fileId.slice(0, 8)} ---\n${text}`);
      }
    }
    fullContext = textParts.join("\n\n");
    contextSourceLabel = "PDF via storage (OLLAMA_USE_RAG=0)";
    if (fullContext.length === 0) {
      console.warn("  ⚠️ Ollama: nenhum texto extraído dos PDFs.");
      return null;
    }
  }

  fullContext = sanitizePdfPageMarkersInContext(fullContext);

  const maxContextChars = getMaxContextChars();
  const context =
    fullContext.length > maxContextChars
      ? fullContext.slice(0, maxContextChars) + "\n\n[... texto truncado ...]"
      : fullContext;

  // Debug: UPDATE_EDITAL_DEBUG_CONTENT=1 (package.json em update/process-edital-info ou .env)
  const updateEditalContentDebug =
    process.env.UPDATE_EDITAL_DEBUG_CONTENT === "1" ||
    process.env.UPDATE_EDITAL_DEBUG_CONTENT === "true";
  if (updateEditalContentDebug && context.length > 0) {
    const maxDbg = Math.max(
      200,
      parseInt(process.env.UPDATE_EDITAL_DEBUG_CONTENT_CHARS || "1500", 10) || 1500,
    );
    const preview =
      context.length > maxDbg
        ? `${context.slice(0, maxDbg)}\n... [debug: +${context.length - maxDbg} caracteres omitidos]`
        : context;
    const sanitizedNote =
      process.env.OLLAMA_NO_SANITIZE_PAGE_MARKERS === "1"
        ? " (sanitização de marcadores de página desligada)"
        : " (marcadores tipo «-- N of M --» removidos antes do prompt, se existirem)";
    console.log(
      `  🐛 [update-edital-debug] FONTE: ${contextSourceLabel}${sanitizedNote}\n` +
        `  🐛 [update-edital-debug] CONTEÚDO enviado ao Ollama: ${context.length} caracteres (preview até ${maxDbg}):\n${"─".repeat(60)}\n${preview}\n${"─".repeat(60)}`,
    );
  }

  const prompt = `Você é um assistente que analisa editais. Use APENAS o conteúdo dos documentos abaixo para responder. Retorne somente o que for pedido (ex.: JSON quando solicitado).

CONTEÚDO DOS DOCUMENTOS (editais):
${context}

---
PERGUNTA:
${message}`;

  const promptChars = prompt.length;
  const estimatedTokens = Math.ceil(promptChars / 3);
  console.log(`  📐 Ollama: ${promptChars} chars (~${estimatedTokens} tokens), contexto max=${maxContextChars} chars, timeout ${process.env.OLLAMA_TIMEOUT_MS || "120000"}ms`);

  const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || "120000", 10);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const body: { model: string; prompt: string; stream: boolean; options?: Record<string, number> } = {
      model,
      prompt,
      stream: false,
    };
    const opts: Record<string, number> = {};
    const numCtx = process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : undefined;
    if (numCtx != null && numCtx > 0) opts.num_ctx = numCtx;
    const numPredict = process.env.OLLAMA_NUM_PREDICT ? parseInt(process.env.OLLAMA_NUM_PREDICT, 10) : 256;
    if (numPredict > 0) opts.num_predict = numPredict;
    if (Object.keys(opts).length > 0) body.options = opts;

    let res: Response;
    try {
      const undici = await import("undici").catch(() => null) as { fetch: typeof fetch; Agent: new (opts?: { headersTimeout?: number; bodyTimeout?: number }) => unknown } | null;
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
    } catch (_) {
      res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    }
    clearTimeout(t);

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`  ⚠️ Ollama respondeu ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const json = (await res.json()) as { response?: string };
    const text = (json.response || "").trim();
    return text.length > 0 ? text : null;
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
        const base = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
        console.warn(`  💡 Verifique: (1) Ollama está rodando? (2) URL correta? OLLAMA_BASE_URL=${base} (3) curl ${base}/api/tags`);
        if (causeMsg) console.warn("  Causa:", causeMsg);
      }
    }
    return null;
  }
}
