/**
 * Estrutura fixa dos campos do formulário de proposta
 * Todos os editais usam o mesmo formulário
 */

export interface PropostaFormData {
  // Seção 1: Título e Versão
  titulo_projeto: string;
  versao: string;

  // Seção 1: Eixos Estratégicos
  eixo_estrategico: {
    selecionado: 'eixo1' | 'eixo2' | 'eixo3' | 'nao_se_aplica' | null;
    eixo1_temas: string[]; // ['educacao', 'seguranca', 'protecao_social']
    eixo2_temas: string[]; // ['agricultura', 'desenvolvimento_economico', 'infraestrutura']
    eixo3_temas: string[]; // ['gestao_publica', 'reducao_desigualdades', 'emprego']
  };

  // Seção 2: Dados da Instituição Executora
  instituicao_executora: {
    nome: string;
    sigla: string;
    municipio: string;
    cnpj: string;
  };

  // Seção 2.1: Representante Legal
  representante_legal: {
    nome: string;
    cargo_ato_nomeacao: string;
    emails: string[];
    telefones: string[];
  };

  // Seção 2.2: Coordenador do Projeto
  coordenador_projeto: {
    nome: string;
    instituicao_vinculo: string;
    departamento: string;
    cargo_exercido: string;
    emails: string[];
    telefones: string[];
    participa_grupo_pesquisa_cnpq: boolean | null;
    grupo_pesquisa_cnpq: string;
    cv_lattes: string;
    orcid: string;
    resumo_experiencia_profissional: string;
  };

  // Seção 3: Detalhamento do Projeto
  detalhamento_projeto: {
    titulo: string;
    modalidade: 'pesquisa_experimental' | 'pesquisa_nao_experimental' | null;
    duracao_meses: number | null; // máximo 36
    valor_projeto: string;
    possui_outras_fontes_fomento: boolean | null;
    outras_fontes_fomento: string;
    ods_selecionados: number[]; // Array de números de 1 a 17
    grande_area_conhecimento: number | null; // 1-8
    subareas_conhecimento: Array<{
      codigo: string;
      nome: string;
    }>;
    tipo_contribuicao_inovacao: ('produto' | 'servico' | 'processo' | 'outros' | 'nao_se_aplica')[];
    caracterizacao_contribuicao_inovacao: string;
    resumo_publicavel: string; // máximo 500 palavras
    palavras_chave: string[]; // máximo 6
    caracterizacao_problema: string; // máximo 2500 palavras
    potencial_fortalecimento_linha_pesquisa: string;
    descricao_avancao_cti: string; // máximo 1000 palavras
    qualificacao_equipe: string;
    objetivo_geral: string; // máximo 100 palavras
    objetivos_especificos: Array<{
      descricao: string;
      entregas: string[];
      criterios_aceitacao: string;
      responsaveis: string[];
      cronograma: Record<string, boolean>; // M1, M2, ... M36
    }>;
    detalhamento_projeto: string; // máximo 3000 palavras
    caracterizacao_interdisciplinaridade: string; // máximo 1000 palavras
    promocao_popularizacao: {
      publico_alvo: string; // máximo 300 palavras
      estrategias_traducao_conhecimento: string; // máximo 1000 palavras
      estrategias_disseminacao_conhecimento: string;
    };
    beneficios_resultados_esperados: string; // máximo 1000 palavras
    impactos_esperados: {
      impacto_cientifico: string;
      impacto_tecnologico: string;
      impacto_economico: string;
      impacto_social_ambiental: string;
    };
    indicadores_acompanhamento: Array<{
      indicador: string;
      unidade_medida: string;
      meta: string;
      prazo: string;
      frequencia_acompanhamento: string;
      fonte_verificacao: string;
    }>;
    riscos_mitigacao: Array<{
      risco: string;
      probabilidade: string;
      impacto: string;
      estrategia_mitigacao: string;
    }>;
    infraestrutura_apoio_tecnico: string; // máximo 1000 palavras
    referencias: string;
    declaracao_proponente: boolean; // checkbox
  };

  // Seção 4: Equipe do Projeto
  equipe_projeto: Array<{
    nome: string;
    funcao: string;
    carga_horaria: string;
    instituicao_vinculo: string;
    email: string;
    responsabilidades: string;
    descricao_curriculo: string;
    cv_lattes: string;
  }>;

