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
import { saveUserProfile, getUserProfile, UserProfile } from "@/lib/userProfile";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export default function EditProfile() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [userType, setUserType] = useState<"pesquisador" | "pessoa-empresa">("pesquisador");
  
  // Campos comuns
  const [cpf, setCpf] = useState("");
  const [lattesId, setLattesId] = useState("");
  
  // Campos específicos de pessoa física/empresa
  const [hasCnpj, setHasCnpj] = useState<string>("nao");
  const [cnpj, setCnpj] = useState("");
  
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
        setLattesId(existingProfile.lattesId || "");
        setHasCnpj(existingProfile.hasCnpj ? "sim" : "nao");
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
    if (userType === "pesquisador" && !lattesId) {
      toast.error("ID Lattes é obrigatório para pesquisadores");
      return;
    }

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

      // Salvar dados adicionais no perfil do usuário
      await saveUserProfile(user.id, {
        cpf: cpf,
        cnpj: hasCnpj === "sim" ? cnpj : undefined,
        lattesId: userType === "pesquisador" ? lattesId : undefined,
        userType: userType,
        hasCnpj: hasCnpj === "sim",
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

            <Tabs value={userType} onValueChange={(value) => setUserType(value as "pesquisador" | "pessoa-empresa")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="pesquisador">Pesquisador</TabsTrigger>
                <TabsTrigger value="pessoa-empresa">Pessoa Física/Empresa</TabsTrigger>
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

                {/* Aba Pesquisador */}
                <TabsContent value="pesquisador" className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="lattesId">ID Lattes *</Label>
                    <Input
                      id="lattesId"
                      type="text"
                      placeholder="0000000000000000"
                      value={lattesId}
                      onChange={(e) => setLattesId(e.target.value.replace(/\D/g, ""))}
                      required
                      disabled={loading}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500">Número do seu ID Lattes (apenas números)</p>
                  </div>
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

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white mt-6"
                  disabled={
                    loading || 
                    !cpf ||
                    (userType === "pesquisador" && !lattesId) ||
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

