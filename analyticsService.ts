// Serviço de Analytics com cálculos de métricas SaaS

export interface AnalyticsMetrics {
  conversao: number; // %
  cac: number; // R$
  ltv: number; // R$
  churn: number; // %
  mrr: number; // R$ - Monthly Recurring Revenue
  arr: number; // R$ - Annual Recurring Revenue
  usuarios_ativos: number;
  usuarios_pagos: number;
  taxa_retencao: number; // %
  nrr: number; // % - Net Revenue Retention
  success_fee_mes: number; // R$ - 3% sobre valor captado
  valor_captado_mes: number; // R$ - Valor total captado pelos usuários
}

export interface TrendData {
  data: string;
  valor: number;
}

// Dados simulados para demo
const mockData = {
  usuarios_totais: 1247,
  usuarios_pagos: 187,
  usuarios_trial: 340,
  usuarios_inativos: 720,
  
  receita_mes: 18650,
  receita_mes_anterior: 15200,
  
  custo_aquisicao_total: 8500,
  usuarios_adquiridos_mes: 156,
  
  churn_taxa: 5.2,
  usuarios_cancelados_mes: 9,
  
  ticket_medio: 99.73,
  ltv_estimado: 1920,
  
  referrals_conversoes: 34,
  referrals_taxa: 18.5
};

export const analyticsService = {
  // Obter métricas principais
  obterMetricas: async (): Promise<AnalyticsMetrics> => {
    await new Promise(resolve => setTimeout(resolve, 500));

    const usuarios_pagos = mockData.usuarios_pagos;
    const usuarios_trial = mockData.usuarios_trial;
    const usuarios_ativos = usuarios_pagos + usuarios_trial;
    
    const conversao = (usuarios_pagos / (usuarios_pagos + usuarios_trial)) * 100;
    const cac = mockData.custo_aquisicao_total / mockData.usuarios_adquiridos_mes;
    const ltv = mockData.ltv_estimado;
    const mrr = mockData.receita_mes;
    const arr = mrr * 12;
    const taxa_retencao = 100 - mockData.churn_taxa;
    
    // NRR = (MRR mês atual - churn + expansão) / MRR mês anterior
    const nrr = ((mrr - (mrr * mockData.churn_taxa / 100)) / mockData.receita_mes_anterior) * 100;
    
    // Success Fee: 3% sobre valor captado pelos usuários
    const valor_captado_mes = 45000000; // R$ 45M captados pelos usuários neste mês
    const success_fee_mes = valor_captado_mes * 0.03; // 3%

    return {
      conversao: Math.round(conversao * 10) / 10,
      cac: Math.round(cac),
      ltv: Math.round(ltv),
      churn: mockData.churn_taxa,
      mrr: Math.round(mrr),
      arr: Math.round(arr),
      usuarios_ativos,
      usuarios_pagos,
      taxa_retencao: Math.round(taxa_retencao * 10) / 10,
      nrr: Math.round(nrr * 10) / 10,
      success_fee_mes: Math.round(success_fee_mes),
      valor_captado_mes
    };
  },

  // Obter dados de tendência de conversão
  obterTendenciaConversao: async (): Promise<TrendData[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));

    const dados = [];
    for (let i = 29; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const valor = 15 + Math.random() * 20 + (i < 10 ? 5 : 0); // Tendência de alta
      
      dados.push({
        data: data.toLocaleDateString('pt-BR'),
        valor: Math.round(valor * 10) / 10
      });
    }
    return dados;
  },

  // Obter dados de tendência de MRR
  obterTendenciaMRR: async (): Promise<TrendData[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));

    const dados = [];
    let mrr = 12000;
    
    for (let i = 11; i >= 0; i--) {
      const data = new Date();
      data.setMonth(data.getMonth() - i);
      mrr += Math.random() * 3000 + 1000; // Crescimento mensal
      
      dados.push({
        data: data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        valor: Math.round(mrr)
      });
    }
    return dados;
  },

  // Obter dados de tendência de churn
  obterTendenciaChurn: async (): Promise<TrendData[]> => {
    await new Promise(resolve => setTimeout(resolve, 400));

    const dados = [];
    for (let i = 11; i >= 0; i--) {
      const data = new Date();
      data.setMonth(data.getMonth() - i);
      const valor = 6 - (i * 0.1) + (Math.random() * 2 - 1); // Tendência de redução
      
      dados.push({
        data: data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        valor: Math.max(2, Math.round(valor * 10) / 10)
      });
    }
    return dados;
  },

  // Obter dados de usuários por plano
  obterUsuariosPorPlano: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      gratuito: mockData.usuarios_inativos + mockData.usuarios_trial,
      pro: Math.round(mockData.usuarios_pagos * 0.65),
      institucional: Math.round(mockData.usuarios_pagos * 0.35)
    };
  },

  // Obter dados de fonte de aquisição
  obterFonteAquisicao: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));

    const total = mockData.usuarios_adquiridos_mes;
    return {
      organic: Math.round(total * 0.35),
      paid_ads: Math.round(total * 0.25),
      referral: mockData.referrals_conversoes,
      partnership: Math.round(total * 0.15),
      direto: Math.round(total * 0.15)
    };
  },

  // Obter dados de receita por plano
  obterReceitaPorPlano: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));

    const total = mockData.receita_mes;
    return {
      pro: Math.round(total * 0.65),
      institucional: Math.round(total * 0.35),
      success_fee: Math.round(total * 0.15)
    };
  },

  // Calcular CAC Payback Period (em meses)
  obterCACPaybackPeriod: async (): Promise<number> => {
    await new Promise(resolve => setTimeout(resolve, 200));

    const cac = mockData.custo_aquisicao_total / mockData.usuarios_adquiridos_mes;
    const mrr_por_usuario = mockData.receita_mes / mockData.usuarios_pagos;
    
    return Math.round((cac / mrr_por_usuario) * 10) / 10;
  },

  // Obter score de saúde (0-100)
  obterScoreSaude: async (): Promise<number> => {
    await new Promise(resolve => setTimeout(resolve, 300));

    const metricas = await analyticsService.obterMetricas();
    
    // Scoring: conversão (30%), LTV/CAC (30%), retenção (25%), NRR (15%)
    const score_conversao = Math.min(metricas.conversao * 2, 30);
    const score_ltv_cac = Math.min((metricas.ltv / metricas.cac) * 5, 30);
    const score_retencao = metricas.taxa_retencao * 0.25;
    const score_nrr = Math.min(metricas.nrr, 15);
    
    return Math.round(score_conversao + score_ltv_cac + score_retencao + score_nrr);
  }
};
