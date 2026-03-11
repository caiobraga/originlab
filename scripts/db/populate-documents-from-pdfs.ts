/**
 * Extrai texto dos PDFs (Storage), divide em chunks e preenche a tabela documents
 * com content, metadata (file_id, edital_id, chunk_index) e embedding.
 * Processa apenas edital_pdfs ainda não processados (is_processed <> true) e marca
 * como processado ao concluir com sucesso.
 *
 * Fluxo: edital_pdfs (não processados) → 1 a 1: download PDF → texto → chunks → documents → embed → is_processed = true.
 *
 * Uso:
 *   npm run db:populate-documents-from-pdfs
 *   npm run db:populate-documents-from-pdfs -- --limit 10
 *   npm run db:populate-documents-from-pdfs -- --all   # ignora is_processed e processa todos
 *   npm run db:populate-documents-from-pdfs -- --dry-run
 *
 * Env: CHUNK_SIZE (chars), CHUNK_OVERLAP (chars), OLLAMA_EMBED_MODEL, EMBED_DIMENSIONS, etc.
 */
import "../load-env";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "edital-pdfs";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || "800", 10);
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP || "200", 10);
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "mxbai-embed-large:latest";
const EMBED_DIMENSIONS = process.env.EMBED_DIMENSIONS ? parseInt(process.env.EMBED_DIMENSIONS, 10) : null;

