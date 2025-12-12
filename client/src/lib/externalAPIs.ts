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

/**
 * Busca informações do Currículo Lattes
 * Nota: A API oficial do Lattes não é pública, então tentamos extrair do HTML público
 */
export async function fetchLattesData(lattesId: string): Promise<LattesData | null> {
  try {
    // Formatar ID Lattes (remover formatação se houver)
    const id = lattesId.replace(/\D/g, "");
    
    if (id.length !== 16) {
      throw new Error("ID Lattes inválido");
    }

    const linkLattes = `https://buscatextual.cnpq.br/buscatextual/visualizacv.do?id=${id}`;

    // Tentar buscar dados do Lattes via página pública
    // Nota: A API oficial do CNPq não é pública, então tentamos extrair do HTML
    try {
      const response = await fetch(linkLattes, {
        method: 'GET',
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const html = await response.text();
        
        // Extrair nome do pesquisador (geralmente em uma tag específica)
        const nomeMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/i) || 
                          html.match(/Nome:\s*([^<\n]+)/i) ||
                          html.match(/<span[^>]*class="[^"]*nome[^"]*"[^>]*>([^<]+)<\/span>/i);
        const nome = nomeMatch ? nomeMatch[1].trim() : `Pesquisador ${id.slice(0, 4)}`;

        // Extrair áreas de atuação (tentativa básica)
        const areasMatch = html.match(/Área[^:]*:\s*([^<\n]+)/gi);
        const areasAtuacao: string[] = [];
        if (areasMatch) {
          areasMatch.forEach(match => {
            const area = match.replace(/Área[^:]*:\s*/i, '').trim();
            if (area && !areasAtuacao.includes(area)) {
              areasAtuacao.push(area);
            }
          });
        }

        // Verificar formação (buscar por doutorado, mestrado, graduação)
        const possuiDoutorado = /doutorado|ph\.?d|doctorado/i.test(html);
        const possuiMestrado = /mestrado|master/i.test(html);
        const possuiGraduacao = /graduação|bacharelado|licenciatura/i.test(html);

        // Verificar status acadêmico atual (cursos em andamento)
        // Buscar por padrões como "doutorando", "em curso", "em andamento", etc.
        const doutorando = /doutorando|doutorado\s+em\s+curso|ph\.?d\s+student|doctorado\s+en\s+curso/i.test(html);
        const mestrando = /mestrando|mestrado\s+em\s+curso|master\s+student|mestrado\s+en\s+curso/i.test(html);
        const graduando = /graduando|graduação\s+em\s+curso|bacharelado\s+em\s+curso|licenciatura\s+em\s+curso|undergraduate|estudante\s+de\s+graduação/i.test(html);
        const posGraduando = /pós-graduando|pós-graduação\s+em\s+curso|especialização\s+em\s+curso/i.test(html);
        
        // Verificar também por padrões de datas futuras ou "em andamento"
        const emAndamentoPattern = /(doutorado|mestrado|graduação|bacharelado|licenciatura).*?(em\s+curso|em\s+andamento|in\s+progress|atual)/i;
        const temCursoEmAndamento = emAndamentoPattern.test(html);

        // Tentar extrair anos de experiência (aproximado)
        const anosExperiencia = calcularAnosExperiencia(html);

        // LÓGICA DE ELEGIBILIDADE PARA LATTES:
        // Um pesquisador é elegível para editais se:
        // - Possui pelo menos uma formação (Doutorado OU Mestrado OU Graduação)
        // 
        // Observações são adicionadas quando:
        // - Não possui pós-graduação (alguns editais exigem)
        // - Tem pouca experiência (< 2 anos)
        const observacoes: string[] = [];
        if (!possuiDoutorado && !possuiMestrado) {
          observacoes.push("Alguns editais podem exigir pós-graduação");
        }
        if (anosExperiencia !== null && anosExperiencia < 2) {
          observacoes.push("Pesquisador com pouca experiência");
        }

        // Cálculo final de elegibilidade:
        // - Precisa ter pelo menos graduação (mínimo para participar de editais)
        const podeParticiparEditais = possuiDoutorado || possuiMestrado || possuiGraduacao;

        return {
          id: id,
          nome,
          resumo: "Informações extraídas do Currículo Lattes público",
          areasAtuacao: areasAtuacao.length > 0 ? areasAtuacao : undefined,
          statusAcademico: {
            doutorando: doutorando || (temCursoEmAndamento && possuiDoutorado && !possuiMestrado),
            mestrando: mestrando || (temCursoEmAndamento && possuiMestrado && !possuiDoutorado),
            graduando: graduando || (temCursoEmAndamento && possuiGraduacao && !possuiMestrado && !possuiDoutorado),
            posGraduando: posGraduando,
          },
          formacao: [
            possuiDoutorado && { nivel: "Doutorado", curso: "Informação extraída", instituicao: "Lattes", anoConclusao: undefined, emAndamento: doutorando },
            possuiMestrado && { nivel: "Mestrado", curso: "Informação extraída", instituicao: "Lattes", anoConclusao: undefined, emAndamento: mestrando },
            possuiGraduacao && { nivel: "Graduação", curso: "Informação extraída", instituicao: "Lattes", anoConclusao: undefined, emAndamento: graduando },
          ].filter(Boolean) as Array<{
            nivel: string;
            curso: string;
            instituicao: string;
            anoConclusao?: string;
            emAndamento?: boolean;
          }>,
          producoes: [],
          ultimaAtualizacao: new Date().toISOString(),
          linkLattes,
          elegibilidade: {
            possuiDoutorado,
            possuiMestrado,
            possuiGraduacao,
            anosExperiencia: anosExperiencia || undefined,
            podeParticiparEditais,
            observacoes: observacoes.length > 0 ? observacoes : undefined,
          },
        };
      }
    } catch (fetchError) {
      console.warn("Não foi possível buscar dados do Lattes via HTML:", fetchError);
    }

    // Fallback: retornar dados básicos
    return {
      id: id,
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
  } catch (error) {
    console.error("Erro ao buscar dados do Lattes:", error);
    return null;
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
 * Busca informações de CNPJ usando API pública (ReceitaWS)
 */
export async function fetchCNPJData(cnpj: string): Promise<CNPJData | null> {
  try {
    // Remover formatação
    const cleanCnpj = cnpj.replace(/\D/g, "");
    
    if (cleanCnpj.length !== 14) {
      throw new Error("CNPJ inválido");
    }

    console.log("Buscando dados do CNPJ:", cleanCnpj);

    // Tentar API ReceitaWS primeiro
    try {
      // Criar AbortController para timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos

      const response = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("Resposta ReceitaWS:", response.status, response.statusText);

      if (!response.ok) {
        // Se receber 429 (rate limit) ou 403 (CORS), tentar API alternativa
        if (response.status === 429 || response.status === 403) {
          console.warn("ReceitaWS bloqueada, tentando API alternativa...");
          throw new Error("Rate limit ou CORS bloqueado");
        }
        throw new Error(`Erro ao buscar CNPJ: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Dados recebidos da ReceitaWS:", data);

      if (data.status === "ERROR") {
        throw new Error(data.message || "Erro ao buscar CNPJ");
      }

      // Verificar se os dados estão vazios ou inválidos
      if (!data.nome && !data.fantasia) {
        throw new Error("CNPJ não encontrado ou dados inválidos");
      }

      // Processar dados da ReceitaWS
      return processCNPJData(cleanCnpj, data);
    } catch (fetchError: any) {
      console.error("Erro ao buscar na ReceitaWS:", fetchError);
      
      // Tentar API alternativa (BrasilAPI)
      try {
        console.log("Tentando API alternativa BrasilAPI...");
        const brasilApiController = new AbortController();
        const brasilApiTimeoutId = setTimeout(() => brasilApiController.abort(), 10000);
        
        const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: brasilApiController.signal,
        });

        clearTimeout(brasilApiTimeoutId);

        if (brasilApiResponse.ok) {
          const brasilApiData = await brasilApiResponse.json();
          console.log("Dados recebidos da BrasilAPI:", brasilApiData);
          
          // Converter formato da BrasilAPI para nosso formato
          return convertBrasilAPIToCNPJData(cleanCnpj, brasilApiData);
        }
      } catch (brasilApiError) {
        console.error("Erro ao buscar na BrasilAPI:", brasilApiError);
      }

      // Se ambas as APIs falharem, retornar null
      throw fetchError;
    }
  } catch (error: any) {
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

