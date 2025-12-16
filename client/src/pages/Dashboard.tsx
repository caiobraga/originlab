import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  ArrowLeft, Search, Filter, Globe, TrendingUp, Calendar, 
  DollarSign, Target, CheckCircle2, Clock, AlertCircle,
  Download, Send, Eye, Sparkles, BarChart3, FileText, User, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchEditaisWithScores,
  EditalWithScores,
  formatPrazo,
  getPaisFromEdital,
  getStatusFromEdital,
} from "@/lib/editaisApi";
import { formatValorProjeto, formatPrazoInscricao } from "@/lib/editalFormatters";

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
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    loadEditais();
  }, [user]);

  const loadEditais = async () => {
    try {
      setLoading(true);
      const editaisComScores = await fetchEditaisWithScores(user?.id);

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

  // Filtrar editais
  const editaisFiltrados = editais.filter((edital) => {
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Meu Painel</h1>
                <p className="text-sm text-gray-600">Oportunidades globais de fomento</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/minhas-propostas">
                <Button variant="outline" className="border-violet-600 text-violet-600 hover:bg-violet-50">
                  <FileText className="w-4 h-4 mr-2" />
                  Minhas Propostas
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
                  Meu Painel
                </Button>
              </Link>
              <Link href="/perfil">
                <Button variant="outline" className="border-green-600 text-green-600 hover:bg-green-50">
                  <User className="w-4 h-4 mr-2" />
                  Meu Perfil
                </Button>
              </Link>
              <Badge className="bg-gradient-to-r from-blue-600 to-violet-600 text-white">
                Plano Pro
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Carregando editais...</span>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
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
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar editais..."
                  className="pl-10"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        </div>

        {/* Editais List */}
        <div className="space-y-4">
          {editaisFiltrados.map((edital) => (
            <div key={edital.id} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{edital.flag}</span>
                    <h3 className="text-lg font-bold text-gray-900">{edital.titulo}</h3>
                    {edital.status === "novo" && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Novo
                      </Badge>
                    )}
                    {edital.status === "em_analise" && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Em análise
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    {edital.orgao || "Órgão não informado"} • {edital.pais}
                  </div>
                  
                  {/* Descrição resumida */}
                  {edital.descricao && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {edital.descricao.substring(0, 150)}
                      {edital.descricao.length > 150 ? "..." : ""}
                    </p>
                  )}

                  <div className="flex items-center gap-6 text-sm">
                    {(() => {
                      const valorFormatado = formatValorProjeto(edital.valor_projeto || edital.valor);
                      if (valorFormatado.display !== 'Não informado') {
                        return (
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-gray-400" />
                            <span className="font-semibold text-gray-900">{valorFormatado.display}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">
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
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{edital.area}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  {/* Match Score */}
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-3xl font-bold text-blue-600">{edital.match}%</div>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-xs text-gray-600">Match</div>
                  </div>

                  {/* Probabilidade */}
                  <div className="text-right">
                    <div className="text-2xl font-bold text-violet-600">{edital.probabilidade}%</div>
                    <div className="text-xs text-gray-600">Prob. aprovação</div>
                  </div>

                  {/* Elegibilidade */}
                  {edital.elegivel && (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      ✓ Elegível
                    </Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                <Button className="flex-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar proposta com IA
                </Button>
                <Button variant="outline" onClick={() => handleVerDetalhes(edital.id)}>
                  <Eye className="w-4 h-4 mr-2" />
                  Ver detalhes
                </Button>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Baixar edital
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