function chunkText(text: string, size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  while (start < trimmed.length) {
    const end = Math.min(start + size, trimmed.length);
    const chunk = trimmed.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= trimmed.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

/** Opcional: prefixo no Storage (ex.: "fonte/numero") para descobrir path listando a pasta quando caminho_storage está vazio. */
type EditalPrefix = { fonte: string; numero: string };

async function fetchPdfBuffer(
  supabaseClient: SupabaseClient,
  fileId: string,
  caminhoStorage?: string | null,
  editalPrefix?: EditalPrefix | null
): Promise<Buffer | null> {
  const ref = String(fileId || "").trim();
  if (!ref) return null;

  let storagePath = caminhoStorage?.trim() || "";
  if (!storagePath.includes("/")) {
    const { data: pdfRecord } = await supabaseClient
      .from("edital_pdfs")
      .select("caminho_storage")
      .eq("id", ref)
      .maybeSingle();
    if (pdfRecord?.caminho_storage) {
      storagePath = pdfRecord.caminho_storage;
    } else {
      const { data: byFid } = await supabaseClient
        .from("edital_pdfs")
        .select("caminho_storage")
        .eq("file_id", ref)
        .maybeSingle();
      if (byFid?.caminho_storage) {
        storagePath = byFid.caminho_storage;
      } else {
        // storage.objects: obter path pelo id do objeto (filtrar pelo bucket)
        const { data: bucketRow } = await supabaseClient
          .schema("storage")
          .from("buckets")
          .select("id")
          .eq("name", STORAGE_BUCKET)
          .maybeSingle();
        const bucketId = (bucketRow as { id?: string } | null)?.id;
        if (bucketId) {
          const { data: obj } = await supabaseClient
            .schema("storage")
            .from("objects")
            .select("name")
            .eq("bucket_id", bucketId)
            .eq("id", ref)
            .maybeSingle();
          if ((obj as { name?: string } | null)?.name) storagePath = (obj as { name: string }).name;
        }
        if (!storagePath && editalPrefix?.fonte && editalPrefix?.numero) {
          const prefix = `${editalPrefix.fonte}/${editalPrefix.numero}`;
          try {
            const { data: listData } = await supabaseClient.storage.from(STORAGE_BUCKET).list(prefix);
            const items = (listData || []) as { id?: string; name: string }[];
            const withName = items.filter((f) => f.name && !f.name.endsWith("/"));
            if (withName.length) {
              const match = withName.find((f) => f.id === ref);
              if (match?.name) storagePath = `${prefix}/${match.name}`;
              else if (withName.length === 1) storagePath = `${prefix}/${withName[0].name}`;
            }
          } catch {
            // ignore
          }
        }
        if (!storagePath) storagePath = ref;
      }
    }
  }

  const { data: fileData, error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (error) {
    if (process.env.DEBUG_POPULATE_PDF === "1") {
      console.warn(`      [debug] Storage download "${storagePath}": ${error.message}`);
    }
    return null;
  }
  if (!fileData) return null;
  const arrayBuffer = await fileData.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  return buf.length > 0 ? buf : null;
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new (PDFParse as new (opts: { data: Uint8Array }) => {
      getText(): Promise<{ text?: string }>;
      destroy(): Promise<void>;
    })({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return (result?.text || "").trim().replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

async function embedWithOllama(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const url = `${OLLAMA_BASE}/api/embed`;
  const input = texts.length === 1 ? texts[0] : texts;
  const body: { model: string; input: string | string[]; dimensions?: number } = {
    model: OLLAMA_EMBED_MODEL,
    input,
  };
  if (EMBED_DIMENSIONS != null && EMBED_DIMENSIONS > 0) body.dimensions = EMBED_DIMENSIONS;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama embed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { embeddings?: number[][] };
  return data.embeddings || [];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const processAll = args.includes("--all");
  const limitArg = args.find((a) => a.startsWith("--limit=")) || (args.includes("--limit") ? args[args.indexOf("--limit") + 1] : null);
  const limit = limitArg ? parseInt(limitArg.replace(/^--limit=/, ""), 10) : null;

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   PDF → TEXTO → CHUNKS → DOCUMENTS (content + embedding)  ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  console.log(`   Chunk: size=${CHUNK_SIZE} overlap=${CHUNK_OVERLAP}`);
  console.log(`   Embed: ${OLLAMA_EMBED_MODEL}${EMBED_DIMENSIONS ? ` dim=${EMBED_DIMENSIONS}` : ""}`);
  if (!processAll) console.log("   Filtro: apenas edital_pdfs com is_processed <> true");
  if (dryRun) console.log("   Modo: --dry-run");
  console.log("");

  let list: { id: string; file_id?: string | null; edital_id?: string | null; caminho_storage?: string | null }[] = [];

  let query = supabase
    .from("edital_pdfs")
    .select("id, file_id, edital_id, caminho_storage")
    .order("edital_id", { ascending: true });

  if (!processAll) {
    query = query.or("is_processed.is.null,is_processed.eq.false");
  }

  const { data: pdfs, error: pdfsErr } = await query;

  if (pdfsErr) {
    if (pdfsErr.message?.includes("is_processed") || pdfsErr.message?.includes("column")) {
      console.warn("   ⚠️ Coluna edital_pdfs.is_processed não existe. Processando todos (ou rode migration-add-edital-pdfs-is-processed.sql).\n");
      const { data: allPdfs, error: e2 } = await supabase
        .from("edital_pdfs")
        .select("id, file_id, edital_id, caminho_storage")
        .order("edital_id", { ascending: true });
      if (e2) {
        console.error("❌ Erro ao buscar edital_pdfs:", e2.message);
        process.exit(1);
      }
      list = (allPdfs || []) as typeof list;
    } else {
      console.error("❌ Erro ao buscar edital_pdfs:", pdfsErr.message);
      process.exit(1);
    }
  } else {
    list = (pdfs || []) as typeof list;
  }

  const toProcess = limit != null && limit > 0 ? list.slice(0, limit) : list;
  console.log(`📄 PDFs a processar: ${toProcess.length} (total ${processAll ? "na lista" : "não processados"}: ${list.length})\n`);

  const editalIds = [...new Set((toProcess as typeof list).map((p) => p.edital_id).filter(Boolean))] as string[];
  const editalPrefixMap = new Map<string, EditalPrefix>();
  if (editalIds.length > 0) {
    const { data: editais } = await supabase.from("editais").select("id, fonte, numero").in("id", editalIds);
    const sanitize = (s: string | null | undefined) =>
      (s ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "").substring(0, 100);
    for (const e of editais || []) {
      const row = e as { id: string; fonte?: string | null; numero?: string | null };
      editalPrefixMap.set(row.id, { fonte: sanitize(row.fonte), numero: sanitize(row.numero) });
    }
  }

  let totalChunks = 0;
  let totalOk = 0;
  let totalFail = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const pdf = toProcess[i];
    const fileId = pdf.file_id || pdf.id;
    const storagePath = pdf.caminho_storage;
    const editalPrefix = pdf.edital_id ? editalPrefixMap.get(pdf.edital_id) ?? null : null;

    if (dryRun) {
      console.log(`   [${i + 1}/${toProcess.length}] file_id=${fileId} (dry-run)`);
      continue;
    }

    const buffer = await fetchPdfBuffer(supabase, fileId, storagePath, editalPrefix);
    if (!buffer || buffer.length === 0) {
      const pathHint = storagePath && storagePath.includes("/") ? ` path=${storagePath}` : " (sem caminho_storage?)";
      console.warn(`   ⚠️ [${i + 1}/${toProcess.length}] PDF não encontrado ou vazio: ${fileId}${pathHint}`);
      totalFail++;
      continue;
    }

    const text = await extractTextFromPdf(buffer);
    if (!text || text.length < 50) {
      console.warn(`   ⚠️ [${i + 1}/${toProcess.length}] Texto extraído vazio ou muito curto: ${fileId}`);
      totalFail++;
      continue;
    }

    const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    if (chunks.length === 0) {
      console.warn(`   ⚠️ [${i + 1}/${toProcess.length}] Nenhum chunk gerado: ${fileId}`);
      totalFail++;
      continue;
    }

    const { error: delErr } = await supabase
      .from("documents")
      .delete()
      .eq("file_id", fileId);

    if (delErr) {
      console.warn(`   ⚠️ [${i + 1}] Erro ao remover documentos antigos para file_id=${fileId}:`, delErr.message);
    }

    const metaBase = { file_id: fileId, edital_id: pdf.edital_id ?? null };
    const inserts: { file_id: string; content: string; metadata: Record<string, unknown> }[] = chunks.map((c, idx) => ({
      file_id: fileId,
      content: c,
      metadata: { ...metaBase, chunk_index: idx },
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("documents")
      .insert(inserts)
      .select("id, content");

    if (insertErr) {
      console.error(`   ❌ [${i + 1}] Erro ao inserir chunks:`, insertErr.message);
      totalFail++;
      continue;
    }

    const rows = (inserted || []) as { id: string; content: string }[];
    totalChunks += rows.length;

    const contents = rows.map((r) => r.content);
    let embeddings: number[][];
    try {
      embeddings = await embedWithOllama(contents);
    } catch (e) {
      console.error(`   ❌ [${i + 1}] Erro ao gerar embeddings:`, (e as Error).message);
      totalFail++;
      continue;
    }

    let ok = 0;
    for (let j = 0; j < rows.length; j++) {
      const emb = embeddings[j];
      if (!emb?.length) continue;
      const { error: upErr } = await supabase
        .from("documents")
        .update({ embedding: emb })
        .eq("id", rows[j].id);
      if (upErr) {
        if (upErr.message.includes("expected 768 dimensions") && EMBED_DIMENSIONS == null) {
          console.warn(`   ⚠️ Defina EMBED_DIMENSIONS=768 no .env.local e rode de novo.`);
        }
        totalFail++;
      } else {
        ok++;
        totalOk++;
      }
    }

    const { error: markErr } = await supabase
      .from("edital_pdfs")
      .update({ is_processed: true })
      .eq("id", pdf.id);

    if (markErr) {
      console.warn(`   ⚠️ [${i + 1}] edital_pdfs.is_processed = true não atualizado:`, markErr.message);
    }

    console.log(`   ✅ [${i + 1}/${toProcess.length}] ${pdf.edital_id || fileId}: ${chunks.length} chunks, ${ok} com embedding → is_processed = true`);
  }

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                        RESUMO                             ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`   PDFs processados: ${toProcess.length}`);
  console.log(`   Chunks inseridos: ${totalChunks}`);
  console.log(`   Chunks com embedding: ${totalOk}`);
  if (totalFail > 0) console.log(`   Falhas: ${totalFail}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
