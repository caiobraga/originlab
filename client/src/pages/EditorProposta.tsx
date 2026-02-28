import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  List,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { generateFieldText } from "@/lib/generateFieldTextApi";
import {
  fetchPropostaById,
  updateProposta,
  type Proposta,
  type StatusProposta,
} from "@/lib/propostasApi";
import { useAuth } from "@/contexts/AuthContext";
import FormularioProposta from "@/components/FormularioProposta";
import FormularioCNPq from "@/components/FormularioCNPq";
import { type PropostaFormData, createEmptyPropostaForm } from "@/lib/propostaFormFields";
import { type CNPqFormData, createEmptyCNPqForm } from "@/lib/cnpqFormFields";


export default function EditorProposta() {
  const params = useParams();
  const propostaId = params.id || "";
  const { user } = useAuth();

  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refazendoResumo, setRefazendoResumo] = useState(false);
  const [campos, setCampos] = useState<PropostaFormData | CNPqFormData>(createEmptyPropostaForm());
  const [isCNPq, setIsCNPq] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const camposRef = useRef<PropostaFormData | CNPqFormData>(createEmptyPropostaForm());
  const scrollPositionKey = `scroll_${propostaId}`;
  const [scrollRestored, setScrollRestored] = useState(false);
  const latestScrollYRef = useRef(0);
  const isRestoringScrollRef = useRef(false);
  const restoreRunIdRef = useRef(0);
  const [activeSection, setActiveSection] = useState<string>("");
  const statusPanelStorageKey = "editor_proposta_status_panel_collapsed";
  const [statusPanelCollapsed, setStatusPanelCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(statusPanelStorageKey);
      if (stored === null) return true;
      return stored === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(statusPanelStorageKey, statusPanelCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [statusPanelCollapsed]);

  useEffect(() => {
    async function loadProposta() {
      if (!propostaId || !user) return;

      try {
        setLoading(true);
        const data = await fetchPropostaById(propostaId, user.id);

        if (!data) {
          toast.error("Proposta não encontrada");
          return;
        }

        setProposta(data);
        
        // Verificar se é edital do CNPq
        // A fonte pode vir diretamente do join ou do objeto editais
        const editalFonte = (data as any).edital_fonte || 
                           ((data as any).editais && typeof (data as any).editais === 'object' && !Array.isArray((data as any).editais) 
                             ? (data as any).editais.fonte 
                             : null);
        const isCNPqEdital = editalFonte?.toLowerCase() === 'cnpq';
        setIsCNPq(isCNPqEdital);
        
        console.log('Fonte do edital:', editalFonte, 'É CNPq?', isCNPqEdital);
        
        // Garantir que os campos tenham a estrutura correta
        const camposFormulario = data.campos_formulario || {};
        
        if (isCNPqEdital) {
          // Usar estrutura CNPq
          const camposCompletos = {
            ...createEmptyCNPqForm(),
            ...camposFormulario,
          };
          setCampos(camposCompletos as CNPqFormData);
          camposRef.current = camposCompletos as CNPqFormData;
        } else {
          // Usar estrutura padrão
          const camposCompletos = {
            ...createEmptyPropostaForm(),
            ...camposFormulario,
          };
          setCampos(camposCompletos as PropostaFormData);
          camposRef.current = camposCompletos as PropostaFormData;
        }
      } catch (error) {
        console.error("Erro ao carregar proposta:", error);
        toast.error("Erro ao carregar proposta");
      } finally {
        setLoading(false);
      }
    }

    loadProposta();
  }, [propostaId, user]);

  const handleFormChange = (newData: PropostaFormData | CNPqFormData) => {
    setCampos(newData);
    camposRef.current = newData;
    hasUnsavedChangesRef.current = true;
    
    // Auto-save com debounce de 2 segundos
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (hasUnsavedChangesRef.current && proposta && user) {
        handleSave();
      }
    }, 2000);
  };

  const handleRefazerResumoProjeto = useCallback(async () => {
    if (!propostaId) return;
    if (!proposta) return;
    if (refazendoResumo) return;

    setRefazendoResumo(true);
    try {
      const isC = isCNPq;
      const fieldId = isC ? "resumo_proposta" : "resumo_publicavel";
      const fieldName = isC ? "Resumo da Proposta" : "3.1. Resumo (Publicável pela FAPES)";
      const fieldDescription = isC
        ? "Refaça do zero o resumo da proposta para submissão ao CNPq, usando o contexto do edital e do documento."
        : "Refaça do zero o resumo do projeto que será publicado, usando o contexto do edital e do documento. Deve conter objetivo geral, caminho percorrido e resultados esperados.";

      const generated = await generateFieldText({
        proposta_id: propostaId,
        field_id: fieldId,
        field_name: fieldName,
        field_description: fieldDescription,
        word_limit: isC ? null : 500,
        char_limit: isC ? 2000 : null,
        form_data: camposRef.current,
        target_language: "pt",
      });

      if (!generated) {
        toast.error("A IA não retornou texto para o resumo.");
        return;
      }

      if (isC) {
        const next = {
          ...(camposRef.current as any),
          resumo: {
            ...((camposRef.current as any)?.resumo || {}),
            resumo_proposta: generated,
          },
        };
        handleFormChange(next);
        scrollToSection("secao-resumo");
      } else {
        const next = {
          ...(camposRef.current as any),
          detalhamento_projeto: {
            ...((camposRef.current as any)?.detalhamento_projeto || {}),
            resumo_publicavel: generated,
          },
        };
        handleFormChange(next);
        scrollToSection("secao-detalhamento-projeto");
      }

      toast.success("Resumo refeito do zero!");
    } catch (error: any) {
      console.error("Erro ao refazer resumo:", error);
      toast.error(error?.message || "Erro ao refazer resumo. Tente novamente.");
    } finally {
      setRefazendoResumo(false);
    }
  }, [propostaId, proposta, isCNPq, refazendoResumo]);

  const handleSave = useCallback(async () => {
    if (!proposta || !user) return;

    try {
      setSaving(true);
      // Preservar posição do scroll durante o save (evita “voltar pro topo” em re-render)
      const yBeforeSave = latestScrollYRef.current || window.scrollY;
      try {
        sessionStorage.setItem(scrollPositionKey, yBeforeSave.toString());
      } catch {
        // ignore
      }

      // Calcular progresso baseado em campos preenchidos
      // Função recursiva para verificar se um campo está preenchido
      const isFieldFilled = (value: any): boolean => {
        if (value === null || value === undefined) return false;
        if (typeof value === "string") return value.trim().length > 0;
        if (typeof value === "boolean") return value === true;
        if (typeof value === "number") return value > 0;
        if (Array.isArray(value)) {
          // Arrays devem ter pelo menos um elemento válido
          if (value.length === 0) return false;
          return value.some(item => {
            if (typeof item === "string") return item.trim().length > 0;
            if (typeof item === "number") return item > 0;
            if (typeof item === "boolean") return item === true;
            if (typeof item === "object" && item !== null) {
              // Para objetos em arrays, verificar se pelo menos um campo está preenchido
              return Object.values(item).some(v => isFieldFilled(v));
            }
            return isFieldFilled(item);
          });
        }
        if (typeof value === "object") {
          // Para objetos, verificar se pelo menos um campo está preenchido
          return Object.values(value).some(v => isFieldFilled(v));
        }
        return false;
      };

      // Contar campos recursivamente, comparando estrutura vazia vs preenchida
      const countFields = (obj: any, baseObj: any): { total: number; filled: number } => {
        let total = 0;
        let filled = 0;

        if (typeof obj !== typeof baseObj) {
          return { total: 0, filled: 0 };
        }

        if (typeof obj === "string") {
          total = 1;
          if (obj.trim().length > 0) filled = 1;
          return { total, filled };
        }

        if (typeof obj === "boolean") {
          total = 1;
          if (obj === true) filled = 1;
          return { total, filled };
        }

        if (typeof obj === "number") {
          total = 1;
          if (obj > 0) filled = 1;
          return { total, filled };
        }

        if (Array.isArray(obj)) {
          // Arrays: contar como um campo (preenchido se tiver elementos válidos)
          total = 1;
          if (obj.length > 0 && obj.some(item => {
            if (typeof item === "string") return item.trim().length > 0;
            if (typeof item === "number") return item > 0;
            if (typeof item === "object" && item !== null) {
              return Object.values(item).some(v => isFieldFilled(v));
            }
            return isFieldFilled(item);
          })) {
            filled = 1;
          }
          // Processar itens do array se forem objetos
          obj.forEach((item, index) => {
            if (typeof item === "object" && item !== null) {
              const baseItem = Array.isArray(baseObj) && baseObj[index] ? baseObj[index] : {};
              const result = countFields(item, baseItem);
              total += result.total;
              filled += result.filled;
            }
          });
          return { total, filled };
        }

        if (typeof obj === "object" && obj !== null) {
          // Para objetos, processar cada campo
          const allKeys = new Set([...Object.keys(obj), ...Object.keys(baseObj || {})]);
          allKeys.forEach(key => {
            // Ignorar campos condicionais opcionais se não aplicáveis (apenas para formulário padrão)
            if (!isCNPq) {
              const currentCampos = camposRef.current as any;
              if (key === "grupo_pesquisa_cnpq" && currentCampos.coordenador_projeto?.participa_grupo_pesquisa_cnpq !== true) {
                return; // Campo opcional, não contar
              }
              if (key === "outras_fontes_fomento" && currentCampos.detalhamento_projeto?.possui_outras_fontes_fomento !== true) {
                return; // Campo opcional, não contar
              }
              if (key === "caracterizacao_contribuicao_inovacao" && 
                  currentCampos.detalhamento_projeto?.tipo_contribuicao_inovacao?.includes('nao_se_aplica')) {
                return; // Campo opcional, não contar
              }
            }

            const result = countFields(obj[key] ?? null, baseObj?.[key] ?? null);
            total += result.total;
            filled += result.filled;
          });
          return { total, filled };
        }

        return { total: 0, filled: 0 };
      };

      const emptyForm = isCNPq ? createEmptyCNPqForm() : createEmptyPropostaForm();
      const currentCampos = camposRef.current;

      let total = 0;
      let filled = 0;

      if (isCNPq) {
        // Cálculo específico e previsível: % baseado no número de campos do formulário CNPq.
        const c = currentCampos as CNPqFormData;
        const requiredFields: string[] = [
          c.projeto_pesquisa.instituicao_desenvolvimento,
          c.projeto_pesquisa.titulo_projeto_pt,
          c.projeto_pesquisa.titulo_projeto_en,
          c.projeto_pesquisa.area,
          c.projeto_pesquisa.palavras_chave_pt,
          c.projeto_pesquisa.palavras_chave_en,
          c.resumo.resumo_proposta,
          c.sobre_projeto.objetivo,
          c.sobre_projeto.metas,
          c.sobre_projeto.metodologia_gestao_execucao,
          c.sobre_projeto.relevancia_setor_produtivo,
          c.sobre_projeto.instituicoes_colaboradoras_financiadoras,
          c.sobre_projeto.nivel_maturidade_tecnologica,
          c.sobre_projeto.resultados_cientificos_tecnologicos,
          c.sobre_projeto.potencial_producao_tecnologica_inovacao,
          c.sobre_projeto.potencial_empreendedorismo_inovador,
          c.sobre_projeto.potencial_atendimento_necessidades,
          c.sobre_projeto.sumula_curricular,
          c.sobre_projeto.sumula_curricular_continuacao,
        ];
        total = requiredFields.length;
        filled = requiredFields.filter((v) => String(v || "").trim().length > 0).length;
      } else {
        const r = countFields(currentCampos, emptyForm);
        total = r.total;
        filled = r.filled;
      }
      
      // Calcular progresso: só 100% quando TODOS os campos estiverem preenchidos
      let progresso = total > 0 ? Math.round((filled / total) * 100) : 0;
      
      // Garantir que só seja 100% se TODOS os campos estiverem realmente preenchidos
      // Usar comparação estrita para garantir que filled === total exatamente
      if (filled < total) {
        // Não permitir 100% se não estiver completo
        progresso = Math.min(99, progresso);
      } else if (filled === total && total > 0) {
        // Só permitir 100% quando TODOS os campos estiverem preenchidos
        progresso = 100;
      }
      
      // Garantir que progresso está sempre entre 0 e 100
      progresso = Math.max(0, Math.min(100, progresso));
      
      // Validar que não seja NaN ou undefined
      if (isNaN(progresso) || progresso === null || progresso === undefined) {
        progresso = 0;
      }

      // Validar que campos pode ser serializado como JSON
      const camposToSave = JSON.parse(JSON.stringify(currentCampos));
      
      await updateProposta(proposta.id, user.id, {
        campos_formulario: camposToSave,
        progresso: Number(progresso), // Garantir que é um número inteiro
      });

      setProposta({ ...proposta, campos_formulario: camposToSave, progresso });
      // Restaurar logo após a atualização de estado/pintura
      requestAnimationFrame(() => window.scrollTo(0, yBeforeSave));
      hasUnsavedChangesRef.current = false;
      toast.success("Proposta salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar proposta:", error);
      const errorMessage = error?.message || error?.details || "Erro desconhecido ao salvar proposta";
      console.error("Detalhes completos do erro:", error);
      toast.error(`Erro ao salvar proposta: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  }, [proposta, user, scrollPositionKey, isCNPq]);

  const handleStatusChange = async (newStatus: StatusProposta) => {
    if (!proposta || !user) return;

    try {
      setSaving(true);
      // Preservar scroll durante a troca de status também
      const yBeforeSave = latestScrollYRef.current || window.scrollY;
      try {
        sessionStorage.setItem(scrollPositionKey, yBeforeSave.toString());
      } catch {
        // ignore
      }
      await updateProposta(proposta.id, user.id, { status: newStatus });
      setProposta({ ...proposta, status: newStatus });
      requestAnimationFrame(() => window.scrollTo(0, yBeforeSave));
      toast.success(`Status alterado para: ${newStatus}`);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar status");
    } finally {
      setSaving(false);
    }
  };

  // Navegação por seções (diferente para CNPq)
  const sections = isCNPq ? [
    { id: "secao-projeto-pesquisa", label: "Projeto de Pesquisa" },
    { id: "secao-resumo", label: "Resumo" },
    { id: "secao-sobre-projeto", label: "Sobre o Projeto" },
  ] : [
    { id: "secao-titulo-projeto", label: "1. Título do Projeto" },
    { id: "secao-eixos-estrategicos", label: "1.3. Eixos Estratégicos" },
    { id: "secao-instituicao-executora", label: "2. Instituição Executora" },
    { id: "secao-detalhamento-projeto", label: "3. Detalhamento do Projeto" },
    { id: "secao-equipe-projeto", label: "4. Equipe do Projeto" },
    { id: "secao-cronograma", label: "5. Cronograma" },
    { id: "secao-recursos-financeiros", label: "6. Recursos Financeiros" },
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 120; // Mais espaço para o header fixo
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: Math.max(0, offsetPosition - 20), // Adicionar um pouco mais de espaço
        behavior: "smooth",
      });
    }
  };

  // Detectar seção ativa durante scroll
  useEffect(() => {
    if (!proposta) return;

    const handleScroll = () => {
      const scrollPosition = window.scrollY + 150; // Offset maior para header fixo
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // Se estiver perto do final da página, marcar a última seção como ativa
      if (scrollPosition + windowHeight >= documentHeight - 100) {
        setActiveSection(sections[sections.length - 1].id);
        return;
      }

      // Verificar cada seção de baixo para cima
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = document.getElementById(sections[i].id);
        if (section) {
          const sectionTop = section.offsetTop;
          const sectionHeight = section.offsetHeight;
          
          // Considerar a seção ativa se estiver dentro de um range maior
          if (scrollPosition >= sectionTop - 50 && scrollPosition < sectionTop + sectionHeight) {
            setActiveSection(sections[i].id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Verificar seção inicial

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [proposta]);

  // Preservar/restaurar scroll ao trocar de aba do navegador (e ao voltar para a página)
  useEffect(() => {
    if (!propostaId) return;

    const saveScroll = () => {
      if (isRestoringScrollRef.current) return;
      try {
        sessionStorage.setItem(scrollPositionKey, String(latestScrollYRef.current || 0));
      } catch {
        // ignore
      }
    };

    const restoreScroll = () => {
      try {
        const saved = sessionStorage.getItem(scrollPositionKey);
        if (!saved) return;
        const y = parseInt(saved, 10);
        if (!Number.isFinite(y)) return;
        const runId = ++restoreRunIdRef.current;
        isRestoringScrollRef.current = true;
        // Alguns navegadores/app re-render podem “puxar” o scroll após voltar para a aba.
        // Restauramos mais de uma vez para garantir.
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
          requestAnimationFrame(() => window.scrollTo(0, y));
        });
        setTimeout(() => window.scrollTo(0, y), 120);
        setTimeout(() => window.scrollTo(0, y), 300);
        setTimeout(() => {
          // libera novamente o salvamento; evita sobrescrever com 0 durante a restauração
          if (restoreRunIdRef.current === runId) {
            isRestoringScrollRef.current = false;
            latestScrollYRef.current = window.scrollY;
          }
        }, 650);
      } catch {
        // ignore
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveScroll();
      } else {
        restoreScroll();
        setTimeout(() => restoreScroll(), 120);
        setTimeout(() => restoreScroll(), 350);
        setTimeout(() => restoreScroll(), 900);
      }
    };

    const handlePageHide = () => {
      saveScroll();
    };

    const handlePageShow = () => {
      restoreScroll();
      setTimeout(() => restoreScroll(), 120);
      setTimeout(() => restoreScroll(), 350);
      setTimeout(() => restoreScroll(), 900);
    };

    const handleScrollUpdate = () => {
      if (isRestoringScrollRef.current) return;
      latestScrollYRef.current = window.scrollY;
      saveScroll();
    };

    const handleFocus = () => {
      // Ao voltar para a aba, alguns navegadores podem “resetar” antes de disparar visibilitychange
      restoreScroll();
      setTimeout(() => restoreScroll(), 120);
      setTimeout(() => restoreScroll(), 350);
      setTimeout(() => restoreScroll(), 900);
    };

    const handleBlur = () => {
      saveScroll();
    };

    window.addEventListener("scroll", handleScrollUpdate, { passive: true });
    window.addEventListener("beforeunload", saveScroll);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("scroll", handleScrollUpdate);
      window.removeEventListener("beforeunload", saveScroll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [propostaId, scrollPositionKey]);

  // Restaurar scroll uma vez, após carregar a proposta (garante altura suficiente)
  useEffect(() => {
    if (!propostaId) return;
    if (scrollRestored) return;
    if (loading) return;
    if (!proposta) return;

    try {
      const saved = sessionStorage.getItem(scrollPositionKey);
      if (!saved) {
        setScrollRestored(true);
        return;
      }
      const y = parseInt(saved, 10);
      if (!Number.isFinite(y)) {
        setScrollRestored(true);
        return;
      }
      const runId = ++restoreRunIdRef.current;
      isRestoringScrollRef.current = true;
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
        requestAnimationFrame(() => window.scrollTo(0, y));
      });
      setTimeout(() => window.scrollTo(0, y), 80);
      setTimeout(() => {
        window.scrollTo(0, y);
        setScrollRestored(true);
        if (restoreRunIdRef.current === runId) {
          isRestoringScrollRef.current = false;
          latestScrollYRef.current = window.scrollY;
        }
      }, 250);
    } catch {
      setScrollRestored(true);
    }
  }, [propostaId, loading, proposta, scrollPositionKey, scrollRestored]);

  // Auto-save quando o usuário muda de tab ou sai da página
  // IMPORTANTE: Este useEffect deve estar ANTES dos early returns para evitar erro de hooks
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Salvar antes de sair da página se houver mudanças não salvas
      if (hasUnsavedChangesRef.current && proposta && user) {
        // Usar sendBeacon para garantir que o salvamento aconteça mesmo ao sair
        handleSave();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Salvar quando a aba perde o foco
        if (hasUnsavedChangesRef.current && proposta && user) {
          handleSave();
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Limpar timeout ao desmontar
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleSave, proposta, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!proposta) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Proposta não encontrada
          </h2>
          <Link href="/minhas-propostas">
            <Button variant="outline">Voltar para Minhas Propostas</Button>
          </Link>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: StatusProposta) => {
    const statusConfig = {
      rascunho: { label: "Rascunho", className: "bg-gray-100 text-gray-700" },
      em_redacao: {
        label: "Em Redação",
        className: "bg-blue-100 text-blue-700",
      },
      revisao: {
        label: "Em Revisão",
        className: "bg-yellow-100 text-yellow-700",
      },
      submetida: {
        label: "Submetida",
        className: "bg-purple-100 text-purple-700",
      },
      aprovada: {
        label: "Aprovada",
        className: "bg-green-100 text-green-700",
      },
      rejeitada: {
        label: "Rejeitada",
        className: "bg-red-100 text-red-700",
      },
    };

    const config = statusConfig[status] || statusConfig.rascunho;
    return (
      <Badge className={config.className}>{config.label}</Badge>
    );
  };

  // Helper para status (movido para antes do return)
  const statusConfig: Record<
    StatusProposta,
    { label: string; className: string }
  > = {
    rascunho: { label: "📝 Rascunho", className: "bg-gray-100 text-gray-700" },
    em_redacao: {
      label: "✍️ Em Redação",
      className: "bg-blue-100 text-blue-700",
    },
    revisao: {
      label: "🔍 Em Revisão",
      className: "bg-yellow-100 text-yellow-700",
    },
    submetida: {
      label: "📤 Submetida",
      className: "bg-purple-100 text-purple-700",
    },
    aprovada: {
      label: "✅ Aprovada",
      className: "bg-green-100 text-green-700",
    },
    rejeitada: {
      label: "❌ Rejeitada",
      className: "bg-red-100 text-red-700",
    },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Sempre visível no topo */}
      <header className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-50 shadow-sm">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/minhas-propostas">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {proposta.edital_titulo || "Editar Proposta"}
                </h1>
                <p className="text-sm text-gray-600">
                  {proposta.edital_orgao || ""} • Progresso: {proposta.progresso}%
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {getStatusBadge(proposta.status)}
              <Button
                type="button"
                variant="outline"
                onClick={handleRefazerResumoProjeto}
                disabled={saving || refazendoResumo}
              >
                {refazendoResumo ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Refazendo resumo...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Refazer resumo
                  </>
                )}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-blue-600 to-violet-600"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Espaço para o header fixo - altura aproximada do header */}
      <div className="h-[88px]"></div>

      {/* Barra Lateral de Navegação - Tópicos */}
      <div className="fixed top-[200px] left-6 z-40 bg-white rounded-xl p-4 shadow-lg border border-gray-200 w-64 hidden lg:block">
        <div className="flex items-center gap-2 mb-4">
          <List className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-gray-900 text-sm">Navegação</h3>
        </div>
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === section.id
                  ? "bg-blue-50 text-blue-700 font-semibold border-l-2 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Card Fixo - Status, Progresso e Ver Edital - Sempre visível */}
      <div
        className={`fixed top-[200px] right-6 z-40 bg-white rounded-xl shadow-lg border border-gray-200 transition-all duration-200 ${
          statusPanelCollapsed ? "w-12 h-40 p-1" : "w-56 p-5"
        }`}
      >
        {statusPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setStatusPanelCollapsed(false)}
            className="w-full h-full rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors flex flex-col items-center justify-center gap-3 p-2"
            aria-label="Expandir painel de status"
            title="Expandir"
          >
            <ChevronLeft className="w-5 h-5 text-gray-800" />
            <span className="text-xs font-semibold text-gray-700 rotate-90 whitespace-nowrap select-none">
              Status
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-900 text-sm">Status</h3>
              <button
                type="button"
                onClick={() => setStatusPanelCollapsed(true)}
                className="p-1.5 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors"
                aria-label="Recolher painel de status"
                title="Recolher"
              >
                <ChevronRight className="w-4 h-4 text-gray-700" />
              </button>
            </div>
            {/* Status */}
            <div>
              <div className="space-y-2">
                {(
                  [
                    "rascunho",
                    "em_redacao",
                    "revisao",
                    "submetida",
                  ] as StatusProposta[]
                ).map((status) => (
                  <Button
                    key={status}
                    variant={proposta.status === status ? "default" : "outline"}
                    className="w-full justify-start text-xs py-1.5 h-9"
                    onClick={() => handleStatusChange(status)}
                    disabled={saving}
                  >
                    {statusConfig[status]?.label || status}
                  </Button>
                ))}
              </div>
            </div>

            {/* Progresso */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="font-bold text-gray-900 mb-3 text-sm">Progresso</h3>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-blue-600">
                  {proposta.progresso}%
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${proposta.progresso}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Ver Edital Original */}
            <div className="border-t border-gray-200 pt-4">
              <Link href={`/edital/${proposta.edital_id}`}>
                <Button variant="outline" className="w-full text-xs">
                  Ver Edital Original
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="container py-8 lg:pl-72">
        <div className={`grid gap-6 ${proposta.observacoes ? 'grid-cols-4' : 'grid-cols-1'}`}>
          {/* Formulário Principal */}
          <div className={`${proposta.observacoes ? 'col-span-3' : 'col-span-1'} space-y-6`}>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Campos do Formulário
              </h2>

              {isCNPq ? (
                <FormularioCNPq 
                  data={campos as CNPqFormData} 
                  onChange={handleFormChange}
                  editalId={proposta.edital_id}
                  propostaId={propostaId}
                />
              ) : (
                <FormularioProposta 
                  data={campos as PropostaFormData} 
                  onChange={handleFormChange}
                  editalId={proposta.edital_id}
                  propostaId={propostaId}
                />
              )}
            </div>
          </div>

          {/* Sidebar - Apenas Observações (se houver) */}
          {proposta.observacoes && (
            <div className="col-span-1">
              <div className="sticky top-[88px]">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-900 mb-4">Observações</h3>
                  <p className="text-sm text-gray-600">{proposta.observacoes}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

