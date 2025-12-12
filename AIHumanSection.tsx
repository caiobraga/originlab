import { Brain, Users, CheckCircle2, Sparkles } from "lucide-react";

export default function AIHumanSection() {
  return (
    <section className="py-20 bg-gradient-to-br from-violet-50 via-blue-50 to-white">
      <div className="container">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
            <Sparkles className="w-4 h-4" />
            Nossa Metodologia
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            IA Avançada + Supervisão Humana
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Combinamos o melhor da tecnologia com expertise humana para garantir propostas de alta qualidade e máxima taxa de aprovação
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* IA Avançada */}
          <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-blue-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-violet-500 rounded-xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Inteligência Artificial</h3>
            </div>

            <p className="text-gray-600 mb-6">
              Nossa IA proprietária analisa milhares de editais e propostas aprovadas para gerar conteúdo altamente aderente aos critérios de avaliação.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Análise Semântica</div>
                  <div className="text-sm text-gray-600">NLP avançado para entender requisitos complexos</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Matching Inteligente</div>
                  <div className="text-sm text-gray-600">Algoritmo com 50+ variáveis para encontrar editais perfeitos</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Geração de Propostas</div>
                  <div className="text-sm text-gray-600">IA generativa treinada em propostas aprovadas</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Multilíngue</div>
                  <div className="text-sm text-gray-600">Português, Espanhol e Inglês para editais internacionais</div>
                </div>
              </div>
            </div>
          </div>

          {/* Supervisão Humana */}
          <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-violet-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Expertise Humana</h3>
            </div>

            <p className="text-gray-600 mb-6">
              Especialistas com anos de experiência em captação de recursos revisam e aprimoram cada proposta antes da submissão.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Revisão Especializada</div>
                  <div className="text-sm text-gray-600">Consultores com histórico comprovado de aprovações</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Adequação Estratégica</div>
                  <div className="text-sm text-gray-600">Ajustes finos para maximizar pontuação</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Compliance</div>
                  <div className="text-sm text-gray-600">Verificação de requisitos legais e documentais</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-gray-900">Suporte Personalizado</div>
                  <div className="text-sm text-gray-600">Acompanhamento durante todo o processo</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto mt-12">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">95%</div>
            <div className="text-sm text-gray-600 font-medium">Precisão do matching</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-violet-600 mb-2">30%</div>
            <div className="text-sm text-gray-600 font-medium">Taxa de aprovação</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">10.000+</div>
            <div className="text-sm text-gray-600 font-medium">Editais analisados</div>
          </div>
        </div>
      </div>
    </section>
  );
}