  // Seção 5: Cronograma Físico (já incluído em objetivos_especificos)

  // Seção 6: Execução dos Recursos Financeiros
  recursos_financeiros: {
    materiais_permanentes: Array<{
      detalhamento: string;
      justificativa: string;
      unidade: string;
      quantidade: number;
      custo_unitario: number;
      custo_total: number;
    }>;
    materiais_consumo: Array<{
      detalhamento: string;
      justificativa: string;
      unidade: string;
      quantidade: number;
      custo_unitario: number;
      custo_total: number;
    }>;
    passagens_diarias: Array<{
      detalhamento: string;
      justificativa: string;
      unidade: string;
      quantidade: number;
      custo_unitario: number;
      custo_total: number;
    }>;
    servicos_terceiros: Array<{
      detalhamento: string;
      justificativa: string;
      unidade: string;
      quantidade: number;
      custo_unitario: number;
      custo_total: number;
    }>;
    bolsas: Array<{
      modalidade: string;
      justificativa: string;
      unidade: string;
      quantidade: number;
      custo_unitario: number;
      custo_total: number;
    }>;
  };
}

/**
 * Cria uma estrutura vazia do formulário para uma nova proposta
 */
export function createEmptyPropostaForm(): PropostaFormData {
  return {
    titulo_projeto: '',
    versao: '1.3',
    eixo_estrategico: {
      selecionado: null,
      eixo1_temas: [],
      eixo2_temas: [],
      eixo3_temas: [],
    },
    instituicao_executora: {
      nome: '',
      sigla: '',
      municipio: '',
      cnpj: '',
    },
    representante_legal: {
      nome: '',
      cargo_ato_nomeacao: '',
      emails: [''],
      telefones: [''],
    },
    coordenador_projeto: {
      nome: '',
      instituicao_vinculo: '',
      departamento: '',
      cargo_exercido: '',
      emails: [''],
      telefones: [''],
      participa_grupo_pesquisa_cnpq: null,
      grupo_pesquisa_cnpq: '',
      cv_lattes: '',
      orcid: '',
      resumo_experiencia_profissional: '',
    },
    detalhamento_projeto: {
      titulo: '',
      modalidade: null,
      duracao_meses: null,
      valor_projeto: '',
      possui_outras_fontes_fomento: null,
      outras_fontes_fomento: '',
      ods_selecionados: [],
      grande_area_conhecimento: null,
      subareas_conhecimento: [],
      tipo_contribuicao_inovacao: [],
      caracterizacao_contribuicao_inovacao: '',
      resumo_publicavel: '',
      palavras_chave: [],
      caracterizacao_problema: '',
      potencial_fortalecimento_linha_pesquisa: '',
      descricao_avancao_cti: '',
      qualificacao_equipe: '',
      objetivo_geral: '',
      objetivos_especificos: [],
      detalhamento_projeto: '',
      caracterizacao_interdisciplinaridade: '',
      promocao_popularizacao: {
        publico_alvo: '',
        estrategias_traducao_conhecimento: '',
        estrategias_disseminacao_conhecimento: '',
      },
      beneficios_resultados_esperados: '',
      impactos_esperados: {
        impacto_cientifico: '',
        impacto_tecnologico: '',
        impacto_economico: '',
        impacto_social_ambiental: '',
      },
      indicadores_acompanhamento: [],
      riscos_mitigacao: [],
      infraestrutura_apoio_tecnico: '',
      referencias: '',
      declaracao_proponente: false,
    },
    equipe_projeto: [],
    recursos_financeiros: {
      materiais_permanentes: [],
      materiais_consumo: [],
      passagens_diarias: [],
      servicos_terceiros: [],
      bolsas: [],
    },
  };
}

/**
 * Opções pré-definidas para campos select/checkbox
 */
