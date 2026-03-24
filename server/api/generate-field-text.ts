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
/** Timeout para a chamada ao webhook (n8n/Ollama). Padrão 5 min. */
const WEBHOOK_TIMEOUT_MS = Math.max(60000, parseInt(process.env.WEBHOOK_TIMEOUT_MS || "300000", 10) || 300000);

/** Tamanho do contexto no prompt (geração com IA local / n8n). Aumente para respostas mais ricas (cuidado com VRAM/tempo). */
const GEN_FIELD_EXISTING_DOC_CHARS = Math.max(1000, parseInt(process.env.GEN_FIELD_EXISTING_DOC_CHARS || "7000", 10) || 7000);
const GEN_FIELD_EDITAL_DESCR_MAX = Math.max(200, parseInt(process.env.GEN_FIELD_EDITAL_DESCR_MAX || "900", 10) || 900);
const GEN_FIELD_EDITAL_CRITERIOS_MAX = Math.max(200, parseInt(process.env.GEN_FIELD_EDITAL_CRITERIOS_MAX || "900", 10) || 900);
const GEN_FIELD_EDITAL_SOBRE_MAX = Math.max(200, parseInt(process.env.GEN_FIELD_EDITAL_SOBRE_MAX || "700", 10) || 700);

/** Tunnel para Ollama local (ex.: https://aisecretary.com). Quando definido, a geração usa esse endpoint com contexto RAG + edital + usuário. */
function normalizeAiSecretaryUrl(raw: string): string {
  const s = (raw || "").trim().replace(/\/$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    u.hostname = u.hostname.replace(/\.$/, ""); // evita "aisecretary.com." → ERR_TLS_CERT_ALTNAME_INVALID
    return u.toString();
  } catch {
    return s;
  }
}
const AI_SECRETARY_URL = normalizeAiSecretaryUrl(process.env.AI_SECRETARY_URL || "");
const AI_SECRETARY_MODEL = process.env.AI_SECRETARY_MODEL || "qwen2.5:7b";
const AI_SECRETARY_MAX_CONTEXT_CHARS = parseInt(process.env.AI_SECRETARY_MAX_CONTEXT_CHARS || "22000", 10);
/** Se "true", desativa verificação TLS (útil quando o tunnel usa certificado de outro domínio, ex.: fkw.com). */
const AI_SECRETARY_INSECURE = process.env.AI_SECRETARY_INSECURE === "true";

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

/** Resolve fileIds (edital_pdfs.id ou file_id) para lista de file_id usados na tabela documents. */
async function resolveFileIdsForDocuments(fileIds: string[]): Promise<string[]> {
  if (!supabase || fileIds.length === 0) return fileIds;
  const trimmed = fileIds.map((id) => id.trim()).filter(Boolean);
  const { data: byId } = await supabase
    .from("edital_pdfs")
    .select("id, file_id")
    .in("id", trimmed);
  const { data: byFileId } = await supabase
    .from("edital_pdfs")
    .select("id, file_id")
    .in("file_id", trimmed);
  const docFileIds = new Set<string>();
  for (const p of byId || []) {
    const r = p as Record<string, unknown>;
    const fid = r.file_id;
    docFileIds.add(typeof fid === "string" && fid ? fid : String(r.id));
  }
  for (const p of byFileId || []) {
    const r = p as Record<string, unknown>;
    const fid = r.file_id;
    docFileIds.add(typeof fid === "string" && fid ? fid : String(r.id));
  }
  return [...docFileIds];
}

/** Busca conteúdo dos documentos (RAG) por file_id para incluir no prompt do Ollama/tunnel. */
async function fetchDocumentContextByFileIds(fileIds: string[]): Promise<string> {
  if (!supabase || fileIds.length === 0) return "";
  const resolvedIds = await resolveFileIdsForDocuments(fileIds);
  if (resolvedIds.length === 0) return "";
  const contentColumns = ["name", "content", "text", "body", "page_content", "chunk"];
  for (const col of contentColumns) {
    const selectCols = "id, file_id, metadata, " + col;
    let rows: unknown[] | null = null;
    let err: { message?: string } | null = null;
    const res = await supabase
      .from("documents")
      .select(selectCols)
      .in("file_id", resolvedIds)
      .order("file_id", { ascending: true })
      .order("id", { ascending: true });
    err = res.error;
    rows = res.data;
    if (err != null) continue;
    if (!rows?.length) continue;
    const withIndex = (rows as Record<string, unknown>[]).map((r) => {
      const meta = r.metadata as Record<string, unknown> | undefined;
      const idx = typeof meta?.chunk_index === "number" ? meta.chunk_index : -1;
      return { row: r, chunkIndex: idx };
    });
    withIndex.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const parts: string[] = [];
    for (const { row: r } of withIndex) {
      const content = r[col];
      if (typeof content === "string" && content.trim().length > 0) {
        const fileLabel =
          (r.file_id as string) ||
          (r.metadata as Record<string, unknown>)?.["file_id"] as string ||
          String(r.id);
        parts.push(`--- Documento ${String(fileLabel).slice(0, 8)} ---\n${content.trim()}`);
      }
    }
    if (parts.length > 0) {
      const joined = parts.join("\n\n");
      return joined.length > AI_SECRETARY_MAX_CONTEXT_CHARS
        ? joined.slice(0, AI_SECRETARY_MAX_CONTEXT_CHARS) + "\n\n[... texto truncado ...]"
        : joined;
    }
  }
  return "";
}

