/**
 * Sincroniza edital_pdfs.is_processed com a tabela documents usando conteúdo textual.
 *
 * Regras:
 * - true: existe pelo menos um document com content não vazio para a chave do PDF
 * - false: não existe document para a chave, ou existe apenas com content vazio
 *
 * Chave de match (mesma lógica dos outros scripts):
 * - key1 = edital_pdfs.file_id (se existir) senão edital_pdfs.id
 * - key2 = edital_pdfs.id (fallback adicional quando file_id existe)
 * - documents: usa documents.file_id; fallback em metadata.file_id
 */
import "../load-env";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;
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

type DocRow = { file_id?: string | null; metadata?: Record<string, unknown> | null; content?: string | null };

async function getDocumentsPresenceAndContent(): Promise<{
  seen: Set<string>;
  withContent: Set<string>;
}> {
  const seen = new Set<string>();
  const withContent = new Set<string>();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("documents")
      .select("file_id, metadata, content")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as DocRow[];
    if (!rows.length) break;

    for (const r of rows) {
      const fid =
        (typeof r.file_id === "string" && r.file_id.trim().length > 0 ? r.file_id.trim() : "") ||
        (typeof r.metadata?.file_id === "string" && r.metadata.file_id.trim().length > 0 ? String(r.metadata.file_id).trim() : "");
      if (!fid) continue;
      seen.add(fid);
      if (typeof r.content === "string" && r.content.trim().length > 0) withContent.add(fid);
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { seen, withContent };
}

async function main() {
  const dryRun = hasFlag("--dry-run");

  console.log("Sincronizando edital_pdfs.is_processed com documents.content...");
  console.log("   false: sem documents para a chave OU somente content vazio\n");

  console.log("Passo 1: chaves em documents (com/sem content)...");
  const { seen: fileIdsAny, withContent: fileIdsWithDocs } = await getDocumentsPresenceAndContent();
  console.log("   " + fileIdsAny.size + " chave(s) aparecem na tabela documents.");
  console.log("   " + fileIdsWithDocs.size + " chave(s) com content preenchido.\n");

  console.log("Passo 3: Listando edital_pdfs e classificando...");
  const pdfs: { id: string; file_id?: string | null }[] = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("edital_pdfs")
      .select("id, file_id")
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (error.message?.includes("is_processed") || error.message?.includes("column")) {
        console.error("Coluna is_processed pode nao existir. Rode migration-add-edital-pdfs-is-processed.sql");
      } else {
        console.error("Erro ao buscar edital_pdfs:", error.message);
      }
      process.exit(1);
    }
    const rows = (data || []) as { id: string; file_id?: string | null }[];
    pdfs.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  const toTrue: string[] = [];
  const toFalse: string[] = [];
  let countNeverInDocuments = 0;
  let countOnlyNullEmbedding = 0;
  for (const r of pdfs) {
    const fid = r.file_id != null ? String(r.file_id).trim() : "";
    const key1 = fid || r.id;
    const key2 = fid ? r.id : "";
    const hasDocsWithContent =
      (key1 && fileIdsWithDocs.has(key1)) ||
      (key2 && fileIdsWithDocs.has(key2));
    const appearsInDocuments =
      (key1 && fileIdsAny.has(key1)) ||
      (key2 && fileIdsAny.has(key2));
    if (hasDocsWithContent) {
      toTrue.push(r.id);
    } else {
      toFalse.push(r.id);
      if (!appearsInDocuments) countNeverInDocuments++;
      else countOnlyNullEmbedding++;
    }
  }

  console.log("   PDFs com documents+content (is_processed = true):    " + toTrue.length);
  console.log("   PDFs sem documents ou so null (is_processed = false): " + toFalse.length);
  console.log("      - file_id nao aparece em documents: " + countNeverInDocuments);
  console.log("      - file_id aparece mas so com content vazio: " + countOnlyNullEmbedding + "\n");

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
