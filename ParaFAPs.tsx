import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, BarChart3, Users, Zap, TrendingUp, Shield } from "lucide-react";
import { useState } from "react";

export default function ParaFAPs() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
      {/* Hero */}
      <section className="py-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-6">
                Modernize sua FAP com Origem.Lab
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Plataforma completa para gerenciar editais, aumentar candidaturas qualificadas e maximizar o impacto do fomento.
              </p>
              <div className="flex gap-4">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-6 text-lg">
                  Solicitar Demo
                </Button>
                <Button variant="outline" className="px-8 py-6 text-lg">
                  Ver Documentação
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-purple-200">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-6 h-6 text-purple-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">+45% Candidaturas</p>
                    <p className="text-sm text-gray-600">Média de aumento em FAPs que usam</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-6 h-6 text-blue-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">Melhor Qualidade</p>
                    <p className="text-sm text-gray-600">Candidaturas mais alinhadas aos critérios</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-6 h-6 text-yellow-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">Menos Trabalho</p>
                    <p className="text-sm text-gray-600">Validação automática de elegibilidade</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section className="py-20 bg-white">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Como Funciona para FAPs</h2>
          
          <div className="grid md:grid-cols-4 gap-6 mb-16">
            <Card className="p-6 border-2 border-purple-200">
              <div className="text-3xl font-bold text-purple-600 mb-3">1</div>
              <h3 className="font-bold mb-3 text-gray-900">Publicar Editais</h3>
              <p className="text-sm text-gray-600">Publique seus editais na plataforma com critérios e requisitos</p>
            </Card>

            <Card className="p-6 border-2 border-purple-200">
              <div className="text-3xl font-bold text-purple-600 mb-3">2</div>
              <h3 className="font-bold mb-3 text-gray-900">Candidatos Qualificados</h3>
              <p className="text-sm text-gray-600">Pesquisadores encontram seus editais e se candidatam com propostas de qualidade</p>
            </Card>

            <Card className="p-6 border-2 border-purple-200">
              <div className="text-3xl font-bold text-purple-600 mb-3">3</div>
              <h3 className="font-bold mb-3 text-gray-900">Validação Automática</h3>
              <p className="text-sm text-gray-600">Sistema valida elegibilidade automaticamente, reduzindo trabalho manual</p>
            </Card>

            <Card className="p-6 border-2 border-green-200">
              <div className="text-3xl font-bold text-green-600 mb-3">4</div>
              <h3 className="font-bold mb-3 text-gray-900">Ganhe Comissão</h3>
              <p className="text-sm text-gray-600">Comissão sobre o valor distribuído em editais</p>
            </Card>
          </div>

          {/* Benefícios */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-12 border-2 border-purple-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Benefícios para sua FAP</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Maior Visibilidade</p>
                  <p className="text-gray-600">Seus editais aparecem para 10.000+ pesquisadores e empresas</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Candidaturas Qualificadas</p>
                  <p className="text-gray-600">Apenas candidatos elegíveis podem se candidatar</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Redução de Carga</p>
                  <p className="text-gray-600">Validação automática economiza 60% do tempo de análise</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Dados e Relatórios</p>
                  <p className="text-gray-600">Dashboard com métricas completas de cada edital</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section className="py-20 bg-gray-50">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Planos para FAPs</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8 border border-gray-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Startup FAP</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 2.990</p>
              <p className="text-gray-600 mb-8">/mês</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 10 editais</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 1.000 candidatos/ano</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Dashboard básico</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Compliance LGPD</li>
              </ul>
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">Solicitar Demo</Button>
            </Card>

            <Card className="p-8 border-2 border-purple-600 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Mais Popular
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Professional FAP</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 9.990</p>
              <p className="text-gray-600 mb-8">/mês</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 50 editais</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 10.000 candidatos/ano</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Dashboard avançado</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Validação automática</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Relatórios detalhados</li>
              </ul>
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">Solicitar Demo</Button>
            </Card>

            <Card className="p-8 border border-gray-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Enterprise FAP</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 19.990</p>
              <p className="text-gray-600 mb-8">/mês</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Editais ilimitados</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Candidatos ilimitados</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Tudo do Professional</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Análise avançada (ML)</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> API completa</li>
              </ul>
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">Solicitar Demo</Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="py-20 bg-white">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Funcionalidades Completas</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="p-8 border-2 border-purple-200">
              <BarChart3 className="w-10 h-10 text-purple-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Dashboard Executivo</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Métricas de cada edital</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Candidatos por região</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Taxa de aprovação</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Valor total distribuído</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-purple-200">
              <Users className="w-10 h-10 text-purple-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Gestão de Candidatos</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Filtrar por elegibilidade</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Validação automática</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Histórico de candidaturas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Exportar relatórios</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-purple-200">
              <Shield className="w-10 h-10 text-purple-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Segurança e Conformidade</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Conformidade LGPD</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Criptografia end-to-end</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Auditoria de acessos</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Backup automático</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-purple-200">
              <Zap className="w-10 h-10 text-purple-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Integração Fácil</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> API REST completa</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Webhooks para eventos</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Suporte técnico 24/7</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Documentação completa</li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-pink-600">
        <div className="container max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-6">Modernize sua FAP Hoje</h2>
          <p className="text-xl text-purple-100 mb-8">Aumente candidaturas qualificadas, reduza trabalho manual e ganhe comissão</p>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-white text-purple-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold"
          >
            Solicitar Demo
          </Button>
        </div>
      </section>
    </div>
  );
}
