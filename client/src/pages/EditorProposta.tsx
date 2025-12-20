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
      // Contar campos não vazios de forma recursiva
      const countFilledFields = (obj: any, path = ""): number => {
        if (obj === null || obj === undefined) return 0;
        if (typeof obj === "string") return obj.trim() ? 1 : 0;
        if (typeof obj === "boolean") return obj ? 1 : 0;
        if (typeof obj === "number") return obj > 0 ? 1 : 0;
        if (Array.isArray(obj)) {
          return obj.length > 0 ? obj.reduce((sum, item) => sum + countFilledFields(item), 0) : 0;
        }
        if (typeof obj === "object") {
          return Object.values(obj).reduce(
            (sum, value) => sum + countFilledFields(value),
            0
          );
        }
        return 0;
      };

      const totalFields = countFilledFields(createEmptyPropostaForm());
      const filledFields = countFilledFields(campos);
      const progresso = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

      await updateProposta(proposta.id, user.id, {
        campos_formulario: campos as any,
        progresso,
      });

      setProposta({ ...proposta, campos_formulario: campos as any, progresso });
      toast.success("Proposta salva com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar proposta:", error);
      toast.error("Erro ao salvar proposta");
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

              <FormularioProposta data={campos} onChange={handleFormChange} />
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

