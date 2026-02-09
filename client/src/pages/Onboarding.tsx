import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchEditaisStatsForOnboarding } from "@/lib/editaisApi";
import Header from "@/components/Header";

type OnboardingStep = "email" | "userType" | "area" | "validation" | "result";

interface OnboardingData {
  email: string;
  userType: string;
  area: string;
  document: string;
}

function formatValorMilhoes(valor: number): string {
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `R$ ${(valor / 1_000).toFixed(1)}k`;
  return `R$ ${valor.toLocaleString("pt-BR")}`;
}

export default function Onboarding() {
  const [step, setStep] = useState<OnboardingStep>("email");
  const [data, setData] = useState<OnboardingData>({
    email: "",
    userType: "",
    area: "",
    document: ""
  });
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const [editaisStats, setEditaisStats] = useState<{
    total: number;
    naArea: number;
    valorTotal: number;
    prazoMedioDias: number;
  } | null>(null);

  const handleEmailSubmit = () => {
    if (!data.email.includes("@")) {
      toast.error("Email inválido");
      return;
    }
    setStep("userType");
  };

  const handleUserTypeSelect = (type: string) => {
    setData({ ...data, userType: type });
    setStep("area");
  };

  const handleAreaSelect = (area: string) => {
    setData({ ...data, area });
    setStep("validation");
  };

  const handleValidation = async () => {
    if (!data.document) {
      toast.error("Informe seu CPF ou CNPJ");
      return;
    }
    
    setIsLoading(true);
    setStep("result");
    try {
      const stats = await fetchEditaisStatsForOnboarding(data.area || undefined);
      setEditaisStats(stats);
    } catch (error) {
      setEditaisStats({ total: 0, naArea: 0, valorTotal: 0, prazoMedioDias: 30 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    if (user) {
      setLocation("/dashboard");
      toast.success("Bem-vindo ao Origem.Lab!");
    } else {
      const params = data.email ? `?email=${encodeURIComponent(data.email)}` : "";
      setLocation(`/cadastro${params}`);
      toast.success("Crie sua conta para explorar seus editais!");
    }
  };

  // Progress indicator
  const steps: OnboardingStep[] = ["email", "userType", "area", "validation", "result"];
  const currentStepIndex = steps.indexOf(step);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 bg-gradient-to-br from-blue-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {step === "email" && "Qual é seu email?"}
              {step === "userType" && "O que você busca?"}
              {step === "area" && "Qual sua área de atuação?"}
              {step === "validation" && "Validação de elegibilidade"}
              {step === "result" && "Seus editais ideais"}
            </h1>
            <Badge className="bg-blue-100 text-blue-700">
              Passo {currentStepIndex + 1} de {steps.length}
            </Badge>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-600 to-violet-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
          {/* Step 1: Email */}
          {step === "email" && (
            <div className="space-y-6">
              <p className="text-gray-600 text-lg">
                Comece sua jornada para descobrir oportunidades de fomento
              </p>
              <div className="space-y-4">
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={data.email}
                  onChange={(e) => setData({ ...data, email: e.target.value })}
                  className="h-12 text-lg"
                  onKeyPress={(e) => e.key === "Enter" && handleEmailSubmit()}
                />
                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
                  onClick={handleEmailSubmit}
                >
                  Continuar
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: User Type */}
          {step === "userType" && (
            <div className="space-y-6">
              <p className="text-gray-600 text-lg">
                Qual tipo de usuário você é?
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: "startup", label: "🚀 Startup", desc: "Empresa inovadora" },
                  { id: "researcher", label: "🔬 Pesquisador", desc: "Pesquisa acadêmica" },
                  { id: "pme", label: "🏢 PME", desc: "Pequena/Média Empresa" },
                  { id: "institution", label: "🏛️ Instituição", desc: "Universidade/Centro" }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleUserTypeSelect(type.id)}
                    className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-all text-left"
                  >
                    <div className="text-lg font-semibold text-gray-900">{type.label}</div>
                    <div className="text-sm text-gray-600">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Area */}
          {step === "area" && (
            <div className="space-y-6">
              <p className="text-gray-600 text-lg">
                Qual sua principal área de atuação?
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: "tech", label: "💻 Tecnologia" },
                  { id: "health", label: "🏥 Saúde" },
                  { id: "agro", label: "🌾 Agronegócio" },
                  { id: "energy", label: "⚡ Energia" },
                  { id: "bio", label: "🧬 Biotecnologia" },
                  { id: "other", label: "📋 Outra" }
                ].map((area) => (
                  <button
                    key={area.id}
                    onClick={() => handleAreaSelect(area.id)}
                    className="p-4 border-2 border-gray-200 rounded-lg hover:border-violet-600 hover:bg-violet-50 transition-all text-left font-semibold text-gray-900"
                  >
                    {area.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Validation */}
          {step === "validation" && (
            <div className="space-y-6">
              <p className="text-gray-600 text-lg">
                Informe seu CPF ou CNPJ para análise de elegibilidade
              </p>
              <div className="space-y-4">
                <Input
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  value={data.document}
                  onChange={(e) => setData({ ...data, document: e.target.value })}
                  className="h-12 text-lg"
                />
                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white"
                  onClick={handleValidation}
                  disabled={isLoading}
                >
                  {isLoading ? "Validando..." : "Validar e Continuar"}
                  {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500 text-center">
                Seus dados são criptografados e nunca serão compartilhados
              </p>
            </div>
          )}

          {/* Step 5: Result */}
          {step === "result" && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-400 rounded-full blur-lg opacity-30"></div>
                  <CheckCircle2 className="w-20 h-20 text-green-600 relative" />
                </div>
              </div>

              <div>
                <h2 className="text-4xl font-bold text-gray-900 mb-2">
                  Encontramos{" "}
                  <span className="text-green-600">
                    {editaisStats ? editaisStats.naArea || editaisStats.total : "—"} editais
                  </span>{" "}
                  para você!
                </h2>
                <p className="text-lg text-gray-600">
                  {editaisStats && editaisStats.total > 0 ? (
                    <>Baseado no seu perfil e área de atuação</>
                  ) : (
                    <>Crie sua conta para ver seus editais personalizados</>
                  )}
                </p>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-lg p-6">
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {editaisStats?.naArea ?? editaisStats?.total ?? "—"}
                  </div>
                  <div className="text-xs text-gray-600">
                    {data.area && data.area !== "other" ? "Na sua área" : "Editais"}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-violet-600">
                    {editaisStats ? formatValorMilhoes(editaisStats.valorTotal) : "—"}
                  </div>
                  <div className="text-xs text-gray-600">Valor total</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {editaisStats?.prazoMedioDias ?? "—"} dias
                  </div>
                  <div className="text-xs text-gray-600">Prazo médio</div>
                </div>
              </div>

              {/* What's Included */}
              <div className="text-left bg-blue-50 rounded-lg p-6 space-y-3">
                <h3 className="font-semibold text-gray-900">Você pode ver:</h3>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    5 editais completos (versão gratuita)
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Validação de elegibilidade
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Match score detalhado
                  </li>
                  <li className="flex items-center gap-2 text-gray-700">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                    <strong>Upgrade para Pro</strong> para ver todos os editais + IA Redatora
                  </li>
                </ul>
              </div>

              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-lg py-6"
                onClick={handleGoToDashboard}
              >
                {user ? "Explorar Meu Painel" : "Criar conta grátis"}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              <p className="text-sm text-gray-600">
                {user ? (
                  <>Você está no plano <strong>Gratuito</strong>. Upgrade para <strong>Pro (R$ 49/mês)</strong> para desbloquear todos os editais e IA Redatora.</>
                ) : (
                  <>Crie sua conta em menos de 2 minutos para acessar o painel completo.</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Skip Link */}
        {step !== "result" && (
          <div className="text-center mt-6">
            <button
              onClick={() => setLocation(user ? "/dashboard" : "/cadastro")}
              className="text-gray-600 hover:text-gray-900 text-sm underline"
            >
              {user ? "Pular para o dashboard" : "Já tenho conta"}
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
