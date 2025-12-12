import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, TrendingUp, Users, Zap, BarChart3, Lock } from "lucide-react";
import { useState } from "react";

export default function ParaCorporativo() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50">
      {/* Hero */}
      <section className="py-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-6">
                Potencialize a Inovação da sua Organização
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Plataforma completa para gerenciar pesquisadores, rastrear oportunidades de fomento e maximizar captação de recursos.
              </p>
              <div className="flex gap-4">
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-6 text-lg">
                  Solicitar Demo
                </Button>
                <Button variant="outline" className="px-8 py-6 text-lg">
                  Ver Documentação
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-indigo-200">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-6 h-6 text-indigo-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">+60% Captação</p>
                    <p className="text-sm text-gray-600">Média de aumento em organizações</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-6 h-6 text-blue-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">Equipes Ilimitadas</p>
                    <p className="text-sm text-gray-600">Gerencie todos os pesquisadores</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-6 h-6 text-yellow-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">Automação Total</p>
                    <p className="text-sm text-gray-600">Validação e matching automáticos</p>
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
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Como Funciona para Corporativo</h2>
          
          <div className="grid md:grid-cols-4 gap-6 mb-16">
            <Card className="p-6 border-2 border-indigo-200">
              <div className="text-3xl font-bold text-indigo-600 mb-3">1</div>
              <h3 className="font-bold mb-3 text-gray-900">Integração</h3>
              <p className="text-sm text-gray-600">Conecte seus pesquisadores via SSO ou API</p>
            </Card>

            <Card className="p-6 border-2 border-indigo-200">
              <div className="text-3xl font-bold text-indigo-600 mb-3">2</div>
              <h3 className="font-bold mb-3 text-gray-900">Descoberta</h3>
              <p className="text-sm text-gray-600">Pesquisadores encontram editais relevantes</p>
            </Card>

            <Card className="p-6 border-2 border-indigo-200">
              <div className="text-3xl font-bold text-indigo-600 mb-3">3</div>
              <h3 className="font-bold mb-3 text-gray-900">Gestão</h3>
              <p className="text-sm text-gray-600">Acompanhe propostas e candidaturas em tempo real</p>
            </Card>

            <Card className="p-6 border-2 border-green-200">
              <div className="text-3xl font-bold text-green-600 mb-3">4</div>
              <h3 className="font-bold mb-3 text-gray-900">Resultado</h3>
              <p className="text-sm text-gray-600">Maximize captação de recursos</p>
            </Card>
          </div>

          {/* Benefícios */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg p-12 border-2 border-indigo-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Benefícios para sua Organização</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Visibilidade Completa</p>
                  <p className="text-gray-600">Dashboard executivo com todas as oportunidades</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Controle Total</p>
                  <p className="text-gray-600">Gerencie pesquisadores, propostas e editais</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Análise Avançada</p>
                  <p className="text-gray-600">Relatórios detalhados e insights estratégicos</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Check className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Compliance</p>
                  <p className="text-gray-600">Conformidade LGPD e segurança de dados</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section className="py-20 bg-gray-50">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Planos para Corporativo</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8 border border-gray-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Departamento</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 1.990</p>
              <p className="text-gray-600 mb-8">/mês</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 50 pesquisadores</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Dashboard de controle</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Gestão de propostas</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Relatórios por departamento</li>
              </ul>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">Começar 7 dias grátis</Button>
            </Card>

            <Card className="p-8 border-2 border-indigo-600 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Mais Popular
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Instituição</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 4.990</p>
              <p className="text-gray-600 mb-8">/mês</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 500 pesquisadores</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Tudo do Departamento</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Dashboard executivo</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Analytics avançado</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Integração acadêmica</li>
              </ul>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">Começar 7 dias grátis</Button>
            </Card>

            <Card className="p-8 border border-gray-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Corporativo</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 9.990</p>
              <p className="text-gray-600 mb-8">/mês</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 2.000 colaboradores</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Tudo da Instituição</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> White label</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> API avançada</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Suporte 24/7</li>
              </ul>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">Solicitar Demo</Button>
            </Card>
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="py-20 bg-white">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Funcionalidades Completas</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="p-8 border-2 border-indigo-200">
              <BarChart3 className="w-10 h-10 text-indigo-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Dashboard Executivo</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Métricas de captação</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Pesquisadores por departamento</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Taxa de sucesso</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Valor total captado</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-indigo-200">
              <Users className="w-10 h-10 text-indigo-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Gestão de Pesquisadores</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Criar equipes</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Controle de permissões</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Histórico de atividades</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Exportar relatórios</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-indigo-200">
              <Lock className="w-10 h-10 text-indigo-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Segurança e Conformidade</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Conformidade LGPD</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> SSO/SAML</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Auditoria de acessos</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Backup automático</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-indigo-200">
              <Zap className="w-10 h-10 text-indigo-600 mb-4" />
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
      <section className="py-20 bg-gradient-to-r from-indigo-600 to-blue-600">
        <div className="container max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-6">Maximize a Inovação da sua Organização</h2>
          <p className="text-xl text-indigo-100 mb-8">Aumente captação de fomento, gerencie pesquisadores e ganhe insights estratégicos</p>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-white text-indigo-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold"
          >
            Solicitar Demo
          </Button>
        </div>
      </section>
    </div>
  );
}
