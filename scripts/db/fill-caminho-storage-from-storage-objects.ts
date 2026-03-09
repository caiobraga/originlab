/**
 * Preenche edital_pdfs.caminho_storage a partir de storage.objects quando está vazio.
 * Útil quando os PDFs foram criados/importados sem caminho_storage; o path real está
 * em storage.objects.name (e file_id = storage.objects.id).
 *
 * Uso: npm run db:fill-caminho-storage-from-storage-objects
 *      npm run db:fill-caminho-storage-from-storage-objects -- --dry-run
 */
import "../load-env";

import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "edital-pdfs";

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

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   PREENCHER CAMINHO_STORAGE A PARTIR DE STORAGE.OBJECTS     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  if (dryRun) console.log("   Modo: --dry-run (nenhuma alteração no banco)\n");

  const { data: bucketRow, error: bucketErr } = await supabase
    .from("storage.buckets")
    .select("id")
    .eq("name", STORAGE_BUCKET)
    .maybeSingle();

  if (bucketErr || !bucketRow) {
    console.error("❌ Erro ao obter bucket:", bucketErr?.message ?? "bucket não encontrado");
    process.exit(1);
  }
  const bucketId = (bucketRow as { id: string }).id;

  const { data: pdfs, error: pdfsErr } = await supabase
    .from("edital_pdfs")
    .select("id, file_id, edital_id, caminho_storage")
    .not("file_id", "is", null);

  if (pdfsErr) {
    console.error("❌ Erro ao buscar edital_pdfs:", pdfsErr.message);
    process.exit(1);
  }

  const toFix = (pdfs || []).filter((p) => {
    const r = p as { file_id?: string | null; caminho_storage?: string | null };
    const fid = r.file_id && String(r.file_id).trim();
    const path = r.caminho_storage;
    return fid && (!path || path.trim() === "");
  });
  if (toFix.length === 0) {
    console.log("✅ Nenhum edital_pdf com file_id preenchido e caminho_storage vazio.\n");
    return;
  }

  console.log(`   Edital_pdfs com file_id e sem caminho_storage: ${toFix.length}\n`);

  const fileIds = [...new Set(toFix.map((p) => (p as { file_id: string }).file_id))];
  const pathByFileId = new Map<string, string>();

  const BATCH = 100;
  for (let i = 0; i < fileIds.length; i += BATCH) {
    const batch = fileIds.slice(i, i + BATCH);
    const { data: objs, error: objErr } = await supabase
      .from("storage.objects")
      .select("id, name")
      .eq("bucket_id", bucketId)
      .in("id", batch);

    if (objErr) {
      console.warn("   ⚠️ Erro ao buscar storage.objects:", objErr.message);
      continue;
    }
    for (const o of objs || []) {
      const row = o as { id: string; name: string };
      if (row.name) pathByFileId.set(row.id, row.name);
    }
  }

  let updated = 0;
  for (const pdf of toFix) {
    const row = pdf as { id: string; file_id: string };
    const path = pathByFileId.get(row.file_id);
    if (!path) continue;
    if (dryRun) {
      console.log(`   [dry-run] id=${row.id} → caminho_storage=${path}`);
      updated++;
      continue;
    }
    const { error: upErr } = await supabase
      .from("edital_pdfs")
      .update({ caminho_storage: path })
      .eq("id", row.id);
    if (!upErr) updated++;
  }

  console.log(`\n   Atualizados: ${updated}/${toFix.length}`);
  if (toFix.length > updated && !dryRun) {
    console.log("   Os demais têm file_id que não corresponde a nenhum id em storage.objects (ex.: file_id = edital_pdfs.id).");
    console.log("   Rode db:populate-documents-from-pdfs; ele tenta descobrir o path pela pasta do edital (fonte/numero).");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
