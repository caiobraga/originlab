import { Brain, Users, CheckCircle2, Sparkles } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";

export default function AIHumanSection() {
  return (
    <section className="py-20 text-white bg-[radial-gradient(1200px_circle_at_50%_-20%,color-mix(in_oklab,var(--attention)_35%,transparent),transparent_60%),linear-gradient(180deg,#030712,#0b1020)]">
      <div className="container">
        <ScrollReveal className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/5 text-white px-4 py-2 rounded-full text-sm font-semibold mb-4 border border-white/10">
            <Sparkles className="w-4 h-4 text-[color:var(--attention)]" />
            Nossa Metodologia
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            IA Avançada + Supervisão Humana
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Combinamos o melhor da tecnologia com expertise humana para garantir propostas de alta qualidade e máxima taxa de aprovação
          </p>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* IA Avançada */}
          <ScrollReveal>
            <div className="bg-white/5 rounded-2xl p-8 shadow-sm border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[linear-gradient(135deg,var(--attention),#0b0f1a)]">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white">Inteligência Artificial</h3>
            </div>

            <p className="text-gray-300 mb-6">
              Nossa IA proprietária analisa milhares de editais e propostas aprovadas para gerar conteúdo altamente aderente aos critérios de avaliação.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Análise Semântica</div>
                  <div className="text-sm text-gray-300">PNL avançado para entender requisitos complexos</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Matching Inteligente</div>
                  <div className="text-sm text-gray-300">Algoritmo com 50+ variáveis para encontrar editais perfeitos</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Geração de Propostas</div>
                  <div className="text-sm text-gray-300">IA generativa treinada em propostas aprovadas</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Multilíngue</div>
                  <div className="text-sm text-gray-300">Português, Espanhol e Inglês para editais internacionais</div>
                </div>
              </div>
            </div>
            </div>
          </ScrollReveal>

          {/* Supervisão Humana */}
          <ScrollReveal delay={0.08}>
            <div className="bg-white/5 rounded-2xl p-8 shadow-sm border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[linear-gradient(135deg,var(--attention),#0b0f1a)]">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white">Expertise Humana</h3>
            </div>

            <p className="text-gray-300 mb-6">
              Especialistas com anos de experiência em captação de recursos revisam e aprimoram cada proposta antes da submissão.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Revisão Especializada</div>
                  <div className="text-sm text-gray-300">Consultores com histórico comprovado de aprovações</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Adequação Estratégica</div>
                  <div className="text-sm text-gray-300">Ajustes finos para maximizar pontuação</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Conformidade</div>
                  <div className="text-sm text-gray-300">Verificação de requisitos legais e documentais</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[color:var(--attention)] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Suporte Personalizado</div>
                  <div className="text-sm text-gray-300">Acompanhamento durante todo o processo</div>
                </div>
              </div>
            </div>
            </div>
          </ScrollReveal>
        </div>

        {/* Stats */}
        <ScrollReveal delay={0.12} className="grid grid-cols-3 gap-6 max-w-4xl mx-auto mt-12">
          <div className="text-center">
            <div className="text-4xl font-bold text-white mb-2">95%</div>
            <div className="text-sm text-gray-300 font-medium">Precisão do matching</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white mb-2">30%</div>
            <div className="text-sm text-gray-300 font-medium">Taxa de aprovação</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-white mb-2">10.000+</div>
            <div className="text-sm text-gray-300 font-medium">Editais analisados</div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
