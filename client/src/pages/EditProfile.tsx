import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/ui/spinner";
import Header from "@/components/Header";
import { saveUserProfile, getUserProfile } from "@/lib/userProfile";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const AREA_OPTIONS = [
  { id: "tech", label: "Tecnologia" },
  { id: "health", label: "Saúde" },
  { id: "agro", label: "Agronegócio" },
  { id: "energy", label: "Energia" },
  { id: "bio", label: "Biotecnologia" },
  { id: "other", label: "Outra" },
] as const;

function formatTelefoneDisplay(v: string): string {
  const n = v.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n ? `(${n}` : "";
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
}

export default function EditProfile() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [userType, setUserType] = useState<"pesquisador" | "pessoa-empresa" | "ambos">("pesquisador");
  
  const [cpf, setCpf] = useState("");
  const [hasCnpj, setHasCnpj] = useState<string>("nao");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [area, setArea] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setLocation("/login");
      return;
    }

    loadExistingProfile();
  }, [user, authLoading, setLocation]);

  const loadExistingProfile = async () => {
    if (!user) return;

    setLoadingProfile(true);
    try {
      const existingProfile = await getUserProfile(user);
      if (existingProfile) {
        setUserType(existingProfile.userType || "pesquisador");
        setCpf(existingProfile.cpf || "");
        setCnpj(existingProfile.cnpj || "");
        setHasCnpj(existingProfile.hasCnpj ? "sim" : "nao");
        setTelefone(existingProfile.phone ? formatTelefoneDisplay(existingProfile.phone) : "");
        setArea(existingProfile.area || "");
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validações específicas
    if (userType === "pessoa-empresa" && hasCnpj === "sim" && !cnpj) {
      toast.error("CNPJ é obrigatório quando você possui CNPJ");
      return;
    }

    if (!cpf) {
      toast.error("CPF é obrigatório");
      return;
    }

    setLoading(true);

    try {
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      await saveUserProfile(user.id, {
        cpf: cpf,
        cnpj: (userType === "pessoa-empresa" || userType === "ambos") && hasCnpj === "sim" ? cnpj : undefined,
        userType: userType,
        hasCnpj: (userType === "pessoa-empresa" || userType === "ambos") && hasCnpj === "sim",
        phone: telefone.replace(/\D/g, "") || undefined,
        area: area || undefined,
      });

      toast.success("Perfil atualizado com sucesso!");
      
      // Redirecionar para o perfil após salvar
      setTimeout(() => {
        setLocation("/perfil");
      }, 1000);
    } catch (error: any) {
      console.error("Erro ao atualizar perfil:", error);
      toast.error(error.message || "Erro ao atualizar perfil");
    } finally {
      setLoading(false);
    }
  };

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    return value;
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 14) {
      return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return value;
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-violet-50">
      <Header />
      
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-6">
            <Link href="/perfil">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao Perfil
              </Button>
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                Atualizar Perfil
              </h1>
              <p className="text-gray-600 mt-2">
                Atualize suas informações de cadastro
              </p>
            </div>

            <Tabs value={userType} onValueChange={(value) => setUserType(value as "pesquisador" | "pessoa-empresa" | "ambos")} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="pesquisador">Pesquisador</TabsTrigger>
                <TabsTrigger value="pessoa-empresa">Pessoa Física/Empresa</TabsTrigger>
                <TabsTrigger value="ambos">Ambos</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF *</Label>
                  <Input
                    id="cpf"
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(formatCPF(e.target.value))}
                    required
                    disabled={loading}
                    maxLength={14}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone (opcional)</Label>
                  <Input
                    id="telefone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={telefone}
                    onChange={(e) => setTelefone(formatTelefoneDisplay(e.target.value))}
                    disabled={loading}
                    maxLength={16}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Área de atuação (opcional)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {AREA_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setArea(area === opt.id ? "" : opt.id)}
                        className={`p-3 rounded-lg border-2 text-left text-sm font-medium transition-all ${
                          area === opt.id ? "border-violet-600 bg-violet-50 text-violet-800" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aba Pesquisador */}
                <TabsContent value="pesquisador" className="space-y-6">
                  <p className="text-sm text-gray-600">Você pode enviar um PDF do currículo baixado pelo Lattes (opcional) na sua página de perfil.</p>
                </TabsContent>

                {/* Aba Pessoa Física/Empresa */}
                <TabsContent value="pessoa-empresa" className="space-y-6">
                  <div className="space-y-4">
                    <Label>Você possui CNPJ?</Label>
                    <RadioGroup value={hasCnpj} onValueChange={setHasCnpj} disabled={loading}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sim" id="cnpj-sim" />
                        <Label htmlFor="cnpj-sim" className="cursor-pointer font-normal">Sim, tenho CNPJ</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="nao" id="cnpj-nao" />
                        <Label htmlFor="cnpj-nao" className="cursor-pointer font-normal">Não tenho CNPJ</Label>
                      </div>
                    </RadioGroup>

                    {hasCnpj === "sim" && (
                      <div className="space-y-2 mt-4">
                        <Label htmlFor="cnpj">CNPJ *</Label>
                        <Input
                          id="cnpj"
                          type="text"
                          placeholder="00.000.000/0000-00"
                          value={cnpj}
                          onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                          required={hasCnpj === "sim"}
                          disabled={loading}
                          maxLength={18}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Aba Ambos */}
                <TabsContent value="ambos" className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800">
                      <strong>Perfil Ambos:</strong> Você poderá visualizar editais tanto para pesquisadores quanto para empresas. 
                      Use o filtro no dashboard para alternar entre os tipos.
                    </p>
                  </div>
                  
                  <p className="text-sm text-gray-600">Você pode enviar um PDF do currículo baixado pelo Lattes (opcional) na sua página de perfil.</p>

                  <div className="space-y-4">
                    <Label>Você possui CNPJ?</Label>
                    <RadioGroup value={hasCnpj} onValueChange={setHasCnpj} disabled={loading}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sim" id="cnpj-sim-ambos" />
                        <Label htmlFor="cnpj-sim-ambos" className="cursor-pointer font-normal">Sim, tenho CNPJ</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="nao" id="cnpj-nao-ambos" />
                        <Label htmlFor="cnpj-nao-ambos" className="cursor-pointer font-normal">Não tenho CNPJ</Label>
                      </div>
                    </RadioGroup>

                    {hasCnpj === "sim" && (
                      <div className="space-y-2 mt-4">
                        <Label htmlFor="cnpj-ambos">CNPJ</Label>
                        <Input
                          id="cnpj-ambos"
                          type="text"
                          placeholder="00.000.000/0000-00"
                          value={cnpj}
                          onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                          disabled={loading}
                          maxLength={18}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white mt-6"
                  disabled={
                    loading || 
                    !cpf ||
                    (userType === "pessoa-empresa" && hasCnpj === "sim" && !cnpj)
                  }
                >
                  {loading ? (
                    <>
                      <Spinner className="mr-2" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Alterações"
                  )}
                </Button>
              </form>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

