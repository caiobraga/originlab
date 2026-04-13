/**
 * Integrações com APIs externas para buscar informações adicionais do usuário
 */

export interface LattesData {
  id: string;
  nome: string;
  resumo?: string;
  areasAtuacao?: string[];
  formacao?: Array<{
    nivel: string;
    curso: string;
    instituicao: string;
    anoConclusao?: string;
    emAndamento?: boolean;
  }>;
  statusAcademico?: {
    doutorando?: boolean;
    mestrando?: boolean;
    graduando?: boolean;
    posGraduando?: boolean;
  };
  producoes?: Array<{
    tipo: string;
    titulo: string;
    ano?: string;
  }>;
  /** Resumo de produções para scores (ex: "15 artigos, 3 projetos") */
  resumoProducoes?: string;
  /** Instituição(ões) de vínculo atual */
  vinculoInstitucional?: string[];
  /** Localização profissional (UF/cidade) para elegibilidade regional */
  enderecoProfissional?: { cidade?: string; uf?: string; pais?: string };
  /** Tipo de vínculo quando identificável (celetista, estatutário, etc.) */
  tipoVinculo?: string;
  /** Indício de colaboração internacional (ex: projetos com França) */
  colaboracaoInternacional?: string;
  ultimaAtualizacao?: string;
  elegibilidade?: {
    possuiDoutorado: boolean;
    possuiMestrado: boolean;
    possuiGraduacao: boolean;
    anosExperiencia?: number;
    podeParticiparEditais: boolean;
    observacoes?: string[];
  };
  linkLattes?: string;
}

export interface CNPJData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacao: string;
  dataAbertura: string;
  capitalSocial?: string;
  porte: string;
  naturezaJuridica: string;
  endereco: {
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
  };
  atividades: Array<{
    codigo: string;
    descricao: string;
    principal: boolean;
  }>;
  telefones?: string[];
  email?: string;
  elegibilidade?: {
    empresaAtiva: boolean;
    tempoAtividade?: number; // em meses
    podeParticiparEditais: boolean;
    observacoes?: string[];
  };
  qsa?: Array<{
    nome: string;
    qualificacao: string;
    percentual?: number;
  }>;
}

export interface CPFData {
  cpf: string;
  nome?: string;
  situacao?: string;
  dataNascimento?: string;
  idade?: number;
  elegibilidade?: {
    maiorIdade: boolean;
    podeParticiparEditais: boolean;
    observacoes?: string[];
  };
  // Nota: APIs públicas de CPF são limitadas por questões de privacidade
}

/** Converte PDF para base64 sem estourar pilha/memória (loop byte-a-byte quebra arquivos Lattes grandes). */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(binary);
}

const MAX_CURRICULUM_PDF_BYTES = 48 * 1024 * 1024;

/**
 * Envia um PDF de currículo para extração de dados.
 * POST /api/lattes/parse-pdf com o arquivo em base64.
 */