export const FORM_OPTIONS = {
  eixos: {
    eixo1: {
      nome: 'EIXO 1 - QUALIDADE DE VIDA AOS CAPIXABAS',
      temas: [
        { id: 'educacao', label: 'EDUCAÇÃO, CULTURA, ESPORTE E LAZER' },
        { id: 'seguranca', label: 'SEGURANÇA PÚBLICA E JUSTIÇA' },
        { id: 'protecao_social', label: 'PROTEÇÃO SOCIAL, SAÚDE E DIREITOS HUMANOS' },
      ],
    },
    eixo2: {
      nome: 'EIXO 2 - DESENVOLVIMENTO COM SUSTENTABILIDADE',
      temas: [
        { id: 'agricultura', label: 'AGRICULTURA E MEIO AMBIENTE' },
        { id: 'desenvolvimento_economico', label: 'DESENVOLVIMENTO ECONÔMICO E CIÊNCIA, TECNOLOGIA, INOVAÇÃO E TURISMO' },
        { id: 'infraestrutura', label: 'INFRAESTRUTURA' },
      ],
    },
    eixo3: {
      nome: 'EIXO 3 - RESULTADOS PARA OS CAPIXABAS',
      temas: [
        { id: 'gestao_publica', label: 'GESTÃO PÚBLICA INOVADORA' },
        { id: 'reducao_desigualdades', label: 'REDUÇÃO DAS DESIGUALDADES SOCIAIS' },
        { id: 'emprego', label: 'EMPREGO, TRABALHO E RENDA' },
      ],
    },
  },
  modalidades: [
    { value: 'pesquisa_experimental', label: 'Pesquisa Experimental' },
    { value: 'pesquisa_nao_experimental', label: 'Pesquisa Não Experimental' },
  ],
  ods: [
    { id: 1, label: '1 - ERRADICAÇÃO DA POBREZA' },
    { id: 2, label: '2 - FOME ZERO E AGRICULTURA SUSTENTÁVEL' },
    { id: 3, label: '3 – SAÚDE E BEM-ESTAR' },
    { id: 4, label: '4 – EDUCAÇÃO DE QUALIDADE' },
    { id: 5, label: '5 – IGUALDADE DE GÊNERO' },
    { id: 6, label: '6 – ÁGUA POTÁVEL E SANEAMENTO' },
    { id: 7, label: '7 – ENERGIA LIMPA E ACESSÍVEL' },
    { id: 8, label: '8 – TRABALHO DECENTE E CRESCIMENTO ECONÔMICO' },
    { id: 9, label: '9 – INDUSTRIA, INOVAÇÃO E INFRAESTRUTURA' },
    { id: 10, label: '10 – REDUÇÃO DAS DESIGUALDADES' },
    { id: 11, label: '11 – CIDADES E COMUNIDADES SUSTENTÁVEIS' },
    { id: 12, label: '12 – CONSUMO E PRODUÇÃO RESPONSÁVEIS' },
    { id: 13, label: '13 – AÇÃO CONTRA A MUDANÇA GLOBAL DO CLIMA' },
    { id: 14, label: '14 – VIDA NA ÁGUA' },
    { id: 15, label: '15 – VIDA TERRESTRE' },
    { id: 16, label: '16 – PAZ, JUSTIÇA E INSTITIÇÕES EFICAZES' },
    { id: 17, label: '17 – PARCERIAS E MEIOS DE IMPLEMENTAÇÃO' },
  ],
  grandes_areas: [
    { id: 1, label: '1 – CIÊNCIAS AGRÁRIAS' },
    { id: 2, label: '2 - ENGENHARIA' },
    { id: 3, label: '3 – CIÊNCIAS EXATAS E DA TERRA' },
    { id: 4, label: '4 – CIÊNCIAS HUMANAS' },
    { id: 5, label: '5 – LINGUÍSTICAS, LETRAS E ARTES' },
    { id: 6, label: '6 – CIÊNCIAS DA SAÚDE' },
    { id: 7, label: '7 – CIÊNCIAS SOCIAIS APLICADAS' },
    { id: 8, label: '8 – CIÊNCIAS DA VIDA' },
  ],
  tipo_contribuicao: [
    { value: 'produto', label: 'PRODUTO' },
    { value: 'servico', label: 'SERVIÇO' },
    { value: 'processo', label: 'PROCESSO' },
    { value: 'outros', label: 'OUTROS' },
    { value: 'nao_se_aplica', label: 'NÃO SE APLICA' },
  ],
  meses: Array.from({ length: 36 }, (_, i) => `M${i + 1}`),
};

