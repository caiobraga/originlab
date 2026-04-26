import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { 
  ArrowLeft, Search, Filter, Globe, TrendingUp, Calendar, 
  DollarSign, Target, Clock, AlertCircle,
  Send, Eye, Sparkles, BarChart3, User, Loader2,
  GraduationCap, Building2, Users, Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { UserProfile } from "@/lib/userProfile";
import Header from "@/components/Header";
import {
  DatabaseEdital,
  formatPrazo,
  getPaisFromEdital,
  getStatusFromEdital,
  editalMatchesArea,
  AREA_FILTER_OPTIONS,
} from "@/lib/editaisApi";
import { useEditaisList } from "@/hooks/useEditaisDashboard";
import { useEditaisIndicacoes } from "@/hooks/useEditaisIndicacoes";
import { formatValorProjeto, formatPrazoInscricao } from "@/lib/editalFormatters";
import {
  extrairDataMaisRecentePrazo,
  extrairDeadlineSubmissao,
  formatDatePtBR,
  getPrazoInscricaoSummary,
  normalizeText,
} from "@/lib/editalSubmissionDeadline";
import { gerarPropostaComIA } from "@/lib/propostasApi";

interface EditalDisplay extends DatabaseEdital {
  prazo: string;
  pais: string;
  flag: string;
  status: "novo" | "em_analise" | "submetido";
  elegivel: boolean;
}

export default function Dashboard() {
  const [filtroArea, setFiltroArea] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false); // Opção para mostrar editais inativos
  const [ignorarFiltroPerfil, setIgnorarFiltroPerfil] = useState(false); // Mostra editais mesmo com is_researcher/is_company incompatíveis
  const [filtroTipoEdital, setFiltroTipoEdital] = useState<"pesquisadores" | "empresas" | "todos">("todos"); // Filtro para tipo (quando usuário é "ambos")
  const [apenasIndicacoes, setApenasIndicacoes] = useState(false);
  const [ordenacao, setOrdenacao] = useState<"recentes" | "indicacoes">("indicacoes");
  const INCREMENTO_PAGINACAO = 5;
  const [visibleCount, setVisibleCount] = useState(15); // Paginação infinita: exibir 15 iniciais, depois +5 ao rolar
  const [gerandoProposta, setGerandoProposta] = useState<string | null>(null);
  const [filtrosSheetOpen, setFiltrosSheetOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();
  const indicacoesQuery = useEditaisIndicacoes(user?.id, { limit: 12, autoRefresh: true });
  const indicacoesMap = (() => {
    const m = new Map<string, { score: number; motivos: string[] }>();
    for (const item of indicacoesQuery.data ?? []) {
      if (item?.edital?.id) {
        m.set(item.edital.id, {
          score: Number(item.score) || 0,
          motivos: Array.isArray(item.motivos) ? item.motivos.filter(Boolean).map(String) : [],
        });
      }
    }
    return m;
  })();

  // 1. Lista em cache (5 min) - carregamento rápido
  const editaisListQuery = useEditaisList(user?.id);
  const editaisRaw = editaisListQuery.data ?? [];
  const editaisIndicadosRaw = (indicacoesQuery.data ?? [])
    .map((i) => i.edital)
    .filter(Boolean);
  // Importante:
  // - Quando "Apenas indicações" estiver ligado, a fonte da lista deve ser as próprias indicações.
  // - Quando estiver em "Todos", ainda assim precisamos garantir que as indicações apareçam no feed
  //   (mesmo que não estejam entre os ~120 mais recentes), então fazemos merge + dedupe por id.
  const editaisRawMerged = (() => {
    const out: any[] = [];
    const seen = new Set<string>();

    // 1) indicados primeiro (ordem do array já vem por score)
    for (const e of editaisIndicadosRaw as any[]) {
      const id = e?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(e);
    }

    // 2) depois o feed padrão (recentes)
    for (const e of editaisRaw as any[]) {
      const id = e?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(e);
    }

    return out;
  })();

  const editaisRawForList = apenasIndicacoes ? editaisIndicadosRaw : editaisRawMerged;

  // Redirecionar para login se não estiver logado
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/login");
      return;
    }
  }, [user, authLoading, setLocation]);

  // Primeiro acesso: redirecionar para onboarding se ainda não completou (usa perfil do banco)
  useEffect(() => {
    if (authLoading || !user || profileLoading) return;
    if (!profile?.onboardingCompleted) {
      setLocation("/onboarding?new=1");
    }
  }, [user, authLoading, profileLoading, profile?.onboardingCompleted, setLocation]);

  // Resetar paginação quando filtros mudarem
  useEffect(() => {
    setVisibleCount(15);
  }, [busca, filtroArea, filtroTipoEdital, mostrarInativos, ignorarFiltroPerfil, apenasIndicacoes, ordenacao]);

  // Paginação infinita: carregar mais 5 editais quando o sentinel entrar na tela
  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + INCREMENTO_PAGINACAO);
  }, []);

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
  // Regra principal: edital é "ativo" se ainda está dentro do prazo de submissão.
  // A data usada para filtrar deve ser a MESMA exibida no card (Prazo).
  const isEditalAtivo = (edital: DatabaseEdital): boolean => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // 0) Não esconder só porque `prazo_inscricao` está "Não informado".
    // Muitos editais ainda têm `data_encerramento` ou timeline válida; esconder aqui reduz demais a lista
    // e faz as indicações “sumirem” do feed.
    // (A validação real acontece nos passos abaixo, com fallbacks.)
    const prazoFormatado = formatPrazoInscricao(edital.prazo_inscricao);

    // 1) Submissão (timeline_estimada)
    const deadlineSubmissao = extrairDeadlineSubmissao(edital.timeline_estimada);
    if (deadlineSubmissao && !isNaN(deadlineSubmissao.getTime())) {
      const fimDoDia = new Date(deadlineSubmissao);
      fimDoDia.setHours(23, 59, 59, 999);
      return hoje.getTime() <= fimDoDia.getTime();
    }

    // 2) prazo_inscricao (quando não há timeline de submissão)
    const prazoSummary = getPrazoInscricaoSummary(edital.prazo_inscricao);
    if (prazoSummary.date) {
      const fimDoDia = new Date(prazoSummary.date);
      fimDoDia.setHours(23, 59, 59, 999);
      return hoje.getTime() <= fimDoDia.getTime();
    }

    // 3) data_encerramento (fallback)
    if (edital.data_encerramento) {
      const enc = new Date(edital.data_encerramento);
      if (!isNaN(enc.getTime())) {
      enc.setHours(23, 59, 59, 999);
        return hoje.getTime() <= enc.getTime();
      }
    }

    // 4) Sem datas parseáveis: não esconder o edital por default.
    // Só marcar como inativo quando o status explícito indica encerrado/finalizado.
    const statusLower = (edital.status || "").toLowerCase().trim();
    if (statusLower === "encerrado" || statusLower === "finalizado") return false;
    return true;
  };

  // Adicionar pais/flag para filtros (getPaisFromEdital)
  const editaisComPais = editaisRawForList.map((e) => ({ ...e, ...getPaisFromEdital(e) }));

  // Filtrar editais baseado no perfil do usuário e outros filtros
  const editaisFiltrados = editaisComPais.filter((edital) => {
    // Quando "Apenas indicações" estiver ligado, NÃO aplicar filtros "fortes".
    // A indicação já é a personalização — então não deve ser cortada por ativo/inativo nem pelo tipo do perfil.
    if (!apenasIndicacoes) {
      // Filtrar editais que já passaram da data de encerramento (a menos que mostrarInativos esteja ativo)
      if (!mostrarInativos && !isEditalAtivo(edital)) {
        return false;
      }

      // Filtro baseado no perfil do usuário (is_researcher ou is_company) — pode ocultar centenas de linhas
      if (!ignorarFiltroPerfil && profile && !profileLoading) {
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
    }

    // Filtro de busca
    const buscaL = busca.toLowerCase();
    const matchBusca =
      (edital.titulo || "").toLowerCase().includes(buscaL) ||
      (edital.orgao?.toLowerCase() || "").includes(buscaL) ||
      (edital.area?.toLowerCase() || "").includes(buscaL) ||
      (edital.descricao?.toLowerCase() || "").includes(buscaL);

    // Filtro de área (Tecnologia, Saúde, Agronegócio, etc.)
    const matchArea = editalMatchesArea(edital, filtroArea);

    const matchIndicacoes = !apenasIndicacoes || indicacoesMap.has(edital.id);

    return matchBusca && matchArea && matchIndicacoes;
  });

  const editaisFiltradosOrdenados = (() => {
    const list = [...editaisFiltrados];

    // Quando estiver filtrando apenas indicações, a ordem sempre prioriza score.
    if (apenasIndicacoes) {
      return list.sort((a, b) => {
        const sa = indicacoesMap.get(a.id)?.score ?? 0;
        const sb = indicacoesMap.get(b.id)?.score ?? 0;
        if (sb !== sa) return sb - sa;
        const da = a.data_encerramento ? new Date(a.data_encerramento).getTime() : Number.POSITIVE_INFINITY;
        const db = b.data_encerramento ? new Date(b.data_encerramento).getTime() : Number.POSITIVE_INFINITY;
        return da - db;
      });
    }

    if (ordenacao === "indicacoes") {
      // “Inteligência” aplicada na lista: indicados primeiro, depois por score.
      return list.sort((a, b) => {
        const ia = indicacoesMap.has(a.id);
        const ib = indicacoesMap.has(b.id);
        if (ia !== ib) return ia ? -1 : 1;
        const sa = indicacoesMap.get(a.id)?.score ?? 0;
        const sb = indicacoesMap.get(b.id)?.score ?? 0;
        if (sb !== sa) return sb - sa;
        return 0;
      });
    }

    // “Recentes”: mantém a ordem padrão que já veio do backend (criado_em desc)
    return editaisFiltrados;
  })();

  // Paginação: apenas os visíveis (scores calculados sob demanda)
  const visibleEditais = editaisFiltradosOrdenados.slice(0, visibleCount);
  const editais: EditalDisplay[] = visibleEditais.map((edital) => {
    const { pais, flag } = getPaisFromEdital(edital);
    const status = getStatusFromEdital(edital);
    const prazo = formatPrazo(edital.data_encerramento);
    return {
      ...edital,
      prazo,
      pais,
      flag,
      status,
      elegivel: true,
    };
  });

  // Mostrar loading só na primeira carga; se der erro, não travar em loading e mostrar retry
  const listLoading = apenasIndicacoes
    ? indicacoesQuery.isLoading && editaisIndicadosRaw.length === 0
    : editaisListQuery.isLoading && editaisRaw.length === 0;
  const listError = editaisListQuery.isError;
  const loading = listLoading && !listError;
  const hasMore = visibleCount < editaisFiltradosOrdenados.length;

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !editaisFiltradosOrdenados.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && hasMore) {
          handleLoadMore();
        }
      },
      { rootMargin: "200px", threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, handleLoadMore, editaisFiltradosOrdenados.length]);

  const stats = {
    editaisAtivos: editaisFiltrados.length,
    emAnalise: editaisFiltrados.filter((e) => getStatusFromEdital(e) === "em_analise").length,
    indicacoes: (indicacoesQuery.data ?? []).length,
  };

  // Não renderizar se não estiver logado (está redirecionando)
  if (!authLoading && !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main id="main-content" className="container py-8">
        {/* Page Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Meu Painel</h1>
            <p className="text-sm md:text-base text-gray-700">Oportunidades globais de fomento</p>
          </div>
        </div>

        {/* Referral Banner */}
        <Link href="/referencia" className="block mb-6">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-4 text-white hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-sm hover:shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold">Indique e Ganhe R$ 50</p>
                  <p className="text-sm text-green-100">Compartilhe seu link exclusivo e ganhe créditos por cada amigo que se cadastrar</p>
                </div>
              </div>
              <span className="text-sm font-medium underline underline-offset-2 sm:no-underline">
                Ver meu link →
              </span>
            </div>
          </div>
        </Link>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Carregando editais...</span>
          </div>
        ) : listError && editaisRaw.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4 max-w-lg mx-auto">
            <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
            <p className="text-gray-700 text-center mb-2">Não foi possível carregar os editais a partir de editais_corretos.</p>
            {editaisListQuery.error && (
              <p className="text-xs text-gray-500 break-words w-full text-center mb-4 font-mono">
                {(editaisListQuery.error as Error).message}
              </p>
            )}
            <p className="text-sm text-gray-600 text-center mb-4">
              Erros comuns: RLS (sem policy de leitura para o anon) ou tabela/URL de outro projeto no .env.
            </p>
            <Button onClick={() => void editaisListQuery.refetch()} variant="outline">
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-5 h-5 text-blue-600 transition-transform duration-200 hover:scale-110" />
              <TrendingUp className="w-4 h-4 text-green-600 transition-transform duration-200 hover:scale-110" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.editaisAtivos}</div>
            <div className="text-sm text-gray-600">Editais disponíveis</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200">
            <div className="flex items-center justify-between mb-2">
              <Sparkles className="w-5 h-5 text-violet-600 transition-transform duration-200 hover:scale-110" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.indicacoes}</div>
            <div className="text-sm text-gray-600">Indicações para você</div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-5 h-5 text-orange-600 transition-transform duration-200 hover:scale-110" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.emAnalise}</div>
            <div className="text-sm text-gray-600">Em análise</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200 mb-6 hover:shadow-md transition-shadow duration-200">
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
            {/* Mobile: botão Filtros que abre Sheet de baixo para cima */}
            <div className="md:hidden">
              <Sheet open={filtrosSheetOpen} onOpenChange={setFiltrosSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full justify-center gap-2">
                    <Filter className="w-5 h-5" />
                    Filtros
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl">
                  <SheetHeader>
                    <SheetTitle>Filtros</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-6 py-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Ordenação</Label>
                      <select
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 hover:border-gray-400 cursor-pointer bg-white"
                        value={ordenacao}
                        onChange={(e) => setOrdenacao(e.target.value as "recentes" | "indicacoes")}
                      >
                        <option value="indicacoes">Ordenar por recomendações</option>
                        <option value="recentes">Ordenar por recentes</option>
                      </select>
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-center gap-2"
                          onClick={() => indicacoesQuery.refetch()}
                          disabled={indicacoesQuery.isFetching}
                        >
                          {indicacoesQuery.isFetching ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Atualizando
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 text-violet-600" />
                              Atualizar indicações
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    {profile && !profileLoading && profile.userType === "ambos" && (
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">Tipo</Label>
                        <div className="flex flex-col gap-1">
                          {[
                            { value: "todos" as const, label: "Todos os tipos" },
                            { value: "pesquisadores" as const, label: "🔬 Pesquisadores" },
                            { value: "empresas" as const, label: "🏢 Empresas" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => { setFiltroTipoEdital(opt.value); }}
                              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                                filtroTipoEdital === opt.value ? "bg-blue-50 text-blue-700 border-2 border-blue-200" : "bg-gray-50 text-gray-700 border-2 border-transparent hover:bg-gray-100"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Área</Label>
                      <div className="flex flex-col gap-1">
                        {AREA_FILTER_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => { setFiltroArea(opt.value); }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                              filtroArea === opt.value ? "bg-blue-50 text-blue-700 border-2 border-blue-200" : "bg-gray-50 text-gray-700 border-2 border-transparent hover:bg-gray-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Checkbox
                        id="mostrar-inativos-mobile"
                        checked={mostrarInativos}
                        onCheckedChange={(checked) => setMostrarInativos(checked === true)}
                      />
                      <Label htmlFor="mostrar-inativos-mobile" className="text-sm text-gray-700 cursor-pointer">
                        Mostrar editais inativos (com prazo encerrado)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="match-alto-mobile"
                        checked={apenasIndicacoes}
                        onCheckedChange={(checked) => setApenasIndicacoes(checked === true)}
                      />
                      <Label htmlFor="match-alto-mobile" className="text-sm text-gray-700 cursor-pointer">
                        Apenas indicações
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="ignorar-perfil-mobile"
                        checked={ignorarFiltroPerfil}
                        onCheckedChange={(checked) => setIgnorarFiltroPerfil(checked === true)}
                      />
                      <Label htmlFor="ignorar-perfil-mobile" className="text-sm text-gray-700 cursor-pointer">
                        Incluir editais fora do meu perfil (pesquisador/empresa)
                      </Label>
                    </div>
                    <Button className="w-full" onClick={() => setFiltrosSheetOpen(false)}>
                      Aplicar filtros
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            {/* Desktop: selects inline */}
            <div className="hidden md:flex items-center gap-2 flex-shrink-0 flex-wrap">
              <Filter className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <select
                className="px-3 md:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 hover:border-gray-400 cursor-pointer"
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as "recentes" | "indicacoes")}
              >
                <option value="indicacoes">Ordenar por recomendações</option>
                <option value="recentes">Ordenar por recentes</option>
              </select>
              {profile && !profileLoading && profile.userType === "ambos" && (
                <select
                  className="px-3 md:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 hover:border-gray-400 cursor-pointer"
                  value={filtroTipoEdital}
                  onChange={(e) => setFiltroTipoEdital(e.target.value as "pesquisadores" | "empresas" | "todos")}
                >
                  <option value="todos">Todos os tipos</option>
                  <option value="pesquisadores">🔬 Pesquisadores</option>
                  <option value="empresas">🏢 Empresas</option>
                </select>
              )}
              <select
                className="px-3 md:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 hover:border-gray-400 cursor-pointer"
                value={filtroArea}
                onChange={(e) => setFiltroArea(e.target.value)}
              >
                {AREA_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => indicacoesQuery.refetch()}
                disabled={indicacoesQuery.isFetching}
                className="gap-2"
              >
                {indicacoesQuery.isFetching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Atualizando
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-violet-600" />
                    Atualizar indicações
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap items-center gap-4">
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
              <div className="flex items-center gap-2">
                <Checkbox
                  id="match-alto"
                  checked={apenasIndicacoes}
                  onCheckedChange={(checked) => setApenasIndicacoes(checked === true)}
                />
                <Label htmlFor="match-alto" className="text-sm text-gray-700 cursor-pointer">
                  Apenas indicações
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ignorar-perfil"
                  checked={ignorarFiltroPerfil}
                  onCheckedChange={(checked) => setIgnorarFiltroPerfil(checked === true)}
                />
                <Label htmlFor="ignorar-perfil" className="text-sm text-gray-700 cursor-pointer">
                  Incluir editais fora do meu perfil
                </Label>
              </div>
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
          {editais.map((edital) => {
            const indicacao = indicacoesMap.get(edital.id);
            const isIndicado = indicacao != null;
            return (
              <Link
                key={edital.id}
                href={`/edital/${edital.id}`}
                className={`block rounded-xl p-4 md:p-6 shadow-sm border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 hover:shadow-md ${
                  isIndicado
                    ? "bg-gradient-to-br from-violet-50 via-white to-blue-50 border-violet-200 hover:border-violet-300"
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
              <div className="flex flex-col md:flex-row items-start md:justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0 w-full">
                  {/* No mobile: título em linha própria para evitar compressão */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 mb-2">
                    <h3 className="order-1 w-full sm:w-auto sm:flex-1 sm:min-w-0 text-base md:text-lg font-bold text-gray-900 break-words hover:text-blue-700">
                      {edital.titulo}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 order-2">
                      {isIndicado && (
                        <Badge className="bg-violet-600 text-white flex-shrink-0">
                          <Sparkles className="w-3 h-3 mr-1" />
                          {indicacao?.score ?? 0}/100
                        </Badge>
                      )}
                      {/* Badges de tipo de edital com separadores visuais */}
                    {(() => {
                      const isResearcher = edital.is_researcher === true;
                      const isCompany = edital.is_company === true;
                      const badges: React.ReactNode[] = [];
                      
                      // Badge de tipo de edital
                      if (isResearcher && isCompany) {
                        badges.push(
                          <Badge key="type" variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 flex-shrink-0">
                            <Users className="w-3 h-3 mr-1" />
                            Pesquisadores e Empresas
                          </Badge>
                        );
                      } else if (isResearcher) {
                        badges.push(
                          <Badge key="type" variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0">
                            <GraduationCap className="w-3 h-3 mr-1" />
                            Pesquisadores
                          </Badge>
                        );
                      } else if (isCompany) {
                        badges.push(
                          <Badge key="type" variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 flex-shrink-0">
                            <Building2 className="w-3 h-3 mr-1" />
                            Empresas
                          </Badge>
                        );
                      }
                      
                      // Badge de status
                      if (edital.status === "novo") {
                        badges.push(
                          <Badge key="status-novo" variant="outline" className="bg-green-50 text-green-700 border-green-200 flex-shrink-0">
                            Novo
                          </Badge>
                        );
                      }
                      if (edital.status === "em_analise") {
                        badges.push(
                          <Badge key="status-analise" variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0">
                            Em análise
                          </Badge>
                        );
                      }
                      
                      // Renderizar badges com separadores visuais
                      if (badges.length === 0) {
                        return null;
                      }
                      
                      return badges.map((badge, index) => (
                        <React.Fragment key={index}>
                          {index > 0 && (
                            <span 
                              className="text-gray-300 dark:text-gray-600 mx-1.5 text-sm font-medium select-none" 
                              aria-hidden="true"
                              role="separator"
                            >
                              •
                            </span>
                          )}
                          {badge}
                        </React.Fragment>
                      ));
                    })()}
                    </div>
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

                  {isIndicado && (indicacao?.motivos?.length ?? 0) > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {indicacao!.motivos.slice(0, 4).map((m, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 md:gap-6 text-xs md:text-sm min-w-0">
                    {(() => {
                      const valorFormatado = formatValorProjeto(edital.valor_projeto || edital.valor);
                      if (valorFormatado.display !== 'Não informado') {
                        return (
                          <div className="flex items-center gap-2 flex-shrink-0 group/item">
                            <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 group-hover/item:scale-110 group-hover/item:text-green-600" />
                            <span className="font-semibold text-gray-900 break-words">{valorFormatado.display}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="flex items-center gap-2 min-w-0 max-w-full group/item">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 group-hover/item:scale-110 group-hover/item:text-blue-600" />
                      <span className="text-gray-600 break-words min-w-0 overflow-hidden" title={(() => {
                        const deadlineSubmissao = extrairDeadlineSubmissao(edital.timeline_estimada);
                        if (deadlineSubmissao && !isNaN(deadlineSubmissao.getTime())) {
                          return `Prazo (submissão): Até ${formatDatePtBR(deadlineSubmissao)}`;
                        }
                        const prazoSummary = getPrazoInscricaoSummary(edital.prazo_inscricao);
                        if (prazoSummary.date) {
                          return `Prazo: Até ${formatDatePtBR(prazoSummary.date)}${prazoSummary.extraCount ? ` (+${prazoSummary.extraCount} mais)` : ""}`;
                        }
                        const prazoFormatado = formatPrazoInscricao(edital.prazo_inscricao);
                        if (prazoFormatado.display !== "Não informado") return `Prazo: ${prazoFormatado.display}`;
                        return `Prazo: ${edital.prazo}`;
                      })()}>
                        {(() => {
                          const deadlineSubmissao = extrairDeadlineSubmissao(edital.timeline_estimada);
                          if (deadlineSubmissao && !isNaN(deadlineSubmissao.getTime())) {
                            return `Prazo: Até ${formatDatePtBR(deadlineSubmissao)}`;
                          }
                          const prazoSummary = getPrazoInscricaoSummary(edital.prazo_inscricao);
                          if (prazoSummary.date) {
                            return `Prazo: Até ${formatDatePtBR(prazoSummary.date)}${prazoSummary.extraCount ? ` (+${prazoSummary.extraCount} mais)` : ""}`;
                          }
                          const prazoFormatado = formatPrazoInscricao(edital.prazo_inscricao);
                          if (prazoFormatado.display !== "Não informado") return `Prazo: ${prazoFormatado.display}`;
                          return `Prazo: ${edital.prazo}`;
                        })()}
                      </span>
                    </div>
                    {edital.area && (
                      <div className="flex items-start gap-2 min-w-0 max-w-full w-full md:w-auto group/item">
                        <Target className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 group-hover/item:scale-110 group-hover/item:text-purple-600" />
                        <span className="text-gray-600 break-words min-w-0 overflow-hidden line-clamp-2" title={edital.area}>
                          {edital.area}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-3 w-full md:w-auto justify-between md:justify-start">
                  <div className="text-center md:text-right">
                    {isIndicado && (
                      <div className="text-xs text-violet-700 font-medium">Indicação para você</div>
                    )}
                  </div>
                </div>
              </div>
              </Link>
            );
          })}
        </div>

            {/* Sentinel para paginação infinita: ao rolar até aqui, carrega mais 5 editais */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-6 min-h-[60px]" aria-hidden="true">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-label="Carregando mais editais" />
              </div>
            )}

            {editais.length === 0 && !loading && !listError && (
              <div className="text-center py-12 max-w-2xl mx-auto px-2">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                {editaisRawForList.length === 0 ? (
                  <>
                    <p className="text-gray-800 font-medium mb-2">Nada para exibir na lista (fonte vazia).</p>
                    <p className="text-sm text-gray-600 mb-3">
                      O feed lê <code className="text-xs bg-gray-100 px-1 rounded">editais_corretos</code> (até 250
                      itens) e, se houver, mescla com indicações. A opção &quot;Mostrar inativos&quot; só muda o filtro de
                      prazo; não cria linhas. Com &quot;Apenas indicações&quot; e sem indicações em{" "}
                      <code className="text-xs bg-gray-100 px-1">edital_indicacoes</code>, a fonte fica vazia — desative.
                      Se no SQL do Supabase há linhas e aqui 0, confira o mesmo projeto em <code className="text-xs bg-gray-100 px-1">.env</code> e execute no banco
                      a migration <code className="text-xs bg-gray-100 px-1">scripts/db/migration-editais-corretos-rls-public-read.sql</code> (policy de
                      <code>SELECT</code> para <code>anon</code>).
                    </p>
                    {apenasIndicacoes && editaisIndicadosRaw.length === 0 && editaisRaw.length > 0 && (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 mb-3 text-left">
                        Há {editaisRaw.length} edital(is) no banco, mas &quot;Apenas indicações&quot; está ativo e você não
                        possui indicações carregadas. Desmarque a opção para ver o feed completo.
                      </p>
                    )}
                    <Button type="button" variant="outline" onClick={() => void editaisListQuery.refetch()}>
                      Recarregar lista
                    </Button>
                  </>
                ) : editaisFiltrados.length === 0 && editaisRawForList.length > 0 ? (
                  <div className="text-left text-sm text-gray-600 space-y-2">
                    <p>
                      <span className="font-medium text-gray-800">
                        {editaisRawForList.length} edital(is) na lista
                      </span>{" "}
                      antes do filtro{indicacoesMap.size > 0 ? ` (inclui itens com indicação no merge)` : ""}, mas{" "}
                      <span className="font-medium">0</span> após os filtros atuais. &quot;Mostrar inativos&quot; só tira a
                      regra de prazo; não desliga filtro de perfil nem &quot;Apenas indicações&quot;.
                    </p>
                    <p className="list-disc pl-5 space-y-1">
                      {apenasIndicacoes && (
                        <li>
                          Desative &quot;Apenas indicações&quot; se quiser o catálogo inteiro, ou clique em &quot;Atualizar
                          indicações&quot;.
                        </li>
                      )}
                      {filtroArea !== "todos" && (
                        <li>Área: está em &quot;{AREA_FILTER_OPTIONS.find((o) => o.value === filtroArea)?.label}&quot; — use &quot;Todas as áreas&quot;.</li>
                      )}
                      {busca.trim() !== "" && <li>Remova o texto da busca.</li>}
                      {!apenasIndicacoes && !ignorarFiltroPerfil && profile && (
                        <li>
                          Perfil ({profile.userType}): editais com <code>is_researcher</code> ou <code>is_company</code>{" "}
                          <span className="font-medium">false</span> (explícito) somem. Marque &quot;Incluir editais fora do meu
                          perfil&quot;.
                        </li>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center pt-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setFiltroArea("todos")}>
                        Área: todas
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setBusca("")}>
                        Limpar busca
                      </Button>
                      {apenasIndicacoes && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => setApenasIndicacoes(false)}>
                          Desligar: só indicações
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => setIgnorarFiltroPerfil(true)}
                        disabled={ignorarFiltroPerfil}
                      >
                        Incluir fora do perfil
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600">Nenhum edital a exibir. Ajuste os filtros acima.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