function safeTrim(s: unknown, max: number): string {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function redactLarge(obj: any, maxTotalChars: number): string {
  // Cria um “resumo” do que já está escrito no documento.
  // Limita para não estourar o prompt do webhook.
  try {
    const pairs: Array<{ k: string; v: string }> = [];
    const walk = (o: any, path: string) => {
      if (pairs.reduce((acc, p) => acc + p.k.length + p.v.length + 6, 0) > maxTotalChars) return;
      if (o == null) return;
      if (typeof o === "string") {
        const v = o.trim();
        if (v) pairs.push({ k: path, v: safeTrim(v, 700) });
        return;
      }
      if (typeof o === "number" || typeof o === "boolean") {
        pairs.push({ k: path, v: String(o) });
        return;
      }
      if (Array.isArray(o)) {
        o.slice(0, 10).forEach((item, idx) => walk(item, `${path}[${idx}]`));
        return;
      }
      if (typeof o === "object") {
        Object.keys(o)
          .slice(0, 50)
          .forEach((key) => walk(o[key], path ? `${path}.${key}` : key));
      }
    };
    walk(obj, "");
    const lines = pairs
      .filter((p) => p.k && p.v)
      .map((p) => `- ${p.k}: ${p.v}`)
      .slice(0, 120);
    const out = lines.join("\n");
    return out.length > maxTotalChars ? out.slice(0, maxTotalChars) + "\n…" : out;
  } catch {
    return "";
  }
}

function extractCnpjFromForm(formData: any): string | null {
  const raw =
    formData?.instituicao_executora?.cnpj ||
    formData?.projeto_pesquisa?.cnpj ||
    formData?.cnpj ||
    null;
  if (!raw) return null;
  const clean = String(raw).replace(/\D/g, "");
  return clean.length === 14 ? clean : null;
}

function extractLattesIdFromForm(formData: any): string | null {
  const raw =
    formData?.coordenador_projeto?.cv_lattes ||
    formData?.user?.lattesId ||
    formData?.lattesId ||
    null;
  if (!raw) return null;
  const m = String(raw).match(/\b(\d{16})\b/);
  return m ? m[1] : null;
}

async function fetchCnpjInfo(cnpj: string): Promise<any | null> {
  // Reimplementação leve (baseada em fetch-lattes.ts), sem cache.
  const clean = String(cnpj).replace(/\D/g, "");
  if (clean.length !== 14) return null;
  const fetchOpts = {
    method: "GET" as const,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; OrigemLab/1.0)",
    },
  };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      ...fetchOpts,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      return {
        cnpj: clean,
        razaoSocial: data.razao_social || data.nome_fantasia || "",
        nomeFantasia: data.nome_fantasia || "",
        situacao: data.descricao_situacao_cadastral || "",
        porte: data.porte || "",
        naturezaJuridica: data.natureza_juridica || "",
        dataAbertura: data.data_inicio_atividade || "",
        municipio: data.municipio || "",
        uf: data.uf || "",
        cnaePrincipal: data.cnae_fiscal_descricao || "",
      };
    }
  } catch {}

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://www.receitaws.com.br/v1/cnpj/${clean}`, {
      ...fetchOpts,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      if (data && data.status !== "ERROR") {
        return {
          cnpj: clean,
          razaoSocial: data.nome || data.fantasia || "",
          nomeFantasia: data.fantasia || "",
          situacao: data.situacao || "",
          porte: data.porte || "",
          naturezaJuridica: data.natureza_juridica || "",
          dataAbertura: data.abertura || "",
          municipio: data.municipio || "",
          uf: data.uf || "",
          cnaePrincipal: data.atividade_principal?.[0]?.text || "",
        };
      }
    }
  } catch {}

  return null;
}

