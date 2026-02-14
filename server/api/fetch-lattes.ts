/**
 * GET /api/lattes/:id
 * POST /api/lattes/parse-paste - cola HTML/texto
 * POST /api/lattes/parse-zip - upload do ZIP exportado do wwws.cnpq.br (requer login lá).
 * POST /api/lattes/parse-pdf - upload de PDF do currículo; extrai texto e retorna dados no mesmo formato.
 * GET /api/fetch-cnpj?cnpj=xx - busca dados de CNPJ (ReceitaWS/BrasilAPI) com cache no banco
 */
import express from "express";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const LATTES_XML_URL = "https://buscatextual.cnpq.br/buscatextual/download.do?metodo=apresentar&idcnpq=";
const LATTES_HTML_URL = "https://buscatextual.cnpq.br/buscatextual/visualizacv.do?id=";

const LATTES_FETCH_TIMEOUT_MS = 8000;

function getFetchOptions(): RequestInit {
  return {
    method: "GET",
    headers: {
      Accept: "text/html, application/xml, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(LATTES_FETCH_TIMEOUT_MS),
  };
}

/** Página de captcha do CNPq: não contém o currículo real. */
function isCaptchaPage(html: string): boolean {
  return (
    /captcha|grecaptcha|recaptcha|reCAPTCHA/i.test(html) ||
    /c[oó]digo\s+de\s+seguran[cç]a|nomeCaptchar|tokenCaptchar/i.test(html) ||
    /visualizarCurriculo\s*\(\s*\)|id="formulario".*visualizacv/i.test(html)
  );
}

/** Decodifica entidades HTML comuns para exibição. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&ccedil;/g, "ç")
    .replace(/&atilde;/g, "ã")
    .replace(/&otilde;/g, "õ")
    .replace(/&acirc;/g, "â")
    .replace(/&ecirc;/g, "ê")
    .replace(/&ocirc;/g, "ô")
    .trim();
}

/** Descarta valores que são lixo da página de captcha ou CSS. */
function looksLikeCaptchaOrCss(text: string): boolean {
  if (!text || text.length > 200) return true;
  const t = text.toLowerCase();
  return (
    /seguran[cç]a|captcha|c[oó]digo\s+de|verifica[cç][aã]o/i.test(t) ||
    /\b\d+px\b|padding:\s*|margin:\s*|id\s*=\s*["']|style\s*=/i.test(t) ||
    /divBotoes|formulario|grecaptcha/i.test(t)
  );
}

function parseLattesFromXml(xml: string, id: string): Record<string, unknown> | null {
  const strip = (s: string) => s.replace(/<[^>]+>/g, "").trim();
  const one = (text: string, re: RegExp): string | undefined => {
    const m = text.match(re);
    return m ? strip(m[1]) : undefined;
  };
  const oneGlobal = (re: RegExp): string | undefined => one(xml, re);
  const all = (re: RegExp): string[] => {
    const matches = xml.matchAll(re);
    return [...matches].map((m) => strip(m[1])).filter(Boolean);
  };

  const nome = oneGlobal(/<NOME-COMPLETO>([\s\S]*?)<\/NOME-COMPLETO>/i) || `Pesquisador ${id.slice(0, 4)}`;
  const areas = all(/<NOME-DA-AREA-DO-CONHECIMENTO>([\s\S]*?)<\/NOME-DA-AREA-DO-CONHECIMENTO>/gi);
  const areasEspecialidade = all(/<NOME-DA-ESPECIALIDADE>([\s\S]*?)<\/NOME-DA-ESPECIALIDADE>/gi);
  const areasAtuacao = [...new Set([...areas, ...areasEspecialidade])].filter(Boolean);

  const formacaoBlocks = xml.match(/<FORMACAO-ACADEMICA-TITULACAO>[\s\S]*?<\/FORMACAO-ACADEMICA-TITULACAO>/gi);
  const formacao: Array<{ nivel: string; curso: string; instituicao: string; anoConclusao?: string }> = [];
  if (formacaoBlocks) {
    for (const block of formacaoBlocks) {
      const nivel = one(block, /<NOME-NIVEL-CURSO>([\s\S]*?)<\/NOME-NIVEL-CURSO>/i) || one(block, /<NOME-CURSO>([\s\S]*?)<\/NOME-CURSO>/i);
      const curso = one(block, /<NOME-CURSO>([\s\S]*?)<\/NOME-CURSO>/i) || "";
      const instituicao = one(block, /<NOME-INSTITUICAO>([\s\S]*?)<\/NOME-INSTITUICAO>/i) || "";
      const ano = one(block, /<ANO-DE-CONCLUSAO>([\s\S]*?)<\/ANO-DE-CONCLUSAO>/i);
      if (nivel) formacao.push({ nivel, curso, instituicao, anoConclusao: ano });
    }
  }

  const possuiDoutorado = /doutorado|ph\.?d|doutor/i.test(formacao.map((f) => f.nivel).join(" "));
  const possuiMestrado = /mestrado|master/i.test(formacao.map((f) => f.nivel).join(" "));
  const possuiGraduacao = /graduação|bacharelado|licenciatura/i.test(formacao.map((f) => f.nivel).join(" "));

  const vinculos = all(/<NOME-INSTITUICAO>([\s\S]*?)<\/NOME-INSTITUICAO>/gi).slice(0, 5);
  const enderecos = xml.match(/<ENDERECO-PROFISSIONAL>([\s\S]*?)<\/ENDERECO-PROFISSIONAL>/gi);
  let cidade: string | undefined;
  let uf: string | undefined;
  if (enderecos && enderecos[0]) {
    cidade = oneGlobal(/<MUNICIPIO>([\s\S]*?)<\/MUNICIPIO>/i);
    uf = oneGlobal(/<UF>([\s\S]*?)<\/UF>/i);
  }

  const artigos = (xml.match(/<ARTIGO-EM-PERIODICO>/gi) || []).length;
  const livros = (xml.match(/<LIVRO-PUBLICADO>/gi) || []).length;
  const capitulos = (xml.match(/<CAPITULO-DE-LIVRO-PUBLICADO>/gi) || []).length;
  const projetos = (xml.match(/<PROJETO-DE-PESQUISA>/gi) || []).length;
  const resumoProducoes: string[] = [];
  if (artigos > 0) resumoProducoes.push(`${artigos} artigo(s)`);
  if (livros > 0) resumoProducoes.push(`${livros} livro(s)`);
  if (capitulos > 0) resumoProducoes.push(`${capitulos} capítulo(s)`);
  if (projetos > 0) resumoProducoes.push(`${projetos} projeto(s)`);

  const anosMatch = xml.match(/\b(19|20)\d{2}\b/g);
  let anosExperiencia: number | undefined;
  if (anosMatch && anosMatch.length > 0) {
    const anos = anosMatch.map((a) => parseInt(a, 10)).filter((a) => a >= 1970 && a <= new Date().getFullYear());
    if (anos.length > 0) anosExperiencia = new Date().getFullYear() - Math.min(...anos);
  }

  return {
    id,
    nome,
    resumo: "Informações extraídas do Currículo Lattes (CNPq).",
    areasAtuacao: areasAtuacao.length > 0 ? areasAtuacao : undefined,
    formacao: formacao.length > 0 ? formacao : undefined,
    vinculoInstitucional: vinculos.length > 0 ? vinculos : undefined,
    enderecoProfissional: cidade || uf ? { cidade, uf, pais: "Brasil" } : undefined,
    resumoProducoes: resumoProducoes.length > 0 ? resumoProducoes.join(", ") : undefined,
    linkLattes: `http://lattes.cnpq.br/${id}`,
    elegibilidade: {
      possuiDoutorado,
      possuiMestrado,
      possuiGraduacao,
      anosExperiencia,
      podeParticiparEditais: possuiDoutorado || possuiMestrado || possuiGraduacao,
      observacoes: undefined,
    },
  };
}

function parseLattesFromHtml(html: string, id: string): Record<string, unknown> | null {
  const nomeMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/i) || html.match(/Nome[:\s]*([^<\n]+)/i);
  let nome = nomeMatch ? decodeHtmlEntities(nomeMatch[1].trim()) : `Pesquisador ${id.slice(0, 4)}`;
  if (looksLikeCaptchaOrCss(nome)) nome = `Pesquisador ${id.slice(0, 4)}`;

  const areasMatch = html.match(/(?:Grande\s+Área|Área|Subárea|Especialidade)[^:]*:\s*([^<\n]+)/gi);
  const areasAtuacao: string[] = [];
  if (areasMatch) {
    areasMatch.forEach((match) => {
      const area = decodeHtmlEntities(match.replace(/(?:Grande\s+Área|Área|Subárea|Especialidade)[^:]*:\s*/i, "").trim());
      if (area && area.length > 2 && !areasAtuacao.includes(area) && !looksLikeCaptchaOrCss(area)) areasAtuacao.push(area);
    });
  }

  const possuiDoutorado = /doutorado|ph\.?d|doctorado/i.test(html);
  const possuiMestrado = /mestrado|master/i.test(html);
  const possuiGraduacao = /graduação|bacharelado|licenciatura/i.test(html);

  const vinculos: string[] = [];
  const vinculoMatches = html.match(/(?:Instituição|Órgão|Empresa|Vínculo)[^:]*:\s*([^<\n]+)/gi);
  if (vinculoMatches) {
    vinculoMatches.slice(0, 5).forEach((m) => {
      const v = decodeHtmlEntities(m.replace(/(?:Instituição|Órgão|Empresa|Vínculo)[^:]*:\s*/i, "").trim());
      if (v && v.length > 3 && !vinculos.includes(v) && !looksLikeCaptchaOrCss(v)) vinculos.push(v);
    });
  }

  const ufMatch = html.match(/(?:UF|Estado)[^:]*:\s*([A-Z]{2})\b/i) || html.match(/\b(AM|PA|AP|RR|RO|AC|MT)\b/);
  const cidadeMatch = html.match(/(?:Município|Cidade|Municipio)[^:]*:\s*([^<\n,]+)/i);
  const uf = ufMatch ? (ufMatch[1] || ufMatch[0]).toString().toUpperCase() : undefined;
  const cidade = cidadeMatch ? cidadeMatch[1].trim() : undefined;

  const countArtigos = (html.match(/artigo\s+completo|article/gi) || []).length;
  const countLivros = (html.match(/livro\s+publicado|book/gi) || []).length;
  const countProjetos = (html.match(/projeto\s+de\s+pesquisa/gi) || []).length;
  const resumoProducoes: string[] = [];
  if (countArtigos > 0) resumoProducoes.push(`${countArtigos} artigo(s)`);
  if (countLivros > 0) resumoProducoes.push(`${countLivros} livro(s)`);
  if (countProjetos > 0) resumoProducoes.push(`${countProjetos} projeto(s)`);

  let tipoVinculo: string | undefined;
  if (/celetista|CLT/i.test(html)) tipoVinculo = "Celetista";
  else if (/estatutário|servidor\s+público/i.test(html)) tipoVinculo = "Estatutário";
  else if (/bolsista|bolsa/i.test(html)) tipoVinculo = "Bolsista";
  else if (/professor|docente/i.test(html)) tipoVinculo = "Docente";

  let colaboracaoInternacional: string | undefined;
  if (/frança|france|franc[eé]s|paris|cnrs|ird/i.test(html)) colaboracaoInternacional = "Indício de colaboração com França";
  else if (/coopera[cç][aã]o\s+internacional|conv[eê]nio\s+internacional/i.test(html)) colaboracaoInternacional = "Colaboração internacional mencionada";

  const anosMatch = html.match(/\b(19|20)\d{2}\b/g);
  let anosExperiencia: number | undefined;
  if (anosMatch && anosMatch.length > 0) {
    const anos = anosMatch.map((a) => parseInt(a, 10)).filter((a) => a >= 1970 && a <= new Date().getFullYear());
    if (anos.length > 0) anosExperiencia = new Date().getFullYear() - Math.min(...anos);
  }

  return {
    id,
    nome,
    resumo: "Informações extraídas do Currículo Lattes público (HTML).",
    areasAtuacao: areasAtuacao.length > 0 ? areasAtuacao : undefined,
    formacao: [
      possuiDoutorado && { nivel: "Doutorado", curso: "Informação extraída", instituicao: "Lattes", anoConclusao: undefined },
      possuiMestrado && { nivel: "Mestrado", curso: "Informação extraída", instituicao: "Lattes", anoConclusao: undefined },
      possuiGraduacao && { nivel: "Graduação", curso: "Informação extraída", instituicao: "Lattes", anoConclusao: undefined },
    ].filter(Boolean) as Array<{ nivel: string; curso: string; instituicao: string; anoConclusao?: string }>,
    vinculoInstitucional: vinculos.length > 0 ? vinculos : undefined,
    enderecoProfissional: cidade || uf ? { cidade, uf, pais: "Brasil" } : undefined,
    tipoVinculo,
    resumoProducoes: resumoProducoes.length > 0 ? resumoProducoes.join(", ") : undefined,
    colaboracaoInternacional,
    linkLattes: `http://lattes.cnpq.br/${id}`,
    elegibilidade: {
      possuiDoutorado,
      possuiMestrado,
      possuiGraduacao,
      anosExperiencia,
      podeParticiparEditais: possuiDoutorado || possuiMestrado || possuiGraduacao,
      observacoes: undefined,
    },
  };
}

/**
 * Extrai itens de formação (curso, instituição, ano) do texto do PDF exportado do Lattes.
 * Estrutura típica: "Formação acadêmica/titulação" → blocos com "YYYY - YYYY" + "Doutorado em X." + "Universidade Y, Sigla, Brasil."
 */
function extractFormacaoFromText(full: string): Array<{ nivel: string; curso: string; instituicao: string; anoConclusao?: string }> {
  const formacao: Array<{ nivel: string; curso: string; instituicao: string; anoConclusao?: string }> = [];
  const section = full.match(/forma[cç][aã]o\s+acad[eê]mica\/titula[cç][aã]o[\s\S]*?(?=forma[cç][aã]o\s+complementar|atua[cç][aã]o|produ[cç][aã]o|$)/i)?.[0] ?? full;

  // Padrão do PDF Lattes: "2008 - 2012" na mesma linha ou próximo, depois "Doutorado em X." depois "Universidade ... Brasil."
  // O nível deve vir logo após o bloco de anos (evitar pegar "Graduação" de "Pós-graduação").
  const blockRe = /(\d{4})\s*-\s*(\d{4})\s*[\s\n]+(Doutorado|Mestrado|Especializa[cç\u00e7][aã\u00e3]o|Gradua[cç\u00e7][aã\u00e3]o|Curso\s+t[eé]cnico(?:\/profissionalizante)?)\s+(?:em\s+)?([^.\n]+)\.\s*[\s\S]*?((?:Universidade|Instituto|Escola|Centro)[\s\S]+?)(?=,?\s*Brasil\.|\.\s*Título|\.\s*Orientador)/gi;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRe.exec(section)) !== null) {
    const anoFim = blockMatch[2];
    let nivel = blockMatch[3];
    const curso = blockMatch[4].trim().replace(/\s+/g, " ").slice(0, 200);
    let instituicao = blockMatch[5].trim().replace(/\s+/g, " ").replace(/,?\s*Brasil\.?\s*$/i, "").trim().slice(0, 200);
    if (/curso\s+t[eé]cnico/i.test(nivel)) nivel = "Curso técnico";
    if (/gradua[cç][aã]o/i.test(nivel)) nivel = "Graduação";
    if (/especializa[cç][aã]o/i.test(nivel)) nivel = "Especialização";
    if (!formacao.some((f) => f.nivel === nivel && f.curso === curso)) {
      formacao.push({ nivel, curso, instituicao: instituicao || "—", anoConclusao: anoFim });
    }
  }

  // Fallback: "Doutorado em X. Universidade Y" sem ano na linha anterior (permite \n e espaços)
  if (formacao.length === 0) {
    const fallbackRe = /(Doutorado|Mestrado|Especializa[cç][aã]o|Gradua[cç][aã]o)\s+em\s+([^.\n]+)\.\s*[\s\S]*?((?:Universidade|Instituto|Escola)[^.\n]+?)(?=\.|,?\s*Brasil|Título)/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fallbackRe.exec(section)) !== null) {
      let nivel = fm[1];
      if (/gradua/i.test(nivel)) nivel = "Graduação";
      if (/especializa/i.test(nivel)) nivel = "Especialização";
      const curso = fm[2].trim().replace(/\s+/g, " ").slice(0, 200);
      let instituicao = fm[3].trim().replace(/\s+/g, " ").replace(/,?\s*Brasil\.?\s*$/i, "").trim().slice(0, 200);
      const after = section.slice(fm.index, fm.index + 800);
      const anoMatch = after.match(/(?:ano\s+de\s+obten[cç][aã]o|obten[cç][aã]o)[\s:]*(\d{4})/i) ?? after.match(/(\d{4})\s*-\s*(\d{4})\b/);
      const anoConclusao = anoMatch ? (anoMatch[1] ?? (anoMatch as RegExpMatchArray)[2]) : undefined;
      if (!formacao.some((f) => f.nivel === nivel && f.curso === curso)) {
        formacao.push({ nivel, curso, instituicao: instituicao || "—", anoConclusao });
      }
    }
  }

  return formacao;
}

