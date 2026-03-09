import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();
router.use(express.json({ limit: "2mb" }));

// Usar n8n por padrão, API local apenas se explicitamente habilitada
const USE_LOCAL_API = process.env.USE_LOCAL_API === "true";
const LOCAL_API_URL =
  process.env.LOCAL_API_URL || "http://localhost:3000/api/extract-edital-info";
const WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://n8n.srv652789.hstgr.cloud/webhook/basic";
const WEBHOOK_LIGHT_URL = process.env.N8N_WEBHOOK_LIGHT_URL || WEBHOOK_URL;

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
const supabase =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

async function fetchEditalInfo(editalId: string): Promise<any | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("editais").select("*").eq("id", editalId).single();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchEditalPdfIds(editalId: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("edital_pdfs")
      .select("file_id")
      .eq("edital_id", editalId)
      .not("file_id", "is", null);
    if (error || !data) return [];
    return data.map((r: any) => r.file_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchEditalIdByPropostaId(propostaId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("propostas")
    .select("edital_id")
    .eq("id", propostaId)
    .single();
  if (error || !data?.edital_id) return null;
  return data.edital_id;
}

function safeTrim(s: unknown, max: number): string {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function redactLarge(obj: any, maxTotalChars: number): string {
  try {
    const parts: string[] = [];
    const walk = (o: any, path: string) => {
      if (parts.join("\n").length > maxTotalChars) return;
      if (o == null) return;
      if (typeof o === "string") {
        const v = o.trim();
        if (v) parts.push(`- ${path}: ${safeTrim(v, 500)}`);
        return;
      }
      if (typeof o === "number" || typeof o === "boolean") {
        parts.push(`- ${path}: ${String(o)}`);
        return;
      }
      if (Array.isArray(o)) {
        o.slice(0, 8).forEach((item, idx) => walk(item, `${path}[${idx}]`));
        return;
      }
      if (typeof o === "object") {
        Object.keys(o)
          .slice(0, 40)
          .forEach((k) => walk(o[k], path ? `${path}.${k}` : k));
      }
    };
    walk(obj, "");
    const out = parts.slice(0, 120).join("\n");
    return out.length > maxTotalChars ? out.slice(0, maxTotalChars) + "\n…" : out;
  } catch {
    return "";
  }
}

async function callWebhook(prompt: string, fileIds: string[]): Promise<string> {
  const isVectorInsertError = (txt: string) =>
    String(txt || "").toLowerCase().includes("vector must have at least 1 dimension");

  const apiUrl = USE_LOCAL_API ? LOCAL_API_URL : WEBHOOK_URL;
  const doRequest = (url: string, body: any) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let response = await doRequest(apiUrl, { message: prompt, file_ids: fileIds });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new Error("Webhook não registrado (404). O workflow do n8n precisa estar ativo.");
    }
    if (!USE_LOCAL_API && response.status === 400 && isVectorInsertError(errorText) && WEBHOOK_LIGHT_URL !== WEBHOOK_URL) {
      console.warn("⚠️ n8n falhou ao inserir vector (embedding vazio). Tentando fallback (light)...");
      response = await doRequest(WEBHOOK_LIGHT_URL, { message: prompt });
      if (!response.ok) {
        const errorText2 = await response.text().catch(() => "");
        throw new Error(`Erro HTTP ${response.status} (light): ${errorText2}`);
      }
    } else {
      throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
    }
  }

  const contentType = response.headers.get("content-type");
  let responseText = await response.text();
  if (USE_LOCAL_API && contentType?.includes("application/json")) {
    try {
      const jsonResponse = JSON.parse(responseText);
      responseText = jsonResponse.result || responseText;
    } catch {}
  }

  responseText = String(responseText || "").trim();
  if (!responseText) throw new Error("Resposta vazia do webhook");

  try {
    const parsed = JSON.parse(responseText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first?.output) responseText = typeof first.output === "string" ? first.output : JSON.stringify(first.output);
    }
  } catch {}

  if (responseText.includes("```")) {
    const codeBlockMatch = responseText.match(/```(?:markdown|md|json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) responseText = codeBlockMatch[1].trim();
  }

  return responseText.replace(/^```\w*\n?/gm, "").replace(/```$/gm, "").trim();
}

router.post("/analyze-field", async (req, res) => {
  try {
    const body = req.body || {};
    let edital_id = body.edital_id ?? body.editalId ?? null;
    const proposta_id = body.proposta_id ?? body.propostaId ?? null;
    const field_name = body.field_name ?? body.fieldName ?? "";
    const field_description = body.field_description ?? body.fieldDescription ?? "";
    const field_id = body.field_id ?? body.fieldId ?? "";
    const current_text = body.current_text ?? body.currentText ?? "";
    const word_limit = body.word_limit ?? body.wordLimit ?? null;
    const char_limit = body.char_limit ?? body.charLimit ?? null;
    const form_data = body.form_data ?? body.formData ?? null;
    const target_language = body.target_language ?? body.targetLanguage ?? "pt";

    if (!edital_id && proposta_id) {
      edital_id = await fetchEditalIdByPropostaId(proposta_id);
      if (!edital_id) {
        return res.status(404).json({ error: "Proposta não encontrada ou sem edital associado" });
      }
    }

    if (!edital_id || !field_name || !field_description) {
      return res.status(400).json({
        error: "Campos obrigatórios: edital_id (ou proposta_id), field_name, field_description",
      });
    }

    const editalInfo = await fetchEditalInfo(edital_id);
    if (!editalInfo) return res.status(404).json({ error: "Edital não encontrado" });
    const fileIds = await fetchEditalPdfIds(edital_id);
    const existingDoc = form_data ? redactLarge(form_data, 4500) : "";

    const prompt = `
Você é um avaliador de propostas para editais de fomento.

Analise o campo abaixo e devolva um relatório curto em Markdown.

Campo:
- ID: ${field_id || "N/A"}
- Nome: ${field_name}
- Descrição: ${field_description}
- Idioma: ${target_language === "en" ? "Inglês" : "Português"}
- Limites: ${word_limit ? `${word_limit} palavras` : "—"} / ${char_limit ? `${char_limit} caracteres` : "—"}

Edital (resumo):
- Título: ${safeTrim(editalInfo.titulo, 200) || "N/A"}
- Órgão: ${safeTrim(editalInfo.orgao, 120) || "N/A"}
- Descrição: ${safeTrim(editalInfo.descricao, 700) || "N/A"}
- Critérios de elegibilidade: ${safeTrim(editalInfo.criterios_elegibilidade, 700) || "N/A"}

Texto atual do campo:
"""
${String(current_text || "").trim()}
"""

Conteúdo do restante do documento (resumo):
${existingDoc ? existingDoc : "- (nenhum)"}

Entregue o relatório em Markdown com as seções:
## Pontos fortes
## Pontos fracos / faltando
## Sugestões objetivas (bullet points)
## Checklist de conformidade (com [ ] itens)

Responda APENAS com o Markdown, sem texto extra.
`;

    const analysis = await callWebhook(prompt, fileIds);
    return res.json({ analysis_markdown: analysis });
  } catch (error) {
    console.error("❌ Erro ao analisar campo:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: errorMessage });
  }
});

export default router;

