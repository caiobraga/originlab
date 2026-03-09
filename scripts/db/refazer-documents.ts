#!/usr/bin/env tsx
/**
 * Refaz os documents: remove todos os registros da tabela `documents` e opcionalmente
 * marca editais e edital_pdfs para reprocessamento. Use quando trocar o modelo no n8n
 * e precisar regenerar todos os vetores/embeddings.
 *
 * Uso:
 *   npm run db:refazer-documents
 *   npm run db:refazer-documents -- --yes          # sem confirmação
 *   npm run db:refazer-documents -- --only-docs   # só apaga documents, não marca editais
 *
 * Após rodar:
 *   1. No n8n, limpe o vector store (se for separado do Supabase) ou deixe o workflow
 *      re-inserir ao receber as requisições.
 *   2. Rode npm run api:process-edital-info-null (ou api:process-edital-info) para
 *      reenviar os file_ids ao n8n e regenerar os vetores com o novo modelo.
 */
import "../load-env";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
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

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

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

async function refazerDocuments() {
  const skipConfirm = hasFlag("--yes") || hasFlag("-y");
  const onlyDocs = hasFlag("--only-docs");

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   REFAZER DOCUMENTS (limpar vetores para novo modelo)     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  console.log("   Use isto quando trocar o modelo no n8n e precisar regenerar");
  console.log("   todos os vetores/embeddings dos PDFs.\n");

  try {
    // 1. Contar documents
    console.log("📑 Passo 1: Contando registros na tabela documents...");
    const { count, error: countError } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true });

    if (countError) {
      console.error("❌ Erro ao acessar documents:", countError.message);
      throw countError;
    }

    const totalDocs = count ?? 0;
    console.log(`   ✅ Total de documents: ${totalDocs}\n`);

    if (totalDocs === 0) {
      console.log("   ℹ️  Nenhum registro em documents. Nada a remover.");
    } else {
      if (!skipConfirm) {
        const ok = await askConfirmation(
          `   Deseja remover TODOS os ${totalDocs} documento(s)? (s/n): `
        );
        if (!ok) {
          console.log("   Operação cancelada.");
          process.exit(0);
        }
      }

      // 2. Remover todos os documents (em lotes se necessário)
      console.log("\n🗑️  Removendo todos os documents...");
      const BATCH = 500;
      let removed = 0;

      while (true) {
        const { data: chunk, error: selectError } = await supabase
          .from("documents")
          .select("id")
          .limit(BATCH);

        if (selectError) {
          console.error("❌ Erro ao listar documents:", selectError.message);
          throw selectError;
        }
        if (!chunk || chunk.length === 0) break;

        const ids = chunk.map((r) => r.id);
        const { error: deleteError } = await supabase.from("documents").delete().in("id", ids);

        if (deleteError) {
          console.error("❌ Erro ao remover documents:", deleteError.message);
          throw deleteError;
        }

        removed += chunk.length;
        console.log(`   ✅ Removidos ${removed} documento(s)`);
        if (chunk.length < BATCH) break;
      }

      console.log(`\n   ✅ Total removido: ${removed} documento(s)\n`);
    }

    // 3. Marcar editais e edital_pdfs para reprocessamento (a menos que --only-docs)
    if (!onlyDocs) {
      console.log("📄 Passo 2: Marcando editais e edital_pdfs para reprocessamento...");

      // 3a. Todos os edital_pdfs com file_id -> is_processed = false
      const { data: pdfs, error: pdfsError } = await supabase
        .from("edital_pdfs")
        .select("id")
        .not("file_id", "is", null);

      if (pdfsError) {
        console.warn("   ⚠️ Erro ao buscar edital_pdfs:", pdfsError.message);
      } else if (pdfs && pdfs.length > 0) {
        const BATCH_PDF = 100;
        let updatedPdfs = 0;
        for (let i = 0; i < pdfs.length; i += BATCH_PDF) {
          const batch = pdfs.slice(i, i + BATCH_PDF).map((p) => p.id);
          const { error: upErr } = await supabase
            .from("edital_pdfs")
            .update({ is_processed: false })
            .in("id", batch);

          if (upErr) {
            if (upErr.message?.includes("is_processed") || upErr.message?.includes("column")) {
              console.warn(
                "   ⚠️ Coluna edital_pdfs.is_processed não existe. Execute: scripts/db/migration-add-edital-pdfs-is-processed.sql"
              );
            } else {
              console.warn("   ⚠️ Erro ao atualizar edital_pdfs:", upErr.message);
            }
            break;
          }
          updatedPdfs += batch.length;
        }
        if (updatedPdfs > 0) {
          console.log(`   ✅ edital_pdfs.is_processed = false: ${updatedPdfs} registro(s)`);
        }
      }

      // 3b. Todos os editais que têm pelo menos um PDF -> informacoes_processadas_em = null
      const { data: editaisWithPdfs, error: editaisError } = await supabase
        .from("edital_pdfs")
        .select("edital_id")
        .not("file_id", "is", null);

      if (editaisError) {
        console.warn("   ⚠️ Erro ao buscar editais com PDFs:", editaisError.message);
      } else if (editaisWithPdfs && editaisWithPdfs.length > 0) {
        const editalIds = [...new Set(editaisWithPdfs.map((p) => p.edital_id).filter(Boolean))];
        const BATCH_ED = 50;
        let updatedEditais = 0;
        for (let i = 0; i < editalIds.length; i += BATCH_ED) {
          const batch = editalIds.slice(i, i + BATCH_ED);
          const { error: upErr } = await supabase
            .from("editais")
            .update({ informacoes_processadas_em: null })
            .in("id", batch);

          if (upErr) {
            if (upErr.message?.includes("informacoes_processadas_em") || upErr.message?.includes("column")) {
              console.warn(
                "   ⚠️ Coluna editais.informacoes_processadas_em não existe. Execute: scripts/db/migration-add-edital-fields.sql"
              );
            } else {
              console.warn("   ⚠️ Erro ao atualizar editais:", upErr.message);
            }
            break;
          }
          updatedEditais += batch.length;
        }
        if (updatedEditais > 0) {
          console.log(`   ✅ editais.informacoes_processadas_em = null: ${updatedEditais} edital(is)\n`);
        }
      }
    } else {
      console.log("   ℹ️  Modo --only-docs: editais e edital_pdfs não foram alterados.\n");
    }

    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║                        PRÓXIMOS PASSOS                   ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("   1. No n8n: se o vector store for separado (ex.: pgvector no n8n),");
    console.log("      limpe os vetores antigos ou deixe o workflow re-inserir.");
    console.log("   2. Rode o processamento para regenerar os vetores com o novo modelo:");
    console.log("      npm run api:process-edital-info-null");
    console.log("      ou");
    console.log("      npm run api:process-edital-info");
    console.log("");
  } catch (error) {
    const err = error as Error;
    console.error("\n❌ Erro:", err.message);
    process.exit(1);
  }
}

refazerDocuments().then(() => {
  console.log("✅ Script finalizado com sucesso!");
  process.exit(0);
});