async function fetchLattesSummary(lattesId: string): Promise<any | null> {
  const id = String(lattesId).replace(/\D/g, "");
  if (id.length !== 16) return null;
  const url = `https://buscatextual.cnpq.br/buscatextual/download.do?metodo=apresentar&idcnpq=${id}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/xml, text/xml, */*" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const xml = await r.text();
    if (!xml || xml.length < 200) return null;
    // Extrair poucos campos (nome, áreas) via regex simples
    const nome =
      xml.match(/<NOME-COMPLETO>([\s\S]*?)<\/NOME-COMPLETO>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ||
      null;
    const areas: string[] = [];
    const re = /<NOME-DA-AREA-DO-CONHECIMENTO>([\s\S]*?)<\/NOME-DA-AREA-DO-CONHECIMENTO>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const v = m[1].replace(/<[^>]+>/g, "").trim();
      if (v && !areas.includes(v)) areas.push(v);
      if (areas.length >= 8) break;
    }
    return {
      id,
      nome,
      areasAtuacao: areas.length ? areas : undefined,
      linkLattes: `http://lattes.cnpq.br/${id}`,
    };
  } catch {
    return null;
  }
}

/** Chama o tunnel Ollama (aisecretary.com) com prompt completo (já com contexto RAG embutido). */
async function callAiSecretary(prompt: string): Promise<string> {
  const baseUrl = AI_SECRETARY_URL.replace(/\/$/, "");
  const url = baseUrl + "/api/generate";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const undici = await import("undici").catch(() => null) as
      | { fetch: typeof fetch; Agent: new (opts?: Record<string, unknown>) => unknown }
      | null;
    const body = {
      model: AI_SECRETARY_MODEL,
      prompt,
      stream: false,
    };
    const opts: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    };
    if (undici?.Agent) {
      const agentOpts: Record<string, unknown> = {
        headersTimeout: WEBHOOK_TIMEOUT_MS,
        bodyTimeout: WEBHOOK_TIMEOUT_MS,
      };
      if (AI_SECRETARY_INSECURE) {
        (agentOpts as any).connect = { rejectUnauthorized: false };
      }
      opts.dispatcher = new undici.Agent(agentOpts);
    }
    const res = await fetch(url, opts);
    clearTimeout(t);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`AI Secretary (Ollama tunnel) respondeu ${res.status}: ${errText.slice(0, 300)}`);
    }
    const json = (await res.json()) as { response?: string };
    let text = (json.response || "").trim();
    if (text.includes("```")) {
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch?.[1]) text = codeBlockMatch[1].trim();
    }
    return text.replace(/^```\w*\n?/gm, "").replace(/```$/gm, "").trim() || (json.response || "").trim();
  } catch (e) {
    clearTimeout(t);
    if ((e as Error)?.name === "AbortError") {
      throw new Error(`AI Secretary timeout após ${WEBHOOK_TIMEOUT_MS}ms. Aumente WEBHOOK_TIMEOUT_MS no .env se necessário.`);
    }
    throw e;
  }
}

async function callWebhook(prompt: string, fileIds: string[]): Promise<string> {
  const isVectorInsertError = (txt: string) =>
    String(txt || "").toLowerCase().includes("vector must have at least 1 dimension");

  const requestBody = { message: prompt, file_ids: fileIds };
  const apiUrl = USE_LOCAL_API ? LOCAL_API_URL : WEBHOOK_URL;

  const doRequest = async (url: string, body: any) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const undici = await import("undici").catch(() => null) as
        | { fetch: typeof fetch; Agent: new (opts?: { headersTimeout?: number; bodyTimeout?: number }) => unknown }
        | null;
      const opts: RequestInit & { dispatcher?: unknown } = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      };
      if (undici?.Agent) {
        opts.dispatcher = new undici.Agent({
          headersTimeout: WEBHOOK_TIMEOUT_MS,
          bodyTimeout: WEBHOOK_TIMEOUT_MS,
        });
      }
      const res = await fetch(url, opts);
      clearTimeout(t);
      return res;
    } catch (e) {
      clearTimeout(t);
      if ((e as Error)?.name === "AbortError") {
        throw new Error(`Webhook timeout após ${WEBHOOK_TIMEOUT_MS}ms. Aumente WEBHOOK_TIMEOUT_MS no .env ou use modelo Ollama mais rápido.`);
      }
      throw e;
    }
  };

  let response = await doRequest(apiUrl, requestBody);

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

  // Formato n8n: pode vir como array JSON [{output: "..."}]
  try {
    const parsed = JSON.parse(responseText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first?.output) {
        responseText = typeof first.output === "string" ? first.output : JSON.stringify(first.output);
      }
    }
  } catch {}

  if (responseText.includes("```")) {
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) responseText = codeBlockMatch[1].trim();
  }

  return responseText.replace(/^```\w*\n?/gm, "").replace(/```$/gm, "").trim();
}

