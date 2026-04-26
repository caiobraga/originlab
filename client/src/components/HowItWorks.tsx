import { Card } from "@/components/ui/card";
import { User, Search, Target, Send } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";

const steps = [
  {
    icon: User,
    title: "Crie seu perfil",
    description: "Cadastre informações sobre sua empresa, área de atuação e objetivos de inovação.",
    color: "from-blue-500 to-blue-600"
  },
  {
    icon: Search,
    title: "IA faz a busca",
    description: "Nossa inteligência artificial vasculha automaticamente milhares de editais compatíveis.",
    color: "from-violet-500 to-violet-600"
  },
  {
    icon: Target,
    title: "Veja oportunidades",
    description: "Painel personalizado mostra editais ranqueados por aderência e probabilidade de aprovação.",
    color: "from-blue-500 to-violet-600"
  },
  {
    icon: Send,
    title: "Submeta com IA",
    description: "Assistente inteligente gera propostas, envia e acompanha todo o processo até a prestação de contas.",
    color: "from-violet-500 to-blue-600"
  }
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-24 bg-gray-50">
      <div className="container">
        <ScrollReveal className="mb-16">
          <div className="max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">Como funciona</h2>
            <p className="text-lg md:text-xl text-gray-600">
              Do mapeamento à prestação de contas, tudo em um só lugar.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <ScrollReveal key={index} delay={0.05 * index}>
              <Card className="relative p-8 border border-gray-200 hover:shadow-md transition-shadow group">
              {/* Step number */}
              <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-[linear-gradient(135deg,var(--attention),#0b0f1a)] flex items-center justify-center text-white font-bold text-lg shadow-sm">
                {index + 1}
              </div>

              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-[linear-gradient(135deg,var(--attention),#0b0f1a)] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <step.icon className="w-8 h-8 text-white" />
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                {step.title}
              </h3>
              <p className="text-gray-600 leading-relaxed">
                {step.description}
              </p>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
