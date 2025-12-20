import { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  ArrowLeft, FileText, Clock, CheckCircle2, Send, AlertCircle,
  Edit3, Trash2, Download, Eye, Sparkles, Calendar, DollarSign,
  TrendingUp, MessageSquare, Users, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPropostas, deleteProposta, type Proposta, type StatusProposta } from "@/lib/propostasApi";
import { formatValorProjeto } from "@/lib/editalFormatters";

interface PropostaDisplay extends Proposta {
  editalTitulo: string;
  orgao: string;
  valor: string;
}

const propostasMock: PropostaDisplay[] = [
  {
    id: "1",
    editalId: "centelha-es",
    editalTitulo: "Centelha III - Espírito Santo",
    orgao: "FAPES + FINEP",
    valor: "R$ 139.600",
    prazo: "30 dias",
    status: "em_redacao",
    progresso: 65,
    ultimaAtualizacao: "Hoje, 14:30",
    proximaEtapa: "Completar seção de Metodologia",
    observacoes: "IA sugeriu melhorias no plano de trabalho"
  },
  {
    id: "2",
    editalId: "fapesp-pipe",
    editalTitulo: "FAPESP PIPE - Pesquisa Inovativa em Pequenas Empresas",
    orgao: "FAPESP",
    valor: "R$ 1.000.000",
    prazo: "45 dias",
    status: "revisao",
    progresso: 90,
    ultimaAtualizacao: "Ontem, 18:45",
    proximaEtapa: "Revisão final antes de submeter",
    observacoes: "Aguardando feedback do orientador"
  },
  {
    id: "3",
    editalId: "finep-startup",
    editalTitulo: "FINEP Startup - Subvenção para Startups",
    orgao: "FINEP",
    valor: "R$ 500.000",
    prazo: "60 dias",
    status: "rascunho",
    progresso: 25,
    ultimaAtualizacao: "03/11/2025",
    proximaEtapa: "Definir escopo do projeto",
    observacoes: ""
  },
  {
    id: "4",
    editalId: "cnpq-universal",
    editalTitulo: "CNPq Universal - Chamada Universal",
    orgao: "CNPq",
    valor: "R$ 200.000",
    prazo: "15 dias",
    status: "submetida",
    progresso: 100,
    ultimaAtualizacao: "28/10/2025",
    proximaEtapa: "Aguardar resultado (previsão: 90 dias)",
    observacoes: "Proposta submetida com sucesso"
  },
  {
    id: "5",
    editalId: "bndes-inovacao",
    editalTitulo: "BNDES Inovação - Apoio à Inovação",
    orgao: "BNDES",
    valor: "R$ 2.000.000",
    prazo: "90 dias",
    status: "aprovada",
    progresso: 100,
    ultimaAtualizacao: "15/10/2025",
    proximaEtapa: "Assinatura do contrato",
    observacoes: "Parabéns! Projeto aprovado com nota 9.2"
  }
];

