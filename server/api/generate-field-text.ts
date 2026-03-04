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
  "https://n8n.srv652789.hstgr.cloud/webhook/789b0959-b90f-40e8-afe8-03aa8e486b43";
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

async function callWebhook(prompt: string, fileIds: string[]): Promise<string> {
  const isVectorInsertError = (txt: string) =>
    String(txt || "").toLowerCase().includes("vector must have at least 1 dimension");

  const requestBody = { message: prompt, file_ids: fileIds };
  const apiUrl = USE_LOCAL_API ? LOCAL_API_URL : WEBHOOK_URL;

  const doRequest = (url: string, body: any) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

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

    const existingDoc = form_data ? redactLarge(form_data, 7000) : "";
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
- Descrição: ${safeTrim(editalInfo.descricao, 900) || "N/A"}
- Critérios de elegibilidade: ${safeTrim(editalInfo.criterios_elegibilidade, 900) || "N/A"}
- Sobre o programa: ${safeTrim(editalInfo.sobre_programa, 700) || "N/A"}

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

    let generated = await callWebhook(prompt, fileIds);

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

