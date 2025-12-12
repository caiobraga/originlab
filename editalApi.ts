// Serviço de integração com APIs de Editais (FAPESP, FINEP, CNPq)
// Em produção, isso seria conectado com APIs reais

export interface Edital {
  id: string;
  titulo: string;
  orgao: string;
  valor: number;
  prazo: string;
  descricao: string;
  link: string;
  match: number;
  probabilidade: number;
  pais: string;
}

// Simular dados de APIs reais
const editaisReais: Edital[] = [
  {
    id: "fapesp-001",
    titulo: "FAPESP PIPE - Pesquisa Inovativa em Pequenas Empresas",
    orgao: "FAPESP",
    valor: 1000000,
    prazo: "2025-03-15",
    descricao: "Programa de apoio a pesquisa inovativa em pequenas empresas",
    link: "https://fapesp.br/pipe",
    match: 94,
    probabilidade: 87,
    pais: "Brasil"
  },
  {
    id: "finep-001",
    titulo: "FINEP Startup - Inovação Tecnológica",
    orgao: "FINEP",
    valor: 500000,
    prazo: "2025-02-28",
    descricao: "Financiamento para startups de tecnologia",
    link: "https://finep.gov.br",
    match: 91,
    probabilidade: 84,
    pais: "Brasil"
  },
  {
    id: "cnpq-001",
    titulo: "CNPq Produtividade em Pesquisa",
    orgao: "CNPq",
    valor: 300000,
    prazo: "2025-04-30",
    descricao: "Bolsa de produtividade para pesquisadores",
    link: "https://cnpq.br",
    match: 90,
    probabilidade: 82,
    pais: "Brasil"
  },
  {
    id: "horizon-001",
    titulo: "Horizon Europe - Pesquisa e Inovação",
    orgao: "EU",
    valor: 2500000,
    prazo: "2025-05-15",
    descricao: "Programa europeu de pesquisa e inovação",
    link: "https://ec.europa.eu/info/research_en",
    match: 85,
    probabilidade: 76,
    pais: "União Europeia"
  },
  {
    id: "corfo-001",
    titulo: "CORFO - Fomento a Inovação Chile",
    orgao: "CORFO",
    valor: 800000,
    prazo: "2025-03-31",
    descricao: "Programa chileno de fomento à inovação",
    link: "https://www.corfo.cl",
    match: 88,
    probabilidade: 79,
    pais: "Chile"
  }
];

export const editalApi = {
  // Buscar editais com filtros
  buscarEditais: async (filtros?: {
    orgao?: string;
    minMatch?: number;
    pais?: string;
  }): Promise<Edital[]> => {
    // Simular delay de API
    await new Promise(resolve => setTimeout(resolve, 500));

    let resultados = [...editaisReais];

    if (filtros?.orgao) {
      resultados = resultados.filter(e => e.orgao === filtros.orgao);
    }

    if (filtros?.minMatch !== undefined) {
      resultados = resultados.filter(e => e.match >= (filtros.minMatch ?? 0));
    }

    if (filtros?.pais !== undefined) {
      resultados = resultados.filter(e => e.pais === (filtros.pais ?? ''));
    }

    return resultados;
  },

  // Obter detalhes de um edital
  obterDetalhes: async (id: string): Promise<Edital | null> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return editaisReais.find(e => e.id === id) || null;
  },

  // Buscar novos editais (para notificações)
  buscarNovosEditais: async (ultimaVerificacao: Date): Promise<Edital[]> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Simular 2-3 novos editais
    return editaisReais.slice(0, Math.floor(Math.random() * 3) + 2);
  },

  // Sincronizar com múltiplas agências
  sincronizarAgencias: async (): Promise<{
    fapesp: number;
    finep: number;
    cnpq: number;
    outros: number;
  }> => {
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      fapesp: Math.floor(Math.random() * 50) + 20,
      finep: Math.floor(Math.random() * 40) + 15,
      cnpq: Math.floor(Math.random() * 60) + 25,
      outros: Math.floor(Math.random() * 100) + 50
    };
  }
};