export default function MinhasPropostas() {
  const { user } = useAuth();
  const [filtroStatus, setFiltroStatus] = useState<StatusProposta | "todos">("todos");
  const [propostas, setPropostas] = useState<PropostaDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const getStatusBadge = (status: StatusProposta) => {
    switch (status) {
      case "rascunho":
        return <Badge variant="outline" className="bg-gray-100">📝 Rascunho</Badge>;
      case "em_redacao":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">✍️ Em Redação</Badge>;
      case "revisao":
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">🔍 Em Revisão</Badge>;
      case "submetida":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200">📤 Submetida</Badge>;
      case "aprovada":
        return <Badge className="bg-green-100 text-green-700 border-green-200">✅ Aprovada</Badge>;
      case "rejeitada":
        return <Badge className="bg-red-100 text-red-700 border-red-200">❌ Rejeitada</Badge>;
      default:
        return <Badge variant="outline">Status desconhecido</Badge>;
    }
  };

  const getStatusIcon = (status: StatusProposta) => {
    switch (status) {
      case "rascunho":
        return <FileText className="w-5 h-5 text-gray-500" />;
      case "em_redacao":
        return <Edit3 className="w-5 h-5 text-blue-600" />;
      case "revisao":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "submetida":
        return <Send className="w-5 h-5 text-purple-600" />;
      case "aprovada":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "rejeitada":
        return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
  };

  // Carregar propostas do banco
  useEffect(() => {
    async function loadPropostas() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await fetchPropostas(user.id);
        
        // Converter para formato de exibição
        const propostasDisplay: PropostaDisplay[] = data.map((p) => ({
          ...p,
          editalTitulo: p.edital_titulo || "Sem título",
          orgao: p.edital_orgao || "Não informado",
          valor: formatValorProjeto(p.edital_valor).display,
        }));

        setPropostas(propostasDisplay);
      } catch (error) {
        console.error("Erro ao carregar propostas:", error);
        toast.error("Erro ao carregar propostas");
      } finally {
        setLoading(false);
      }
    }

    loadPropostas();
  }, [user]);

  const propostasFiltradas = propostas.filter(p => 
    filtroStatus === "todos" || p.status === filtroStatus
  );

  const handleContinuarRedacao = (id: string) => {
    // Navegar para o editor usando Link do wouter
    window.location.href = `/propostas/${id}`;
  };

  const handleExcluir = async (id: string) => {
    if (!user) return;
    
    if (!confirm("Tem certeza que deseja excluir esta proposta?")) {
      return;
    }

    try {
      await deleteProposta(id, user.id);
      setPropostas(propostas.filter(p => p.id !== id));
      toast.success("Proposta excluída com sucesso");
    } catch (error) {
      console.error("Erro ao excluir proposta:", error);
      toast.error("Erro ao excluir proposta");
    }
  };

  // Formatar data de última atualização
  const formatUltimaAtualizacao = (data: string) => {
    const date = new Date(data);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins < 1 ? "Agora" : `Há ${diffMins} minuto(s)`;
      }
      return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Ontem, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `Há ${diffDays} dia(s)`;
    } else {
      return date.toLocaleDateString('pt-BR');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Minhas Propostas</h1>
                <p className="text-sm text-gray-600">Acompanhe o progresso dos seus projetos</p>
              </div>
            </div>
            <Link href="/dashboard">
              <Button className="bg-gradient-to-r from-blue-600 to-violet-600">
                <Sparkles className="w-4 h-4 mr-2" />
                Nova Proposta
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container py-8">
        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{propostas.length}</div>
            <div className="text-sm text-gray-600">Total de Propostas</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">
              {propostas.filter(p => p.status === "em_redacao").length}
            </div>
            <div className="text-sm text-blue-600">Em Redação</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-700">
              {propostas.filter(p => p.status === "revisao").length}
            </div>
            <div className="text-sm text-yellow-600">Em Revisão</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">
              {propostas.filter(p => p.status === "submetida").length}
            </div>
            <div className="text-sm text-purple-600">Submetidas</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-2xl font-bold text-green-700">
              {propostas.filter(p => p.status === "aprovada").length}
            </div>
            <div className="text-sm text-green-600">Aprovadas</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Filtrar por status:</span>
            <Button 
              variant={filtroStatus === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus("todos")}
            >
              Todos
            </Button>
            <Button 
              variant={filtroStatus === "rascunho" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus("rascunho")}
            >
              Rascunho
            </Button>
            <Button 
              variant={filtroStatus === "em_redacao" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus("em_redacao")}
            >
              Em Redação
            </Button>
            <Button 
              variant={filtroStatus === "revisao" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus("revisao")}
            >
              Em Revisão
            </Button>
            <Button 
              variant={filtroStatus === "submetida" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus("submetida")}
            >
              Submetida
            </Button>
            <Button 
              variant={filtroStatus === "aprovada" ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltroStatus("aprovada")}
            >
              Aprovada
            </Button>
          </div>
        </div>

        {/* Lista de Propostas */}
        <div className="space-y-4">
          {propostasFiltradas.length === 0 ? (
            <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma proposta encontrada</h3>
              <p className="text-gray-600 mb-4">
                {filtroStatus === "todos" 
                  ? "Comece criando sua primeira proposta a partir de um edital no dashboard"
                  : `Você não tem propostas com status "${filtroStatus}"`
                }
              </p>
              <Link href="/dashboard">
                <Button className="bg-gradient-to-r from-blue-600 to-violet-600">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Explorar Editais
                </Button>
              </Link>
            </div>
          ) : (
            propostasFiltradas.map((proposta) => (
              <div key={proposta.id} className="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-3 bg-gray-100 rounded-lg">
                      {getStatusIcon(proposta.status)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{proposta.editalTitulo}</h3>
                        {getStatusBadge(proposta.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {proposta.orgao}
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          {proposta.valor}
                        </div>
                        {/* Prazo removido - não está disponível no banco */}
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatUltimaAtualizacao(proposta.atualizado_em)}
                        </div>
                      </div>

                      {/* Progresso */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">Progresso</span>
                          <span className="text-sm font-bold text-blue-600">{proposta.progresso}%</span>
                        </div>
                        <Progress value={proposta.progresso} className="h-2" />
                      </div>

                      {/* Próxima Etapa */}
                      {proposta.proxima_etapa && (
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <div className="flex items-start gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
                            <div>
                              <div className="text-xs font-medium text-blue-900 mb-1">Próxima Etapa</div>
                              <div className="text-sm text-blue-700">{proposta.proxima_etapa}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Observações */}
                      {proposta.observacoes && (
                        <div className="mt-3 flex items-start gap-2 text-sm text-gray-600">
                          <MessageSquare className="w-4 h-4 mt-0.5" />
                          <span>{proposta.observacoes}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                  {proposta.status === "rascunho" || proposta.status === "em_redacao" ? (
                    <Button 
                      className="bg-gradient-to-r from-blue-600 to-violet-600"
                      onClick={() => handleContinuarRedacao(proposta.id)}
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Continuar Redação
                    </Button>
                  ) : proposta.status === "revisao" ? (
                    <Button 
                      className="bg-gradient-to-r from-yellow-500 to-orange-500"
                      onClick={() => handleContinuarRedacao(proposta.id)}
                    >
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Revisar Proposta
                    </Button>
                  ) : null}
                  
                  <Link href={`/edital/${proposta.edital_id}`}>
                    <Button variant="outline">
                      <Eye className="w-4 h-4 mr-2" />
                      Ver Edital
                    </Button>
                  </Link>
                  
                  {proposta.status === "submetida" || proposta.status === "aprovada" ? (
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Proposta
                    </Button>
                  ) : null}
                  
                  {proposta.status === "rascunho" && (
                    <Button 
                      variant="outline" 
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleExcluir(proposta.id)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
