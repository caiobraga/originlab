import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "R$ 0",
    period: "/mês",
    description: "Para iniciantes explorarem o ecossistema",
    features: [
      "3 editais por mês",
      "Alertas básicos",
      "Painel simplificado",
      "Suporte por email"
    ],
    cta: "Começar Grátis",
    popular: false
  },
  {
    name: "Pro",
    price: "R$ 49",
    period: "/mês",
    description: "Ideal para pesquisadores e startups",
    features: [
      "Editais ilimitados",
      "IA redatora de propostas",
      "Painel completo com métricas",
      "Alertas personalizados",
      "Suporte prioritário",
      "Histórico de submissões"
    ],
    cta: "Assinar Pro",
    popular: true
  },
  {
    name: "Empresas",
    price: "R$ 199",
    period: "/mês",
    description: "Para startups e corporações inovadoras",
    features: [
      "Tudo do Pro",
      "Multiusuário (até 10)",
      "Acompanhamento dedicado",
      "Relatórios executivos",
      "API de integração",
      "Consultoria estratégica"
    ],
    cta: "Falar com Vendas",
    popular: false
  },
  {
    name: "Institucional",
    price: "Sob consulta",
    period: "",
    description: "White label para universidades e FAPs",
    features: [
      "Tudo do Empresas",
      "White label customizado",
      "Usuários ilimitados",
      "Infraestrutura dedicada",
      "SLA garantido",
      "Treinamento in-company"
    ],
    cta: "Solicitar Proposta",
    popular: false
  }
];

export default function Pricing() {
  return (
    <section id="planos" className="py-24 bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Planos para cada etapa
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Escolha o plano ideal para transformar suas ideias em projetos financiados
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`relative p-8 ${plan.popular ? 'border-2 border-violet-500 shadow-2xl scale-105' : 'border border-gray-200'} bg-white hover:shadow-xl transition-all`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="flex items-center gap-1 px-4 py-1 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    Mais Popular
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-600">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                className={`w-full ${plan.popular ? 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white' : 'bg-white border-2 border-gray-300 text-gray-900 hover:border-blue-500 hover:bg-blue-50'}`}
              >
                {plan.cta}
              </Button>
            </Card>
          ))}
        </div>

        {/* Success Fee */}
        <div className="mt-12 text-center">
          <p className="text-gray-600">
            <span className="font-semibold text-gray-900">Success Fee:</span> 3% sobre projetos aprovados em todos os planos
          </p>
        </div>
      </div>
    </section>
  );
}
