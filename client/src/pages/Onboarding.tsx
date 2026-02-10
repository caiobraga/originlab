import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, Sparkles, User, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { fetchEditaisStatsForOnboarding } from "@/lib/editaisApi";
import { parseCurriculumFromPdf } from "@/lib/externalAPIs";
import { saveCurriculumToMetadata, setOnboardingCompleted, updateProfileFromOnboarding } from "@/lib/userProfile";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import { Spinner } from "@/components/ui/spinner";

type StepCompletarPerfil = "telefone" | "curriculo" | "area" | "concluido";
type StepConhecerEditais = "userType" | "area" | "result";

interface OnboardingData {
  telefone: string;
  userType: string;
  area: string;
}

function formatValorMilhoes(valor: number): string {
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `R$ ${(valor / 1_000).toFixed(1)}k`;
  return `R$ ${valor.toLocaleString("pt-BR")}`;
}

function formatTelefone(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n ? `(${n}` : "";
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
}

export default function Onboarding() {
  const [location, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isNewSignup = params.get("new") === "1";

  // Quem já concluiu o onboarding não fica nesta página: vai para o dashboard
  useEffect(() => {
    if (authLoading || profileLoading || !user) return;
    if (profile?.onboardingCompleted === true) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, profileLoading, profile?.onboardingCompleted, setLocation]);

  const isOnboarding1 = Boolean(user && isNewSignup);

  const [stepCompletar, setStepCompletar] = useState<StepCompletarPerfil>("telefone");
  const [stepConhecer, setStepConhecer] = useState<StepConhecerEditais>("userType");
  const [data, setData] = useState<OnboardingData>({ telefone: "", userType: "", area: "" });
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [editaisStats, setEditaisStats] = useState<{
    total: number;
    naArea: number;
    valorTotal: number;
    prazoMedioDias: number;
  } | null>(null);

  useEffect(() => {
    if (isNewSignup && user) {
      toast.success("Conta criada! Complete seu perfil para melhores recomendações.");
    }
  }, [isNewSignup, user]);

  const handleSalvarPerfil = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const current = (user.user_metadata?.profile as Record<string, unknown>) || {};
      const updates: Record<string, unknown> = { ...current, onboarding_completed: true };
      if (data.telefone.trim()) updates.phone = data.telefone.replace(/\D/g, "");
      await supabase.auth.updateUser({ data: { profile: updates } });
      await updateProfileFromOnboarding(user.id, {
        phone: data.telefone.trim() || undefined,
        area: data.area || undefined,
        markOnboardingCompleted: true,
      });
      toast.success("Perfil atualizado!");
      setLocation("/dashboard");
    } catch (e) {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadCurriculo = async (file: File) => {
    if (!file?.name.toLowerCase().endsWith(".pdf") || !user) return;
    setUploadingPdf(true);
    try {
      const curriculumData = await parseCurriculumFromPdf(file);
      if (curriculumData) {
        await saveCurriculumToMetadata(curriculumData);
        toast.success("Currículo extraído e salvo.");
      } else {
        toast.error("Não foi possível extrair dados do PDF.");
      }
    } catch {
      toast.error("Erro ao processar o PDF.");
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleUserTypeSelect = (type: string) => {
    setData((d) => ({ ...d, userType: type }));
    setStepConhecer("area");
  };

  const handleAreaSelectConhecer = async (area: string) => {
    setData((d) => ({ ...d, area }));
    setStepConhecer("result");
    setLoading(true);
    try {
      const stats = await fetchEditaisStatsForOnboarding(area || undefined);
      setEditaisStats(stats);
    } catch {
      setEditaisStats({ total: 0, naArea: 0, valorTotal: 0, prazoMedioDias: 30 });
    } finally {
      setLoading(false);
    }
  };

  const handleIrAoPainel = async () => {
    if (user) {
      try {
        const userType = data.userType ? (data.userType as "pesquisador" | "pessoa-empresa" | "ambos") : undefined;
        await updateProfileFromOnboarding(user.id, {
          userType,
          area: data.area || undefined,
          markOnboardingCompleted: true,
        });
      } catch {
        // segue mesmo se falhar (ex.: perfil ainda não existe) — marca só onboarding
        try {
          await setOnboardingCompleted(user.id);
        } catch {
          // ignora
        }
      }
      setLocation("/dashboard");
      toast.success("Bem-vindo ao Origem.Lab!");
    } else {
      setLocation("/cadastro");
      toast.success("Crie sua conta para explorar seus editais!");
    }
  };

  // Quem já concluiu: mostrar loading até o redirect para o dashboard (evita flash do onboarding)
  if (user && (authLoading || profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isOnboarding1) {
    const steps: StepCompletarPerfil[] = ["telefone", "curriculo", "area", "concluido"];
    const idx = steps.indexOf(stepCompletar);
    const progress = ((idx + 1) / steps.length) * 100;

    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 bg-gradient-to-br from-blue-50 via-white to-violet-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Complete seu perfil</h1>
              <p className="text-gray-600">Informações opcionais para recomendações melhores.</p>
              <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-600 to-violet-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <Badge className="mt-2 bg-blue-100 text-blue-700">Passo {idx + 1} de {steps.length}</Badge>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 space-y-6">
              {stepCompletar === "telefone" && (
                <>
                  <p className="text-gray-600">Telefone (opcional) para contato sobre editais.</p>
                  <Input
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={data.telefone}
                    onChange={(e) => setData((d) => ({ ...d, telefone: formatTelefone(e.target.value) }))}
                    className="h-12 text-lg"
                  />
                  <Button className="w-full" onClick={() => setStepCompletar("curriculo")}>
                    Continuar <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </>
              )}

              {stepCompletar === "curriculo" && (
                <>
                  <p className="text-gray-600">Envie um PDF do currículo (opcional) para análise de elegibilidade.</p>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    id="onb-pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadCurriculo(f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" className="w-full" onClick={() => document.getElementById("onb-pdf")?.click()} disabled={uploadingPdf}>
                    <FileText className="w-4 h-4 mr-2" />
                    {uploadingPdf ? "Enviando..." : "Enviar PDF do currículo"}
                  </Button>
                  <Button className="w-full" onClick={() => setStepCompletar("area")}>
                    Pular e continuar <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </>
              )}

              {stepCompletar === "area" && (
                <>
                  <p className="text-gray-600">Sua principal área de atuação (opcional).</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: "tech", label: "Tecnologia" },
                      { id: "health", label: "Saúde" },
                      { id: "agro", label: "Agronegócio" },
                      { id: "energy", label: "Energia" },
                      { id: "bio", label: "Biotecnologia" },
                      { id: "other", label: "Outra" },
                    ].map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setData((d) => ({ ...d, area: a.id }))}
                        className={`p-4 border-2 rounded-lg text-left font-medium transition-all ${data.area === a.id ? "border-violet-600 bg-violet-50" : "border-gray-200 hover:border-blue-300"}`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <Button className="w-full" onClick={() => setStepCompletar("concluido")}>
                    Continuar <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </>
              )}

              {stepCompletar === "concluido" && (
                <>
                  <div className="flex justify-center">
                    <CheckCircle2 className="w-16 h-16 text-green-600" />
                  </div>
                  <p className="text-center text-gray-700">Tudo certo! Você pode completar mais dados depois na página de perfil.</p>
                  <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleSalvarPerfil} disabled={loading}>
                    {loading ? "Salvando..." : "Ir ao painel"}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </>
              )}
            </div>

            <p className="text-center mt-6">
              <button
                type="button"
                onClick={async () => {
                  if (user) {
                    const current = (user.user_metadata?.profile as Record<string, unknown>) || {};
                    await supabase.auth.updateUser({ data: { profile: { ...current, onboarding_completed: true } } });
                    try {
                      await updateProfileFromOnboarding(user.id, {
                        phone: data.telefone.trim() || undefined,
                        area: data.area || undefined,
                        markOnboardingCompleted: true,
                      });
                    } catch {
                      try {
                        await setOnboardingCompleted(user.id);
                      } catch {
                        // ignora
                      }
                    }
                  }
                  setLocation("/dashboard");
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Pular e ir ao painel
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const stepsVisitante: StepConhecerEditais[] = ["userType", "area", "result"];
  const idxVisitante = stepsVisitante.indexOf(stepConhecer);
  const progressVisitante = ((idxVisitante + 1) / stepsVisitante.length) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 bg-gradient-to-br from-blue-50 via-white to-violet-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              {stepConhecer === "userType" && "O que você busca?"}
              {stepConhecer === "area" && "Qual sua área de atuação?"}
              {stepConhecer === "result" && "Editais para você"}
            </h1>
            <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-600 to-violet-600 rounded-full transition-all" style={{ width: `${progressVisitante}%` }} />
            </div>
            <Badge className="mt-2 bg-blue-100 text-blue-700">Passo {idxVisitante + 1} de {stepsVisitante.length}</Badge>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
            {stepConhecer === "userType" && (
              <div className="space-y-6">
                <p className="text-gray-600">Selecione o perfil que mais combina com você.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { id: "startup", label: "Startup", desc: "Empresa inovadora" },
                    { id: "researcher", label: "Pesquisador", desc: "Pesquisa acadêmica" },
                    { id: "pme", label: "PME", desc: "Pequena/Média Empresa" },
                    { id: "institution", label: "Instituição", desc: "Universidade/Centro" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleUserTypeSelect(t.id)}
                      className={`p-4 border-2 rounded-lg text-left transition-all ${data.userType === t.id ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-blue-300"}`}
                    >
                      <div className="font-semibold text-gray-900">{t.label}</div>
                      <div className="text-sm text-gray-600">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stepConhecer === "area" && (
              <div className="space-y-6">
                <p className="text-gray-600">Qual sua principal área de atuação?</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "tech", label: "Tecnologia" },
                    { id: "health", label: "Saúde" },
                    { id: "agro", label: "Agronegócio" },
                    { id: "energy", label: "Energia" },
                    { id: "bio", label: "Biotecnologia" },
                    { id: "other", label: "Outra" },
                  ].map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleAreaSelectConhecer(a.id)}
                      className={`p-4 border-2 rounded-lg font-medium transition-all ${data.area === a.id ? "border-violet-600 bg-violet-50" : "border-gray-200 hover:border-violet-300"}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {stepConhecer === "result" && (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <CheckCircle2 className="w-20 h-20 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Encontramos <span className="text-green-600">{editaisStats?.naArea ?? editaisStats?.total ?? "—"} editais</span> para você!
                </h2>
                <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-lg p-6 text-left">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{editaisStats?.naArea ?? editaisStats?.total ?? "—"}</div>
                    <div className="text-xs text-gray-600">Na sua área</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-violet-600">{editaisStats ? formatValorMilhoes(editaisStats.valorTotal) : "—"}</div>
                    <div className="text-xs text-gray-600">Valor total</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{editaisStats?.prazoMedioDias ?? "—"} dias</div>
                    <div className="text-xs text-gray-600">Prazo médio</div>
                  </div>
                </div>
                <div className="text-left bg-blue-50 rounded-lg p-6 space-y-2">
                  <h3 className="font-semibold text-gray-900">Você pode ver:</h3>
                  <ul className="space-y-1 text-gray-700">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Editais completos e elegibilidade</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Match score detalhado</li>
                    <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-600" /> Upgrade Pro: todos os editais + IA Redatora</li>
                  </ul>
                </div>
                <Button size="lg" className="w-full bg-green-600 hover:bg-green-700" onClick={handleIrAoPainel}>
                  {user ? "Explorar painel" : "Criar conta grátis"}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <p className="text-sm text-gray-600">
                  {user ? "Acesse seu painel para ver editais personalizados." : "Crie sua conta em menos de 2 minutos."}
                </p>
              </div>
            )}
          </div>

          {stepConhecer !== "result" && (
            <p className="text-center mt-6">
              <button type="button" onClick={() => setLocation(user ? "/dashboard" : "/cadastro")} className="text-sm text-gray-500 hover:text-gray-700 underline">
                {user ? "Pular para o painel" : "Já tenho conta"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