/** Extrai dados quando o usuário cola o texto visível da página (Ctrl+A no Lattes) ou do PDF. */
function parseLattesFromText(text: string, id: string): Record<string, unknown> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let nome = `Pesquisador ${id.slice(0, 4)}`;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i];
    if (line.length > 4 && line.length < 80 && /^[A-Za-zÀ-ÿ\s\-\.]+$/.test(line) && !/captcha|segurança|código|currículo|lattes/i.test(line)) {
      nome = line;
      break;
    }
  }
  const full = text;
  const areasAtuacao: string[] = [];
  const areaRe = /(?:Grande\s+Área|Área|Subárea|Especialidade)[^:]*:\s*([^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = areaRe.exec(full)) !== null) {
    const a = m[1].trim();
    if (a.length > 2 && a.length < 150 && !areasAtuacao.includes(a)) areasAtuacao.push(a);
  }
  let possuiDoutorado = /doutorado|doutor\b|ph\.?\s*d\.?/i.test(full);
  let possuiMestrado = /mestrado|master\b/i.test(full);
  let possuiGraduacao = /graduação|bacharelado|licenciatura/i.test(full);
  const vinculos: string[] = [];
  const vinculoRe = /(?:Institui[cç][aã]o|Órg[aã]o|Empresa|V[ií]nculo|Atua[cç][aã]o\s+profissional)[^:]*:\s*([^\n.]+)/gi;
  while ((m = vinculoRe.exec(full)) !== null) {
    const v = m[1].trim().replace(/\s+/g, " ").slice(0, 200);
    if (v.length > 3 && !vinculos.includes(v)) vinculos.push(v);
  }

  let formacao = extractFormacaoFromText(full);
  if (formacao.length === 0) {
    if (possuiDoutorado) formacao.push({ nivel: "Doutorado", curso: "—", instituicao: "—", anoConclusao: undefined });
    if (possuiMestrado) formacao.push({ nivel: "Mestrado", curso: "—", instituicao: "—", anoConclusao: undefined });
    if (possuiGraduacao) formacao.push({ nivel: "Graduação", curso: "—", instituicao: "—", anoConclusao: undefined });
  }

  // Inferir elegibilidade a partir da formação quando o texto não contiver os termos explícitos
  const niveisStr = formacao.map((f) => f.nivel).join(" ");
  if (niveisStr.length > 0) {
    if (!possuiDoutorado && /doutorado|doutor\b|ph\.?\s*d/i.test(niveisStr)) possuiDoutorado = true;
    if (!possuiMestrado && /mestrado|master\b/i.test(niveisStr)) possuiMestrado = true;
    if (!possuiGraduacao && /gradua[cç][aã]o|bacharelado|licenciatura/i.test(niveisStr)) possuiGraduacao = true;
  }

  // Fallback vínculo: instituições da formação quando não encontradas no texto
  if (vinculos.length === 0 && formacao.length > 0) {
    for (const f of formacao) {
      if (f.instituicao && f.instituicao !== "—" && f.instituicao.length > 5 && !vinculos.includes(f.instituicao)) {
        vinculos.push(f.instituicao.slice(0, 200));
      }
    }
  }

  return {
    id,
    nome,
    resumo: "Importado do conteúdo colado (página do Lattes).",
    areasAtuacao: areasAtuacao.length > 0 ? areasAtuacao : undefined,
    formacao: formacao.length > 0 ? formacao : undefined,
    vinculoInstitucional: vinculos.length > 0 ? vinculos : undefined,
    linkLattes: `http://lattes.cnpq.br/${id}`,
    elegibilidade: {
      possuiDoutorado,
      possuiMestrado: possuiMestrado,
      possuiGraduacao,
      podeParticiparEditais: possuiDoutorado || possuiMestrado || possuiGraduacao,
      observacoes: undefined,
    },
  };
}

