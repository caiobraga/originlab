/**
 * Sincroniza edital_pdfs.is_processed com a tabela documents:
 * - is_processed = true: existe pelo menos um document com embedding não null para o file_id
 * - is_processed = false: (1) file_id não aparece em documents, OU (2) aparece só com embedding null
 *
 * Uso:
 *   npm run db:sync-is-processed-from-documents
 *   npm run db:sync-is-processed-from-documents -- --dry-run
 */
import "../load-env";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
const BATCH = 80;

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function getFileIdsWithDocuments(): Promise<Set<string>> {
  const fileIds = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("documents")
      .select("file_id")
      .not("embedding", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (error.message?.includes("embedding") || error.message?.includes("column")) {
        console.warn("Coluna documents.embedding nao encontrada. Tentando por content...");
        break;
      }
      throw error;
    }
    if (!data?.length) break;
    for (const row of data as { file_id?: string | null }[]) {
      const fid = row.file_id;
      if (typeof fid === "string" && fid.trim()) fileIds.add(fid.trim());
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  if (fileIds.size === 0) {
    const { data: fallback } = await supabase.from("documents").select("file_id").limit(5000);
    for (const row of (fallback || []) as { file_id?: string | null }[]) {
      const fid = row.file_id;
      if (typeof fid === "string" && fid.trim()) fileIds.add(fid.trim());
    }
  }
  return fileIds;
}

/** file_ids que aparecem em documents em qualquer registro (embedding null ou não). */
async function getFileIdsThatAppearInDocuments(): Promise<Set<string>> {
  const fileIds = new Set<string>();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("documents")
      .select("file_id")
      .range(offset, offset + pageSize - 1);
    if (error) return fileIds;
    if (!data?.length) break;
    for (const row of data as { file_id?: string | null }[]) {
      const fid = row.file_id;
      if (typeof fid === "string" && fid.trim()) fileIds.add(fid.trim());
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return fileIds;
}

async function main() {
  const dryRun = hasFlag("--dry-run");

  console.log("Sincronizando edital_pdfs.is_processed com documents...");
  console.log("   is_processed = false: file_id nao aparece em documents OU so tem embedding null.\n");

  console.log("Passo 1: file_ids em documents com embedding nao null...");
  const fileIdsWithDocs = await getFileIdsWithDocuments();
  console.log("   " + fileIdsWithDocs.size + " file_id(s) com pelo menos um document (embedding preenchido).");

  console.log("Passo 2: file_ids que aparecem em documents (qualquer embedding)...");
  const fileIdsAny = await getFileIdsThatAppearInDocuments();
  console.log("   " + fileIdsAny.size + " file_id(s) aparecem na tabela documents.\n");

  console.log("Passo 3: Listando edital_pdfs e classificando...");
  const { data: pdfs, error: pdfsErr } = await supabase
    .from("edital_pdfs")
    .select("id, file_id");
  if (pdfsErr) {
    if (pdfsErr.message?.includes("is_processed") || pdfsErr.message?.includes("column")) {
      console.error("Coluna is_processed pode nao existir. Rode migration-add-edital-pdfs-is-processed.sql");
    } else {
      console.error("Erro ao buscar edital_pdfs:", pdfsErr.message);
    }
    process.exit(1);
  }

  const toTrue: string[] = [];
  const toFalse: string[] = [];
  let countNeverInDocuments = 0;
  let countOnlyNullEmbedding = 0;
  for (const p of pdfs || []) {
    const r = p as { id: string; file_id?: string | null };
    const fid = r.file_id != null ? String(r.file_id).trim() : "";
    const key = fid || r.id;
    const hasDocsWithEmbedding = key && fileIdsWithDocs.has(key);
    const appearsInDocuments = key && fileIdsAny.has(key);
    if (hasDocsWithEmbedding) {
      toTrue.push(r.id);
    } else {
      toFalse.push(r.id);
      if (!appearsInDocuments) countNeverInDocuments++;
      else countOnlyNullEmbedding++;
    }
  }

  console.log("   PDFs com documents+embedding (is_processed = true):  " + toTrue.length);
  console.log("   PDFs sem documents ou so null (is_processed = false): " + toFalse.length);
  console.log("      - file_id nao aparece em documents: " + countNeverInDocuments);
  console.log("      - file_id aparece mas so com embedding null: " + countOnlyNullEmbedding + "\n");

  if (dryRun) {
    console.log("--dry-run: nenhuma alteracao. Rode sem --dry-run para aplicar.");
    process.exit(0);
  }

  let okTrue = 0;
  let okFalse = 0;
  for (let i = 0; i < toTrue.length; i += BATCH) {
    const batch = toTrue.slice(i, i + BATCH);
    const { error } = await supabase.from("edital_pdfs").update({ is_processed: true }).in("id", batch);
    if (error) {
      console.warn("Erro ao setar is_processed = true:", error.message);
      break;
    }
    okTrue += batch.length;
  }
  for (let i = 0; i < toFalse.length; i += BATCH) {
    const batch = toFalse.slice(i, i + BATCH);
    const { error } = await supabase.from("edital_pdfs").update({ is_processed: false }).in("id", batch);
    if (error) {
      console.warn("Erro ao setar is_processed = false:", error.message);
      break;
    }
    okFalse += batch.length;
  }

  console.log("Atualizados: is_processed = true: " + okTrue + ", is_processed = false: " + okFalse);
  console.log("Concluido.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
