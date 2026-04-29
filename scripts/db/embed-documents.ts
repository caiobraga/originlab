/**
 * Gera embeddings para os registros da tabela documents e preenche:
 * - content: texto usado para o embedding (para RAG)
 * - metadata: extra data com file_id
 * - embedding: vetor do modelo (mxbai-embed-large ou OpenAI)
 *
 * Requer: migration-add-documents-embedding.sql aplicada no Supabase.
 *
 * Uso:
 *   npm run db:embed-documents
 *   npm run db:embed-documents -- --dry-run
 *   npm run db:embed-documents -- --limit 50
 *   npm run db:embed-documents -- --only-missing   # só quem ainda não tem embedding
 *
 * Variáveis de ambiente:
 *   OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL (padrão nomic-embed-text) → usa Ollama
 *   OPENAI_API_KEY, OPENAI_EMBED_MODEL (padrão text-embedding-3-small) → usa OpenAI
 *   EMBED_MAX_CHARS (truncar texto para N caracteres antes de embedar; padrão 24000)
 */
import "../load-env";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

const CONTENT_COLUMNS = ["content", "text", "body", "page_content", "chunk", "data", "value"] as const;
const SKIP_KEYS = new Set(["id", "file_id", "metadata", "embedding", "created_at", "updated_at"]);
const EMBED_MAX_CHARS = parseInt(process.env.EMBED_MAX_CHARS || "24000", 10);
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "mxbai-embed-large:latest";
const EMBED_DIMENSIONS = process.env.EMBED_DIMENSIONS ? parseInt(process.env.EMBED_DIMENSIONS, 10) : null;
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const OPENAI_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

type DocRow = { id: string; file_id?: string | null; [k: string]: unknown };

async function detectContentColumn(): Promise<{ column: string; columnsFound: string[] } | null> {
  const forced = process.env.EMBED_CONTENT_COLUMN?.trim();
  if (forced) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, " + forced)
      .limit(1)
      .maybeSingle();
    if (!error && data != null) {
      const val = (data as Record<string, unknown>)[forced];
      if (typeof val === "string" && val.trim().length > 0) return { column: forced, columnsFound: [forced] };
    }
  }

  const { data: row, error } = await supabase
    .from("documents")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("   Aviso ao inspecionar documents:", error.message);
    for (const col of CONTENT_COLUMNS) {
      const { data, error: e2 } = await supabase
        .from("documents")
        .select("id, " + col)
        .limit(1)
        .maybeSingle();
      if (!e2 && data != null) {
        const val = (data as Record<string, unknown>)[col];
        if (typeof val === "string" && val.trim().length > 0) return { column: col, columnsFound: [col] };
      }
    }
    return null;
  }

  const columnsFound = row == null ? [] : Object.keys(row as object).filter((k) => !SKIP_KEYS.has(k));

  if (row != null && typeof row === "object") {
    const r = row as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (SKIP_KEYS.has(key)) continue;
      const val = r[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return { column: key, columnsFound };
      }
    }
    for (const col of CONTENT_COLUMNS) {
      if (col in r) {
        const val = r[col];
        if (typeof val === "string") return { column: col, columnsFound };
      }
    }
  }

  return { column: "", columnsFound };
}

function getText(row: DocRow, contentCol: string): string {
  const raw = row[contentCol];
  if (typeof raw !== "string") return "";
  const text = raw.trim();
  if (text.length <= EMBED_MAX_CHARS) return text;
  return text.slice(0, EMBED_MAX_CHARS);
}

