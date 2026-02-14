/**
 * GET /api/fetch-cnpj?cnpj=xx
 * Proxy para buscar dados de CNPJ (evita CORS no browser).
 * ReceitaWS e BrasilAPI são chamadas do servidor (sem restrição CORS).
 */
import express from "express";

const router = express.Router();

function processReceitaWS(cleanCnpj: string, data: any): any {
  const calcTempo = (abertura: string): number | null => {
    if (!abertura) return null;
    try {
      const [d, m, a] = abertura.split("/");
      const dt = new Date(parseInt(a), parseInt(m) - 1, parseInt(d));
      const meses = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24 * 30));
      return meses;
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
    endereco: {
      logradouro: data.logradouro || "",
      numero: data.numero || "",
      complemento: data.complemento,
      bairro: data.bairro || "",
      municipio: data.municipio || "",
      uf: data.uf || "",
      cep: data.cep ? String(data.cep).replace(/\D/g, "") : "",
    },
    atividades: []
      .concat(data.atividade_principal || [], data.atividades_secundarias || [])
      .map((atv: any) => ({
        codigo: atv.code || "",
        descricao: atv.text || "",
        principal: !!(data.atividade_principal || []).find((a: any) => a.code === atv.code),
      })),
    telefones: data.telefone ? [data.telefone] : [],
    email: data.email,
    qsa: data.qsa?.map((s: any) => ({ nome: s.nome || "", qualificacao: s.qual || "", percentual: s.pais ? parseFloat(s.pais) : undefined })),
    elegibilidade: { empresaAtiva, tempoAtividade: tempoAtividade ?? undefined, podeParticiparEditais, observacoes: observacoes.length ? observacoes : undefined },
  };
}

function processBrasilAPI(cleanCnpj: string, data: any): any {
  const calcTempo = (abertura: string): number | null => {
    if (!abertura) return null;
    try {
      const [a, m, d] = abertura.split("-");
      const dt = new Date(parseInt(a), parseInt(m) - 1, parseInt(d));
      const meses = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24 * 30));
      return meses;
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
    endereco: {
      logradouro: data.logradouro || "",
      numero: data.numero || "",
      complemento: data.complemento,
      bairro: data.bairro || "",
      municipio: data.municipio || "",
      uf: data.uf || "",
      cep: data.cep ? String(data.cep).replace(/\D/g, "") : "",
    },
    atividades: (data.cnae_fiscal_principal
      ? [{ codigo: data.cnae_fiscal_principal.codigo || "", descricao: data.cnae_fiscal_principal.descricao || "", principal: true }]
      : []
    ).concat(
      (data.cnaes_secundarios || []).map((c: any) => ({ codigo: c.codigo || "", descricao: c.descricao || "", principal: false }))
    ),
    telefones: data.ddd_telefone_1 ? [data.ddd_telefone_1] : [],
    email: data.email,
    elegibilidade: { empresaAtiva, tempoAtividade: tempoAtividade ?? undefined, podeParticiparEditais, observacoes: observacoes.length ? observacoes : undefined },
  };
}

router.get("/fetch-cnpj", async (req, res) => {
  const raw = req.query.cnpj as string;
  if (!raw) {
    return res.status(400).json({ error: "cnpj é obrigatório" });
  }

  const cleanCnpj = String(raw).replace(/\D/g, "");
  if (cleanCnpj.length !== 14) {
    return res.status(400).json({ error: "CNPJ inválido (deve ter 14 dígitos)" });
  }

  // 1) Tentar ReceitaWS
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (r.ok) {
      const data = await r.json();
      if (data.status === "ERROR") {
        throw new Error(data.message || "CNPJ não encontrado");
      }
      if (data.nome || data.fantasia) {
        return res.json(processReceitaWS(cleanCnpj, data));
      }
    }
    if (r.status === 429) {
      console.warn("ReceitaWS rate limit (429), tentando BrasilAPI");
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.warn("ReceitaWS timeout, tentando BrasilAPI");
    } else {
      console.warn("ReceitaWS erro:", e?.message);
    }
  }

  // 2) Fallback BrasilAPI
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (r.ok) {
      const data = await r.json();
      if (data.razao_social || data.nome_fantasia) {
        return res.json(processBrasilAPI(cleanCnpj, data));
      }
    }
  } catch (e: any) {
    console.warn("BrasilAPI erro:", e?.message);
  }

  return res.status(404).json({ error: "CNPJ não encontrado ou APIs indisponíveis" });
});

export default router;
