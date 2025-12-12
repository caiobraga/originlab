import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import DemoModal from "@/components/DemoModal";

export default function Hero() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [, setLocation] = useLocation();

  const handleStartFree = () => {
    setLocation("/dashboard");
    toast.success("Bem-vindo ao Origem.Lab!");
  };

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-violet-50 pt-20 pb-32">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-violet-300/20 rounded-full blur-3xl" />
        <div className="absolute top-60 -left-40 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left Column - Copy */}
          <div className="space-y-8">
            {/* Urgency Badge */}
            <Badge className="w-fit bg-red-100 text-red-700 border-red-200 px-4 py-2 font-semibold">
              <Zap className="w-3 h-3 mr-2" />
              ⏰ 2.347 editais abertos AGORA
            </Badge>

            {/* Main Headline - Numbers First */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
                Descubra <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">R$ 20 bilhões</span> em oportunidades de fomento
              </h1>
              <p className="text-xl text-gray-600 leading-relaxed">
                Encontre seus editais ideais em <strong>2 minutos</strong>. Sem cartão de crédito.
              </p>
            </div>

            {/* Social Proof - Specific Numbers */}
            <div className="flex items-center gap-6 pt-4 border-t border-gray-200">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-violet-400 border-2 border-white flex items-center justify-center text-white text-sm font-bold"
                  >
                    {i}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">
                  ⭐⭐⭐⭐⭐ 4.9/5
                </div>
                <div className="text-xs text-gray-600">
                  1.247 avaliações de usuários
                </div>
              </div>
            </div>

            {/* CTA Buttons - Primary Action */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button
                size="lg"
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-lg px-8 py-6 rounded-lg shadow-lg font-semibold"
                onClick={handleStartFree}
              >
                Começar Grátis
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 rounded-lg border-2 font-semibold"
                onClick={() => setIsDemoModalOpen(true)}
              >
                Ver Demonstração
              </Button>
            </div>

            {/* Trust Indicators - Specific Numbers */}
            <div className="grid grid-cols-3 gap-4 pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">2.000+</div>
                <div className="text-xs text-gray-600 mt-1">Empresas ativas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-violet-600">R$ 20bi</div>
                <div className="text-xs text-gray-600 mt-1">Já captados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">67%</div>
                <div className="text-xs text-gray-600 mt-1">Taxa aprovação</div>
              </div>
            </div>
          </div>

          {/* Right Column - Visual Demo Card */}
          <div className="relative hidden md:block">
            {/* Card Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl blur-2xl opacity-20"></div>

            {/* Main Card */}
            <div className="relative bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">
                    Seus Editais Ideais
                  </h3>
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    ✓ Validado
                  </Badge>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-3xl font-bold text-blue-600">47</div>
                    <div className="text-xs text-gray-600 mt-1">Editais encontrados</div>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-4 border border-violet-200">
                    <div className="text-3xl font-bold text-violet-600">92%</div>
                    <div className="text-xs text-gray-600 mt-1">Match médio</div>
                  </div>
                </div>

                {/* Edital List */}
                <div className="space-y-3">
                  {[
                    { title: "Centelha III - ES", match: 92, value: "R$ 139.6k", status: "✓" },
                    { title: "FAPESP PIPE", match: 88, value: "R$ 1M", status: "✓" },
                    { title: "FINEP Startup", match: 85, value: "R$ 500k", status: "✓" }
                  ].map((edital, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors border border-gray-200">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {edital.title}
                        </div>
                        <div className="text-xs text-gray-600">
                          {edital.value}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-green-600">
                          {edital.match}%
                        </div>
                        <div className="text-xs text-gray-600">match</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <Button
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold"
                  onClick={handleStartFree}
                >
                  Ver Todos os 47 Editais
                </Button>

                {/* Footer */}
                <div className="text-center text-xs text-gray-500 pt-2">
                  Sem cartão de crédito. Leva 2 minutos.
                </div>
              </div>
            </div>

            {/* Floating Badge */}
            <div className="absolute -bottom-4 -right-4 bg-white rounded-full shadow-lg p-4 border-2 border-green-500">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <div className="text-sm font-bold text-gray-900">+47%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </section>
  );
}
