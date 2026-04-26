import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import DemoModal from "@/components/DemoModal";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import ScrollReveal from "@/components/ScrollReveal";

export default function Hero() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const { user, loading } = useAuth();

  return (
    <section className="relative overflow-hidden bg-white pt-28 pb-24">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
      </div>

      <div className="container relative z-10">
        <div className="max-w-5xl mx-auto">
          <ScrollReveal className="mb-8">
            <div className="inline-flex items-center gap-2 px-3.5 md:px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm">
              <Sparkles className="w-4 h-4 text-[color:var(--attention)]" />
              <span className="text-xs md:text-sm font-semibold text-gray-900 tracking-tight">
                IA aplicada a fomento e subvenção
              </span>
            </div>
          </ScrollReveal>

          {/* Main heading */}
          <ScrollReveal delay={0.05} className="max-w-4xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 text-gray-950 leading-[1.05] tracking-tight">
              Transforme ideias em projetos financiados.
            </h1>
          </ScrollReveal>

          {/* Subheading */}
          <ScrollReveal delay={0.1} className="max-w-3xl">
            <p className="text-lg md:text-xl text-gray-700 mb-10 leading-relaxed">
              Encontre editais compatíveis, organize evidências e escreva propostas com apoio de IA — com rastreabilidade, consistência e foco em qualidade.
            </p>
          </ScrollReveal>

          {/* CTA Buttons */}
          <ScrollReveal delay={0.15}>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {!loading && user ? (
                <Link href="/dashboard">
                  <Button size="lg" variant="attention" className="px-8 py-6 text-lg">
                    Acessar Meu Painel
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link href="/cadastro">
                    <Button size="lg" variant="attention" className="px-8 py-6 text-lg">
                      Descubra seus editais ideais
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                  </Link>
                  <Link href="/onboarding">
                    <Button
                      size="lg"
                      variant="outline"
                      className="px-8 py-6 text-lg border-2 border-gray-300 hover:border-gray-950 hover:bg-gray-50"
                    >
                      Começar em 2 minutos
                    </Button>
                  </Link>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="px-8 py-6 text-lg text-gray-700 hover:text-gray-950 hover:bg-gray-100"
                    onClick={() => setIsDemoModalOpen(true)}
                  >
                    Ver demonstração
                  </Button>
                </>
              )}
            </div>
          </ScrollReveal>

          {/* Stats */}
          <ScrollReveal delay={0.2} className="mt-14">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl">
              <div>
                <div className="text-3xl md:text-4xl font-bold text-gray-950 mb-2">+2.000</div>
                <div className="text-sm text-gray-600">Editais mapeados</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-gray-950 mb-2">R$ 20bi</div>
                <div className="text-sm text-gray-600">Mercado de P&D</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-gray-950 mb-2">20.000+</div>
                <div className="text-sm text-gray-600">Startups no Brasil</div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>

      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </section>
  );
}
