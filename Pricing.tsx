import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Sparkles, TrendingUp } from "lucide-react";
import StripeCheckout from "./StripeCheckout";

export default function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [activeTab, setActiveTab] = useState<"pesquisadores" | "startups" | "corporativo">("pesquisadores");

  const getPrice = (price: number) => {
    return billingPeriod === "monthly" ? price : Math.round(price * 12 * 0.83);
  };

  const pesquisadores = [
    {
      name: "Gratuito",
      monthlyPrice: 0,
      description: "Para começar",
      features: ["5 editais/mês", "Validação básica", "Sem IA Redatora", "Sem suporte"],
      cta: "Começar Grátis",
      popular: false,
      color: "gray"
    },
    {
      name: "Pro",
      monthlyPrice: 79,
      description: "Ideal para pesquisadores",
      features: ["Editais ilimitados", "Validação completa", "IA Redatora (3/mês)", "Suporte por email"],
      cta: "Começar 7 dias grátis",
      popular: true,
      color: "blue"
    },
    {
      name: "Premium",
      monthlyPrice: 199,
      description: "Para máxima produtividade",
      features: ["Tudo do Pro", "IA Redatora ilimitada", "Revisão por especialista", "Suporte prioritário"],
      cta: "Começar 7 dias grátis",
      popular: false,
      color: "blue"
    }
  ];

  const startups = [
    {
      name: "Gratuito",
      monthlyPrice: 0,
      description: "Para começar",
      features: ["5 editais/mês", "Validação básica", "Sem IA Redatora", "+ 1% Success Fee"],
      cta: "Começar Grátis",
      popular: false,
      color: "purple"
    },
    {
      name: "Pro",
      monthlyPrice: 199,
      description: "Mais Popular",
      features: ["Editais ilimitados", "Dashboard completo", "IA Redatora (5/mês)", "Suporte por email", "+ 1% Success Fee"],
      cta: "Começar 7 dias grátis",
      popular: true,
      color: "purple"
    },
    {
      name: "Premium",
      monthlyPrice: 499,
      description: "Para crescimento acelerado",
      features: ["Tudo do Pro", "IA Redatora ilimitada", "Equipes até 5 pessoas", "Suporte prioritário", "+ 1% Success Fee"],
      cta: "Começar 7 dias grátis",
      popular: false,
      color: "purple"
    }
  ];

  const corporativo = [
    {
      name: "Departamento",
      monthlyPrice: 1990,
      description: "Para departamentos",
      features: ["Até 50 pesquisadores", "Dashboard de controle", "Gestão de propostas", "Relatórios por departamento"],
      cta: "Começar 7 dias grátis",
      popular: false,
      color: "indigo"
    },
    {
      name: "Instituição",
      monthlyPrice: 4990,
      description: "Mais Popular",
      features: ["Até 500 pesquisadores", "Tudo do Departamento", "Dashboard executivo", "Analytics avançado", "Integração acadêmica"],
      cta: "Começar 7 dias grátis",
      popular: true,
      color: "indigo"
    },
    {
      name: "Corporativo",
      monthlyPrice: 9990,
      description: "Para grandes organizações",
      features: ["Até 2.000 colaboradores", "Tudo da Instituição", "White label", "API avançada", "Suporte 24/7"],
      cta: "Solicitar Demo",
      popular: false,
      color: "indigo"
    }
  ];

  const getCurrentPlans = () => {
    switch (activeTab) {
      case "startups":
        return startups;
      case "corporativo":
        return corporativo;
      default:
        return pesquisadores;
    }
  };

  const renderPriceCard = (plan: any, index: number) => (
    <Card
      key={index}
      className={`relative p-8 transition-all ${
        plan.popular
          ? `border-2 border-${plan.color}-500 shadow-2xl md:scale-105`
          : "border border-gray-200"
      } bg-white hover:shadow-xl`}
    >
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <div className={`flex items-center gap-1 px-4 py-1 rounded-full bg-${plan.color}-600 text-white text-sm font-medium`}>
            <Sparkles className="w-4 h-4" />
            Mais Popular
          </div>
        </div>
      )}

      <div className="mb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
        <p className="text-sm text-gray-600 mb-6">{plan.description}</p>

        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-5xl font-bold text-gray-900">
            R$ {getPrice(plan.monthlyPrice).toLocaleString("pt-BR")}
          </span>
          <span className="text-gray-600">
            /{billingPeriod === "monthly" ? "mês" : "ano"}
          </span>
        </div>

        {billingPeriod === "annual" && (
          <div className="flex items-center gap-1 text-green-600 text-sm font-semibold mt-2">
            <TrendingUp className="w-4 h-4" />
            Economize {Math.round((1 - 0.83) * 100)}%
          </div>
        )}
      </div>

      <ul className="space-y-3 mb-8">
        {plan.features.map((feature: string, featureIndex: number) => (
          <li key={featureIndex} className="flex items-start gap-3">
            <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>

      {plan.name === "Gratuito" ? (
        <Button className="w-full font-semibold py-6 text-base bg-green-600 hover:bg-green-700 text-white">
          {plan.cta}
        </Button>
      ) : (
        <StripeCheckout
          planName={plan.name}
          planPrice={getPrice(plan.monthlyPrice)}
          billingPeriod={billingPeriod}
        />
      )}
    </Card>
  );

  return (
    <section id="planos" className="py-24 bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Planos para cada perfil
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Escolha o plano ideal para seu negócio
          </p>

          {/* Billing Toggle */}
          <div className="flex justify-center items-center gap-4 mb-12">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                billingPeriod === "monthly"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border-2 border-gray-200"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingPeriod("annual")}
              className={`px-6 py-2 rounded-lg font-semibold transition-all relative ${
                billingPeriod === "annual"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border-2 border-gray-200"
              }`}
            >
              Anual
              <span className="absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                -17%
              </span>
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {["pesquisadores", "startups", "corporativo"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 border-2 border-gray-200 hover:border-blue-600"
                }`}
              >
                {tab === "pesquisadores" && "Pesquisadores"}
                {tab === "startups" && "Startups/PMEs"}
                {tab === "corporativo" && "Corporativo"}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
          {getCurrentPlans().map((plan, index) => renderPriceCard(plan, index))}
        </div>

        {/* Success Fee Info - Apenas para Startups/PMEs */}
        {activeTab === "startups" && (
          <div className="mt-16 text-center bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-8 max-w-3xl mx-auto border-2 border-green-200">
            <div className="mb-4">
              <p className="text-2xl font-bold text-green-900 mb-2">💰 Success Fee: 1% sobre Valor Captado</p>
              <p className="text-gray-700 text-lg">
                Ganhe 1% do <span className="font-semibold">valor total que sua startup consegue captar</span> em editais aprovados. Cobrado automaticamente no cartão.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-sm text-gray-600 mb-2">Startup capta</p>
                <p className="font-semibold text-gray-900">R$ 100k</p>
                <p className="text-green-600 font-bold text-lg">Você paga: R$ 1k</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-sm text-gray-600 mb-2">Startup capta</p>
                <p className="font-semibold text-gray-900">R$ 500k</p>
                <p className="text-green-600 font-bold text-lg">Você paga: R$ 5k</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-sm text-gray-600 mb-2">+ Plano mensal</p>
                <p className="font-semibold text-gray-900">Pro: R$ 199/mês</p>
                <p className="text-green-600 font-bold text-lg">Total: R$ 2.388/ano</p>
              </div>
            </div>
          </div>
        )}

        {/* FAQ */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Dúvidas frequentes</h3>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-2">Como funciona a Success Fee?</h4>
              <p className="text-gray-600">A Success Fee é cobrada apenas quando você capta fomento em um edital aprovado. O valor é 1% para Startups/PMEs e é debitado automaticamente no cartão salvo na plataforma.</p>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-2">Como você diferencia Pesquisador de Startup/PME?</h4>
              <p className="text-gray-600">No onboarding, você informa se é PF (Pesquisador) ou PJ (Startup/PME). Validamos seu CNPJ e receita bruta via Receita Federal. Startups/PMEs com receita &lt; R$ 4.8M/ano têm acesso ao plano especial com Success Fee.</p>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-2">Posso mudar de plano a qualquer momento?</h4>
              <p className="text-gray-600">Sim! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. As mudanças entram em efeito imediatamente.</p>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-2">Existe período de teste?</h4>
              <p className="text-gray-600">Sim! Todos os planos pagos têm 7 dias grátis. Sem necessidade de cartão de crédito.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
