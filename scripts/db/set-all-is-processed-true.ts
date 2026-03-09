#!/usr/bin/env tsx
/**
 * Define is_processed = true para todos os registros em edital_pdfs.
 * Útil quando você já processou os documents/vetores e quer marcar tudo como processado.
 *
 * Uso:
 *   npm run db:set-all-is-processed-true
 *   npm run db:set-all-is-processed-true -- --yes   # sem confirmação
 */
import "../load-env";
import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variáveis de ambiente não encontradas!");
  console.error("   Configure no arquivo .env.local:");
  console.error("   VITE_SUPABASE_URL=https://seu-projeto.supabase.co");
  console.error("   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

async function setAllIsProcessedTrue() {
  const skipConfirm = process.argv.includes("--yes") || process.argv.includes("-y");

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   DEFINIR is_processed = true EM TODOS edital_pdfs        ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  try {
    const { count, error: countError } = await supabase
      .from("edital_pdfs")
      .select("id", { count: "exact", head: true });

    if (countError) {
      console.error("❌ Erro ao contar edital_pdfs:", countError.message);
      throw countError;
    }

    const total = count ?? 0;
    console.log(`📄 Total de registros em edital_pdfs: ${total}\n`);

    if (total === 0) {
      console.log("   ℹ️  Nenhum registro. Nada a atualizar.");
      return;
    }

    if (!skipConfirm) {
      const ok = await askConfirmation(
        `   Deseja definir is_processed = true para todos os ${total} registro(s)? (s/n): `
      );
      if (!ok) {
        console.log("   Operação cancelada.");
        process.exit(0);
      }
    }

    const BATCH = 100;
    let updated = 0;
    let offset = 0;

    while (true) {
      const { data: chunk, error: selectError } = await supabase
        .from("edital_pdfs")
        .select("id")
        .range(offset, offset + BATCH - 1);

      if (selectError) {
        console.error("❌ Erro ao listar edital_pdfs:", selectError.message);
        throw selectError;
      }
      if (!chunk || chunk.length === 0) break;

      const ids = chunk.map((r) => r.id);
      const { error: updateError } = await supabase
        .from("edital_pdfs")
        .update({ is_processed: true })
        .in("id", ids);

      if (updateError) {
        if (updateError.message?.includes("is_processed") || updateError.message?.includes("column")) {
          console.error("❌ Coluna edital_pdfs.is_processed não existe.");
          console.error("   Execute: scripts/db/migration-add-edital-pdfs-is-processed.sql");
        } else {
          console.error("❌ Erro ao atualizar:", updateError.message);
        }
        throw updateError;
      }

      updated += chunk.length;
      console.log(`   ✅ Atualizados ${updated}/${total}`);
      if (chunk.length < BATCH) break;
      offset += BATCH;
    }

    console.log(`\n✅ is_processed = true definido para ${updated} registro(s).\n`);
  } catch (error) {
    const err = error as Error;
    console.error("\n❌ Erro:", err.message);
    process.exit(1);
  }
}

setAllIsProcessedTrue().then(() => {
  console.log("✅ Script finalizado com sucesso!");
  process.exit(0);
});
