import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createCheckoutSession } from "@/lib/stripeBilling";

type PlanAction =
  | { kind: "signup" }
  | { kind: "checkout"; planKey: "pro" | "empresas" }
  | { kind: "contact"; href: string };

const plans: Array<{
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  popular: boolean;
  action: PlanAction;
}> = [
  {
    name: "Free",
    price: "R$ 0",
    period: "/mês",
    description: "Para iniciantes explorarem o ecossistema",
    features: [
      "3 editais por mês",
      "Alertas básicos",
      "Painel simplificado",
      "Suporte por email",
    ],
    cta: "Começar Grátis",
    popular: false,
    action: { kind: "signup" },
  },
  {
    name: "Pro",
    price: "R$ 1,99",
    period: "/mês",
    description: "Ideal para pesquisadores e startups",
    features: [
      "Editais ilimitados",
      "IA redatora de propostas",
      "Painel completo com métricas",
      "Alertas personalizados",
      "Suporte prioritário",
      "Histórico de submissões",
    ],
    cta: "Assinar Pro",
    popular: true,
    action: { kind: "checkout", planKey: "pro" },
  },
  {
    name: "Empresas",
    price: "R$ 199",
    period: "/mês",
    description: "Para startups e corporações inovadoras",
    features: [
      "Inclui todos os recursos",
      "Multiusuário (até 10)",
      "Acompanhamento dedicado",
      "Relatórios executivos",
      "API de integração",
      "Consultoria estratégica",
    ],
    cta: "Assinar Empresas",
    popular: false,
    action: { kind: "checkout", planKey: "empresas" },
  },
  {
    name: "Institucional",
    price: "Sob consulta",
    period: "",
    description: "White label para universidades e FAPs",
    features: [
      "Inclui todos os recursos",
      "White label customizado",
      "Usuários ilimitados",
      "Infraestrutura dedicada",
      "SLA garantido",
      "Treinamento in-company",
    ],
    cta: "Solicitar Proposta",
    popular: false,
    action: { kind: "contact", href: "/contato" },
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [loadingPlan, setLoadingPlan] = useState<"pro" | "empresas" | null>(null);

  const handlePlanClick = async (action: PlanAction) => {
    if (action.kind === "signup") {
      setLocation("/cadastro");
      return;
    }
    if (action.kind === "contact") {
      setLocation(action.href);
      return;
    }
    if (!user) {
      toast.info("Faça login ou crie uma conta para assinar.");
      setLocation(`/login?redirect=/planos`);
      return;
    }
    setLoadingPlan(action.planKey);
    try {
      const url = await createCheckoutSession(action.planKey);
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao abrir checkout.";
      toast.error(msg);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section id="planos" className="py-24 bg-gray-50">
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
              className={`relative p-8 ${plan.popular ? "border-2 border-gray-950 shadow-lg" : "border border-gray-200"} bg-white hover:shadow-md transition-shadow`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="flex items-center gap-1 px-4 py-1 rounded-full bg-gray-950 text-white text-sm font-medium shadow-sm">
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

              {plan.action.kind === "contact" ? (
                <Link href={plan.action.href}>
                  <Button
                    className={`w-full ${plan.popular ? "bg-gray-950 hover:bg-gray-800 text-white" : "bg-white border-2 border-gray-300 text-gray-900 hover:border-gray-950 hover:bg-gray-50"}`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              ) : (
                <Button
                  type="button"
                  disabled={
                    plan.action.kind === "checkout" &&
                    loadingPlan === plan.action.planKey
                  }
                  variant={plan.popular ? "attention" : "outline"}
                  className={`w-full ${plan.popular ? "" : "border-2 border-gray-300 text-gray-900 hover:border-gray-950 hover:bg-gray-50"}`}
                  onClick={() => void handlePlanClick(plan.action)}
                >
                  {plan.action.kind === "checkout" && loadingPlan === plan.action.planKey ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Redirecionando…
                    </>
                  ) : (
                    plan.cta
                  )}
                </Button>
              )}
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600">
            <span className="font-semibold text-gray-900">Success Fee:</span> 3% sobre projetos aprovados em todos os planos
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/referencia"
            className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 font-medium transition-colors"
          >
            <span>Indique amigos e ganhe R$ 50 em créditos</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
