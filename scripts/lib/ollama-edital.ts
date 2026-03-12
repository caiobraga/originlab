/**
 * Extração de informações de edital via Ollama local.
 * Busca PDFs no Supabase Storage (ou contexto da tabela documents) e envia ao modelo.
 * Use USE_OLLAMA=true no .env para ativar (em vez do webhook n8n).
 *
 * Timeout: causas comuns e o que fazer
 * - Contexto grande (muitos chars/tokens): reduza OLLAMA_MAX_CONTEXT_CHARS (ex: 40000).
 * - Modelo 7B em CPU é lento: aumente OLLAMA_TIMEOUT_MS (ex: 300000) ou use modelo menor (qwen2.5:3b).
 * - Rode com OLLAMA_VERBOSE=1 para ver tamanho do prompt e ajustar.
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

/**
 * Resolve fileIds para o que está em documents.file_id.
 * Os IDs recebidos podem ser edital_pdfs.id OU edital_pdfs.file_id (storage).
 * Buscamos em edital_pdfs por id e por file_id e montamos a lista de file_id
 * (storage) para consultar documents.
 */
async function resolveFileIdsForDocuments(fileIds: string[]): Promise<string[]> {
  if (!supabase || fileIds.length === 0) return fileIds;
  const trimmed = fileIds.map((id) => id.trim()).filter(Boolean);
  const { data: byId } = await supabase
    .from("edital_pdfs")
    .select("id, file_id")
    .in("id", trimmed);
  const { data: byFileId } = await supabase
    .from("edital_pdfs")
    .select("id, file_id")
    .in("file_id", trimmed);

  const docFileIds = new Set<string>();
  for (const p of byId || []) {
    const r = p as Record<string, unknown>;
    const fid = r.file_id;
    docFileIds.add(typeof fid === "string" && fid ? fid : String(r.id));
  }
  for (const p of byFileId || []) {
    const r = p as Record<string, unknown>;
    const fid = r.file_id;
    docFileIds.add(typeof fid === "string" && fid ? fid : String(r.id));
  }
  return [...docFileIds];
}

/**
 * Busca conteúdo dos documentos na tabela `documents` por file_id (RAG).
 * Considera file_id na coluna top-level OU dentro de metadata (metadata->>'file_id').
 * Tenta colunas de conteúdo: name, content, text, body, page_content, chunk.
 */
async function fetchDocumentContextByFileIds(fileIds: string[]): Promise<string> {
  if (!supabase || fileIds.length === 0) return "";

  const resolvedIds = await resolveFileIdsForDocuments(fileIds);
  if (resolvedIds.length === 0) return "";

  const contentColumns = ["name", "content", "text", "body", "page_content", "chunk"];
  for (const col of contentColumns) {
    let rows: unknown[] | null = null;
    let error: { message: string } | null = null;

    const selectCols = "id, file_id, metadata, " + col;

    const byColumn = supabase
      .from("documents")
      .select(selectCols)
      .in("file_id", resolvedIds)
      .order("file_id", { ascending: true })
      .order("id", { ascending: true });
    const resColumn = await byColumn;
    error = resColumn.error;
    rows = resColumn.data;

    const tryMetadata =
      error != null && (error.message?.includes("file_id") || error.message?.includes("column")) ||
      (error == null && (!rows || rows.length === 0));
    if (tryMetadata && resolvedIds.length > 0) {
      const orFilter = resolvedIds.map((id) => `metadata->>file_id.eq.${id}`).join(",");
      const byMetadata = await supabase
        .from("documents")
        .select(selectCols)
        .or(orFilter)
        .order("id", { ascending: true });
      error = byMetadata.error;
      rows = byMetadata.data;
    }

    if (error != null) {
      if (process.env.OLLAMA_DEBUG_RAG === "1") {
        console.warn(`  [RAG debug] coluna "${col}": ${error.message}`);
      }
      continue;
    }
    if (!rows?.length) continue;

    const withIndex = (rows as Record<string, unknown>[]).map((r) => {
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
    if (parts.length > 0) {
      const maxCh = getMaxChunks();
      const limited = maxCh != null && maxCh > 0 ? parts.slice(0, maxCh) : parts;
      if (limited.length < parts.length && process.env.OLLAMA_VERBOSE === "1") {
        console.log(`  📑 RAG: usando ${limited.length}/${parts.length} chunks (OLLAMA_MAX_CHUNKS=${maxCh})`);
      }
      return limited.join("\n\n");
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
      `  [RAG debug] resolvedIds (${resolvedIds.length}): ${resolvedIds.slice(0, 2).map((x) => x.slice(0, 8)).join(", ")}...; documentos: ${count}`
    );
  }
  return "";
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
  fileIds: string[]
): Promise<string | null> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";

  if (!fileIds || fileIds.length === 0) return null;
  if (!supabase) {
    console.warn("  ⚠️ Ollama: Supabase não configurado.");
    return null;
  }

  let fullContext = "";

  if (USE_RAG_DOCUMENTS) {
    fullContext = await fetchDocumentContextByFileIds(fileIds);
    if (fullContext.length > 0) {
      if (process.env.OLLAMA_VERBOSE === "1") {
        console.log(`  📑 Ollama RAG: contexto da tabela documents (${fullContext.length} caracteres)`);
      }
    } else {
      console.warn(
        "  ⚠️ Ollama RAG: tabela documents não retornou conteúdo para estes file_ids. Verifique se a tabela tem alguma coluna de texto (name, content, text, body, page_content ou chunk) e se documents.file_id corresponde aos IDs enviados."
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
    if (fullContext.length === 0) {
      console.warn("  ⚠️ Ollama: nenhum texto extraído dos PDFs.");
      return null;
    }
  }

  const maxContextChars = getMaxContextChars();
  const context =
    fullContext.length > maxContextChars
      ? fullContext.slice(0, maxContextChars) + "\n\n[... texto truncado ...]"
      : fullContext;

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
