import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  ArrowUp,
  ArrowDown,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon
} from "lucide-react";
import { analyticsService, AnalyticsMetrics, TrendData } from "@/services/analyticsService";

export default function AdminDashboard() {
  const [metricas, setMetricas] = useState<AnalyticsMetrics | null>(null);
  const [tendenciaConversao, setTendenciaConversao] = useState<TrendData[]>([]);
  const [tendenciaMRR, setTendenciaMRR] = useState<TrendData[]>([]);
  const [tendenciaChurn, setTendenciaChurn] = useState<TrendData[]>([]);
  const [usuariosPorPlano, setUsuariosPorPlano] = useState<any>(null);
  const [fonteAquisicao, setFonteAquisicao] = useState<any>(null);
  const [receitaPorPlano, setReceitaPorPlano] = useState<any>(null);
  const [cacPayback, setCacPayback] = useState<number | null>(null);
  const [scoreSaude, setScoreSaude] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregarDados = async () => {
      setLoading(true);
      try {
        const [
          m,
          tc,
          tm,
          tch,
          up,
          fa,
          rp,
          cp,
          ss
        ] = await Promise.all([
          analyticsService.obterMetricas(),
          analyticsService.obterTendenciaConversao(),
          analyticsService.obterTendenciaMRR(),
          analyticsService.obterTendenciaChurn(),
          analyticsService.obterUsuariosPorPlano(),
          analyticsService.obterFonteAquisicao(),
          analyticsService.obterReceitaPorPlano(),
          analyticsService.obterCACPaybackPeriod(),
          analyticsService.obterScoreSaude()
        ]);

        setMetricas(m);
        setTendenciaConversao(tc);
        setTendenciaMRR(tm);
        setTendenciaChurn(tch);
        setUsuariosPorPlano(up);
        setFonteAquisicao(fa);
        setReceitaPorPlano(rp);
        setCacPayback(cp);
        setScoreSaude(ss);
      } finally {
        setLoading(false);
      }
    };

    carregarDados();
  }, []);

  if (loading || !metricas) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const MetricCard = ({ icon: Icon, label, valor, unidade, tendencia }: any) => (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Icon className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="text-2xl font-bold text-gray-900">
              {valor.toLocaleString('pt-BR')}
              <span className="text-sm text-gray-500 ml-1">{unidade}</span>
            </p>
          </div>
        </div>
        {tendencia !== undefined && (
          <div className={`flex items-center gap-1 ${tendencia >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {tendencia >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            <span className="text-sm font-semibold">{Math.abs(tendencia)}%</span>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard Admin</h1>
          <p className="text-gray-600">Monitoramento em tempo real da saúde do negócio</p>
        </div>

        {/* Score de Saúde */}
        {scoreSaude !== null && (
          <Card className="p-8 mb-8 bg-gradient-to-r from-blue-600 to-violet-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 mb-2">Score de Saude do Negocio</p>
                <p className="text-5xl font-bold">{scoreSaude}/100</p>
                <p className="text-blue-100 mt-2">
                  {scoreSaude >= 80 ? "Excelente" : scoreSaude >= 60 ? "Bom" : "Precisa melhorar"}
                </p>
              </div>
              <Activity className="w-24 h-24 opacity-20" />
            </div>
          </Card>
        )}

        {/* Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            icon={TrendingUp}
            label="Taxa de Conversão"
            valor={metricas.conversao}
            unidade="%"
            tendencia={2.5}
          />
          <MetricCard
            icon={DollarSign}
            label="CAC (Customer Acquisition Cost)"
            valor={metricas.cac}
            unidade="R$"
            tendencia={-8}
          />
          <MetricCard
            icon={DollarSign}
            label="LTV (Lifetime Value)"
            valor={metricas.ltv}
            unidade="R$"
            tendencia={12}
          />
          <MetricCard
            icon={Activity}
            label="Churn Rate"
            valor={metricas.churn}
            unidade="%"
            tendencia={-1.2}
          />
        </div>

        {/* Receita e Usuários */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <p className="text-sm text-gray-600 mb-2">MRR (Monthly Recurring Revenue)</p>
            <p className="text-3xl font-bold text-gray-900">R$ {metricas.mrr.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-green-600 mt-2">↑ 22% vs mês anterior</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-gray-600 mb-2">ARR (Annual Recurring Revenue)</p>
            <p className="text-3xl font-bold text-gray-900">R$ {metricas.arr.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-green-600 mt-2">↑ 22% vs ano anterior</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-gray-600 mb-2">Usuários Ativos</p>
            <p className="text-3xl font-bold text-gray-900">{metricas.usuarios_ativos.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-blue-600 mt-2">{metricas.usuarios_pagos} pagos • {metricas.usuarios_ativos - metricas.usuarios_pagos} trial</p>
          </Card>
        </div>

        {/* Métricas Avançadas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <p className="text-sm text-gray-600 mb-2">Taxa de Retenção</p>
            <p className="text-3xl font-bold text-gray-900">{metricas.taxa_retencao}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${metricas.taxa_retencao}%` }}
              ></div>
            </div>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-gray-600 mb-2">NRR (Net Revenue Retention)</p>
            <p className="text-3xl font-bold text-gray-900">{metricas.nrr}%</p>
            <p className="text-xs text-gray-600 mt-2">
              {metricas.nrr > 100 ? "✅ Crescimento com clientes existentes" : "⚠️ Foco em expansão"}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-gray-600 mb-2">CAC Payback Period</p>
            <p className="text-3xl font-bold text-gray-900">{cacPayback} meses</p>
            <p className="text-xs text-gray-600 mt-2">Tempo para recuperar custo de aquisição</p>
          </Card>
        </div>

        {/* Gráficos de Tendência */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Conversão */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <LineChartIcon className="w-5 h-5 text-blue-600" />
              Tendência de Conversão (30 dias)
            </h3>
            <div className="h-64 bg-gray-50 rounded-lg p-4 flex items-end justify-between">
              {tendenciaConversao.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 mx-0.5 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t opacity-70 hover:opacity-100 transition-opacity"
                  style={{ height: `${(d.valor / 40) * 100}%` }}
                  title={`${d.data}: ${d.valor}%`}
                ></div>
              ))}
            </div>
          </Card>

          {/* MRR */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-600" />
              Tendência de MRR (12 meses)
            </h3>
            <div className="h-64 bg-gray-50 rounded-lg p-4 flex items-end justify-between">
              {tendenciaMRR.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 mx-0.5 bg-gradient-to-t from-green-600 to-green-400 rounded-t opacity-70 hover:opacity-100 transition-opacity"
                  style={{ height: `${(d.valor / 25000) * 100}%` }}
                  title={`${d.data}: R$ ${d.valor.toLocaleString('pt-BR')}`}
                ></div>
              ))}
            </div>
          </Card>
        </div>

        {/* Distribuição */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Usuários por Plano */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-purple-600" />
              Usuários por Plano
            </h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Gratuito</span>
                  <span className="font-semibold">{usuariosPorPlano.gratuito}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-gray-600 h-2 rounded-full" style={{ width: "60%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Pro</span>
                  <span className="font-semibold">{usuariosPorPlano.pro}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: "25%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Institucional</span>
                  <span className="font-semibold">{usuariosPorPlano.institucional}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-violet-600 h-2 rounded-full" style={{ width: "15%" }}></div>
                </div>
              </div>
            </div>
          </Card>

          {/* Fonte de Aquisição */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Fonte de Aquisição</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Orgânico</span>
                <span className="font-semibold text-green-600">{fonteAquisicao.organic}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Paid Ads</span>
                <span className="font-semibold text-blue-600">{fonteAquisicao.paid_ads}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Referral</span>
                <span className="font-semibold text-purple-600">{fonteAquisicao.referral}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Partnership</span>
                <span className="font-semibold text-orange-600">{fonteAquisicao.partnership}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Direto</span>
                <span className="font-semibold text-red-600">{fonteAquisicao.direto}</span>
              </div>
            </div>
          </Card>

          {/* Receita por Plano */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Receita por Plano</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Pro</span>
                  <span className="font-semibold">R$ {receitaPorPlano.pro.toLocaleString('pt-BR')}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: "65%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Institucional</span>
                  <span className="font-semibold">R$ {receitaPorPlano.institucional.toLocaleString('pt-BR')}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-violet-600 h-2 rounded-full" style={{ width: "35%" }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Success Fee</span>
                  <span className="font-semibold">R$ {receitaPorPlano.success_fee.toLocaleString('pt-BR')}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: "15%" }}></div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Ações */}
        <div className="flex gap-4">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            Exportar Relatório
          </Button>
          <Button variant="outline">
            Configurar Alertas
          </Button>
          <Button variant="outline">
            Atualizar Dados
          </Button>
        </div>
      </div>
    </div>
  );
}
