/**
 * Preenche edital_pdfs.caminho_storage listando o bucket via Storage API (sem usar schema storage).
 * Para cada edital_pdf com file_id e caminho_storage vazio, procura o path pelo id do objeto no bucket.
 *
 * Uso: npm run db:fill-caminho-storage-from-storage-objects
 *      npm run db:fill-caminho-storage-from-storage-objects -- --dry-run
 */
import "../load-env";

import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "edital-pdfs";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type ListItem = { name: string; id?: string };

/** Lista o bucket recursivamente e retorna mapa id do objeto → path completo. */
async function listBucketIdToPath(
  prefix: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data: items } = await supabase.storage.from(STORAGE_BUCKET).list(prefix);
  if (!items?.length) return out;

  for (const item of items as ListItem[]) {
    const name = item?.name;
    if (!name) continue;
    const fullPath = prefix ? `${prefix}/${name}` : name;

    if (item.id) {
      out.set(item.id, fullPath);
    } else {
      const nested = await listBucketIdToPath(fullPath);
      nested.forEach((path, id) => out.set(id, path));
    }
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   PREENCHER CAMINHO_STORAGE (listando bucket via API)       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  if (dryRun) console.log("   Modo: --dry-run (nenhuma alteração no banco)\n");

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

  console.log(`   Edital_pdfs com file_id e sem caminho_storage: ${toFix.length}`);
  console.log("   Listando bucket (pode demorar em buckets grandes)...\n");

  const pathByFileId = await listBucketIdToPath("");

  console.log(`   Arquivos no bucket: ${pathByFileId.size}\n`);

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

  console.log(`   Atualizados: ${updated}/${toFix.length}`);
  if (toFix.length > updated && !dryRun) {
    console.log("   Os demais têm file_id que não bate com nenhum id de arquivo no bucket.");
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
