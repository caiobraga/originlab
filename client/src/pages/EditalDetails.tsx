import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { 
  ArrowLeft, CheckCircle2, AlertCircle, Loader2,
  Calendar, DollarSign, MapPin, Users, FileText, Sparkles,
  Shield, Clock, Download, Send, Info, ChevronDown, Target,
  TrendingUp, AlertTriangle, XCircle, CheckCircle, Building2,
  GraduationCap
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";


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
            {/* Ações no Header */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button 
                className="bg-gradient-to-r from-blue-600 to-violet-600 hidden sm:flex"
                onClick={handleGerarProposta}
                disabled={gerandoProposta || !user}
                size="sm"
              >
                {gerandoProposta ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Gerar proposta
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCompartilhar}
                className="hidden sm:flex"
              >
                <Send className={`w-4 h-4 ${linkCopiado ? "text-green-600" : ""}`} />
              </Button>
              {/* Menu mobile - botões menores */}
              <div className="flex gap-1 sm:hidden">
                <Button 
                  className="bg-gradient-to-r from-blue-600 to-violet-600"
                  onClick={handleGerarProposta}
                  disabled={gerandoProposta || !user}
                  size="sm"
                >
                  {gerandoProposta ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCompartilhar}
                >
                  <Send className={`w-4 h-4 ${linkCopiado ? "text-green-600" : ""}`} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-4 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Resumo Executivo - Informações Críticas para Decisão */}
            {!loading && edital && (
              <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-xl p-6 md:p-8 shadow-lg border-2 border-blue-200">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Target className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900">Resumo Executivo</h2>
                  </div>
                  {user && scores && (
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-3xl md:text-4xl font-bold text-blue-600">{scores.match}%</div>
                        <div className="text-xs text-gray-600">Match</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl md:text-4xl font-bold text-violet-600">{scores.probabilidade}%</div>
                        <div className="text-xs text-gray-600">Aprovação</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Prazo - Mais Urgente */}
                  <div className="bg-white rounded-lg p-4 border-l-4 border-red-500">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-5 h-5 text-red-600" />
                      <span className="text-sm font-semibold text-gray-700">Prazo de Inscrição</span>
                    </div>
                    {(() => {
                      const prazoFormatado = formatPrazoInscricao(edital?.prazo_inscricao);
                      return (
                        <div className="text-lg font-bold text-gray-900">
                          {prazoFormatado.display}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Valor */}
                  <div className="bg-white rounded-lg p-4 border-l-4 border-green-500">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-semibold text-gray-700">Valor do Projeto</span>
                    </div>
                    {(() => {
                      const valorFormatado = formatValorProjeto(edital?.valor_projeto);
                      return (
                        <div className="text-lg font-bold text-gray-900">
                          {valorFormatado.display === 'Não informado' ? (
                            <span className="text-gray-500">Não informado</span>
                          ) : (
                            valorFormatado.display
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Tipo de Edital */}
                  <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-semibold text-gray-700">Tipo de Edital</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {edital.is_researcher && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                          <GraduationCap className="w-3 h-3 mr-1" />
                          Pesquisadores
                        </Badge>
                      )}
                      {edital.is_company && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          <Building2 className="w-3 h-3 mr-1" />
                          Empresas
                        </Badge>
                      )}
                      {!edital.is_researcher && !edital.is_company && (
                        <Badge variant="outline">Não especificado</Badge>
                      )}
                    </div>
                  </div>

                  {/* Localização */}
                  {edital.localizacao && edital.localizacao !== 'Não informado' && (
                    <div className="bg-white rounded-lg p-4 border-l-4 border-purple-500">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-5 h-5 text-purple-600" />
                        <span className="text-sm font-semibold text-gray-700">Localização</span>
                      </div>
                      <div className="text-lg font-bold text-gray-900">{edital.localizacao}</div>
                    </div>
                  )}
                </div>

                {/* Recomendação Rápida */}
                {user && scores && (
                  <div className={`rounded-lg p-4 border-2 ${
                    scores.match >= 70 && scores.probabilidade >= 60
                      ? 'bg-green-50 border-green-300'
                      : scores.match >= 50 && scores.probabilidade >= 40
                      ? 'bg-yellow-50 border-yellow-300'
                      : 'bg-red-50 border-red-300'
                  }`}>
                    <div className="flex items-start gap-3">
                      {scores.match >= 70 && scores.probabilidade >= 60 ? (
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : scores.match >= 50 && scores.probabilidade >= 40 ? (
                        <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 mb-2">
                          {scores.match >= 70 && scores.probabilidade >= 60
                            ? '✅ Recomendado para você'
                            : scores.match >= 50 && scores.probabilidade >= 40
                            ? '⚠️ Avalie com cuidado'
                            : '❌ Baixa compatibilidade'}
                        </div>
                        {scores.justificativa && (
                          <div className="prose prose-sm max-w-none text-gray-700">
                            <ReactMarkdown
                              components={{
                                h1: ({node, ...props}) => <h1 className="text-base font-bold mb-2 text-gray-900" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-sm font-bold mb-1.5 text-gray-900" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-sm font-semibold mb-1 text-gray-900" {...props} />,
                                p: ({node, ...props}) => <p className="mb-2 leading-relaxed text-sm" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 space-y-0.5 text-sm" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 space-y-0.5 text-sm" {...props} />,
                                li: ({node, ...props}) => <li className="ml-1" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                                em: ({node, ...props}) => <em className="italic" {...props} />,
                                code: ({node, ...props}) => <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono" {...props} />,
                                blockquote: ({node, ...props}) => <blockquote className="border-l-3 border-gray-400 pl-2 italic my-2 text-sm" {...props} />,
                                a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                              }}
                            >
                              {scores.justificativa.length > 200 
                                ? scores.justificativa.substring(0, 200) + '...'
                                : scores.justificativa
                              }
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Informações Detalhadas - Organizadas em Accordion */}
            <Accordion type="multiple" defaultValue={["essenciais", "elegibilidade", "timeline"]} className="space-y-4">
              {/* Informações Essenciais */}
              <AccordionItem value="essenciais" className="bg-white rounded-xl shadow-sm border border-gray-200">
                <AccordionTrigger className="px-4 md:px-6 py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Info className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg md:text-xl font-bold text-gray-900">Informações Essenciais</h2>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 md:px-6 pb-6">
              
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

                      {edital?.localizacao && edital.localizacao !== 'Não informado' && (
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-blue-600 mt-1" />
                          <div className="flex-1">
                            <div className="text-sm text-gray-600">Localização</div>
                            <div className="font-bold text-lg">{edital.localizacao}</div>
                          </div>
                        </div>
                      )}

                      {edital?.vagas && edital.vagas !== 'Não informado' && (
                        <div className="flex items-start gap-3">
                          <Users className="w-5 h-5 text-blue-600 mt-1" />
                          <div className="flex-1">
                            <div className="text-sm text-gray-600">Vagas</div>
                            <div className="font-bold text-lg">{edital.vagas}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* Critérios de Elegibilidade */}
              <AccordionItem value="elegibilidade" className="bg-white rounded-xl shadow-sm border border-gray-200">
                <AccordionTrigger className="px-4 md:px-6 py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg md:text-xl font-bold text-gray-900">Critérios de Elegibilidade</h2>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 md:px-6 pb-6">
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
                </AccordionContent>
              </AccordionItem>

              {/* Sobre o Programa */}
              <AccordionItem value="sobre-programa" className="bg-white rounded-xl shadow-sm border border-gray-200">
                <AccordionTrigger className="px-4 md:px-6 py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg md:text-xl font-bold text-gray-900">Sobre o Programa</h2>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 md:px-6 pb-6">
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
                </AccordionContent>
              </AccordionItem>

              {/* Timeline */}
              {edital?.timeline_estimada && edital.timeline_estimada.fases && Array.isArray(edital.timeline_estimada.fases) && edital.timeline_estimada.fases.length > 0 && (
                <AccordionItem value="timeline" className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <AccordionTrigger className="px-4 md:px-6 py-4 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <h2 className="text-lg md:text-xl font-bold text-gray-900">Timeline Estimada</h2>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 md:px-6 pb-6">
                    <div className="space-y-4">
                      {edital.timeline_estimada.fases.map((fase: any, index: number) => {
                        const isLast = index === edital.timeline_estimada.fases.length - 1;
                        
                        const hoje = new Date();
                        hoje.setHours(0, 0, 0, 0);
                        
                        let statusCalculado = fase.status?.toLowerCase() || 'pendente';
                        
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
                        }
                        
                        const status = statusCalculado;
                        const isAberto = status === 'aberto' || status === 'aberta';
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
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Arquivos do Edital */}
              <AccordionItem value="arquivos" className="bg-white rounded-xl shadow-sm border border-gray-200">
                <AccordionTrigger className="px-4 md:px-6 py-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg md:text-xl font-bold text-gray-900">Arquivos do Edital</h2>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 md:px-6 pb-6">
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
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 md:space-y-6">
            {/* Análise de Match Detalhada */}
            {user && (
              <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <h3 className="text-base md:text-lg font-bold text-gray-900 break-words">Análise Detalhada</h3>
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
                      <div className="prose prose-sm max-w-none text-gray-700">
                        <ReactMarkdown
                          components={{
                            h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-3 text-gray-900" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2 text-gray-900" {...props} />,
                            h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-2 text-gray-900" {...props} />,
                            p: ({node, ...props}) => <p className="mb-3 leading-relaxed text-sm" {...props} />,
                            ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-sm" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-sm" {...props} />,
                            li: ({node, ...props}) => <li className="ml-2" {...props} />,
                            strong: ({node, ...props}) => <strong className="font-semibold text-gray-900" {...props} />,
                            em: ({node, ...props}) => <em className="italic" {...props} />,
                            code: ({node, ...props}) => <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono" {...props} />,
                            blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-3 italic my-3 text-sm" {...props} />,
                            a: ({node, ...props}) => <a className="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                          }}
                        >
                          {scores.justificativa}
                        </ReactMarkdown>
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


          </div>
        </div>
      </div>
    </div>
  );
}
