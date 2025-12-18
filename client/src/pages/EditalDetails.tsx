import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { 
  ArrowLeft, CheckCircle2, AlertCircle, Loader2,
  Calendar, DollarSign, MapPin, Users, FileText, Sparkles,
  Shield, Clock, TrendingUp, Download, Send, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import EditalChat from "@/components/EditalChat";
import { supabase } from "@/lib/supabase";
import { DatabaseEdital, calculateEditalScores } from "@/lib/editaisApi";
import { formatValorProjeto, formatPrazoInscricao } from "@/lib/editalFormatters";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";


interface EditalPdf {
  id: string;
  nome_arquivo: string;
  caminho_storage: string;
  url_original: string | null;
  tamanho_bytes: number | null;
  tipo_mime: string | null;
  criado_em: string;
}

export default function EditalDetails() {
  const params = useParams();
  const editalId = params.id || "";
  const [edital, setEdital] = useState<DatabaseEdital | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfs, setPdfs] = useState<EditalPdf[]>([]);
  const [loadingPdfs, setLoadingPdfs] = useState(true);
  const [scores, setScores] = useState<{ match: number; probabilidade: number; justificativa?: string | null } | null>(null);
  const [loadingScores, setLoadingScores] = useState(false);
  const { user } = useAuth();
  const { profile } = useUserProfile();

  // Buscar dados do edital
  useEffect(() => {
    async function fetchEdital() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("editais")
          .select("*")
          .eq("id", editalId)
          .single();

        if (error) {
          console.error("Erro ao buscar edital:", error);
          toast.error("Erro ao carregar dados do edital");
        } else {
          setEdital(data);
        }
      } catch (error) {
        console.error("Erro ao buscar edital:", error);
        toast.error("Erro ao carregar dados do edital");
      } finally {
        setLoading(false);
      }
    }

    if (editalId) {
      fetchEdital();
    }
  }, [editalId]);

  // Buscar PDFs do edital
  useEffect(() => {
    async function fetchPdfs() {
      if (!editalId) return;
      
      try {
        setLoadingPdfs(true);
        const { data, error } = await supabase
          .from("edital_pdfs")
          .select("id, nome_arquivo, caminho_storage, url_original, tamanho_bytes, tipo_mime, criado_em")
          .eq("edital_id", editalId)
          .order("criado_em", { ascending: true });

        if (error) {
          console.error("Erro ao buscar PDFs:", error);
        } else {
          setPdfs(data || []);
        }
      } catch (error) {
        console.error("Erro ao buscar PDFs:", error);
      } finally {
        setLoadingPdfs(false);
      }
    }

    if (editalId) {
      fetchPdfs();
    }
  }, [editalId]);

  // Buscar scores do edital
  useEffect(() => {
    async function fetchScores() {
      if (!edital || !user || !editalId) return;

      try {
        setLoadingScores(true);
        const calculatedScores = await calculateEditalScores(edital, user.id, user, profile || null);
        setScores(calculatedScores);
      } catch (error) {
        console.error("Erro ao buscar scores:", error);
      } finally {
        setLoadingScores(false);
      }
    }

    if (edital && user) {
      fetchScores();
    }
  }, [edital, user, editalId, profile]);

  // Função para fazer download do arquivo
  const handleDownloadPdf = async (pdf: EditalPdf) => {
    try {
      // Se tiver URL original, usar ela
      if (pdf.url_original) {
        window.open(pdf.url_original, '_blank');
        return;
      }

      // Caso contrário, baixar do storage
      const { data, error } = await supabase.storage
        .from('edital-pdfs')
        .download(pdf.caminho_storage);

      if (error) {
        console.error("Erro ao baixar PDF:", error);
        toast.error("Erro ao baixar arquivo");
        return;
      }

      // Criar link de download
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdf.nome_arquivo;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("Download iniciado");
    } catch (error) {
      console.error("Erro ao fazer download:", error);
      toast.error("Erro ao baixar arquivo");
    }
  };

  // Função para formatar tamanho do arquivo
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Tamanho desconhecido";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };




  const getStatusBadge = (status: string) => {
    switch (status) {
      case "aprovado":
        return <Badge className="bg-green-100 text-green-700 border-green-200">✓ Aprovado</Badge>;
      case "atencao":
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">⚠ Atenção</Badge>;
      case "reprovado":
        return <Badge className="bg-red-100 text-red-700 border-red-200">✗ Reprovado</Badge>;
      default:
        return <Badge variant="outline">N/A</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {loading ? "Carregando..." : edital?.titulo || "Edital não encontrado"}
              </h1>
              <p className="text-sm text-gray-600">
                {edital?.orgao || ""} {edital?.numero ? `- Edital ${edital.numero}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Badge className="bg-green-500">85% Match</Badge>
              <Badge className="bg-blue-500">76% Aprovação</Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-8">
        <div className="grid grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="col-span-2 space-y-6">
            {/* Informações Básicas */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Informações do Edital</h2>
              
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <DollarSign className="w-5 h-5 text-blue-600 mt-1" />
                    <div className="flex-1">
                      <div className="text-sm text-gray-600">Valor por Projeto</div>
                      {(() => {
                        const valorFormatado = formatValorProjeto(edital?.valor_projeto);
                        if (valorFormatado.display === 'Não informado') {
                          return <div className="font-bold text-lg text-gray-500">Não informado</div>;
                        }
                        return (
                          <>
                            <div className="font-bold text-lg">{valorFormatado.display}</div>
                            {valorFormatado.details && valorFormatado.details.length > 1 && (
                              <div className="space-y-1 mt-2">
                                <div className="text-xs text-gray-500 font-medium">
                                  {valorFormatado.details.length} valores disponíveis:
                                </div>
                                {valorFormatado.details.map((valor, idx) => (
                                  <div key={idx} className="text-sm text-gray-600 border-l-2 border-blue-500 pl-2">
                                    {valor}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-blue-600 mt-1" />
                    <div className="flex-1">
                      <div className="text-sm text-gray-600">Prazo de Inscrição</div>
                      {(() => {
                        const prazoFormatado = formatPrazoInscricao(edital?.prazo_inscricao);
                        if (!prazoFormatado.details || prazoFormatado.details.length <= 1) {
                          return <div className="font-bold text-lg">{prazoFormatado.display}</div>;
                        }
                        return (
                          <div className="space-y-2">
                            <div className="font-bold text-lg">{prazoFormatado.display}</div>
                            <div className="space-y-1 mt-2">
                              {prazoFormatado.details.map((prazo, idx) => (
                                <div key={idx} className="text-sm text-gray-600 border-l-2 border-blue-500 pl-2">
                                  {prazo.chamada && (
                                    <div className="font-semibold text-gray-900">{prazo.chamada}</div>
                                  )}
                                  {prazo.inicio && prazo.fim ? (
                                    <div>De {prazo.inicio} até {prazo.fim}{prazo.horario ? ` às ${prazo.horario}` : ''}</div>
                                  ) : prazo.fim ? (
                                    <div>Até {prazo.fim}{prazo.horario ? ` às ${prazo.horario}` : ''}</div>
                                  ) : prazo.prazo ? (
                                    <div>{prazo.prazo}</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-blue-600 mt-1" />
                    <div className="flex-1">
                      <div className="text-sm text-gray-600">Localização</div>
                      <div className="font-bold text-lg">
                        {edital?.localizacao || "Não informado"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-blue-600 mt-1" />
                    <div className="flex-1">
                      <div className="text-sm text-gray-600">Vagas</div>
                      <div className="font-bold text-lg">
                        {edital?.vagas || "Não informado"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sobre o Programa */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Sobre o Programa
              </h2>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : edital?.sobre_programa && edital.sobre_programa !== 'Não informado' ? (
                <div className="prose prose-sm prose-blue max-w-none text-gray-700">
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 text-gray-900" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-3 text-gray-900" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-semibold mb-2 text-gray-900" {...props} />,
                      p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc list-inside mb-4 space-y-1" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-4 space-y-1" {...props} />,
                      li: ({node, ...props}) => <li className="ml-4" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                      em: ({node, ...props}) => <em className="italic" {...props} />,
                      code: ({node, ...props}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic my-4" {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                    }}
                  >
                    {edital.sobre_programa}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-gray-500 italic">
                  Informações sobre o programa não foram extraídas ainda ou não estão disponíveis.
                </div>
              )}
            </div>

            {/* Critérios de Elegibilidade */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Critérios de Elegibilidade
              </h2>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : edital?.criterios_elegibilidade && edital.criterios_elegibilidade !== 'Não informado' ? (
                <div className="prose prose-sm prose-blue max-w-none text-gray-700">
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mb-4 text-gray-900" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-bold mb-3 text-gray-900" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-semibold mb-2 text-gray-900" {...props} />,
                      p: ({node, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc list-inside mb-4 space-y-1" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-4 space-y-1" {...props} />,
                      li: ({node, ...props}) => <li className="ml-4" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                      em: ({node, ...props}) => <em className="italic" {...props} />,
                      code: ({node, ...props}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic my-4" {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                    }}
                  >
                    {edital.criterios_elegibilidade}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-gray-500 italic">
                  Critérios de elegibilidade não foram extraídos ainda ou não estão disponíveis.
                </div>
              )}
            </div>

            {/* Arquivos do Edital */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Arquivos do Edital</h2>
              {loadingPdfs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : pdfs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nenhum arquivo disponível para este edital.
                </div>
              ) : (
                <div className="space-y-3">
                  {pdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {pdf.nome_arquivo}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatFileSize(pdf.tamanho_bytes)}
                            {pdf.tipo_mime && ` • ${pdf.tipo_mime}`}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPdf(pdf)}
                        className="ml-4 flex-shrink-0"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Baixar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Análise de Match */}
            {user && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-bold text-gray-900">Análise de Match</h3>
                </div>
                
                {loadingScores ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  </div>
                ) : scores ? (
                  <>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-blue-600">{scores.match}%</div>
                        <div className="text-xs text-gray-600">Match</div>
                      </div>
                      <div className="text-center flex-1">
                        <div className="text-3xl font-bold text-violet-600">{scores.probabilidade}%</div>
                        <div className="text-xs text-gray-600">Aprovação</div>
                      </div>
                    </div>

                    {scores.justificativa ? (
                      <div className="prose prose-sm max-w-none">
                        <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {scores.justificativa}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic">
                        Justificativa ainda não disponível. Os dados estão sendo processados.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    Faça login para ver a análise de match personalizada.
                  </div>
                )}
              </div>
            )}

            {/* Chat Agent - Floating Bubble */}
            {editalId && <EditalChat editalId={editalId} />}

            {/* Actions */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4">Ações</h3>
              <div className="space-y-3">
                <Button className="w-full bg-gradient-to-r from-blue-600 to-violet-600">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar proposta com IA
                </Button>
                <Button variant="outline" className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  Compartilhar
                </Button>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4">Timeline Estimada</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="w-0.5 h-full bg-gray-300 my-1" />
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="font-medium text-sm">Inscrição</div>
                    <div className="text-xs text-gray-600">30 dias</div>
                    <Badge variant="default" className="mt-1">Aberto</Badge>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                    <div className="w-0.5 h-full bg-gray-300 my-1" />
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="font-medium text-sm">Fase 1: Ideias</div>
                    <div className="text-xs text-gray-600">60 dias</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                    <div className="w-0.5 h-full bg-gray-300 my-1" />
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="font-medium text-sm">Capacitações</div>
                    <div className="text-xs text-gray-600">30 dias</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                    <div className="w-0.5 h-full bg-gray-300 my-1" />
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="font-medium text-sm">Fase 2: Projetos</div>
                    <div className="text-xs text-gray-600">90 dias</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <div className="w-3 h-3 bg-white rounded-full" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">Resultado Final</div>
                    <div className="text-xs text-gray-600">30 dias</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl p-6 text-white">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" />
                <h3 className="font-bold">Estatísticas</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-bold">~35%</div>
                  <div className="text-sm opacity-90">Taxa de aprovação Fase 1</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">~70%</div>
                  <div className="text-sm opacity-90">Taxa de aprovação Fase 2</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">47</div>
                  <div className="text-sm opacity-90">Projetos serão aprovados</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