async function embedWithOllama(texts: string[]): Promise<number[][]> {
  const url = `${OLLAMA_BASE}/api/embed`;
  const input = texts.length === 1 ? texts[0] : texts;
  const body: { model: string; input: string | string[]; dimensions?: number } = {
    model: OLLAMA_EMBED_MODEL,
    input,
  };
  if (EMBED_DIMENSIONS != null && EMBED_DIMENSIONS > 0) {
    body.dimensions = EMBED_DIMENSIONS;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama embed failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings || [];
}

async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não definida");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBED_MODEL,
      input: texts,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embed failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return (data.data || []).map((d) => d.embedding);
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const trimmed = texts.map((t) => (typeof t === "string" ? t.trim() : ""));
  if (trimmed.every((t) => !t)) return [];
  if (process.env.OPENAI_API_KEY) {
    return embedWithOpenAI(trimmed);
  }
  return embedWithOllama(trimmed);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit=")) || args.find((a) => a === "--limit");
  const limit = limitArg
    ? parseInt(limitArg.split("=")[1] || args[args.indexOf("--limit") + 1] || "0", 10)
    : null;

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   EMBEDDINGS PARA DOCUMENTS (file_id em metadata)         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const provider = process.env.OPENAI_API_KEY ? "OpenAI" : "Ollama";
  console.log(`   Provedor: ${provider}`);
  if (provider === "Ollama") {
    console.log(`   Modelo: ${OLLAMA_EMBED_MODEL} (${OLLAMA_BASE})`);
    if (EMBED_DIMENSIONS != null && EMBED_DIMENSIONS > 0) {
      console.log(`   Dimensões: ${EMBED_DIMENSIONS} (compatível com coluna vector(${EMBED_DIMENSIONS}) no banco)`);
    }
  } else {
    console.log(`   Modelo: ${OPENAI_EMBED_MODEL}`);
  }
  console.log(`   Truncar texto em: ${EMBED_MAX_CHARS} caracteres`);
  if (dryRun) console.log("   Modo: --dry-run (não grava no banco)");
  if (args.includes("--only-missing")) console.log("   Modo: --only-missing (apenas documentos sem embedding)");
  console.log("");

  const detected = await detectContentColumn();
  if (!detected || !detected.column) {
    console.error("❌ Nenhuma coluna de conteúdo encontrada em documents.");
    console.error("   Colunas tentadas: " + CONTENT_COLUMNS.join(", "));
    if (detected?.columnsFound?.length) {
      console.error("   Colunas presentes na tabela (amostra): " + detected.columnsFound.join(", "));
      console.error("   Defina EMBED_CONTENT_COLUMN no .env.local com o nome da coluna de texto.");
    } else {
      console.error("   A tabela pode estar vazia ou com outro esquema. Defina EMBED_CONTENT_COLUMN com o nome da coluna de texto.");
    }
    process.exit(1);
  }
  const contentCol = detected.column;
  console.log(`   Coluna de conteúdo: ${contentCol}\n`);

  const onlyMissing = args.includes("--only-missing");
  let query = supabase
    .from("documents")
    .select("id, file_id, " + contentCol)
    .not(contentCol, "is", null);
  if (onlyMissing) {
    query = query.is("embedding", null);
  }
  const { data: rows, error } = await query;

  if (error) {
    if (error.message?.includes("embedding") || error.message?.includes("metadata")) {
      console.error("❌ Tabela documents sem colunas embedding/metadata. Execute migration-add-documents-embedding.sql no Supabase.");
    } else {
      console.error("❌ Erro ao buscar documents:", error.message);
    }
    process.exit(1);
  }

  const docs = (rows || []) as DocRow[];
  const toProcess = limit != null && limit > 0 ? docs.slice(0, limit) : docs;
  console.log(`📑 Documentos com conteúdo: ${docs.length}`);
  if (limit != null && limit > 0) {
    console.log(`   Processando apenas os primeiros ${toProcess.length} (--limit=${limit})\n`);
  } else {
    console.log("");
  }

  if (toProcess.length === 0) {
    console.log("✅ Nenhum documento para processar.");
    return;
  }

  const BATCH = 10;
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH);
    const texts = batch.map((r) => getText(r, contentCol));
    const ids = batch.map((r) => r.id);

    try {
      const embeddings = await generateEmbeddings(texts);
      if (embeddings.length !== batch.length) {
        console.warn(`   ⚠️ Batch ${i / BATCH + 1}: esperados ${batch.length} embeddings, obtidos ${embeddings.length}`);
      }

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const text = texts[j] ?? "";
        const meta: Record<string, unknown> = {
          file_id: row.file_id ?? null,
        };
        if (dryRun) {
          console.log(`   [dry-run] id=${row.id} file_id=${row.file_id ?? "null"} embedding_len=${embeddings[j]?.length ?? 0}`);
          ok++;
          continue;
        }
        const emb = embeddings[j];
        if (!emb || emb.length === 0) {
          fail++;
          continue;
        }
        const updatePayload: { embedding: number[]; metadata: Record<string, unknown>; content?: string } = {
          embedding: emb,
          metadata: meta,
        };
        if (text.length > 0) {
          updatePayload.content = text;
        }
        const { error: upErr } = await supabase
          .from("documents")
          .update(updatePayload)
          .eq("id", row.id);

        if (upErr) {
          if (upErr.message.includes("expected 768 dimensions") || upErr.message.includes("expected 1024 dimensions")) {
            if (fail === 0) {
              console.warn(`   ⚠️ Coluna embedding no banco tem dimensão diferente do modelo.`);
              console.warn(`   Solução mais simples: no .env.local defina EMBED_DIMENSIONS=768 e rode de novo.`);
              console.warn(`   Ou altere a coluna no Supabase para 1024d: scripts/db/migration-documents-embedding-768-to-1024.sql`);
            }
            console.warn(`   ⚠️ Erro ao atualizar ${row.id}:`, upErr.message);
          } else {
            console.warn(`   ⚠️ Erro ao atualizar ${row.id}:`, upErr.message);
          }
          fail++;
        } else {
          ok++;
        }
      }

      console.log(`   ✅ Processados ${Math.min(i + BATCH, toProcess.length)}/${toProcess.length}`);
    } catch (e) {
      const err = e as Error;
      console.error(`   ❌ Erro no batch:`, err.message);
      fail += batch.length;
    }

    if (i + BATCH < toProcess.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                        RESUMO                             ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`   Atualizados (content + metadata + embedding): ${ok}`);
  if (fail > 0) console.log(`   Falhas: ${fail}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
