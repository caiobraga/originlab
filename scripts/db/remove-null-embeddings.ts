#!/usr/bin/env tsx
/**
 * Remove da tabela documents todos os registros cujo embedding é null.
 * Útil após falhas parciais do db:populate-documents-from-pdfs ou db:embed-documents.
 *
 * Uso:
 *   npm run db:remove-null-embeddings
 *   npm run db:remove-null-embeddings -- --yes    # sem confirmação
 *   npm run db:remove-null-embeddings -- --dry-run
 *
 * Opcional: --reset-pdfs  marca edital_pdfs (dos file_id afetados) com is_processed = false
 *   para reprocessar com db:populate-documents-from-pdfs.
 */
import "../load-env";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as readline from "readline";

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

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

const BATCH = 500;

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = (answer || "").trim().toLowerCase();
      resolve(normalized === "s" || normalized === "sim" || normalized === "y" || normalized === "yes");
    });
  });
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const skipConfirm = hasFlag("--yes") || hasFlag("-y");
  const resetPdfs = hasFlag("--reset-pdfs");

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   REMOVER DOCUMENTS COM EMBEDDING NULL                  ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const { count, error: countError } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  if (countError) {
    console.error("❌ Erro ao contar documents:", countError.message);
    process.exit(1);
  }

  const total = count ?? 0;
  if (total === 0) {
    console.log("   Nenhum document com embedding null. Nada a remover.");
    process.exit(0);
  }

  console.log(`   Documents com embedding null: ${total}`);
  if (resetPdfs) console.log("   --reset-pdfs: edital_pdfs dos file_id afetados serão marcados is_processed = false");
  if (dryRun) {
    console.log("   --dry-run: nenhuma alteração será feita.\n");
  } else if (!skipConfirm) {
    const ok = await askConfirmation(`   Remover ${total} registro(s)? (s/n): `);
    if (!ok) {
      console.log("   Cancelado.");
      process.exit(0);
    }
  }

  if (dryRun) {
    const { data: sample } = await supabase
      .from("documents")
      .select("id, file_id")
      .is("embedding", null)
      .limit(5);
    console.log("   Amostra (até 5):", sample ?? []);
    console.log("\n   Rode sem --dry-run para remover.");
    process.exit(0);
  }

  const fileIdsAffected = new Set<string>();
  let removed = 0;

  while (true) {
    const { data: chunk, error: selectError } = await supabase
      .from("documents")
      .select("id, file_id")
      .is("embedding", null)
      .limit(BATCH);

    if (selectError) {
      console.error("❌ Erro ao listar:", selectError.message);
      process.exit(1);
    }
    if (!chunk || chunk.length === 0) break;

    const ids = chunk.map((r) => r.id);
    for (const r of chunk as { id: string; file_id?: string | null }[]) {
      if (r.file_id) fileIdsAffected.add(r.file_id);
    }

    const { error: deleteError } = await supabase.from("documents").delete().in("id", ids);
    if (deleteError) {
      console.error("❌ Erro ao remover:", deleteError.message);
      process.exit(1);
    }
    removed += chunk.length;
    console.log(`   Removidos ${removed}/${total}`);
    if (chunk.length < BATCH) break;
  }

  console.log(`\n   Total removido: ${removed} document(s) com embedding null.`);

  if (resetPdfs && fileIdsAffected.size > 0) {
    console.log("\n   Marcando edital_pdfs (is_processed = false) para os file_id afetados...");
    const fids = [...fileIdsAffected];
    const BATCH_PDF = 80;
    let pdfsUpdated = 0;
    for (let i = 0; i < fids.length; i += BATCH_PDF) {
      const batch = fids.slice(i, i + BATCH_PDF);
      const { error: upErr } = await supabase
        .from("edital_pdfs")
        .update({ is_processed: false })
        .in("file_id", batch);
      if (upErr) {
        if (upErr.message?.includes("is_processed") || upErr.message?.includes("column")) {
          console.warn("   Coluna edital_pdfs.is_processed nao existe.");
        } else {
          console.warn("   Erro ao atualizar edital_pdfs:", upErr.message, (upErr as { details?: string }).details ?? "");
        }
        break;
      }
      pdfsUpdated += batch.length;
    }
    if (pdfsUpdated > 0) {
      console.log("   " + pdfsUpdated + " file_id(s) -> is_processed = false. Rode db:populate-documents-from-pdfs para reprocessar.");
    }
  }

  console.log("\nConcluido.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
