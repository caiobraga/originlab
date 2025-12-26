/**
 * Estrutura de campos específica para editais do CNPq
 */

export interface CNPqFormData {
  // Informações básicas do projeto
  projeto_pesquisa: {
    instituicao_desenvolvimento: string;
    titulo_projeto_pt: string;
    titulo_projeto_en: string;
    area: string;
    palavras_chave_pt: string; // 1-6 palavras separadas por vírgula
    palavras_chave_en: string; // 1-6 palavras separadas por vírgula
  };

  // Resumo
  resumo: {
    resumo_proposta: string; // máximo 2000 caracteres
  };

  // Sobre o Projeto (12 questões)
  sobre_projeto: {
    objetivo: string; // máximo 4000 caracteres
    metas: string; // máximo 4000 caracteres
    metodologia_gestao_execucao: string; // máximo 4000 caracteres
    relevancia_setor_produtivo: string; // máximo 4000 caracteres
    instituicoes_colaboradoras_financiadoras: string; // máximo 4000 caracteres
    nivel_maturidade_tecnologica: string; // máximo 4000 caracteres
    resultados_cientificos_tecnologicos: string; // máximo 4000 caracteres
    potencial_producao_tecnologica_inovacao: string; // máximo 4000 caracteres
    potencial_empreendedorismo_inovador: string; // máximo 4000 caracteres
    potencial_atendimento_necessidades: string; // máximo 4000 caracteres
    sumula_curricular: string; // máximo 4000 caracteres
    sumula_curricular_continuacao: string; // máximo 4000 caracteres
  };
}

/**
 * Cria uma estrutura vazia do formulário CNPq
 */
export function createEmptyCNPqForm(): CNPqFormData {
  return {
    projeto_pesquisa: {
      instituicao_desenvolvimento: '',
      titulo_projeto_pt: '',
      titulo_projeto_en: '',
      area: '',
      palavras_chave_pt: '',
      palavras_chave_en: '',
    },
    resumo: {
      resumo_proposta: '',
    },
    sobre_projeto: {
      objetivo: '',
      metas: '',
      metodologia_gestao_execucao: '',
      relevancia_setor_produtivo: '',
      instituicoes_colaboradoras_financiadoras: '',
      nivel_maturidade_tecnologica: '',
      resultados_cientificos_tecnologicos: '',
      potencial_producao_tecnologica_inovacao: '',
      potencial_empreendedorismo_inovador: '',
      potencial_atendimento_necessidades: '',
      sumula_curricular: '',
      sumula_curricular_continuacao: '',
    },
  };
}

/**
 * Valida se os campos obrigatórios do formulário CNPq estão preenchidos
 */
export function validateCNPqForm(data: CNPqFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validar campos obrigatórios
  if (!data.projeto_pesquisa.instituicao_desenvolvimento.trim()) {
    errors.push('Instituição onde será desenvolvido o projeto é obrigatória');
  }
  if (!data.projeto_pesquisa.titulo_projeto_pt.trim()) {
    errors.push('Título do Projeto (em Português) é obrigatório');
  }
  if (!data.projeto_pesquisa.titulo_projeto_en.trim()) {
    errors.push('Título do Projeto (em Inglês) é obrigatório');
  }
  if (!data.projeto_pesquisa.area.trim()) {
    errors.push('Área é obrigatória');
  }
  if (!data.projeto_pesquisa.palavras_chave_pt.trim()) {
    errors.push('Palavras-chave (em português) são obrigatórias');
  }
  if (!data.projeto_pesquisa.palavras_chave_en.trim()) {
    errors.push('Palavras-chave (em inglês) são obrigatórias');
  }

  // Validar limites de caracteres
  if (data.resumo.resumo_proposta.length > 2000) {
    errors.push('Resumo da Proposta não pode exceder 2000 caracteres');
  }

  const campos4000 = [
    { field: data.sobre_projeto.objetivo, name: 'Objetivos' },
    { field: data.sobre_projeto.metas, name: 'Metas' },
    { field: data.sobre_projeto.metodologia_gestao_execucao, name: 'Metodologia e gestão da execução' },
    { field: data.sobre_projeto.relevancia_setor_produtivo, name: 'Relevância para o setor produtivo' },
    { field: data.sobre_projeto.instituicoes_colaboradoras_financiadoras, name: 'Instituições colaboradoras/financiadoras' },
    { field: data.sobre_projeto.nivel_maturidade_tecnologica, name: 'Nível de maturidade tecnológica' },
    { field: data.sobre_projeto.resultados_cientificos_tecnologicos, name: 'Resultados científicos e tecnológicos' },
    { field: data.sobre_projeto.potencial_producao_tecnologica_inovacao, name: 'Potencial para produção tecnológica e inovação' },
    { field: data.sobre_projeto.potencial_empreendedorismo_inovador, name: 'Potencial para empreendedorismo inovador' },
    { field: data.sobre_projeto.potencial_atendimento_necessidades, name: 'Potencial para atendimento a necessidades' },
    { field: data.sobre_projeto.sumula_curricular, name: 'Súmula Curricular' },
    { field: data.sobre_projeto.sumula_curricular_continuacao, name: 'Súmula Curricular (continuação)' },
  ];

  campos4000.forEach(({ field, name }) => {
    if (field.length > 4000) {
      errors.push(`${name} não pode exceder 4000 caracteres`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

