import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  ArrowLeft, Search, Filter, Globe, TrendingUp, Calendar, 
  DollarSign, Target, CheckCircle2, Clock, AlertCircle,
  Send, Eye, Sparkles, BarChart3, User, Loader2,
  GraduationCap, Building2, Users, Share2, RefreshCw
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
  EditalWithScores,
  DatabaseEdital,
  formatPrazo,
  getPaisFromEdital,
  getStatusFromEdital,
  editalMatchesArea,
  AREA_FILTER_OPTIONS,
  calculateEditalScores,
} from "@/lib/editaisApi";
import { useEditaisList, useEditaisScores } from "@/hooks/useEditaisDashboard";
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
  const [filtroArea, setFiltroArea] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false); // Opção para mostrar editais inativos
  const [filtroMatchAlto, setFiltroMatchAlto] = useState(false); // Filtrar apenas editais com match >= 70%
  const [filtroTipoEdital, setFiltroTipoEdital] = useState<"pesquisadores" | "empresas" | "todos">("todos"); // Filtro para tipo (quando usuário é "ambos")
  const INCREMENTO_PAGINACAO = 5;
  const [visibleCount, setVisibleCount] = useState(15); // Paginação infinita: exibir 15 iniciais, depois +5 ao rolar
  const [gerandoProposta, setGerandoProposta] = useState<string | null>(null);
  const [forceRecalcScores, setForceRecalcScores] = useState(false);
  const [filtrosSheetOpen, setFiltrosSheetOpen] = useState(false);
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  // 1. Lista em cache (5 min) - carregamento rápido
  const editaisListQuery = useEditaisList(user?.id);
  const editaisRaw = editaisListQuery.data ?? [];

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
  }, [busca, filtroArea, filtroTipoEdital, mostrarInativos, filtroMatchAlto]);

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
  /** Extrai a data mais recente (prazo fim) de prazo_inscricao para comparar com hoje */
  const extrairDataMaisRecentePrazo = (prazo: string | null | undefined): Date | null => {
    if (!prazo || prazo === 'Não informado') return null;
    const normalizeMonth = (m: string): string => {
      return String(m || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    };

    const monthMap: Record<string, number> = {
      janeiro: 1, jan: 1,
      fevereiro: 2, fev: 2,
      marco: 3, mar: 3,
      abril: 4, abr: 4,
      maio: 5, mai: 5,
      junho: 6, jun: 6,
      julho: 7, jul: 7,
      agosto: 8, ago: 8,
      setembro: 9, set: 9,
      outubro: 10, out: 10,
      novembro: 11, nov: 11,
      dezembro: 12, dez: 12,
    };

    const parsePtMonthDateParts = (dayStr: string, monthStr: string, yearStr: string): Date | null => {
      const day = Number(dayStr);
      const year = Number(yearStr);
      const monthKey = normalizeMonth(monthStr);
      const month = monthMap[monthKey];
      if (!month || !day || !year) return null;
      const d = new Date(year, month - 1, day);
      return isNaN(d.getTime()) ? null : d;
    };

    // Parse somente quando a string é *apenas* uma data (evita pegar datas erradas dentro de textos/JSON)
    const parseDateOnly = (str: string): Date | null => {
      const s = String(str).trim();

      const isoOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoOnly) {
        const year = Number(isoOnly[1]);
        const month = Number(isoOnly[2]);
        const day = Number(isoOnly[3]);
        const d = new Date(year, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
      }

      const brOnly = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (brOnly) {
        const day = Number(brOnly[1]);
        const month = Number(brOnly[2]);
        const year = Number(brOnly[3]);
        const d = new Date(year, month - 1, day);
        return isNaN(d.getTime()) ? null : d;
      }

      // Ex.: "08 de outubro de 2025" ou "8 outubro 2025"
      const ptMonthOnly1 = s.match(/^(\d{1,2})\s+de\s+([a-zA-ZÀ-ÿçÇ]+)\s+de\s+(\d{4})$/i);
      if (ptMonthOnly1) {
        return parsePtMonthDateParts(ptMonthOnly1[1], ptMonthOnly1[2], ptMonthOnly1[3]);
      }
      const ptMonthOnly2 = s.match(/^(\d{1,2})\s+([a-zA-ZÀ-ÿçÇ]+)\s+(\d{4})$/i);
      if (ptMonthOnly2) {
        return parsePtMonthDateParts(ptMonthOnly2[1], ptMonthOnly2[2], ptMonthOnly2[3]);
      }

      // Tentar datas com hora (ISO completo), mas só quando parece um formato de data/hora.
      if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/i.test(s)) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      }

      return null;
    };

    /** Procura datas dentro de um texto (último recurso) */
    const extrairDatasDoTexto = (texto: string): Date[] => {
      const datas: Date[] = [];
      if (!texto) return datas;

      const t = String(texto);
      const matches: string[] = [];
      // ISO e BR numérico
      const basic = t.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/g);
      if (basic) matches.push(...basic);
      // Datas com mês por extenso (pt-BR)
      const ptMonthRegex = /\b(\d{1,2})\s+de\s+([a-zA-ZÀ-ÿçÇ]+)\s+de\s+(\d{4})\b|\b(\d{1,2})\s+([a-zA-ZÀ-ÿçÇ]+)\s+(\d{4})\b/gi;
      let m: RegExpExecArray | null;
      while ((m = ptMonthRegex.exec(t)) !== null) {
        // preferir a forma com "de"
        if (m[1] && m[2] && m[3]) {
          matches.push(`${m[1]} de ${m[2]} de ${m[3]}`);
        } else if (m[4] && m[5] && m[6]) {
          matches.push(`${m[4]} ${m[5]} ${m[6]}`);
        }
      }

      if (matches.length === 0) return datas;

      for (const m of matches) {
        const d = parseDateOnly(m);
        if (d) datas.push(d);
      }
      return datas;
    };
    try {
      let parsed: any;
      if (typeof prazo === 'string' && prazo.trim().startsWith('{')) {
        parsed = JSON.parse(prazo);
      } else if (typeof prazo === 'object') {
        parsed = prazo;
      } else {
        const quaisquer = extrairDatasDoTexto(String(prazo));
        const max = quaisquer.length ? Math.max(...quaisquer.map((x) => x.getTime()).filter((t) => !isNaN(t))) : NaN;
        return Number.isFinite(max) ? new Date(max) : null;
      }
      const datas: Date[] = [];
      if (parsed.prazos && Array.isArray(parsed.prazos)) {
        for (const p of parsed.prazos) {
          const str = typeof p === 'string' ? p : (p.fim || p.prazo);
          if (str) {
            const found = extrairDatasDoTexto(String(str));
            datas.push(...found);
          }
        }
      } else if (parsed.fim) {
        datas.push(...extrairDatasDoTexto(String(parsed.fim)));
      } else if (parsed.prazo) {
        datas.push(...extrairDatasDoTexto(String(parsed.prazo)));
      }
      if (datas.length === 0) {
        const texto = JSON.stringify(parsed);
        const quaisquer = extrairDatasDoTexto(texto);
        const max = quaisquer.length ? Math.max(...quaisquer.map((x) => x.getTime()).filter((t) => !isNaN(t))) : NaN;
        return Number.isFinite(max) ? new Date(max) : null;
      }
      return new Date(Math.max(...datas.map((d: Date) => d.getTime())));
    } catch {
      const str = String(prazo);
      const quaisquer = extrairDatasDoTexto(str);
      const max = quaisquer.length ? Math.max(...quaisquer.map((x) => x.getTime()).filter((t) => !isNaN(t))) : NaN;
      return Number.isFinite(max) ? new Date(max) : null;
    }
  };

  const normalizeText = (value: unknown): string => {
    return String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const formatDatePtBR = (date: Date): string => {
    try {
      return date.toLocaleDateString("pt-BR");
    } catch {
      return String(date);
    }
  };

  const getPrazoInscricaoSummary = (prazoInscricao: any): { date: Date | null; extraCount: number } => {
    if (!prazoInscricao || prazoInscricao === "Não informado") return { date: null, extraCount: 0 };

    // Tentar obter contagem de prazos quando vier como JSON
    let extraCount = 0;
    try {
      let parsed: any = prazoInscricao;
      if (typeof prazoInscricao === "string" && prazoInscricao.trim().startsWith("{")) {
        parsed = JSON.parse(prazoInscricao);
      }
      if (parsed?.prazos && Array.isArray(parsed.prazos) && parsed.prazos.length > 1) {
        extraCount = parsed.prazos.length - 1;
      }
    } catch {
      // ignore
    }

    const date = extrairDataMaisRecentePrazo(typeof prazoInscricao === "string" ? prazoInscricao : JSON.stringify(prazoInscricao));
    return { date: date && !isNaN(date.getTime()) ? date : null, extraCount };
  };

  /** Prioriza sempre a data de submissão (timeline_estimada). */
  const extrairDeadlineSubmissao = (timeline: any): Date | null => {
    if (!timeline) return null;

    let obj: any = timeline;
    if (typeof timeline === "string") {
      try {
        obj = JSON.parse(timeline);
      } catch {
        return null;
      }
    }

    const fases = obj?.fases;
    if (!Array.isArray(fases) || fases.length === 0) return null;

    const candidatos = fases.filter((fase: any) => {
      const nome = normalizeText(fase?.nome);
      return nome.includes("submiss"); // cobre "submissão", "submissao", "submissões"
    });

    if (candidatos.length === 0) return null;

    const deadlines: Date[] = [];

    const extractDeadlineFromText = (text: string): Date | null => {
      const t = String(text || "");
      const norm = normalizeText(t);

      // 1) Se existir "fim:" ou "fim" com uma data logo após, essa é a fonte de verdade
      const fimMatch = norm.match(/\bfim\b\s*:?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{4}|\d{1,2}\s+de\s+[a-zA-ZÀ-ÿçÇ]+\s+de\s+\d{4}|\d{1,2}\s+[a-zA-ZÀ-ÿçÇ]+\s+\d{4})/i);
      if (fimMatch?.[1]) {
        const d = extrairDataMaisRecentePrazo(fimMatch[1]);
        if (d && !isNaN(d.getTime())) return d;
      }

      // 2) "até <data>" geralmente representa o deadline
      const ateMatch = norm.match(/\bate\b\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{4}|\d{1,2}\s+de\s+[a-zA-ZÀ-ÿçÇ]+\s+de\s+\d{4}|\d{1,2}\s+[a-zA-ZÀ-ÿçÇ]+\s+\d{4})/i);
      if (ateMatch?.[1]) {
        const d = extrairDataMaisRecentePrazo(ateMatch[1]);
        if (d && !isNaN(d.getTime())) return d;
      }

      // 3) Intervalos: pegar a *segunda* data como deadline (ex.: "06/04/2026 a 17/04/2026" ou "05/04/2026 - 16/04/2026")
      const rangeBasic = t.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})\s*(?:-|a|até|to)\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i);
      if (rangeBasic?.[2]) {
        const d = extrairDataMaisRecentePrazo(rangeBasic[2]);
        if (d && !isNaN(d.getTime())) return d;
      }

      // 4) Último recurso: se houver apenas uma data, usar ela
      const d = extrairDataMaisRecentePrazo(t);
      if (d && !isNaN(d.getTime())) return d;
      return null;
    };

    for (const fase of candidatos) {
      // Preferir data_fim quando existir (deadline real)
      if (fase?.data_fim) {
        const parsedFim = extrairDataMaisRecentePrazo(String(fase.data_fim));
        if (parsedFim && !isNaN(parsedFim.getTime())) {
          deadlines.push(parsedFim);
          continue;
        }
      }

      // Fallback: extrair deadline de textos (prioriza "Fim:" / "Até" / 2ª data do intervalo)
      const rawText = [
        fase?.prazo,
        fase?.fim,
        fase?.nome,
        fase?.data_inicio,
        fase?.data_fim,
      ]
        .filter(Boolean)
        .map(String)
        .join(" | ");
      const extractedDeadline = extractDeadlineFromText(rawText);
      if (extractedDeadline && !isNaN(extractedDeadline.getTime())) deadlines.push(extractedDeadline);
    }

    if (deadlines.length === 0) return null;
    return new Date(Math.max(...deadlines.map((d) => d.getTime())));
  };

  // Regra principal: edital é "ativo" se ainda está dentro do prazo de submissão.
  // A data usada para filtrar deve ser a MESMA exibida no card (Prazo).
  const isEditalAtivo = (edital: DatabaseEdital): boolean => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

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
  const editaisComPais = editaisRaw.map((e) => ({ ...e, ...getPaisFromEdital(e) }));

  // Filtrar editais baseado no perfil do usuário e outros filtros
  const editaisFiltrados = editaisComPais.filter((edital) => {
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

    // Filtro de área (Tecnologia, Saúde, Agronegócio, etc.)
    const matchArea = editalMatchesArea(edital, filtroArea);

    return matchBusca && matchArea;
  });

  // Paginação: apenas os visíveis (scores calculados sob demanda)
  const visibleEditais = editaisFiltrados.slice(0, visibleCount);
  const scoresQuery = useEditaisScores(
    visibleEditais,
    user?.id,
    user ?? null,
    profile ?? null,
    forceRecalcScores
  );

  const recalcMutation = useMutation({
    mutationFn: async ({ edital }: { edital: DatabaseEdital }) => {
      if (!user?.id) throw new Error("Não logado");
      return calculateEditalScores(edital, user.id, user, profile ?? null, { forceRecalculate: true });
    },
    onSuccess: (scores, { edital }) => {
      const queryKey = ["editais-scores", user?.id, visibleEditais.map((e) => e.id).sort().join(","), forceRecalcScores];
      queryClient.setQueryData<EditalWithScores[]>(queryKey, (old) => {
        if (!old) return old;
        return old.map((e) =>
          e.id === edital.id ? { ...e, ...scores } : e
        );
      });
      toast.success("Probabilidade recalculada");
    },
    onError: () => {
      toast.error("Erro ao recalcular. Tente novamente.");
    },
  });
  const editaisComScores = scoresQuery.data ?? [];

  // Enquanto os scores carregam (n8n), mostrar placeholder com texto "Carregando probabilidade"
  const scoresLoading = scoresQuery.isLoading && editaisComScores.length === 0;
  const baseParaDisplay = editaisComScores.length > 0 ? editaisComScores : visibleEditais.map((e) => ({
    ...e,
    match: 50,
    probabilidade: 50,
    justificativa: null as string | null,
  }));

  const editais: EditalDisplay[] = baseParaDisplay.map((edital) => {
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
  const listLoading = editaisListQuery.isLoading && editaisRaw.length === 0;
  const listError = editaisListQuery.isError;
  const loading = listLoading && !listError;
  const hasMore = visibleCount < editaisFiltrados.length;

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !editaisFiltrados.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && hasMore && !scoresQuery.isLoading) {
          handleLoadMore();
        }
      },
      { rootMargin: "200px", threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, scoresQuery.isLoading, handleLoadMore, editaisFiltrados.length]);

  const editaisExibidos = filtroMatchAlto ? editais.filter((e) => e.match >= 70) : editais;

  const stats = {
    editaisAtivos: editaisFiltrados.length,
    emAnalise: editaisFiltrados.filter((e) => getStatusFromEdital(e) === "em_analise").length,
    matchAlto: editais.filter((e) => e.match >= 70).length,
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setForceRecalcScores(true);
              toast.info("Recalculando scores dos editais visíveis...");
            }}
            disabled={scoresQuery.isLoading || visibleEditais.length === 0}
            className="shrink-0"
          >
            {scoresQuery.isFetching && forceRecalcScores ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recalculando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Recalcular scores
              </>
            )}
          </Button>
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
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
            <p className="text-gray-700 text-center mb-4">Não foi possível carregar os editais. Verifique sua conexão e tente novamente.</p>
            <Button onClick={() => editaisListQuery.refetch()} variant="outline">
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
            <div className="text-3xl font-bold text-gray-900">{stats.matchAlto}</div>
            <div className="text-sm text-gray-600">Match acima de 70%</div>
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
                        checked={filtroMatchAlto}
                        onCheckedChange={(checked) => setFiltroMatchAlto(checked === true)}
                      />
                      <Label htmlFor="match-alto-mobile" className="text-sm text-gray-700 cursor-pointer">
                        Apenas match ≥ 70%
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
                  checked={filtroMatchAlto}
                  onCheckedChange={(checked) => setFiltroMatchAlto(checked === true)}
                />
                <Label htmlFor="match-alto" className="text-sm text-gray-700 cursor-pointer">
                  Apenas match ≥ 70%
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
          {editaisExibidos.map((edital) => (
            <div key={edital.id} className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer">
              <div className="flex flex-col md:flex-row items-start md:justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0 w-full">
                  {/* No mobile: título em linha própria para evitar compressão */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 mb-2">
                    <Link
                      href={`/edital/${edital.id}`}
                      className="order-1 w-full sm:w-auto sm:flex-1 sm:min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h3 className="text-base md:text-lg font-bold text-gray-900 break-words hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded">
                        {edital.titulo}
                      </h3>
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 order-2">
                      <span className="text-xl md:text-2xl flex-shrink-0">{edital.flag}</span>
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

                  <div className="flex flex-wrap items-center gap-3 md:gap-6 text-xs md:text-sm">
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
                      <div className="flex items-center gap-2 flex-shrink-0 group/item">
                        <Target className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 group-hover/item:scale-110 group-hover/item:text-purple-600" />
                        <span className="text-gray-600 break-words">{edital.area}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-3 w-full md:w-auto justify-between md:justify-start">
                  {/* Match / Probabilidade - carregando ou valores */}
                  <div className="text-center md:text-right">
                    {scoresLoading ? (
                      <>
                        <div className="flex items-center gap-2 mb-1 justify-center md:justify-end">
                          <Loader2 className="w-6 h-6 animate-spin text-blue-600 flex-shrink-0" aria-hidden />
                          <span className="text-sm font-medium text-gray-500">Carregando probabilidade</span>
                        </div>
                        <div className="text-xs text-gray-500">Match e aprovação</div>
                      </>
                    ) : (() => {
                      const isPlaceholder = edital.match === 50 || edital.probabilidade === 50 || (edital.justificativa == null || edital.justificativa === "");
                      const isRecalculating = recalcMutation.isPending && recalcMutation.variables?.edital.id === edital.id;
                      if (isPlaceholder) {
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              recalcMutation.mutate({ edital });
                            }}
                            disabled={isRecalculating}
                          >
                            {isRecalculating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Recalcular probabilidade
                          </Button>
                        );
                      }
                      return (
                        <>
                          <div className="flex items-center gap-2 mb-1 justify-center md:justify-end">
                            <div className="text-2xl md:text-3xl font-bold text-blue-600">{edital.match}%</div>
                            <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                          </div>
                          <div className="text-xs text-gray-600">Match</div>
                          <div className="text-xs text-violet-600 font-medium mt-0.5">{edital.probabilidade}% aprovação</div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 max-w-[140px] sm:max-w-[160px] md:max-w-[180px] break-words" title={edital.justificativa ?? ""}>
                            {edital.justificativa}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-4 border-t border-gray-200">
                <Button 
                  onClick={() => handleGerarProposta(edital.id)}
                  disabled={gerandoProposta === edital.id || !user}
                  className="w-full sm:flex-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
                >
                  {gerandoProposta === edital.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span className="hidden sm:inline">Gerando...</span>
                      <span className="sm:hidden">Gerando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                      <span className="hidden sm:inline">Gerar proposta com IA</span>
                      <span className="sm:hidden">Gerar proposta</span>
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => handleVerDetalhes(edital.id)} className="w-full sm:w-auto transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group">
                  <Eye className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                  <span className="hidden sm:inline">Ver detalhes</span>
                  <span className="sm:hidden">Detalhes</span>
                </Button>
              </div>
            </div>
          ))}
        </div>

            {/* Sentinel para paginação infinita: ao rolar até aqui, carrega mais 5 editais */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-6 min-h-[60px]" aria-hidden="true">
                {scoresQuery.isLoading && (
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-label="Carregando mais editais" />
                )}
              </div>
            )}

            {editaisExibidos.length === 0 && !loading && (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  {editaisRaw.length === 0
                    ? "Nenhum edital encontrado no banco de dados."
                    : filtroMatchAlto && editaisFiltrados.length > 0
                    ? "Nenhum edital com match ≥ 70%. Tente desmarcar o filtro \"Apenas match ≥ 70%\"."
                    : "Nenhum edital encontrado. Tente marcar \"Mostrar editais inativos\" ou ajustar os filtros."}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
