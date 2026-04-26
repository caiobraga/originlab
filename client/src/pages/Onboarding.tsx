import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, Sparkles, User, FileText, ExternalLink, RefreshCw } from "lucide-react";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { fetchEditaisStatsForOnboarding } from "@/lib/editaisApi";
import { parseCurriculumFromPdf } from "@/lib/externalAPIs";
import { saveCurriculumToMetadata, setOnboardingCompleted, updateProfileFromOnboarding } from "@/lib/userProfile";
import { supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";

type StepCompletarPerfil = "telefone" | "curriculo" | "area" | "concluido";
type StepConhecerEditais = "userType" | "area" | "result";

interface OnboardingData {
  telefone: string;
  userType: string;
  area: string;
  cnpj: string;
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

  /** Tipo de onboarding conforme perfil do usuário (pesquisador, pessoa-empresa ou ambos). */
  const onboardingVariant = (profile?.userType ?? "pesquisador") as "pesquisador" | "pessoa-empresa" | "ambos";

  const [stepCompletar, setStepCompletar] = useState<StepCompletarPerfil>("telefone");
  const [stepConhecer, setStepConhecer] = useState<StepConhecerEditais>("userType");
  const [data, setData] = useState<OnboardingData>({ telefone: "", userType: "", area: "", cnpj: "" });
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfExtractProgress, setPdfExtractProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [editaisStats, setEditaisStats] = useState<{
    total: number;
    naArea: number;
    valorTotal: number;
    prazoMedioDias: number;
  } | null>(null);
  const [curriculumExtracted, setCurriculumExtracted] = useState(false);

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
        cnpj: data.cnpj.trim() ? data.cnpj : undefined,
        hasCnpj: data.cnpj.replace(/\D/g, "").length === 14,
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
    setPdfExtractProgress(0);
    setUploadedFileName(null);
    const interval = setInterval(() => {
      setPdfExtractProgress((p) => {
        if (p >= 90) return p;
        return p + Math.random() * 8 + 4;
      });
    }, 300);
    try {
      const curriculumData = await parseCurriculumFromPdf(file);
      clearInterval(interval);
      setPdfExtractProgress(100);
      if (curriculumData) {
        await saveCurriculumToMetadata(curriculumData);
        setCurriculumExtracted(true);
        setUploadedFileName(file.name);
        toast.success("Currículo extraído e salvo. Você pode continuar.");
      } else {
        toast.error("Não foi possível extrair dados do PDF. Envie o PDF do currículo baixado pelo Lattes.");
      }
    } catch (err) {
      clearInterval(interval);
      const msg = err instanceof Error ? err.message : "Erro ao processar o PDF. Tente novamente.";
      toast.error(msg);
    } finally {
      setUploadingPdf(false);
      setPdfExtractProgress(0);
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

              {stepCompletar === "curriculo" && onboardingVariant === "pessoa-empresa" && (
                <>
                  <p className="text-gray-600 mb-4">
                    Informe o CNPJ da empresa (opcional). Você pode preencher depois na página de perfil.
                  </p>
                  <Input
                    placeholder="00.000.000/0001-00"
                    value={data.cnpj}
                    onChange={(e) => {
                      const n = e.target.value.replace(/\D/g, "").slice(0, 14);
                      let formatted = n;
                      if (n.length > 12) formatted = n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, "$1.$2.$3/$4-$5");
                      else if (n.length > 8) formatted = n.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
                      else if (n.length > 5) formatted = n.replace(/(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
                      else if (n.length > 2) formatted = n.replace(/(\d{2})(\d+)/, "$1.$2");
                      setData((d) => ({ ...d, cnpj: formatted }));
                    }}
                    maxLength={18}
                    className="font-mono"
                  />
                  <Button className="w-full mt-3" onClick={() => setStepCompletar("area")}>
                    Continuar <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </>
              )}

              {stepCompletar === "curriculo" && onboardingVariant === "ambos" && (
                <>
                  <p className="text-gray-600 mb-4">
                    Você é pesquisador e empresa. Informe o CNPJ (opcional) e envie o currículo Lattes.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ da empresa (opcional)</label>
                      <Input
                        placeholder="00.000.000/0001-00"
                        value={data.cnpj}
                        onChange={(e) => {
                          const n = e.target.value.replace(/\D/g, "").slice(0, 14);
                          let formatted = n;
                          if (n.length > 12) formatted = n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, "$1.$2.$3/$4-$5");
                          else if (n.length > 8) formatted = n.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
                          else if (n.length > 5) formatted = n.replace(/(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
                          else if (n.length > 2) formatted = n.replace(/(\d{2})(\d+)/, "$1.$2");
                          setData((d) => ({ ...d, cnpj: formatted }));
                        }}
                        maxLength={18}
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Currículo Lattes (obrigatório)</label>
                      <a
                        href="https://www.lattes.cnpq.br/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 hover:underline mb-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Abrir Plataforma Lattes (CNPq) para baixar ou imprimir seu currículo em PDF
                      </a>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        id="onb-pdf-ambos"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadCurriculo(f);
                          e.target.value = "";
                        }}
                      />
                      {!(curriculumExtracted || (profile?.curriculumData && typeof profile.curriculumData === "object")) && (
                        <Button variant="outline" className="w-full" onClick={() => document.getElementById("onb-pdf-ambos")?.click()} disabled={uploadingPdf}>
                          <FileText className="w-4 h-4 mr-2" />
                          {uploadingPdf ? "Enviando e extraindo dados..." : "Enviar PDF do currículo"}
                        </Button>
                      )}
                      {uploadingPdf && (
                        <div className="w-full mt-2 space-y-2">
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>Extraindo dados do PDF...</span>
                            <span>{Math.round(Math.min(pdfExtractProgress, 100))}%</span>
                          </div>
                          <Progress value={Math.min(pdfExtractProgress, 100)} className="h-2" />
                        </div>
                      )}
                      {(curriculumExtracted || (profile?.curriculumData && typeof profile.curriculumData === "object")) && !uploadingPdf && (
                        <div className="w-full p-4 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                              <span className="text-sm font-medium text-green-800 truncate">
                                {uploadedFileName ? uploadedFileName : "Currículo cadastrado"}
                              </span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                              onClick={() => document.getElementById("onb-pdf-ambos")?.click()}
                            >
                              <RefreshCw className="w-4 h-4 mr-1.5" />
                              Trocar arquivo
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    className="w-full mt-3"
                    onClick={() => setStepCompletar("area")}
                    disabled={!curriculumExtracted && !(profile?.curriculumData && typeof profile.curriculumData === "object")}
                  >
                    Continuar <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                  {!curriculumExtracted && !(profile?.curriculumData && typeof profile.curriculumData === "object") && (
                    <p className="text-sm text-amber-700 mt-2">
                      Envie o PDF do currículo para continuar.
                    </p>
                  )}
                </>
              )}

              {stepCompletar === "curriculo" && onboardingVariant === "pesquisador" && (
                <>
                  <p className="text-gray-600 mb-4">
                    Envie um PDF do currículo baixado pelo Lattes para análise de elegibilidade (formação, vínculo institucional e área). Os dados são necessários para o match com editais.
                  </p>
                  <a
                    href="https://www.lattes.cnpq.br/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 hover:underline mb-4"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Abrir Plataforma Lattes (CNPq) para baixar ou imprimir seu currículo em PDF
                  </a>
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
                  {!(curriculumExtracted || (profile?.curriculumData && typeof profile.curriculumData === "object")) && (
                    <Button variant="outline" className="w-full" onClick={() => document.getElementById("onb-pdf")?.click()} disabled={uploadingPdf}>
                      <FileText className="w-4 h-4 mr-2" />
                      {uploadingPdf ? "Enviando e extraindo dados..." : "Enviar PDF do currículo"}
                    </Button>
                  )}
                  {uploadingPdf && (
                    <div className="w-full mt-4 space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Extraindo dados do PDF...</span>
                        <span>{Math.round(Math.min(pdfExtractProgress, 100))}%</span>
                      </div>
                      <Progress value={Math.min(pdfExtractProgress, 100)} className="h-2" />
                    </div>
                  )}
                  {(curriculumExtracted || (profile?.curriculumData && typeof profile.curriculumData === "object")) && !uploadingPdf && (
                    <div className="w-full mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                          <span className="text-sm font-medium text-green-800 truncate">
                            {uploadedFileName ? uploadedFileName : "Currículo cadastrado"}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0 border-green-300 text-green-700 hover:bg-green-100"
                          onClick={() => document.getElementById("onb-pdf")?.click()}
                        >
                          <RefreshCw className="w-4 h-4 mr-1.5" />
                          Trocar arquivo
                        </Button>
                      </div>
                    </div>
                  )}
                  <Button
                    className="w-full mt-3"
                    onClick={() => setStepCompletar("area")}
                    disabled={!curriculumExtracted && !(profile?.curriculumData && typeof profile.curriculumData === "object")}
                  >
                    Continuar <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                  {!curriculumExtracted && !(profile?.curriculumData && typeof profile.curriculumData === "object") && (
                    <p className="text-sm text-amber-700 mt-2">
                      Envie o PDF e aguarde a extração dos dados para continuar.
                    </p>
                  )}
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
                  <p className="text-center text-sm text-gray-600">
                    Para pagar com cartão e ativar o <strong>Pro</strong> ou <strong>Empresas</strong>, abra os planos após entrar no painel (menu <strong>Planos</strong>) ou agora:
                  </p>
                  <Link href="/planos">
                    <Button type="button" variant="outline" className="w-full border-violet-300 text-violet-700 hover:bg-violet-50">
                      Ver planos e checkout com cartão
                    </Button>
                  </Link>
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
                        cnpj: data.cnpj.trim() ? data.cnpj : undefined,
                        hasCnpj: data.cnpj.replace(/\D/g, "").length === 14,
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
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Indicações personalizadas no dashboard</li>
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
