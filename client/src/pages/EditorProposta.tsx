import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  fetchPropostaById,
  updateProposta,
  type Proposta,
  type StatusProposta,
} from "@/lib/propostasApi";
import { useAuth } from "@/contexts/AuthContext";
import FormularioProposta from "@/components/FormularioProposta";
import { type PropostaFormData, createEmptyPropostaForm } from "@/lib/propostaFormFields";


export default function EditorProposta() {
  const params = useParams();
  const propostaId = params.id || "";
  const { user } = useAuth();

  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campos, setCampos] = useState<PropostaFormData>(createEmptyPropostaForm());

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
        // Garantir que os campos tenham a estrutura correta
        const camposFormulario = data.campos_formulario || {};
        // Mesclar com estrutura vazia para garantir todos os campos existam
        const camposCompletos = {
          ...createEmptyPropostaForm(),
          ...camposFormulario,
        };
        setCampos(camposCompletos as PropostaFormData);
      } catch (error) {
        console.error("Erro ao carregar proposta:", error);
        toast.error("Erro ao carregar proposta");
      } finally {
        setLoading(false);
      }
    }

    loadProposta();
  }, [propostaId, user]);

  const handleFormChange = (newData: PropostaFormData) => {
    setCampos(newData);
  };

  const handleSave = async () => {
    if (!proposta || !user) return;

    try {
      setSaving(true);

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
            // Ignorar campos condicionais opcionais se não aplicáveis
            if (key === "grupo_pesquisa_cnpq" && campos.coordenador_projeto?.participa_grupo_pesquisa_cnpq !== true) {
              return; // Campo opcional, não contar
            }
            if (key === "outras_fontes_fomento" && campos.detalhamento_projeto?.possui_outras_fontes_fomento !== true) {
              return; // Campo opcional, não contar
            }
            if (key === "caracterizacao_contribuicao_inovacao" && 
                campos.detalhamento_projeto?.tipo_contribuicao_inovacao?.includes('nao_se_aplica')) {
              return; // Campo opcional, não contar
            }

            const result = countFields(obj[key] ?? null, baseObj?.[key] ?? null);
            total += result.total;
            filled += result.filled;
          });
          return { total, filled };
        }

        return { total: 0, filled: 0 };
      };

      const emptyForm = createEmptyPropostaForm();
      const { total, filled } = countFields(campos, emptyForm);
      
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
      const camposToSave = JSON.parse(JSON.stringify(campos));
      
      await updateProposta(proposta.id, user.id, {
        campos_formulario: camposToSave,
        progresso: Number(progresso), // Garantir que é um número inteiro
      });

      setProposta({ ...proposta, campos_formulario: camposToSave, progresso });
      toast.success("Proposta salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar proposta:", error);
      const errorMessage = error?.message || error?.details || "Erro desconhecido ao salvar proposta";
      console.error("Detalhes completos do erro:", error);
      toast.error(`Erro ao salvar proposta: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: StatusProposta) => {
    if (!proposta || !user) return;

    try {
      setSaving(true);
      await updateProposta(proposta.id, user.id, { status: newStatus });
      setProposta({ ...proposta, status: newStatus });
      toast.success(`Status alterado para: ${newStatus}`);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar status");
    } finally {
      setSaving(false);
    }
  };

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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
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

      <div className="container py-8">
        <div className="grid grid-cols-4 gap-6">
          {/* Formulário Principal */}
          <div className="col-span-3 space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Campos do Formulário
              </h2>

              <FormularioProposta 
                data={campos} 
                onChange={handleFormChange}
                editalId={proposta.edital_id}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4">Status</h3>
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
                    className="w-full justify-start"
                    onClick={() => handleStatusChange(status)}
                    disabled={saving}
                  >
                    {statusConfig[status]?.label || status}
                  </Button>
                ))}
              </div>
            </div>

            {/* Progresso */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4">Progresso</h3>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-blue-600">
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

            {/* Observações */}
            {proposta.observacoes && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4">Observações</h3>
                <p className="text-sm text-gray-600">{proposta.observacoes}</p>
              </div>
            )}

            {/* Link para Edital */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <Link href={`/edital/${proposta.edital_id}`}>
                <Button variant="outline" className="w-full">
                  Ver Edital Original
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

