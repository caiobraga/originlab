import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  ArrowLeft, Search, Filter, Globe, TrendingUp, Calendar, 
  DollarSign, Target, CheckCircle2, Clock, AlertCircle,
  Send, Eye, Sparkles, BarChart3, User, Loader2,
  GraduationCap, Building2, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  const [mostrarInativos, setMostrarInativos] = useState(false); // Opção para mostrar editais inativos
  const [filtroTipoEdital, setFiltroTipoEdital] = useState<"pesquisadores" | "empresas" | "todos">("todos"); // Filtro para tipo ambos
  const [editais, setEditais] = useState<EditalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerandoProposta, setGerandoProposta] = useState<string | null>(null); // ID do edital sendo processado
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  // Redirecionar para login se não estiver logado
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
      return;
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    // Só carregar editais se estiver logado e não estiver carregando autenticação
    if (!authLoading && !profileLoading && user) {
      loadEditais();
    }
  }, [user, profile, profileLoading, authLoading]);

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

  // Função helper para verificar se um edital ainda está ativo
  // IMPORTANTE: Um edital é considerado ativo se QUALQUER um dos seguintes critérios for verdadeiro:
  // 1. Tem fase ativa na Timeline Estimada
  // 2. Status explícito é "Ativo" ou "Aberto"
  // 3. Não tem data_encerramento OU data_encerramento é no futuro
  // 4. Tem prazo_inscricao válido no futuro
  // 5. Não tem nenhuma informação de encerramento (assumir ativo por padrão)
  const isEditalAtivo = (edital: EditalDisplay): boolean => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Resetar horas para comparar apenas datas

    // Critério 1: Verificar status explícito primeiro (mais confiável)
    const statusLower = (edital.status || '').toLowerCase().trim();
    if (statusLower === 'ativo' || statusLower === 'aberto' || statusLower === 'aberta') {
      return true; // Status explícito indica ativo
    }
    if (statusLower === 'encerrado' || statusLower === 'finalizado' || statusLower === 'fechado') {
      // Mesmo com status encerrado, verificar se tem fase ativa na timeline
      // (pode ter sido encerrado mas ainda tem fase ativa)
    } else {
      // Se status não indica encerrado explicitamente, continuar verificando outros critérios
    }

    // Critério 2: Verificar Timeline Estimada
    // IMPORTANTE: Se tem timeline_estimada, ela é a fonte de verdade principal
    // Se nenhuma fase está ativa, o edital NÃO está ativo (a menos que outros critérios indiquem o contrário)
    if (edital.timeline_estimada && edital.timeline_estimada.fases && Array.isArray(edital.timeline_estimada.fases)) {
      const fasesValidas = edital.timeline_estimada.fases.filter((fase: any) => fase); // Filtrar fases nulas
      
      // Se não tem fases válidas, não considerar timeline
      if (fasesValidas.length === 0) {
        // Timeline vazia, continuar verificando outros critérios
      } else {
        // Verificar se alguma fase está ativa
        const temFaseAtiva = fasesValidas.some((fase: any) => {
          let statusCalculado = fase.status?.toLowerCase() || 'pendente';
          
          // Calcular status baseado nas datas
          if (fase.data_fim) {
            const dataFim = new Date(fase.data_fim);
            dataFim.setHours(23, 59, 59, 999);
            if (hoje > dataFim) {
              statusCalculado = 'fechado';
            } else if (fase.data_inicio) {
              const dataInicio = new Date(fase.data_inicio);
              dataInicio.setHours(0, 0, 0, 0);
              if (hoje >= dataInicio && hoje <= dataFim) {
                statusCalculado = 'aberto';
              } else if (hoje < dataInicio) {
                statusCalculado = 'pendente';
              }
            } else {
              if (hoje <= dataFim) {
                statusCalculado = 'aberto';
              }
            }
          } else if (fase.data_inicio) {
            const dataInicio = new Date(fase.data_inicio);
            dataInicio.setHours(0, 0, 0, 0);
            if (hoje >= dataInicio) {
              statusCalculado = 'aberto';
            } else {
              statusCalculado = 'pendente';
            }
          } else {
            // Fase sem datas válidas, considerar como pendente
            statusCalculado = 'pendente';
          }
          
          // Se a fase está aberta, o edital está ativo
          return statusCalculado === 'aberto' || statusCalculado === 'aberta';
        });
        
        if (temFaseAtiva) {
          return true; // Tem fase ativa na timeline, edital está ativo
        }
        
        // IMPORTANTE: Se tem timeline mas nenhuma fase está ativa, verificar se todas estão fechadas
        // Se todas as fases estão fechadas/encerradas, o edital está inativo
        const todasFasesFechadas = fasesValidas.every((fase: any) => {
          // Verificar status explícito primeiro
          const statusFase = fase.status?.toLowerCase() || '';
          if (statusFase === 'fechado' || statusFase === 'encerrado' || statusFase === 'finalizado') {
            return true; // Status explícito indica fechado
          }
          
          // Se não tem status explícito, verificar por data
          if (fase.data_fim) {
            const dataFim = new Date(fase.data_fim);
            dataFim.setHours(23, 59, 59, 999);
            return hoje > dataFim; // Data já passou = fechado
          }
          
          // Se não tem data_fim nem status explícito, não considerar como fechada
          return false;
        });
        
        if (todasFasesFechadas && fasesValidas.length > 0) {
          // Todas as fases da timeline estão fechadas, edital está inativo
          // A menos que tenha status explícito de ativo (pode ter sido reaberto)
          if (statusLower === 'ativo' || statusLower === 'aberto' || statusLower === 'aberta') {
            return true; // Status explícito indica ativo mesmo com timeline fechada
          }
          
          // Se não tem status explícito de ativo, está inativo
          // (não precisa verificar prazo aqui, pois se todas as fases estão fechadas, o edital está inativo)
          return false;
        }
        
        // Se chegou aqui, tem timeline mas nenhuma fase está ativa e nem todas estão fechadas
        // (pode ter fases pendentes sem datas ou fases futuras)
        // Continuar verificando outros critérios abaixo
      }
    }

    // Critério 3: Verificar data_encerramento
    // Se tem data_encerramento e já passou, verificar se não há outras indicações de atividade
    if (edital.data_encerramento) {
      const encerramento = new Date(edital.data_encerramento);
      encerramento.setHours(0, 0, 0, 0);
      if (encerramento < hoje) {
        // Data de encerramento passou, mas verificar se tem prazo_inscricao válido
        // (pode ter múltiplos prazos ou prorrogações)
      } else {
        // Data de encerramento ainda não chegou, edital está ativo
        return true;
      }
    }

    // Critério 4: Verificar prazo_inscricao (pode ter múltiplos prazos)
    if (edital.prazo_inscricao) {
      try {
        // Tentar parsear como JSON
        let parsed: any;
        if (typeof edital.prazo_inscricao === 'string' && edital.prazo_inscricao.trim().startsWith('{')) {
          parsed = JSON.parse(edital.prazo_inscricao);
        } else if (typeof edital.prazo_inscricao === 'object') {
          parsed = edital.prazo_inscricao;
        } else {
          // Se for string simples, tentar parsear como data
          const dataPrazo = new Date(edital.prazo_inscricao);
          if (!isNaN(dataPrazo.getTime())) {
            dataPrazo.setHours(0, 0, 0, 0);
            if (dataPrazo >= hoje) {
              return true; // Prazo ainda válido
            }
          }
          // Se não for data válida, continuar verificando outros critérios
        }

        // Se for objeto com array de prazos
        if (parsed.prazos && Array.isArray(parsed.prazos)) {
          // Verificar se pelo menos um prazo ainda está ativo
          const temPrazoAtivo = parsed.prazos.some((prazo: any) => {
            if (typeof prazo === 'string') {
              const dataPrazo = new Date(prazo);
              if (!isNaN(dataPrazo.getTime())) {
                dataPrazo.setHours(0, 0, 0, 0);
                return dataPrazo >= hoje;
              }
            } else if (prazo.fim) {
              const dataFim = new Date(prazo.fim);
              if (!isNaN(dataFim.getTime())) {
                dataFim.setHours(0, 0, 0, 0);
                return dataFim >= hoje;
              }
            }
            return false;
          });
          if (temPrazoAtivo) {
            return true; // Tem pelo menos um prazo ativo
          }
        }

        // Se for objeto com prazo único
        if (parsed.prazo) {
          const dataPrazo = new Date(parsed.prazo);
          if (!isNaN(dataPrazo.getTime())) {
            dataPrazo.setHours(0, 0, 0, 0);
            if (dataPrazo >= hoje) {
              return true; // Prazo ainda válido
            }
          }
        }

        if (parsed.fim) {
          const dataFim = new Date(parsed.fim);
          if (!isNaN(dataFim.getTime())) {
            dataFim.setHours(0, 0, 0, 0);
            if (dataFim >= hoje) {
              return true; // Prazo ainda válido
            }
          }
        }
      } catch (e) {
        // Se não conseguir parsear, continuar verificando outros critérios
        console.warn("Erro ao parsear prazo_inscricao:", e);
      }
    }

    // Critério 5: Verificação final - considerar múltiplos fatores
    // IMPORTANTE: Se tem timeline_estimada e nenhuma fase está ativa, verificar se todas estão fechadas
    // Se todas estão fechadas, considerar como inativo (a menos que tenha status explícito de ativo)
    
    // Verificar se tem timeline com todas as fases fechadas (verificação duplicada para garantir)
    let todasFasesFechadas = false;
    let temTimelineComFases = false;
    if (edital.timeline_estimada && edital.timeline_estimada.fases && Array.isArray(edital.timeline_estimada.fases)) {
      const fasesValidas = edital.timeline_estimada.fases.filter((fase: any) => fase);
      if (fasesValidas.length > 0) {
        temTimelineComFases = true;
        todasFasesFechadas = fasesValidas.every((fase: any) => {
          // Verificar status explícito primeiro
          const statusFase = fase.status?.toLowerCase() || '';
          if (statusFase === 'fechado' || statusFase === 'encerrado' || statusFase === 'finalizado') {
            return true; // Status explícito indica fechado
          }
          
          // Se não tem status explícito, verificar por data
          if (fase.data_fim) {
            const dataFim = new Date(fase.data_fim);
            dataFim.setHours(23, 59, 59, 999);
            return hoje > dataFim; // Data já passou = fechado
          }
          
          return false; // Se não tem data_fim nem status explícito, não considerar como fechada
        });
      }
    }
    
    // Se tem timeline e todas as fases estão fechadas, edital está inativo
    // (a menos que tenha status explícito de ativo)
    if (temTimelineComFases && todasFasesFechadas) {
      // Verificar se tem status explícito de ativo (pode ter sido reaberto)
      if (statusLower === 'ativo' || statusLower === 'aberto' || statusLower === 'aberta') {
        return true; // Status explícito indica ativo mesmo com timeline fechada
      }
      
      // Se não tem status explícito de ativo, está inativo
      return false; // Timeline fechada e sem status explícito de ativo = inativo
    }
    
    // Se tem timeline mas nenhuma fase está ativa e nem todas estão fechadas
    // (pode ter fases pendentes sem datas), considerar como inativo se não tiver outros critérios válidos
    if (temTimelineComFases && !todasFasesFechadas) {
      // Tem timeline mas nenhuma fase ativa e nem todas fechadas
      // Verificar outros critérios (status explícito ou prazo válido) antes de decidir
      // Se não tiver outros critérios válidos, será considerado inativo no final
    }
    
    // Se tem data_encerramento e já passou
    if (edital.data_encerramento) {
      const encerramento = new Date(edital.data_encerramento);
      encerramento.setHours(0, 0, 0, 0);
      
      if (encerramento < hoje) {
        // Data passou, mas verificar outros fatores antes de considerar inativo
        
        // Se status explícito é encerrado/finalizado, então está inativo
        if (statusLower === 'encerrado' || statusLower === 'finalizado' || statusLower === 'fechado') {
          return false; // Claramente encerrado
        }
        
        // Se tem timeline mas nenhuma fase está ativa, está inativo
        if (temTimelineComFases) {
          return false; // Timeline sem fases ativas e data passou = inativo
        }
        
        // Se não tem status explícito de encerrado e não tem timeline,
        // ainda pode estar ativo se tem prazo válido (já verificamos prazo acima)
        // Se chegou aqui sem prazo válido, está inativo
        return false;
      } else {
        // Data de encerramento ainda não chegou, edital está ativo
        return true;
      }
    }
    
    // Critério 6: Se não tem nenhuma informação de encerramento explícita, considerar como ativo
    // Por padrão, assumimos que um edital está ativo a menos que haja evidência clara de que está encerrado
    // Isso é importante porque muitos editais podem não ter todas as informações preenchidas
    // PRINCÍPIO: Melhor mostrar editais que podem estar ativos do que esconder editais que estão ativos
    
    // IMPORTANTE: Se tem timeline mas nenhuma fase está ativa, considerar como inativo
    // (a menos que tenha outros critérios válidos como status explícito ou prazo válido)
    if (temTimelineComFases) {
      // Tem timeline mas nenhuma fase está ativa
      // Se não tem status explícito de ativo e não tem prazo válido, está inativo
      // (já verificamos status e prazo acima, então se chegou aqui, está inativo)
      return false;
    }
    
    // Se chegou até aqui, não encontrou evidência clara de encerramento
    // Considerar como ativo (não tem timeline ou timeline está vazia)
    return true;
  };

  // Filtrar editais baseado no perfil do usuário e outros filtros
  const editaisFiltrados = editais.filter((edital) => {
    // Filtrar editais que já passaram da data de encerramento (a menos que mostrarInativos esteja ativo)
    if (!mostrarInativos && !isEditalAtivo(edital)) {
      return false;
    }

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
      
      // Se o usuário é tipo "ambos", aplicar filtro baseado no filtroTipoEdital
      if (userType === "ambos") {
        if (filtroTipoEdital === "pesquisadores") {
          // Mostrar apenas editais onde is_researcher === true
          if (edital.is_researcher === false) {
            return false;
          }
        } else if (filtroTipoEdital === "empresas") {
          // Mostrar apenas editais onde is_company === true
          if (edital.is_company === false) {
            return false;
          }
        }
        // Se filtroTipoEdital === "todos", não filtrar por tipo
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
    editaisAtivos: editaisFiltrados.length,
    emAnalise: editaisFiltrados.filter((e) => e.status === "em_analise").length,
    matchAlto: editaisFiltrados.filter((e) => e.match >= 90).length,
  };

  // Não renderizar se não estiver logado (está redirecionando)
  if (!authLoading && !user) {
    return null;
  }

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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
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
            {/* Filtro de tipo de edital - apenas para usuários tipo "ambos" */}
            {profile && !profileLoading && profile.userType === "ambos" && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  className="px-3 md:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
                  value={filtroTipoEdital}
                  onChange={(e) => setFiltroTipoEdital(e.target.value as "pesquisadores" | "empresas" | "todos")}
                >
                  <option value="todos">Todos os tipos</option>
                  <option value="pesquisadores">🔬 Pesquisadores</option>
                  <option value="empresas">🏢 Empresas</option>
                </select>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <Checkbox
                id="mostrar-inativos"
                checked={mostrarInativos}
                onCheckedChange={(checked) => setMostrarInativos(checked === true)}
              />
              <Label htmlFor="mostrar-inativos" className="text-sm text-gray-700 cursor-pointer">
                Mostrar editais inativos (com prazo encerrado)
              </Label>
            </div>
          </div>
          {profile && !profileLoading && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Target className="w-4 h-4 text-blue-600" />
                <span>
                  Mostrando editais para{" "}
                  <span className="font-semibold text-gray-900">
                    {profile.userType === "pesquisador" 
                      ? "pesquisadores" 
                      : profile.userType === "pessoa-empresa"
                      ? "empresas e público geral"
                      : filtroTipoEdital === "pesquisadores"
                      ? "pesquisadores"
                      : filtroTipoEdital === "empresas"
                      ? "empresas"
                      : "todos os tipos"}
                  </span>
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {profile.userType === "pesquisador"
                  ? "Editais direcionados para pesquisadores e iniciação científica são exibidos primeiro."
                  : profile.userType === "pessoa-empresa"
                  ? "Editais abertos para empresas, MEI, autônomos e público geral são exibidos primeiro."
                  : "Use o filtro acima para alternar entre editais para pesquisadores e empresas."}
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
                    {/* Badges de tipo de edital */}
                    {(() => {
                      const isResearcher = edital.is_researcher === true;
                      const isCompany = edital.is_company === true;
                      
                      if (isResearcher && isCompany) {
                        return (
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 flex-shrink-0">
                            <Users className="w-3 h-3 mr-1" />
                            Pesquisadores e Empresas
                          </Badge>
                        );
                      } else if (isResearcher) {
                        return (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0">
                            <GraduationCap className="w-3 h-3 mr-1" />
                            Pesquisadores
                          </Badge>
                        );
                      } else if (isCompany) {
                        return (
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 flex-shrink-0">
                            <Building2 className="w-3 h-3 mr-1" />
                            Empresas
                          </Badge>
                        );
                      }
                      return null;
                    })()}
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
                  <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-gray-600 mb-3 break-words">
                    {edital.orgao && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-gray-400" />
                        <span className="font-medium">{edital.orgao}</span>
                      </span>
                    )}
                    {edital.orgao && edital.pais && <span>•</span>}
                    {edital.pais && <span>{edital.pais}</span>}
                    {!edital.orgao && !edital.pais && <span className="text-gray-400">Órgão não informado</span>}
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
                    <div className="flex items-center gap-2 min-w-0 max-w-full">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600 break-words min-w-0 overflow-hidden" title={(() => {
                        const prazoFormatado = formatPrazoInscricao(edital.prazo_inscricao);
                        if (prazoFormatado.display !== 'Não informado') {
                          return `Prazo: ${prazoFormatado.display}`;
                        }
                        return `Prazo: ${edital.prazo}`;
                      })()}>
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
