import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, UserProfile } from "@/lib/userProfile";
import { fetchLattesData, fetchCNPJData, fetchCPFData, LattesData, CNPJData, CPFData, formatCPF, formatCNPJ, formatCEP } from "@/lib/externalAPIs";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { 
  User, 
  Mail, 
  FileText, 
  Building2, 
  GraduationCap, 
  MapPin, 
  Phone, 
  Calendar,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lattesData, setLattesData] = useState<LattesData | null>(null);
  const [cnpjData, setCnpjData] = useState<CNPJData | null>(null);
  const [cpfData, setCpfData] = useState<CPFData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLattes, setLoadingLattes] = useState(false);
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const [loadingCPF, setLoadingCPF] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setLocation("/login");
      return;
    }

    loadProfile();
  }, [user, authLoading, setLocation]);

  const loadProfile = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const userProfile = await getUserProfile(user);
      console.log("Perfil carregado:", userProfile);
      console.log("User metadata:", user?.user_metadata);
      setProfile(userProfile);

      // Carregar dados de APIs externas
      if (userProfile) {
        console.log("Carregando dados externos para perfil:", {
          lattesId: userProfile.lattesId,
          cnpj: userProfile.cnpj,
          cpf: userProfile.cpf,
        });
        
        if (userProfile.lattesId) {
          loadLattesData(userProfile.lattesId);
        }
        if (userProfile.cnpj) {
          console.log("CNPJ encontrado no perfil, carregando dados...");
          loadCNPJData(userProfile.cnpj);
        } else {
          console.log("CNPJ não encontrado no perfil");
        }
        if (userProfile.cpf) {
          loadCPFData(userProfile.cpf);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      toast.error("Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
  };

  const loadLattesData = async (lattesId: string) => {
    setLoadingLattes(true);
    try {
      const data = await fetchLattesData(lattesId);
      setLattesData(data);
      if (data) {
        toast.success("Dados do Lattes carregados");
      }
    } catch (error) {
      console.error("Erro ao carregar dados do Lattes:", error);
      toast.error("Erro ao carregar dados do Lattes");
    } finally {
      setLoadingLattes(false);
    }
  };

  const loadCNPJData = async (cnpj: string) => {
    if (!cnpj) {
      console.warn("CNPJ não fornecido para carregamento");
      return;
    }
    
    setLoadingCNPJ(true);
    console.log("Carregando dados do CNPJ:", cnpj);
    try {
      const data = await fetchCNPJData(cnpj);
      console.log("Dados do CNPJ recebidos:", data);
      setCnpjData(data);
      if (data) {
        toast.success("Dados do CNPJ carregados");
      } else {
        toast.warning("Não foi possível carregar dados do CNPJ");
      }
    } catch (error) {
      console.error("Erro ao carregar dados do CNPJ:", error);
      toast.error(`Erro ao carregar dados do CNPJ: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setLoadingCNPJ(false);
    }
  };

  const loadCPFData = async (cpf: string) => {
    setLoadingCPF(true);
    try {
      const data = await fetchCPFData(cpf);
      setCpfData(data);
    } catch (error) {
      console.error("Erro ao carregar dados do CPF:", error);
    } finally {
      setLoadingCPF(false);
    }
  };

  if (authLoading || loading) {
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
      
      <div className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Meu Perfil</h1>
          <p className="text-gray-600">Visualize suas informações e dados de APIs externas</p>
        </div>

        {/* Informações Básicas */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Informações Básicas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Email</label>
                <p className="text-gray-900 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {user.email}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Tipo de Usuário</label>
                <p className="text-gray-900">
                  <Badge variant={profile?.userType === "pesquisador" ? "default" : "secondary"}>
                    {profile?.userType === "pesquisador" ? "Pesquisador" : profile?.userType === "pessoa-empresa" ? "Pessoa Física/Empresa" : "Não definido"}
                  </Badge>
                </p>
              </div>

              {profile?.cpf ? (
                <div>
                  <label className="text-sm font-medium text-gray-500">CPF</label>
                  <p className="text-gray-900">{formatCPF(profile.cpf)}</p>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium text-gray-500">CPF</label>
                  <p className="text-gray-500 text-sm italic">Não cadastrado</p>
                </div>
              )}

              {profile?.cnpj ? (
                <div>
                  <label className="text-sm font-medium text-gray-500">CNPJ</label>
                  <p className="text-gray-900">{formatCNPJ(profile.cnpj)}</p>
                </div>
              ) : profile?.userType === "pessoa-empresa" ? (
                <div>
                  <label className="text-sm font-medium text-gray-500">CNPJ</label>
                  <p className="text-gray-500 text-sm italic">Não cadastrado</p>
                </div>
              ) : null}

              {profile?.lattesId ? (
                <div>
                  <label className="text-sm font-medium text-gray-500">ID Lattes</label>
                  <p className="text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {profile.lattesId}
                    <a
                      href={`https://buscatextual.cnpq.br/buscatextual/visualizacv.do?id=${profile.lattesId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>
              ) : profile?.userType === "pesquisador" ? (
                <div>
                  <label className="text-sm font-medium text-gray-500">ID Lattes</label>
                  <p className="text-gray-500 text-sm italic">Não cadastrado</p>
                </div>
              ) : null}
            </div>

            {(!profile?.cpf && !profile?.cnpj && !profile?.lattesId) && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800 mb-2">
                        Perfil incompleto
                      </p>
                      <p className="text-sm text-yellow-700 mb-3">
                        Complete seu cadastro adicionando CPF, CNPJ ou ID Lattes para aproveitar melhor os recursos da plataforma.
                      </p>
                      <Link href="/perfil/editar">
                        <Button variant="outline" size="sm" className="border-yellow-600 text-yellow-700 hover:bg-yellow-100">
                          Atualizar Perfil
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dados do Lattes */}
        {profile && profile.lattesId && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" />
                  Currículo Lattes
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadLattesData(profile.lattesId!)}
                  disabled={loadingLattes}
                >
                  {loadingLattes ? (
                    <Spinner className="w-4 h-4 mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Atualizar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLattes ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner />
                </div>
              ) : lattesData ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Nome</label>
                    <p className="text-gray-900 font-semibold">{lattesData.nome}</p>
                  </div>

                  {lattesData.resumo && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Resumo</label>
                      <p className="text-gray-700">{lattesData.resumo}</p>
                    </div>
                  )}

                  {lattesData.areasAtuacao && lattesData.areasAtuacao.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Áreas de Atuação</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {lattesData.areasAtuacao.map((area, idx) => (
                          <Badge key={idx} variant="outline">{area}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {lattesData.statusAcademico && (
                    lattesData.statusAcademico.doutorando || 
                    lattesData.statusAcademico.mestrando || 
                    lattesData.statusAcademico.graduando || 
                    lattesData.statusAcademico.posGraduando
                  ) ? (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status Acadêmico Atual</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {lattesData.statusAcademico.doutorando && (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-300">
                            Doutorando
                          </Badge>
                        )}
                        {lattesData.statusAcademico.mestrando && (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                            Mestrando
                          </Badge>
                        )}
                        {lattesData.statusAcademico.graduando && (
                          <Badge className="bg-green-100 text-green-700 border-green-300">
                            Graduando
                          </Badge>
                        )}
                        {lattesData.statusAcademico.posGraduando && (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-300">
                            Pós-Graduando
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {lattesData.formacao && lattesData.formacao.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Formação</label>
                      <div className="space-y-2 mt-2">
                        {lattesData.formacao.map((formacao, idx) => (
                          <div key={idx} className="border-l-2 border-blue-500 pl-4">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">{formacao.nivel}</p>
                              {formacao.emAndamento && (
                                <Badge variant="outline" className="text-xs">Em andamento</Badge>
                              )}
                            </div>
                            <p className="text-gray-700">{formacao.curso}</p>
                            <p className="text-sm text-gray-600">{formacao.instituicao}</p>
                            {formacao.anoConclusao && (
                              <p className="text-sm text-gray-500">Concluído em {formacao.anoConclusao}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lattesData.elegibilidade && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <label className="text-sm font-medium text-gray-500 mb-2 block">Elegibilidade para Editais</label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {lattesData.elegibilidade.podeParticiparEditais ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                          <span className="text-sm text-gray-700">
                            {lattesData.elegibilidade.podeParticiparEditais ? "Elegível para participar de editais" : "Não elegível para participar de editais"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <div className="flex items-center gap-2">
                            {lattesData.elegibilidade.possuiDoutorado ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="text-xs text-gray-600">Doutorado</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {lattesData.elegibilidade.possuiMestrado ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="text-xs text-gray-600">Mestrado</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {lattesData.elegibilidade.possuiGraduacao ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="text-xs text-gray-600">Graduação</span>
                          </div>
                          {lattesData.elegibilidade.anosExperiencia && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-blue-600" />
                              <span className="text-xs text-gray-600">{lattesData.elegibilidade.anosExperiencia} anos de experiência</span>
                            </div>
                          )}
                        </div>

                        {lattesData.elegibilidade.observacoes && lattesData.elegibilidade.observacoes.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                            <p className="text-sm font-medium text-yellow-800 mb-1">Observações:</p>
                            <ul className="text-sm text-yellow-700 list-disc list-inside">
                              {lattesData.elegibilidade.observacoes.map((obs, idx) => (
                                <li key={idx}>{obs}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>Nenhum dado do Lattes encontrado</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => loadLattesData(profile.lattesId!)}
                  >
                    Tentar Carregar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dados do CNPJ */}
        {profile && profile.cnpj ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Dados da Empresa (CNPJ)
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    console.log("Botão Atualizar CNPJ clicado, CNPJ:", profile.cnpj);
                    loadCNPJData(profile.cnpj!);
                  }}
                  disabled={loadingCNPJ}
                >
                  {loadingCNPJ ? (
                    <Spinner className="w-4 h-4 mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  {cnpjData ? "Atualizar" : "Carregar"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCNPJ ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner />
                  <span className="ml-2 text-sm text-gray-600">Carregando dados do CNPJ...</span>
                </div>
              ) : cnpjData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Razão Social</label>
                      <p className="text-gray-900 font-semibold">{cnpjData.razaoSocial}</p>
                    </div>

                    {cnpjData.nomeFantasia && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Nome Fantasia</label>
                        <p className="text-gray-900">{cnpjData.nomeFantasia}</p>
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium text-gray-500">Situação</label>
                      <p className="text-gray-900">
                        <Badge variant={cnpjData.situacao === "ATIVA" ? "default" : "destructive"}>
                          {cnpjData.situacao}
                        </Badge>
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Data de Abertura</label>
                      <p className="text-gray-900 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {cnpjData.dataAbertura}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Porte</label>
                      <p className="text-gray-900">{cnpjData.porte}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Natureza Jurídica</label>
                      <p className="text-gray-900">{cnpjData.naturezaJuridica}</p>
                    </div>
                  </div>

                  {cnpjData.endereco && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Endereço</label>
                      <p className="text-gray-900 flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-1" />
                        <span>
                          {cnpjData.endereco.logradouro}, {cnpjData.endereco.numero}
                          {cnpjData.endereco.complemento && ` - ${cnpjData.endereco.complemento}`}
                          <br />
                          {cnpjData.endereco.bairro} - {cnpjData.endereco.municipio}/{cnpjData.endereco.uf}
                          <br />
                          CEP: {formatCEP(cnpjData.endereco.cep)}
                        </span>
                      </p>
                    </div>
                  )}

                  {cnpjData.atividades && cnpjData.atividades.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Atividades</label>
                      <div className="space-y-2 mt-2">
                        {cnpjData.atividades.map((atividade, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <Badge variant={atividade.principal ? "default" : "outline"}>
                              {atividade.principal ? "Principal" : "Secundária"}
                            </Badge>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{atividade.descricao}</p>
                              <p className="text-xs text-gray-500">Código: {atividade.codigo}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {cnpjData.telefones && cnpjData.telefones.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Telefones</label>
                      <p className="text-gray-900 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        {cnpjData.telefones.join(", ")}
                      </p>
                    </div>
                  )}

                  {cnpjData.email && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email</label>
                      <p className="text-gray-900 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {cnpjData.email}
                      </p>
                    </div>
                  )}

                  {cnpjData.elegibilidade && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <label className="text-sm font-medium text-gray-500 mb-2 block">Elegibilidade para Editais</label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {cnpjData.elegibilidade.podeParticiparEditais ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                          <span className="text-sm text-gray-700">
                            {cnpjData.elegibilidade.podeParticiparEditais ? "Elegível para participar de editais" : "Não elegível para participar de editais"}
                          </span>
                        </div>

                        {cnpjData.elegibilidade.tempoAtividade && (
                          <div className="flex items-center gap-2 mt-2">
                            <Calendar className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-gray-600">
                              {cnpjData.elegibilidade.tempoAtividade} meses de atividade
                            </span>
                          </div>
                        )}

                        {cnpjData.elegibilidade.observacoes && cnpjData.elegibilidade.observacoes.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                            <p className="text-sm font-medium text-yellow-800 mb-1">Observações:</p>
                            <ul className="text-sm text-yellow-700 list-disc list-inside">
                              {cnpjData.elegibilidade.observacoes.map((obs, idx) => (
                                <li key={idx}>{obs}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>Nenhum dado do CNPJ encontrado</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      console.log("Tentando carregar CNPJ:", profile.cnpj);
                      loadCNPJData(profile.cnpj!);
                    }}
                  >
                    Tentar Carregar
                  </Button>
                  <p className="text-xs text-gray-400 mt-2">
                    CNPJ cadastrado: {formatCNPJ(profile.cnpj)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : profile && profile.userType === "pessoa-empresa" ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Dados da Empresa (CNPJ)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="mb-4">CNPJ não cadastrado no perfil</p>
                <Link href="/perfil/editar">
                  <Button variant="outline" size="sm">
                    Adicionar CNPJ
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Dados do CPF */}
        {profile && profile.cpf && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Validação CPF
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cpfData ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Situação</label>
                    <p className="text-gray-900">
                      <Badge variant={cpfData.situacao === "Válido" ? "default" : "destructive"}>
                        {cpfData.situacao}
                      </Badge>
                    </p>
                  </div>

                  {cpfData.elegibilidade && (
                    <div>
                      <label className="text-sm font-medium text-gray-500 mb-2 block">Elegibilidade para Editais</label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {cpfData.elegibilidade.podeParticiparEditais ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                          <span className="text-sm text-gray-700">
                            {cpfData.elegibilidade.podeParticiparEditais ? "Elegível para participar de editais" : "Não elegível para participar de editais"}
                          </span>
                        </div>
                        
                        {cpfData.elegibilidade.observacoes && cpfData.elegibilidade.observacoes.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                            <p className="text-sm font-medium text-yellow-800 mb-1">Observações:</p>
                            <ul className="text-sm text-yellow-700 list-disc list-inside">
                              {cpfData.elegibilidade.observacoes.map((obs, idx) => (
                                <li key={idx}>{obs}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  Informações detalhadas de CPF não estão disponíveis publicamente por questões de privacidade.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex justify-between">
          <Link href="/perfil/editar">
            <Button variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
              Editar Perfil
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline">Voltar ao Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