export async function parseCurriculumFromPdf(file: File): Promise<LattesData | null> {
  try {
    if (!file.size || file.size < 500) {
      throw new Error("Arquivo PDF muito pequeno ou vazio.");
    }
    if (file.size > MAX_CURRICULUM_PDF_BYTES) {
      throw new Error("PDF acima de 48 MB. Exporte um currículo mais enxuto do Lattes ou use o ID Lattes no perfil.");
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const pdfBase64 = uint8ArrayToBase64(bytes);
    const base = typeof window !== "undefined" ? "" : process.env.VITE_APP_URL || "http://localhost:3000";
    const response = await fetch(`${base}/api/lattes/parse-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64 }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: string };
      const detail = err.error?.trim();
      if (detail) throw new Error(detail);
      if (response.status === 413) {
        throw new Error("Arquivo grande demais para o servidor. Tente um PDF menor ou use o ID Lattes.");
      }
      throw new Error(`Falha ao processar PDF (${response.status}). Tente de novo ou use o ID Lattes no perfil.`);
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const eleg = raw.elegibilidade as Record<string, unknown> | undefined;
    const formacao = Array.isArray(raw.formacao)
      ? (raw.formacao as Array<{ nivel: string; curso: string; instituicao: string; anoConclusao?: string }>)
      : undefined;

    let elegibilidade = eleg
      ? {
          possuiDoutorado: Boolean(eleg.possuiDoutorado),
          possuiMestrado: Boolean(eleg.possuiMestrado),
          possuiGraduacao: Boolean(eleg.possuiGraduacao),
          anosExperiencia: eleg.anosExperiencia != null ? Number(eleg.anosExperiencia) : undefined,
          podeParticiparEditais: Boolean(eleg.podeParticiparEditais),
          observacoes: Array.isArray(eleg.observacoes) ? (eleg.observacoes as string[]) : undefined,
        }
      : undefined;

    // Se a API não retornou elegibilidade ou retornou tudo false, inferir a partir da formação
    if (formacao && formacao.length > 0) {
      const niveis = formacao.map((f) => f.nivel).join(" ");
      const fromFormacao = {
        possuiDoutorado: /doutorado|doutor\b|ph\.?\s*d/i.test(niveis),
        possuiMestrado: /mestrado|master\b/i.test(niveis),
        possuiGraduacao: /gradua[cç][aã]o|bacharelado|licenciatura/i.test(niveis),
      };
      const hasAny = fromFormacao.possuiDoutorado || fromFormacao.possuiMestrado || fromFormacao.possuiGraduacao;
      if (!elegibilidade || (!elegibilidade.possuiDoutorado && !elegibilidade.possuiMestrado && !elegibilidade.possuiGraduacao)) {
        elegibilidade = {
          possuiDoutorado: fromFormacao.possuiDoutorado,
          possuiMestrado: fromFormacao.possuiMestrado,
          possuiGraduacao: fromFormacao.possuiGraduacao,
          anosExperiencia: elegibilidade?.anosExperiencia,
          podeParticiparEditais: hasAny || Boolean(elegibilidade?.podeParticiparEditais),
          observacoes: elegibilidade?.observacoes,
        };
      }
    }

    return {
      id: String(raw.id ?? "pdf"),
      nome: String(raw.nome ?? "Currículo"),
      resumo: raw.resumo != null ? String(raw.resumo) : undefined,
      areasAtuacao: Array.isArray(raw.areasAtuacao) ? (raw.areasAtuacao as string[]) : undefined,
      formacao,
      resumoProducoes: raw.resumoProducoes != null ? String(raw.resumoProducoes) : undefined,
      vinculoInstitucional: Array.isArray(raw.vinculoInstitucional) ? (raw.vinculoInstitucional as string[]) : undefined,
      enderecoProfissional:
        raw.enderecoProfissional != null && typeof raw.enderecoProfissional === "object"
          ? (raw.enderecoProfissional as { cidade?: string; uf?: string; pais?: string })
          : undefined,
      linkLattes: raw.linkLattes != null ? String(raw.linkLattes) : undefined,
      elegibilidade,
    };
  } catch (err) {
    console.warn("Erro ao extrair currículo do PDF:", err);
    const msg = err instanceof Error ? err.message : "Erro ao processar PDF";
    throw new Error(msg);
  }
}

/**
 * Busca informações do Currículo Lattes.
 * Usa o endpoint do nosso backend (/api/lattes/:id) que faz o fetch no servidor (evita CORS do CNPq).
 */
export async function fetchLattesData(lattesId: string): Promise<LattesData | null> {
  try {
    const id = lattesId.replace(/\D/g, "");
    if (id.length !== 16) {
      throw new Error("ID Lattes inválido");
    }

    const base = typeof window !== "undefined" ? "" : process.env.VITE_APP_URL || "http://localhost:3000";
    const response = await fetch(`${base}/api/lattes/${id}`, { method: "GET" });

    if (response.ok) {
      const raw = (await response.json()) as Record<string, unknown>;
      const eleg = raw.elegibilidade as Record<string, unknown> | undefined;
      return {
        id: String(raw.id ?? id),
        nome: String(raw.nome ?? `Pesquisador ${id.slice(0, 4)}`),
        resumo: raw.resumo != null ? String(raw.resumo) : undefined,
        areasAtuacao: Array.isArray(raw.areasAtuacao) ? (raw.areasAtuacao as string[]) : undefined,
        formacao: Array.isArray(raw.formacao)
          ? (raw.formacao as Array<{ nivel: string; curso: string; instituicao: string; anoConclusao?: string }>)
          : undefined,
        resumoProducoes: raw.resumoProducoes != null ? String(raw.resumoProducoes) : undefined,
        vinculoInstitucional: Array.isArray(raw.vinculoInstitucional) ? (raw.vinculoInstitucional as string[]) : undefined,
        enderecoProfissional:
          raw.enderecoProfissional != null && typeof raw.enderecoProfissional === "object"
            ? (raw.enderecoProfissional as { cidade?: string; uf?: string; pais?: string })
            : undefined,
        tipoVinculo: raw.tipoVinculo != null ? String(raw.tipoVinculo) : undefined,
        colaboracaoInternacional: raw.colaboracaoInternacional != null ? String(raw.colaboracaoInternacional) : undefined,
        linkLattes: raw.linkLattes != null ? String(raw.linkLattes) : undefined,
        elegibilidade: eleg
          ? {
              possuiDoutorado: Boolean(eleg.possuiDoutorado),
              possuiMestrado: Boolean(eleg.possuiMestrado),
              possuiGraduacao: Boolean(eleg.possuiGraduacao),
              anosExperiencia: eleg.anosExperiencia != null ? Number(eleg.anosExperiencia) : undefined,
              podeParticiparEditais: Boolean(eleg.podeParticiparEditais),
              observacoes: Array.isArray(eleg.observacoes) ? (eleg.observacoes as string[]) : undefined,
            }
          : undefined,
      };
    }

    // Resposta não-ok: usar fallback
    const linkLattes = `http://lattes.cnpq.br/${id}`;
    return {
      id,
      nome: `Pesquisador ${id.slice(0, 4)}`,
      resumo: "ID Lattes válido. Para informações completas, acesse o link abaixo.",
      linkLattes,
      elegibilidade: {
        possuiDoutorado: false,
        possuiMestrado: false,
        possuiGraduacao: false,
        podeParticiparEditais: true,
        observacoes: ["Informações completas disponíveis no site do Lattes"],
      },
    };
  } catch (err) {
    console.warn("Erro ao buscar dados do Lattes:", err);
    const id = lattesId.replace(/\D/g, "");
    const linkLattes = id.length === 16 ? `http://lattes.cnpq.br/${id}` : undefined;
    return {
      id: id || lattesId,
      nome: id.length === 16 ? `Pesquisador ${id.slice(0, 4)}` : "Pesquisador",
      resumo: "ID Lattes válido. Para informações completas, acesse o link abaixo.",
      linkLattes,
      elegibilidade: {
        possuiDoutorado: false,
        possuiMestrado: false,
        possuiGraduacao: false,
        podeParticiparEditais: true,
        observacoes: ["Informações completas disponíveis no site do Lattes"],
      },
    };
  }
}

/**
 * Tenta calcular anos de experiência baseado no HTML do Lattes
 */
function calcularAnosExperiencia(html: string): number | null {
  try {
    // Buscar por anos de conclusão de cursos
    const anosMatch = html.match(/\b(19|20)\d{2}\b/g);
    if (anosMatch && anosMatch.length > 0) {
      const anos = anosMatch.map(a => parseInt(a)).filter(a => a >= 1970 && a <= new Date().getFullYear());
      if (anos.length > 0) {
        const anoMaisAntigo = Math.min(...anos);
        const anosExperiencia = new Date().getFullYear() - anoMaisAntigo;
        return anosExperiencia > 0 ? anosExperiencia : null;
      }
    }
  } catch {
    // Ignorar erros
  }
  return null;
}

/**
 * Busca informações de CNPJ via proxy no servidor (evita CORS).
 * O servidor chama ReceitaWS e BrasilAPI; o browser não chama APIs externas diretamente.
 */
export async function fetchCNPJData(cnpj: string): Promise<CNPJData | null> {
  try {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) {
      throw new Error("CNPJ inválido");
    }

    const base = typeof window !== "undefined" ? "" : process.env.VITE_APP_URL || "http://localhost:3000";
    const response = await fetch(`${base}/api/fetch-cnpj?cnpj=${encodeURIComponent(cleanCnpj)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn("Erro ao buscar CNPJ:", (err as { error?: string }).error || response.statusText);
      return null;
    }

    const data = (await response.json()) as CNPJData;
    return data;
  } catch (error: unknown) {
    console.error("Erro ao buscar dados do CNPJ:", error);
    return null;
  }
}

/**
 * Processa dados do CNPJ da ReceitaWS
 */
function processCNPJData(cleanCnpj: string, data: any): CNPJData {
    // Calcular tempo de atividade em meses
    const calcularTempoAtividade = (dataAbertura: string): number | null => {
      if (!dataAbertura) return null;
      try {
        const [dia, mes, ano] = dataAbertura.split("/");
        const dataAberturaDate = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
        const hoje = new Date();
        const diffTime = Math.abs(hoje.getTime() - dataAberturaDate.getTime());
        const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
        return diffMonths;
      } catch {
        return null;
      }
    };

    const situacao = data.situacao || "Desconhecida";
    const dataAbertura = data.abertura || "";
    const tempoAtividade = calcularTempoAtividade(dataAbertura);
    const empresaAtiva = situacao === "ATIVA";

    // LÓGICA DE ELEGIBILIDADE PARA CNPJ:
    // Uma empresa é elegível para editais se:
    // 1. Está ATIVA na Receita Federal (situacao === "ATIVA")
    // 2. Tem pelo menos 6 meses de atividade (muitos editais exigem tempo mínimo)
    // 
    // Observações são adicionadas quando:
    // - Empresa não está ativa
    // - Tem menos de 6 meses de atividade
    // - Não tem email cadastrado (pode dificultar comunicação)
    const observacoes: string[] = [];
    if (!empresaAtiva) {
      observacoes.push("Empresa não está ativa na Receita Federal");
    }
    if (tempoAtividade !== null && tempoAtividade < 6) {
      observacoes.push("Empresa com menos de 6 meses de atividade");
    }
    if (!data.email) {
      observacoes.push("Email não cadastrado na Receita Federal");
    }

    // Cálculo final de elegibilidade:
    // - Empresa deve estar ATIVA
    // - E ter pelo menos 6 meses OU tempo desconhecido (assumimos elegível se não sabemos)
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
        cep: data.cep ? data.cep.replace(/\D/g, "") : "",
      },
      atividades: (data.atividade_principal || []).concat(data.atividades_secundarias || []).map((atv: any) => ({
        codigo: atv.code || "",
        descricao: atv.text || "",
        principal: !!(data.atividade_principal || []).find((a: any) => a.code === atv.code),
      })),
      telefones: data.telefone ? [data.telefone] : [],
      email: data.email,
      qsa: data.qsa ? data.qsa.map((socio: any) => ({
        nome: socio.nome || "",
        qualificacao: socio.qual || "",
        percentual: socio.pais ? parseFloat(socio.pais) : undefined,
      })) : undefined,
      elegibilidade: {
        empresaAtiva,
        tempoAtividade: tempoAtividade || undefined,
        podeParticiparEditais,
        observacoes: observacoes.length > 0 ? observacoes : undefined,
      },
    };
}

/**
 * Converte dados da BrasilAPI para o formato CNPJData
 */
function convertBrasilAPIToCNPJData(cleanCnpj: string, data: any): CNPJData {
  const calcularTempoAtividade = (dataAbertura: string): number | null => {
    if (!dataAbertura) return null;
    try {
      // BrasilAPI retorna formato YYYY-MM-DD
      const [ano, mes, dia] = dataAbertura.split("-");
      const dataAberturaDate = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
      const hoje = new Date();
      const diffTime = Math.abs(hoje.getTime() - dataAberturaDate.getTime());
      const diffMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
      return diffMonths;
    } catch {
      return null;
    }
  };

  const situacao = data.descricao_situacao_cadastral || "Desconhecida";
  const dataAbertura = data.data_inicio_atividade || "";
  const tempoAtividade = calcularTempoAtividade(dataAbertura);
  const empresaAtiva = situacao === "ATIVA" || data.situacao_cadastral === 2;

  const observacoes: string[] = [];
  if (!empresaAtiva) {
    observacoes.push("Empresa não está ativa na Receita Federal");
  }
  if (tempoAtividade !== null && tempoAtividade < 6) {
    observacoes.push("Empresa com menos de 6 meses de atividade");
  }

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
      cep: data.cep ? data.cep.replace(/\D/g, "") : "",
    },
    atividades: (data.cnae_fiscal_principal ? [{
      codigo: data.cnae_fiscal_principal.codigo || "",
      descricao: data.cnae_fiscal_principal.descricao || "",
      principal: true,
    }] : []).concat((data.cnaes_secundarios || []).map((cnae: any) => ({
      codigo: cnae.codigo || "",
      descricao: cnae.descricao || "",
      principal: false,
    }))),
    telefones: data.ddd_telefone_1 ? [data.ddd_telefone_1] : [],
    email: data.email,
    elegibilidade: {
      empresaAtiva,
      tempoAtividade: tempoAtividade || undefined,
      podeParticiparEditais,
      observacoes: observacoes.length > 0 ? observacoes : undefined,
    },
  };
}

/**
 * Valida dígitos verificadores do CPF
 */
function validateCPFDigits(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, "");
  if (numbers.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(numbers)) return false; // Todos os dígitos iguais

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(numbers.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(numbers.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(numbers.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(numbers.charAt(10))) return false;

  return true;
}

/**
 * Estima idade baseada no CPF (apenas para CPFs antigos com data de nascimento)
 * Nota: CPFs novos não contêm essa informação
 */
function estimateAgeFromCPF(cpf: string): number | null {
  const numbers = cpf.replace(/\D/g, "");
  if (numbers.length !== 11) return null;

  // CPFs antigos podem ter data de nascimento nos primeiros dígitos
  // Mas isso não é confiável para CPFs novos
  // Por enquanto, retornamos null - em produção, usar API oficial
  return null;
}

/**
 * Busca informações básicas de CPF
 * Nota: APIs públicas de CPF são muito limitadas por questões de privacidade
 * Esta função valida o CPF e fornece informações de elegibilidade básicas
 */
export async function fetchCPFData(cpf: string): Promise<CPFData | null> {
  try {
    const cleanCpf = cpf.replace(/\D/g, "");
    
    if (cleanCpf.length !== 11) {
      throw new Error("CPF inválido");
    }

    // Validar dígitos verificadores
    const isValid = validateCPFDigits(cleanCpf);
    
    if (!isValid) {
      return {
        cpf: cleanCpf,
        situacao: "Inválido",
        elegibilidade: {
          maiorIdade: false,
          podeParticiparEditais: false,
          observacoes: ["CPF com dígitos verificadores inválidos"],
        },
      };
    }

    // Tentar buscar informações adicionais via API pública (se disponível)
    // Por enquanto, retornamos validação básica
    // Em produção, integrar com Cadastro Base do Cidadão (CBC) ou API paga autorizada
    
    // LÓGICA DE ELEGIBILIDADE PARA CPF:
    // - CPF válido (dígitos verificadores corretos) = elegível
    // - CPF inválido = não elegível
    // Nota: A maioria dos editais exige CPF válido, então se o CPF passa na validação,
    // consideramos elegível. Em produção, você pode adicionar mais verificações como:
    // - Verificar se está na lista de CPFs bloqueados (Receita Federal)
    // - Verificar idade mínima (se tiver acesso à data de nascimento)
    const elegibilidade = {
      maiorIdade: true, // Assumimos maioridade - em produção, buscar data de nascimento
      podeParticiparEditais: true, // CPF válido = elegível para editais básicos
      observacoes: [] as string[],
    };

    // Nota: Para obter informações reais como nome, data de nascimento, etc.
    // é necessário usar APIs oficiais como:
    // - Cadastro Base do Cidadão (CBC) - API oficial do governo (requer OAuth)
    // - APIs privadas autorizadas (pagas)
    
    return {
      cpf: cleanCpf,
      situacao: "Válido",
      elegibilidade,
    };
  } catch (error) {
    console.error("Erro ao buscar dados do CPF:", error);
    return null;
  }
}

/**
 * Formata CPF para exibição
 */
export function formatCPF(cpf: string): string {
  const numbers = cpf.replace(/\D/g, "");
  if (numbers.length !== 11) return cpf;
  return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/**
 * Formata CNPJ para exibição
 */
export function formatCNPJ(cnpj: string): string {
  const numbers = cnpj.replace(/\D/g, "");
  if (numbers.length !== 14) return cnpj;
  return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/**
 * Formata CEP para exibição
 */
export function formatCEP(cep: string): string {
  const numbers = cep.replace(/\D/g, "");
  if (numbers.length !== 8) return cep;
  return numbers.replace(/(\d{5})(\d{3})/, "$1-$2");
}