router.post("/lattes/parse-paste", (req, res) => {
  try {
    const { html, id } = req.body || {};
    const raw = typeof html === "string" ? html.trim() : "";
    const lid = (id || req.body?.lattesId || "").replace(/\D/g, "");
    const useId = lid.length === 16 ? lid : (raw.match(/\d{16}/) || [])[0] || "0000000000000000";
    if (raw.length < 50) {
      return res.status(400).json({ error: "Cole o conteúdo da página do Lattes (texto ou código-fonte)." });
    }
    if (isCaptchaPage(raw)) {
      return res.status(400).json({ error: "Parece que você colou a página de captcha. Abra o currículo, resolva o código de segurança e cole o conteúdo da página do currículo." });
    }
    const isHtml = raw.includes("<") && raw.includes(">");
    const data = isHtml ? parseLattesFromHtml(raw, useId) : parseLattesFromText(raw, useId);
    if (data) {
      return res.json(data);
    }
    return res.status(400).json({ error: "Não foi possível extrair dados. Cole a página completa do currículo (após resolver o captcha)." });
  } catch (error) {
    console.error("Erro ao processar colagem Lattes:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/** Extrai ID Lattes (16 dígitos) do XML. */
function extractIdFromXml(xml: string): string | null {
  const m = xml.match(/<NUMERO-IDENTIFICADOR>([\s\S]*?)<\/NUMERO-IDENTIFICADOR>/i) || xml.match(/\b(\d{16})\b/);
  if (m) {
    const raw = m[1].replace(/<[^>]+>/g, "").trim().replace(/\D/g, "");
    return raw.length === 16 ? raw : null;
  }
  return null;
}

/**
 * POST /api/lattes/parse-zip
 * Recebe o ZIP exportado de https://wwws.cnpq.br/cvlattesweb (PKG_IMPCV.get_arquivo).
 * O usuário precisa estar logado no Lattes para baixar o ZIP; depois envia o arquivo aqui.
 * Body: { zipBase64: string } ou multipart (opcional id).
 */
router.post("/lattes/parse-zip", (req, res) => {
  try {
    const { zipBase64, id: bodyId } = req.body || {};
    const b64 = typeof zipBase64 === "string" ? zipBase64.trim() : "";
    if (!b64) {
      return res.status(400).json({ error: "Envie o arquivo ZIP (base64) do currículo exportado do site do Lattes." });
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Conteúdo do arquivo inválido." });
    }
    if (buffer.length < 50) {
      return res.status(400).json({ error: "Arquivo ZIP muito pequeno." });
    }
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let xmlContent: string | null = null;
    for (const entry of entries) {
      if (!entry.isDirectory && (entry.entryName.endsWith(".xml") || entry.entryName.toLowerCase().includes(".xml"))) {
        try {
          xmlContent = entry.getData().toString("utf8");
        } catch {
          xmlContent = entry.getData().toString("latin1");
        }
        if (xmlContent && (xmlContent.includes("<CURRICULO") || xmlContent.includes("CURRICULO-VITAE"))) break;
      }
    }
    if (!xmlContent || (!xmlContent.includes("<CURRICULO") && !xmlContent.includes("CURRICULO-VITAE"))) {
      return res.status(400).json({ error: "Nenhum XML de currículo encontrado no ZIP. Exporte o currículo em https://wwws.cnpq.br/cvlattesweb (após login)." });
    }
    const idFromXml = extractIdFromXml(xmlContent);
    const lid = (bodyId || "").replace(/\D/g, "");
    const useId = lid.length === 16 ? lid : (idFromXml || "0000000000000000");
    const data = parseLattesFromXml(xmlContent, useId);
    if (data) {
      return res.json(data);
    }
    return res.status(400).json({ error: "Não foi possível extrair dados do XML no ZIP." });
  } catch (error) {
    console.error("Erro ao processar ZIP Lattes:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/lattes/parse-pdf
 * Recebe um PDF de currículo (base64). Extrai o texto e aplica a mesma lógica de parse que o texto colado.
 * Body: { pdfBase64: string }
 */
router.post("/lattes/parse-pdf", async (req, res) => {
  try {
    const { pdfBase64 } = req.body || {};
    const b64 = typeof pdfBase64 === "string" ? pdfBase64.trim() : "";
    if (!b64) {
      return res.status(400).json({ error: "Envie o arquivo PDF do currículo (em base64)." });
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Conteúdo do arquivo inválido." });
    }
    if (buffer.length < 100) {
      return res.status(400).json({ error: "Arquivo PDF muito pequeno." });
    }
    let text = "";
    // Usar pdf.js-extract (Node 18+) como primário; pdf-parse requer Node 20+
    try {
      const { PDFExtract } = await import("pdf.js-extract");
      const pdfExtract = new PDFExtract();
      const data = await pdfExtract.extractBuffer(buffer, {});
      text =
        data?.pages
          ?.flatMap((p: { content?: Array<{ str?: string }> }) => p.content?.map((c: { str?: string }) => c.str ?? "") ?? [])
          .join(" ") ?? "";
    } catch (fallbackErr) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      await parser.destroy();
      text = textResult?.text || "";
    }
    if (text.length < 50) {
      return res.status(400).json({
        error:
          "Não foi possível extrair texto do PDF. Use o PDF baixado do Lattes (exportar currículo), não uma imagem escaneada.",
      });
    }
    // Normalizar espaços e quebras de linha para melhorar extração (PDFs costumam quebrar palavras)
    const normalized = text.replace(/\s+/g, " ").trim();
    const id = (text.match(/\d{16}/) || [])[0] || "pdf";
    const data = parseLattesFromText(normalized.length > 50 ? normalized : text, id);
    if (data && typeof data === "object") {
      const out = { ...data };
      if (id === "pdf") (out as Record<string, unknown>).linkLattes = undefined;
      return res.json(out);
    }
    return res.status(400).json({ error: "Não foi possível extrair dados do currículo." });
  } catch (error) {
    console.error("Erro ao processar PDF de currículo:", error);
    const msg = (error as Error).message;
    const userMsg =
      msg.includes("crypto.hash") || msg.includes("not a function")
        ? "O servidor precisa do Node.js 20+ para processar PDFs. Atualize o Node."
        : msg;
    res.status(500).json({ error: userMsg });
  }
});

/** GET /api/fetch-cnpj?cnpj=xx - Proxy CNPJ com cache no banco (evita CORS e repetir requisições) */
router.get("/fetch-cnpj", async (req, res) => {
  const raw = (req.query.cnpj as string) || "";
  const cleanCnpj = String(raw).replace(/\D/g, "");
  if (cleanCnpj.length !== 14) {
    return res.status(400).json({ error: "CNPJ inválido (deve ter 14 dígitos)" });
  }

  // 1) Verificar cache no banco
  if (supabase) {
    try {
      const { data: cached, error } = await supabase
        .from("cnpj_cache")
        .select("data")
        .eq("cnpj", cleanCnpj)
        .maybeSingle();
      if (!error && cached?.data) {
        return res.json(cached.data as object);
      }
    } catch {}
  }

  const processReceitaWS = (data: any) => {
    const calcTempo = (abertura: string): number | null => {
      if (!abertura) return null;
      try {
        const [d, m, a] = abertura.split("/");
        const dt = new Date(parseInt(a), parseInt(m) - 1, parseInt(d));
        return Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24 * 30));
      } catch {
        return null;
      }
    };
    const situacao = data.situacao || "Desconhecida";
    const dataAbertura = data.abertura || "";
    const tempoAtividade = calcTempo(dataAbertura);
    const empresaAtiva = situacao === "ATIVA";
    const observacoes: string[] = [];
    if (!empresaAtiva) observacoes.push("Empresa não está ativa na Receita Federal");
    if (tempoAtividade !== null && tempoAtividade < 6) observacoes.push("Empresa com menos de 6 meses de atividade");
    if (!data.email) observacoes.push("Email não cadastrado na Receita Federal");
    const podeParticiparEditais = empresaAtiva && (tempoAtividade === null || tempoAtividade >= 6);
    return {
      cnpj: cleanCnpj,
      razaoSocial: data.nome || data.fantasia || "",
      nomeFantasia: data.fantasia,
      situacao,
      dataAbertura,
      capitalSocial: data.capital_social,
      porte: data.porte || "",
      naturezaJuridica: data.natureza_juridica || "",
      endereco: { logradouro: data.logradouro || "", numero: data.numero || "", complemento: data.complemento, bairro: data.bairro || "", municipio: data.municipio || "", uf: data.uf || "", cep: data.cep ? String(data.cep).replace(/\D/g, "") : "" },
      atividades: [].concat(data.atividade_principal || [], data.atividades_secundarias || []).map((atv: any) => ({ codigo: atv.code || "", descricao: atv.text || "", principal: !!(data.atividade_principal || []).find((a: any) => a.code === atv.code) })),
      telefones: data.telefone ? [data.telefone] : [],
      email: data.email,
      elegibilidade: { empresaAtiva, tempoAtividade: tempoAtividade ?? undefined, podeParticiparEditais, observacoes: observacoes.length ? observacoes : undefined },
    };
  };
  const processBrasilAPI = (data: any) => {
    const calcTempo = (abertura: string): number | null => {
      if (!abertura) return null;
      try {
        const [a, m, d] = abertura.split("-");
        const dt = new Date(parseInt(a), parseInt(m) - 1, parseInt(d));
        return Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24 * 30));
      } catch {
        return null;
      }
    };
    const situacao = data.descricao_situacao_cadastral || "Desconhecida";
    const dataAbertura = data.data_inicio_atividade || "";
    const tempoAtividade = calcTempo(dataAbertura);
    const empresaAtiva = situacao === "ATIVA" || data.situacao_cadastral === 2;
    const observacoes: string[] = [];
    if (!empresaAtiva) observacoes.push("Empresa não está ativa na Receita Federal");
    if (tempoAtividade !== null && tempoAtividade < 6) observacoes.push("Empresa com menos de 6 meses de atividade");
    const podeParticiparEditais = empresaAtiva && (tempoAtividade === null || tempoAtividade >= 6);
    return {
      cnpj: cleanCnpj,
      razaoSocial: data.razao_social || data.nome_fantasia || "",
      nomeFantasia: data.nome_fantasia,
      situacao,
      dataAbertura: dataAbertura ? dataAbertura.split("-").reverse().join("/") : "",
      capitalSocial: data.capital_social?.toString(),
      porte: data.porte || "",
      naturezaJuridica: data.natureza_juridica || "",
      endereco: { logradouro: data.logradouro || "", numero: data.numero || "", complemento: data.complemento, bairro: data.bairro || "", municipio: data.municipio || "", uf: data.uf || "", cep: data.cep ? String(data.cep).replace(/\D/g, "") : "" },
      atividades: (data.cnae_fiscal != null ? [{ codigo: String(data.cnae_fiscal), descricao: data.cnae_fiscal_descricao || "", principal: true }] : []).concat((data.cnaes_secundarios || []).map((c: any) => ({ codigo: String(c.codigo || ""), descricao: c.descricao || "", principal: false }))),
      telefones: data.ddd_telefone_1 ? [data.ddd_telefone_1] : [],
      email: data.email,
      elegibilidade: { empresaAtiva, tempoAtividade: tempoAtividade ?? undefined, podeParticiparEditais, observacoes: observacoes.length ? observacoes : undefined },
    };
  };
  const fetchOpts = {
    method: "GET" as const,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; OrigemLab/1.0)",
    },
  };

  let result: object | null = null;

  // BrasilAPI primeiro (mais estável, sem rate limit rígido)
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, { ...fetchOpts, signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      if (data.razao_social || data.nome_fantasia) result = processBrasilAPI(data);
    }
  } catch {}
  // Fallback ReceitaWS
  if (!result) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cleanCnpj}`, { ...fetchOpts, signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) {
        const data = await r.json();
        if (data.status !== "ERROR" && (data.nome || data.fantasia)) result = processReceitaWS(data);
      }
    } catch {}
  }

  if (!result) {
    return res.status(404).json({ error: "CNPJ não encontrado ou APIs indisponíveis" });
  }

  // Salvar no cache para próximas requisições
  if (supabase) {
    try {
      await supabase.from("cnpj_cache").upsert({ cnpj: cleanCnpj, data: result }, { onConflict: "cnpj" });
    } catch {}
  }

  return res.json(result);
});

router.get("/lattes/:id", async (req, res) => {
  try {
    const id = (req.params.id || "").replace(/\D/g, "");
    if (id.length !== 16) {
      return res.status(400).json({ error: "ID Lattes inválido (deve ter 16 dígitos)" });
    }

    // 1) Tentar XML (estrutura estável)
    try {
      const xmlRes = await fetch(LATTES_XML_URL + id, getFetchOptions());
      if (xmlRes.ok) {
        const contentType = xmlRes.headers.get("content-type") || "";
        const text = await xmlRes.text();
        if (contentType.includes("xml") || text.trimStart().startsWith("<?xml") || text.includes("<CURRICULO-VITAE")) {
          const data = parseLattesFromXml(text, id);
          if (data) {
            console.log(`✅ Lattes ${id}: dados extraídos do XML`);
            return res.json(data);
          }
        }
      }
    } catch (e) {
      // Timeout ou rede; não logar em excesso
    }

    // 2) Tentar HTML (ignorar página de captcha do CNPq)
    try {
      const htmlRes = await fetch(LATTES_HTML_URL + id, getFetchOptions());
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        if (html.length > 500 && !isCaptchaPage(html)) {
          const data = parseLattesFromHtml(html, id);
          if (data) {
            console.log(`✅ Lattes ${id}: dados extraídos do HTML`);
            return res.json(data);
          }
        }
      }
    } catch (e) {
      // Timeout ou rede
    }

    // Fallback: usuário abre o link no navegador, resolve o captcha no CNPq; a URL "liberada" pode incluir tokenCaptchar (não podemos gerar esse token).
    res.json({
      id,
      nome: `Pesquisador ${id.slice(0, 4)}`,
      resumo: "ID Lattes válido. Para informações completas, acesse o link abaixo.",
      linkLattes: `http://lattes.cnpq.br/${id}`,
      elegibilidade: {
        possuiDoutorado: false,
        possuiMestrado: false,
        possuiGraduacao: false,
        podeParticiparEditais: true,
        observacoes: ["Informações completas disponíveis no site do Lattes"],
      },
    });
  } catch (error) {
    console.error("Erro ao buscar Lattes:", error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
