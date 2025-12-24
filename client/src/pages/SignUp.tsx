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
import { saveUserProfile } from "@/lib/userProfile";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function SignUp() {
  const [, setLocation] = useLocation();
  const [userType, setUserType] = useState<"pesquisador" | "pessoa-empresa" | "ambos">("pesquisador");
  
  // Campos comuns
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cpf, setCpf] = useState("");
  
  // Campos específicos do pesquisador
  const [lattesId, setLattesId] = useState("");
  
  // Campos específicos de pessoa física/empresa
  const [hasCnpj, setHasCnpj] = useState<string>("nao");
  const [cnpj, setCnpj] = useState("");
  
  const [loading, setLoading] = useState(false);
  const { signUp, user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      return;
    }

    // Validações específicas
    if (!cpf) {
      toast.error("CPF é obrigatório");
      return;
    }

    if (userType === "pesquisador" && !lattesId) {
      toast.error("ID Lattes é obrigatório para pesquisadores");
      return;
    }

    if (userType === "pessoa-empresa" && hasCnpj === "sim" && !cnpj) {
      toast.error("CNPJ é obrigatório quando você possui CNPJ");
      return;
    }

    setLoading(true);

    try {
      // Preparar dados do perfil - limpar formatação do CPF, CNPJ e Lattes ID
      const cpfLimpo = cpf.replace(/\D/g, ""); // Remove formatação
      const cnpjLimpo = cnpj.replace(/\D/g, ""); // Remove formatação
      const lattesLimpo = lattesId.replace(/\D/g, ""); // Remove formatação
      
      // Preparar dados do perfil para salvar
      const profileData = {
        cpf: cpfLimpo || undefined,
        cnpj: (userType === "pessoa-empresa" || userType === "ambos") && hasCnpj === "sim" && cnpjLimpo ? cnpjLimpo : undefined,
        lattesId: ((userType === "pesquisador" || userType === "ambos") && lattesLimpo) ? lattesLimpo : undefined,
        userType: userType,
        hasCnpj: (userType === "pessoa-empresa" || userType === "ambos") && hasCnpj === "sim",
      };

      console.log("Dados do perfil a serem salvos:", profileData);

      // Fazer o signUp básico
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        console.error("Erro no signup:", signUpError);
        throw signUpError;
      }

      if (!signUpData.user) {
        console.error("Usuário não retornado do signup");
        toast.error("Erro ao criar conta. Tente novamente.");
        return;
      }

      console.log("Usuário criado:", signUpData.user.id);

      // Aguardar um pouco para garantir que o usuário foi criado no banco
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Salvar dados adicionais no perfil do usuário imediatamente após o signup
      let profileSaved = false;
      try {
        console.log("Tentando salvar perfil para userId:", signUpData.user.id);
        console.log("Dados do perfil:", profileData);
        
        await saveUserProfile(signUpData.user.id, profileData);
        console.log("✅ Perfil salvo com sucesso na tabela profiles");
        profileSaved = true;
        toast.success("Conta criada com sucesso! Verifique seu email para confirmar.");
      } catch (profileError: any) {
        console.error("❌ Erro ao salvar perfil:", profileError);
        console.error("Código do erro:", profileError?.code);
        console.error("Mensagem do erro:", profileError?.message);
        console.error("Detalhes completos:", JSON.stringify(profileError, null, 2));
        
        // Sempre tentar salvar no metadata como fallback
        try {
          console.log("Tentando salvar no user_metadata como fallback...");
          const metadataProfile: any = {
            userType: profileData.userType,
            hasCnpj: profileData.hasCnpj || false,
          };
          if (profileData.cpf) metadataProfile.cpf = profileData.cpf;
          if (profileData.cnpj) metadataProfile.cnpj = profileData.cnpj;
          if (profileData.lattesId) metadataProfile.lattesId = profileData.lattesId;

          const { error: metadataError } = await supabase.auth.updateUser({
            data: { profile: metadataProfile },
          });
          
          if (metadataError) {
            console.error("Erro ao salvar no metadata:", metadataError);
            toast.warning("Conta criada, mas houve um problema ao salvar o perfil. Você pode atualizar depois.");
          } else {
            console.log("✅ Perfil salvo no user_metadata como fallback");
            toast.success("Conta criada com sucesso! Verifique seu email para confirmar.");
          }
        } catch (metadataError) {
          console.error("Erro ao salvar no metadata também:", metadataError);
          toast.warning("Conta criada, mas houve um problema ao salvar o perfil. Você pode atualizar depois.");
        }
      }
      
      // Verificar se o perfil foi realmente salvo
      if (profileSaved) {
        try {
          const { data: verifyProfile, error: verifyError } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', signUpData.user.id)
            .maybeSingle();
          
          if (verifyError && verifyError.code !== 'PGRST116') {
            console.warn("⚠️ Erro ao verificar perfil salvo:", verifyError);
          } else if (verifyProfile) {
            console.log("✅ Perfil verificado com sucesso:", verifyProfile);
          } else {
            console.warn("⚠️ Perfil não encontrado após salvar. Pode ser necessário confirmar o email primeiro.");
          }
        } catch (verifyError) {
          console.warn("⚠️ Erro ao verificar perfil:", verifyError);
        }
      }
      
      // After signup, redirect to login
      setLocation("/login");
    } catch (error: any) {
      console.error("Erro completo no signup:", error);
      toast.error(error.message || "Erro ao criar conta. Tente novamente.");
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-violet-50 px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                Criar nova conta
              </h1>
              <p className="text-gray-600 mt-2">
                Escolha o tipo de conta e preencha os dados abaixo
              </p>
            </div>

            <Tabs value={userType} onValueChange={(value) => setUserType(value as "pesquisador" | "pessoa-empresa" | "ambos")} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="pesquisador">Pesquisador</TabsTrigger>
                <TabsTrigger value="pessoa-empresa">Pessoa Física/Empresa</TabsTrigger>
                <TabsTrigger value="ambos">Ambos</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Campos comuns */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500">Mínimo de 6 caracteres</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                      className="w-full"
                    />
                    {password && confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-red-500">As senhas não coincidem</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
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
                    <Label htmlFor="lattesId">ID Lattes</Label>
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
                        <Label htmlFor="cnpj">CNPJ</Label>
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
                  
                  <div className="space-y-2">
                    <Label htmlFor="lattesId-ambos">ID Lattes (Opcional)</Label>
                    <Input
                      id="lattesId-ambos"
                      type="text"
                      placeholder="0000000000000000"
                      value={lattesId}
                      onChange={(e) => setLattesId(e.target.value.replace(/\D/g, ""))}
                      disabled={loading}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500">Número do seu ID Lattes (apenas números) - opcional</p>
                  </div>

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
                    (password !== confirmPassword && confirmPassword !== "") ||
                    (userType === "pesquisador" && !lattesId) ||
                    (userType === "pessoa-empresa" && hasCnpj === "sim" && !cnpj)
                  }
                >
                  {loading ? (
                    <>
                      <Spinner className="mr-2" />
                      Criando conta...
                    </>
                  ) : (
                    "Criar Conta"
                  )}
                </Button>
              </form>

              <div className="text-center text-sm text-gray-600 mt-6">
                Já tem uma conta?{" "}
                <Link href="/login">
                  <span className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer">
                    Entrar
                  </span>
                </Link>
              </div>

              <div className="text-center mt-4">
                <Link href="/">
                  <span className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
                    ← Voltar para a página inicial
                  </span>
                </Link>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

