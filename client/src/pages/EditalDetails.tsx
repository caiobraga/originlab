import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { 
  ArrowLeft, CheckCircle2, AlertCircle, Loader2,
  Calendar, DollarSign, MapPin, Users, FileText, Sparkles,
  Shield, Clock, Download, Send, Info
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
import { gerarPropostaComIA } from "@/lib/propostasApi";
import { useLocation } from "wouter";


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
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [gerandoProposta, setGerandoProposta] = useState(false);
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [, setLocation] = useLocation();

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



  // Função para compartilhar edital
  const handleCompartilhar = async () => {
    const urlCompleta = window.location.href;
    const tituloEdital = edital?.titulo || "Edital";
    const textoCompartilhamento = `Confira este edital: ${tituloEdital}`;

    // Tentar usar Web Share API (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: tituloEdital,
          text: textoCompartilhamento,
          url: urlCompleta,
        });
        toast.success("Compartilhado com sucesso!");
        return;
      } catch (error: any) {
        // Se o usuário cancelar, não fazer nada
        if (error.name === "AbortError") {
          return;
        }
        // Se der erro, continuar com fallback
      }
    }

    // Fallback: copiar link para área de transferência
    try {
      await navigator.clipboard.writeText(urlCompleta);
      setLinkCopiado(true);
      toast.success("Link copiado para a área de transferência!");
      setTimeout(() => setLinkCopiado(false), 2000);
    } catch (error) {
      console.error("Erro ao copiar link:", error);
      toast.error("Erro ao copiar link. Tente novamente.");
    }
  };

  // Função para compartilhar no WhatsApp
  const handleCompartilharWhatsApp = () => {
    const urlCompleta = window.location.href;
    const tituloEdital = edital?.titulo || "Edital";
    const texto = `Confira este edital: ${tituloEdital}\n\n${urlCompleta}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  };

  // Função para compartilhar por Email
  const handleCompartilharEmail = () => {
    const urlCompleta = window.location.href;
    const tituloEdital = edital?.titulo || "Edital";
    const assunto = `Edital: ${tituloEdital}`;
    const corpo = `Olá!\n\nEncontrei este edital que pode ser do seu interesse:\n\n${tituloEdital}\n\n${urlCompleta}`;
    window.open(`mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`, "_blank");
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

  // Função para gerar proposta com IA
  const handleGerarProposta = async () => {
    if (!user) {
      toast.error("Faça login para gerar uma proposta");
      return;
    }

    if (!editalId) {
      toast.error("ID do edital não encontrado");
      return;
    }

    try {
      setGerandoProposta(true);
      toast.loading("Criando proposta...", { id: "gerar-proposta" });

      const proposta = await gerarPropostaComIA(editalId, user.id, user, profile);

      toast.success("Proposta criada com sucesso!", { id: "gerar-proposta" });
      setLocation(`/propostas/${proposta.id}`);
    } catch (error) {
      console.error("Erro ao criar proposta:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao criar proposta",
        { id: "gerar-proposta" }
      );
    } finally {
      setGerandoProposta(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container py-3 md:py-4">
          <div className="flex items-start gap-2 md:gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="flex-shrink-0">
                <ArrowLeft className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Voltar</span>
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-2xl font-bold text-gray-900 break-words">
                {loading ? "Carregando..." : edital?.titulo || "Edital não encontrado"}
              </h1>
              <p className="text-xs md:text-sm text-gray-600 break-words">
                {edital?.orgao || ""} {edital?.numero ? `- Edital ${edital.numero}` : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-4 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Informações Básicas */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Informações do Edital</h2>
              
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="break-words">Sobre o Programa</span>
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
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="break-words">Critérios de Elegibilidade</span>
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
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4">Arquivos do Edital</h2>
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
          <div className="space-y-4 md:space-y-6">
            {/* Análise de Match */}
            {user && (
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <h3 className="text-base md:text-lg font-bold text-gray-900 break-words">Análise de Match</h3>
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
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
              <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4">Ações</h3>
              <div className="space-y-3">
                <Button 
                  className="w-full bg-gradient-to-r from-blue-600 to-violet-600"
                  onClick={handleGerarProposta}
                  disabled={gerandoProposta || !user}
                >
                  {gerandoProposta ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Gerar proposta com IA</span>
                  <span className="sm:hidden">Gerar proposta</span>
                    </>
                  )}
                </Button>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleCompartilhar}
                  >
                    <Send className={`w-4 h-4 mr-2 flex-shrink-0 ${linkCopiado ? "text-green-600" : ""}`} />
                    {linkCopiado ? "Link copiado!" : "Compartilhar"}
                  </Button>
                  {linkCopiado && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                        onClick={handleCompartilharWhatsApp}
                      >
                        WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={handleCompartilharEmail}
                      >
                        Email
                </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline */}
            {edital?.timeline_estimada && edital.timeline_estimada.fases && Array.isArray(edital.timeline_estimada.fases) && edital.timeline_estimada.fases.length > 0 ? (
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
              <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4">Timeline Estimada</h3>
              <div className="space-y-4">
                  {edital.timeline_estimada.fases.map((fase: any, index: number) => {
                    const isLast = index === edital.timeline_estimada.fases.length - 1;
                    
                    // Determinar status baseado nas datas atual
                    const hoje = new Date();
                    hoje.setHours(0, 0, 0, 0); // Normalizar para meia-noite
                    
                    let statusCalculado = fase.status?.toLowerCase() || 'pendente';
                    
                    // Se tiver data_fim, verificar se já passou
                    if (fase.data_fim) {
                      const dataFim = new Date(fase.data_fim);
                      dataFim.setHours(23, 59, 59, 999); // Final do dia
                      if (hoje > dataFim) {
                        statusCalculado = 'fechado';
                      } else if (fase.data_inicio) {
                        const dataInicio = new Date(fase.data_inicio);
                        dataInicio.setHours(0, 0, 0, 0);
                        // Se hoje está entre início e fim, está aberto
                        if (hoje >= dataInicio && hoje <= dataFim) {
                          statusCalculado = 'aberto';
                        } else if (hoje < dataInicio) {
                          statusCalculado = 'pendente';
                        }
                      } else {
                        // Se não tem data_inicio mas tem data_fim no futuro, considerar aberto
                        if (hoje <= dataFim) {
                          statusCalculado = 'aberto';
                        }
                      }
                    } else if (fase.data_inicio) {
                      // Se só tem data_inicio, verificar se já passou
                      const dataInicio = new Date(fase.data_inicio);
                      dataInicio.setHours(0, 0, 0, 0);
                      if (hoje >= dataInicio) {
                        statusCalculado = 'aberto';
                      } else {
                        statusCalculado = 'pendente';
                      }
                    }
                    
                    const status = statusCalculado;
                    const isAberto = status === 'aberto' || status === 'aberta';
                    const isPendente = status === 'pendente';
                    const isFechado = status === 'fechado' || status === 'fechada';
                    
                    return (
                      <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            isAberto ? 'bg-green-500' : isFechado ? 'bg-red-300' : 'bg-gray-300'
                          }`}>
                            {isAberto ? (
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            ) : (
                      <div className="w-3 h-3 bg-white rounded-full" />
                            )}
                    </div>
                          {!isLast && <div className="w-0.5 h-full bg-gray-300 my-1" />}
                  </div>
                        <div className={`flex-1 ${!isLast ? 'pb-4' : ''}`}>
                          <div className="font-medium text-sm">{fase.nome || `Fase ${index + 1}`}</div>
                          {fase.prazo && (
                            <div className="text-xs text-gray-600">{fase.prazo}</div>
                          )}
                          {(fase.data_inicio || fase.data_fim) && (
                            <div className="text-xs text-gray-500 mt-1">
                              {fase.data_inicio && fase.data_fim 
                                ? `${new Date(fase.data_inicio).toLocaleDateString('pt-BR')} - ${new Date(fase.data_fim).toLocaleDateString('pt-BR')}`
                                : fase.data_inicio 
                                  ? `Início: ${new Date(fase.data_inicio).toLocaleDateString('pt-BR')}`
                                  : fase.data_fim 
                                    ? `Fim: ${new Date(fase.data_fim).toLocaleDateString('pt-BR')}`
                                    : null
                              }
                  </div>
                          )}
                          {fase.status && (
                            <Badge 
                              variant={isAberto ? "default" : "outline"} 
                              className={`mt-1 ${
                                isAberto ? 'bg-green-100 text-green-700 border-green-200' :
                                isFechado ? 'bg-red-100 text-red-700 border-red-200' :
                                'bg-gray-100 text-gray-700 border-gray-200'
                              }`}
                            >
                              {isAberto ? 'Aberto' : isFechado ? 'Fechado' : 'Pendente'}
                            </Badge>
                          )}
                    </div>
                  </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4">Timeline Estimada</h3>
                <div className="text-sm text-gray-500 italic">
                  Timeline estimada não foi extraída ainda ou não está disponível.
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