router.post("/generate-field-text", async (req, res) => {
  try {
    const body = req.body || {};
    let edital_id = body.edital_id ?? body.editalId ?? null;
    const proposta_id = body.proposta_id ?? body.propostaId ?? null;
    const field_name = body.field_name ?? body.fieldName ?? "";
    const field_description = body.field_description ?? body.fieldDescription ?? "";
    const field_id = body.field_id ?? body.fieldId ?? "";
    const word_limit = body.word_limit ?? body.wordLimit ?? null;
    const char_limit = body.char_limit ?? body.charLimit ?? null;
    const form_data = body.form_data ?? body.formData ?? null;

    const target_language =
      body.target_language ??
      body.targetLanguage ??
      (/\b(en|english|ingl[eê]s)\b/i.test(String(field_name)) || /_en\b/i.test(String(field_id))
        ? "en"
        : "pt");

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

    const cnpj = extractCnpjFromForm(form_data);
    const lattesId = extractLattesIdFromForm(form_data);
    const [cnpjInfo, lattesSummary] = await Promise.all([
      cnpj ? fetchCnpjInfo(cnpj) : Promise.resolve(null),
      lattesId ? fetchLattesSummary(lattesId) : Promise.resolve(null),
    ]);

    const existingDoc = form_data ? redactLarge(form_data, GEN_FIELD_EXISTING_DOC_CHARS) : "";
    const limitText = word_limit
      ? `IMPORTANTE: O texto gerado DEVE ter no máximo ${word_limit} palavras.`
      : "";
    const charLimitText = char_limit
      ? `IMPORTANTE: O texto gerado DEVE ter no máximo ${char_limit} caracteres (contando espaços).`
      : "";

    const prompt = `
Você é um assistente especialista em escrever textos para propostas de editais de fomento.

Objetivo:
Gerar DO ZERO o conteúdo do campo abaixo, usando o edital e o contexto do usuário e do documento como base.

Campo:
- ID do campo: ${field_id || "N/A"}
- Nome: ${field_name}
- Descrição do campo: ${field_description}
${limitText}
${charLimitText}

Idioma do campo: ${target_language === "en" ? "Inglês" : "Português"}

Informações do Edital (resumo):
- Título: ${safeTrim(editalInfo.titulo, 200) || "N/A"}
- Número: ${safeTrim(editalInfo.numero, 80) || "N/A"}
- Órgão: ${safeTrim(editalInfo.orgao, 120) || "N/A"}
- Descrição: ${safeTrim(editalInfo.descricao, GEN_FIELD_EDITAL_DESCR_MAX) || "N/A"}
- Critérios de elegibilidade: ${safeTrim(editalInfo.criterios_elegibilidade, GEN_FIELD_EDITAL_CRITERIOS_MAX) || "N/A"}
- Sobre o programa: ${safeTrim(editalInfo.sobre_programa, GEN_FIELD_EDITAL_SOBRE_MAX) || "N/A"}

Contexto do usuário/organização (quando disponível):
- CNPJ (informado): ${cnpj || "N/A"}
- Dados do CNPJ: ${cnpjInfo ? JSON.stringify(cnpjInfo) : "N/A"}
- Lattes ID (inferido): ${lattesId || "N/A"}
- Resumo do Lattes: ${lattesSummary ? JSON.stringify(lattesSummary) : "N/A"}

Conteúdo já escrito no documento (para contexto e coerência):
${existingDoc ? existingDoc : "- (nenhum conteúdo relevante encontrado)"}

Regras:
1. Gere um texto novo, não apenas uma reescrita.
2. Seja consistente com o que já foi escrito em outros campos.
3. Não invente dados pessoais específicos (nomes, números, datas) que não existam no contexto; use formulações genéricas quando faltar dado.
4. Responda APENAS com o texto final do campo, sem explicações, sem markdown.
`;

    let generated: string;
    if (AI_SECRETARY_URL) {
      const documentContext = await fetchDocumentContextByFileIds(fileIds);
      const promptWithContext = documentContext
        ? prompt + `

Conteúdo dos documentos do edital (use como referência para critérios e redação):
${documentContext}`
        : prompt;
      generated = await callAiSecretary(promptWithContext);
    } else {
      generated = await callWebhook(prompt, fileIds);
    }

    if (char_limit && typeof char_limit === "number" && Number.isFinite(char_limit) && char_limit > 0) {
      if (generated.length > char_limit) {
        const hard = generated.slice(0, char_limit);
        const lastBreak =
          Math.max(
            hard.lastIndexOf("\n"),
            hard.lastIndexOf(". "),
            hard.lastIndexOf("! "),
            hard.lastIndexOf("? "),
            hard.lastIndexOf("; "),
            hard.lastIndexOf(", "),
            hard.lastIndexOf(" ")
          );
        const cutAt = lastBreak >= Math.max(0, char_limit - 120) ? lastBreak : char_limit;
        generated = hard.slice(0, cutAt).trim();
      }
    }

    return res.json({ generated_text: generated });
  } catch (error) {
    console.error("❌ Erro ao gerar texto do campo:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: errorMessage });
  }
});

export default router;

