import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, TrendingUp, Users, Zap, BarChart3, Lock } from "lucide-react";
import { useState } from "react";

export default function ParaConsultorias() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Hero */}
      <section className="py-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-6">
                Multiplique seus resultados com Origem.Lab
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Ofereça a melhor ferramenta de fomento para seus clientes. Ganhe 2% sobre cada projeto aprovado.
              </p>
              <div className="flex gap-4">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg">
                  Começar Agora
                </Button>
                <Button variant="outline" className="px-8 py-6 text-lg">
                  Ver Demo
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-blue-200">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-6 h-6 text-green-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">Aumento de Receita</p>
                    <p className="text-sm text-gray-600">2% sobre cada projeto aprovado</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-6 h-6 text-blue-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">Retenção de Clientes</p>
                    <p className="text-sm text-gray-600">Ferramenta essencial para seus clientes</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-6 h-6 text-yellow-500 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">Implementação Rápida</p>
                    <p className="text-sm text-gray-600">White label em 48 horas</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modelo de Negócio */}
      <section className="py-20 bg-white">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Como Funciona</h2>
          
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <Card className="p-8 border-2 border-blue-200">
              <div className="text-4xl font-bold text-blue-600 mb-4">1</div>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Integração</h3>
              <p className="text-gray-600 mb-6">Conecte Origem.Lab ao seu sistema via API ou white label em 48h</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> API REST completa</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> White label customizado</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Suporte técnico 24/7</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-blue-200">
              <div className="text-4xl font-bold text-blue-600 mb-4">2</div>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Ofereça aos Clientes</h3>
              <p className="text-gray-600 mb-6">Seus clientes usam Origem.Lab para encontrar e captar fomento</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Dashboard intuitivo</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> IA Redatora de propostas</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Validação automática</li>
              </ul>
            </Card>

            <Card className="p-8 border-2 border-green-200">
              <div className="text-4xl font-bold text-green-600 mb-4">3</div>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Ganhe Comissão</h3>
              <p className="text-gray-600 mb-6">Receba 2% sobre cada projeto aprovado pelos seus clientes</p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Pagamento automático</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Dashboard de ganhos</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500" /> Relatórios detalhados</li>
              </ul>
            </Card>
          </div>

          {/* Exemplo de Ganho */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-12 border-2 border-green-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Exemplo de Ganho Mensal</h3>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Clientes Ativos</p>
                <p className="text-3xl font-bold text-gray-900">50</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Valor Captado/Mês</p>
                <p className="text-3xl font-bold text-gray-900">R$ 50M</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Taxa Sucesso</p>
                <p className="text-3xl font-bold text-gray-900">30%</p>
              </div>
              <div className="text-center bg-green-100 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Sua Comissão</p>
                <p className="text-4xl font-bold text-green-600">R$ 450k</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section className="py-20 bg-gray-50">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Planos para Consultorias</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8 border border-gray-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Starter</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 0</p>
              <p className="text-gray-600 mb-8">+ 2% sobre projetos aprovados</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 10 clientes</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> API básica</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Suporte por email</li>
              </ul>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">Começar</Button>
            </Card>

            <Card className="p-8 border-2 border-blue-600 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                Mais Popular
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Professional</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 1.990</p>
              <p className="text-gray-600 mb-8">+ 2% sobre projetos aprovados</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 50 clientes</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Dashboard completo</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Relatórios mensais</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> IA Redatora</li>
              </ul>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">Começar 7 dias grátis</Button>
            </Card>

            <Card className="p-8 border border-gray-200">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">Enterprise</h3>
              <p className="text-4xl font-bold text-gray-900 mb-2">R$ 4.990</p>
              <p className="text-gray-600 mb-8">+ 2% sobre projetos aprovados</p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Até 200 clientes</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> White label completo</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> API avançada</li>
                <li className="flex items-center gap-2"><Check className="w-5 h-5 text-green-500" /> Suporte 24/7</li>
              </ul>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">Começar 7 dias grátis</Button>
            </Card>
          </div>
        </div>
      </section>

      {/* API Documentation */}
      <section className="py-20 bg-white">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Integração Simples via API</h2>
          
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-bold mb-6 text-gray-900">Endpoints Principais</h3>
              <div className="space-y-4">
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
                  <p className="text-green-400">POST /api/usuarios</p>
                  <p className="text-gray-400">Criar novo usuário</p>
                </div>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
                  <p className="text-green-400">GET /api/editais</p>
                  <p className="text-gray-400">Listar editais disponíveis</p>
                </div>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
                  <p className="text-green-400">POST /api/propostas</p>
                  <p className="text-gray-400">Submeter proposta</p>
                </div>
                <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
                  <p className="text-green-400">GET /api/ganhos</p>
                  <p className="text-gray-400">Consultar comissões</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-bold mb-6 text-gray-900">Exemplo de Integração</h3>
              <div className="bg-gray-900 text-gray-100 p-6 rounded-lg font-mono text-sm overflow-x-auto">
                <pre>{`// Criar usuário
const usuario = await fetch(
  'https://api.origem.lab/usuarios',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer SEU_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nome: 'João Silva',
      email: 'joao@empresa.com',
      tipo: 'pesquisador'
    })
  }
);

// Listar editais
const editais = await fetch(
  'https://api.origem.lab/editais?match=85',
  {
    headers: {
      'Authorization': 'Bearer SEU_TOKEN'
    }
  }
);`}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transparência */}
      <section className="py-20 bg-blue-50">
        <div className="container max-w-6xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16 text-gray-900">Transparência Total</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8">
              <BarChart3 className="w-12 h-12 text-blue-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Dashboard em Tempo Real</h3>
              <p className="text-gray-600">Acompanhe todos os ganhos, clientes ativos e projetos aprovados em tempo real</p>
            </Card>

            <Card className="p-8">
              <Lock className="w-12 h-12 text-green-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Dados Seguros</h3>
              <p className="text-gray-600">Criptografia end-to-end, conformidade LGPD e backups automáticos</p>
            </Card>

            <Card className="p-8">
              <Zap className="w-12 h-12 text-yellow-600 mb-4" />
              <h3 className="text-xl font-bold mb-4 text-gray-900">Relatórios Detalhados</h3>
              <p className="text-gray-600">Exportar relatórios em PDF, Excel com todas as métricas e comissões</p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="container max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-6">Pronto para Multiplicar seus Ganhos?</h2>
          <p className="text-xl text-blue-100 mb-8">Comece agora e ganhe 3% sobre cada projeto aprovado pelos seus clientes</p>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-6 text-lg font-semibold"
          >
            Solicitar Acesso
          </Button>
        </div>
      </section>
    </div>
  );
}
