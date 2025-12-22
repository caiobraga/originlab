import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  ArrowLeft, Search, Filter, Globe, TrendingUp, Calendar, 
  DollarSign, Target, CheckCircle2, Clock, AlertCircle,
  Send, Eye, Sparkles, BarChart3, FileText, User, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import Header from "@/components/Header";
import {
  fetchEditaisWithScores,
  EditalWithScores,
  formatPrazo,
  getPaisFromEdital,
  getStatusFromEdital,
} from "@/lib/editaisApi";
import { formatValorProjeto, formatPrazoInscricao } from "@/lib/editalFormatters";
import { gerarPropostaComIA } from "@/lib/propostasApi";

interface EditalDisplay extends EditalWithScores {
  prazo: string;
  pais: string;
  flag: string;
  status: "novo" | "em_analise" | "submetido";
  elegivel: boolean;
}

export default function Dashboard() {
  const [filtroRegiao, setFiltroRegiao] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [editais, setEditais] = useState<EditalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerandoProposta, setGerandoProposta] = useState<string | null>(null); // ID do edital sendo processado
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  useEffect(() => {
    if (!profileLoading) {
      loadEditais();
    }
  }, [user, profile, profileLoading]);

  const loadEditais = async () => {
    try {
      setLoading(true);
      const editaisComScores = await fetchEditaisWithScores(user?.id, user, profile);

      // Transformar para formato de exibição
      const editaisFormatados: EditalDisplay[] = editaisComScores.map((edital) => {
        const { pais, flag } = getPaisFromEdital(edital);
        const status = getStatusFromEdital(edital);
        const prazo = formatPrazo(edital.data_encerramento);

        return {
          ...edital,
          prazo,
          pais,
          flag,
          status,
          elegivel: true, // Por enquanto sempre true, pode ser calculado depois
        };
      });

      setEditais(editaisFormatados);
    } catch (error) {
      console.error("Erro ao carregar editais:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerDetalhes = (editalId: string) => {
    setLocation(`/edital/${editalId}`);
  };

  // Função para gerar proposta com IA
  const handleGerarProposta = async (editalId: string) => {
    if (!user) {
      toast.error("Faça login para gerar uma proposta");
      return;
    }

    if (!editalId) {
      toast.error("ID do edital não encontrado");
      return;
    }

    try {
      setGerandoProposta(editalId);
      toast.loading("Criando proposta...", { id: `gerar-proposta-${editalId}` });

      const proposta = await gerarPropostaComIA(editalId, user.id, user, profile);

      toast.success("Proposta criada com sucesso!", { id: `gerar-proposta-${editalId}` });
      setLocation(`/propostas/${proposta.id}`);
    } catch (error) {
      console.error("Erro ao criar proposta:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao criar proposta",
        { id: `gerar-proposta-${editalId}` }
      );
    } finally {
      setGerandoProposta(null);
    }
  };

  // Filtrar editais baseado no perfil do usuário e outros filtros
  const editaisFiltrados = editais.filter((edital) => {
    // Filtro baseado no perfil do usuário (is_researcher ou is_company)
    if (profile && !profileLoading) {
      const userType = profile.userType;
      
      // Se o usuário é pesquisador, mostrar apenas editais onde is_researcher === true
      if (userType === "pesquisador") {
        // Se is_researcher é false ou null, não mostrar
        // Se is_researcher é true ou undefined (ainda não processado), mostrar
        if (edital.is_researcher === false) {
          return false;
        }
      }
      
      // Se o usuário é pessoa-empresa, mostrar apenas editais onde is_company === true
      if (userType === "pessoa-empresa") {
        // Se is_company é false ou null, não mostrar
        // Se is_company é true ou undefined (ainda não processado), mostrar
        if (edital.is_company === false) {
          return false;
        }
      }
    }

    // Filtro de busca
    const matchBusca =
      edital.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      (edital.orgao?.toLowerCase() || "").includes(busca.toLowerCase()) ||
      (edital.area?.toLowerCase() || "").includes(busca.toLowerCase());

    // Filtro de região
    const matchRegiao =
      filtroRegiao === "todos" ||
      (filtroRegiao === "brasil" && edital.pais === "Brasil") ||
      (filtroRegiao === "europa" && edital.pais === "União Europeia") ||
      (filtroRegiao === "latam" &&
        ["Brasil", "Chile", "Colômbia"].includes(edital.pais));

    return matchBusca && matchRegiao;
  });

  const stats = {
    editaisAtivos: editais.length,
    emAnalise: editais.filter((e) => e.status === "em_analise").length,
    matchAlto: editais.filter((e) => e.match >= 90).length,
    propostas: 5, // Mock - número de propostas ativas
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="container py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Meu Painel</h1>
          <p className="text-sm md:text-base text-gray-600">Oportunidades globais de fomento</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Carregando editais...</span>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-5 h-5 text-blue-600" />
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.editaisAtivos}</div>
            <div className="text-sm text-gray-600">Editais disponíveis</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.matchAlto}</div>
            <div className="text-sm text-gray-600">Match acima de 90%</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.propostas}</div>
            <div className="text-sm text-gray-600">Propostas ativas</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.emAnalise}</div>
            <div className="text-sm text-gray-600">Em análise</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar editais..."
                  className="pl-10 w-full"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Filter className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <select
                className="px-3 md:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
                value={filtroRegiao}
                onChange={(e) => setFiltroRegiao(e.target.value)}
              >
                <option value="todos">Todas as regiões</option>
                <option value="brasil">🇧🇷 Brasil</option>
                <option value="europa">🇪🇺 Europa</option>
                <option value="latam">🌎 América Latina</option>
              </select>
            </div>
          </div>
          {profile && !profileLoading && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Target className="w-4 h-4 text-blue-600" />
                <span>
                  Mostrando editais para{" "}
                  <span className="font-semibold text-gray-900">
                    {profile.userType === "pesquisador" ? "pesquisadores" : "empresas e público geral"}
                  </span>
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {profile.userType === "pesquisador"
                  ? "Editais direcionados para pesquisadores e iniciação científica são exibidos primeiro."
                  : "Editais abertos para empresas, MEI, autônomos e público geral são exibidos primeiro."}
              </p>
            </div>
          )}
        </div>

        {/* Editais List */}
        <div className="space-y-4">
          {editaisFiltrados.map((edital) => (
            <div key={edital.id} className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row items-start md:justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                    <span className="text-xl md:text-2xl flex-shrink-0">{edital.flag}</span>
                    <h3 className="text-base md:text-lg font-bold text-gray-900 break-words flex-1 min-w-0">{edital.titulo}</h3>
                    {edital.status === "novo" && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex-shrink-0">
                        Novo
                      </Badge>
                    )}
                    {edital.status === "em_analise" && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0">
                        Em análise
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs md:text-sm text-gray-600 mb-3 break-words">
                    {edital.orgao || "Órgão não informado"} • {edital.pais}
                  </div>
                  
                  {/* Descrição resumida */}
                  {edital.descricao && (
                    <p className="text-xs md:text-sm text-gray-600 mb-3 line-clamp-2 break-words">
                      {edital.descricao.substring(0, 150)}
                      {edital.descricao.length > 150 ? "..." : ""}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 md:gap-6 text-xs md:text-sm">
                    {(() => {
                      const valorFormatado = formatValorProjeto(edital.valor_projeto || edital.valor);
                      if (valorFormatado.display !== 'Não informado') {
                        return (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="font-semibold text-gray-900 break-words">{valorFormatado.display}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600 break-words">
                        {(() => {
                          const prazoFormatado = formatPrazoInscricao(edital.prazo_inscricao);
                          if (prazoFormatado.display !== 'Não informado') {
                            return `Prazo: ${prazoFormatado.display}`;
                          }
                          return `Prazo: ${edital.prazo}`;
                        })()}
                      </span>
                    </div>
                    {edital.area && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Target className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-600 break-words">{edital.area}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-3 w-full md:w-auto justify-between md:justify-start">
                  {/* Match Score */}
                  <div className="text-center md:text-right">
                    <div className="flex items-center gap-2 mb-1 justify-center md:justify-end">
                      <div className="text-2xl md:text-3xl font-bold text-blue-600">{edital.match}%</div>
                      <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                    </div>
                    <div className="text-xs text-gray-600">Match</div>
                  </div>

                  {/* Probabilidade */}
                  <div className="text-center md:text-right">
                    <div className="text-xl md:text-2xl font-bold text-violet-600">{edital.probabilidade}%</div>
                    <div className="text-xs text-gray-600">Prob. aprovação</div>
                  </div>

                  {/* Elegibilidade */}
                  {edital.elegivel && (
                    <Badge className="bg-green-100 text-green-700 border-green-200 flex-shrink-0">
                      ✓ Elegível
                    </Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-4 border-t border-gray-200">
                <Button 
                  onClick={() => handleGerarProposta(edital.id)}
                  disabled={gerandoProposta === edital.id || !user}
                  className="w-full sm:flex-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {gerandoProposta === edital.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span className="hidden sm:inline">Gerando...</span>
                      <span className="sm:hidden">Gerando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Gerar proposta com IA</span>
                      <span className="sm:hidden">Gerar proposta</span>
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => handleVerDetalhes(edital.id)} className="w-full sm:w-auto">
                  <Eye className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Ver detalhes</span>
                  <span className="sm:hidden">Detalhes</span>
                </Button>
              </div>
            </div>
          ))}
        </div>

            {editaisFiltrados.length === 0 && !loading && (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {editais.length === 0
                    ? "Nenhum edital encontrado no banco de dados."
                    : "Nenhum edital encontrado com os filtros selecionados."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
