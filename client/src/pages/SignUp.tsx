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

export default function SignUp() {
  const [, setLocation] = useLocation();
  const [userType, setUserType] = useState<"pesquisador" | "pessoa-empresa">("pesquisador");
  
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
    if (userType === "pesquisador" && !lattesId) {
      return;
    }

    if (userType === "pessoa-empresa" && hasCnpj === "sim" && !cnpj) {
      return;
    }

    setLoading(true);

    try {
      // Fazer o signUp básico
      await signUp(email, password);
      
      // Aguardar um momento para garantir que o usuário foi criado
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Obter o usuário atual após o signup
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Salvar dados adicionais no perfil do usuário
        await saveUserProfile(user.id, {
          cpf: cpf,
          cnpj: hasCnpj === "sim" ? cnpj : undefined,
          lattesId: userType === "pesquisador" ? lattesId : undefined,
          userType: userType,
          hasCnpj: hasCnpj === "sim",
        });
      }
      
      // After signup, redirect to login or dashboard
      setLocation("/login");
    } catch (error) {
      // Error is already handled in AuthContext
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

            <Tabs value={userType} onValueChange={(value) => setUserType(value as "pesquisador" | "pessoa-empresa")} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="pesquisador">Pesquisador</TabsTrigger>
                <TabsTrigger value="pessoa-empresa">Pessoa Física/Empresa</TabsTrigger>
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

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white mt-6"
                  disabled={
                    loading || 
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

