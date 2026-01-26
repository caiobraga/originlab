import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, DollarSign, Target, CheckCircle2, 
  GraduationCap, Building2, Users, Eye, Loader2,
  TrendingUp, Clock, Sparkles, ArrowRight, Lock
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatValorProjeto, formatPrazoInscricao } from "@/lib/editalFormatters";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface EditalDisplay {
  id: string;
  numero: string | null;
  titulo: string;
  descricao: string | null;
  valor_projeto: string | null;
  prazo_inscricao: string | null;
  data_encerramento: string | null;
  orgao: string | null;
  area: string | null;
  is_researcher: boolean | null;
  is_company: boolean | null;
  match?: number;
}

type FilterType = "todos" | "alta-aderencia" | "prazo-proximo" | "alto-valor";

export default function IntelligentPanel() {
  const [editais, setEditais] = useState<EditalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("todos");
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    loadEditais();
  }, []);

  const loadEditais = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("editais")
        .select("id, numero, titulo, descricao, valor_projeto, prazo_inscricao, data_encerramento, orgao, area, is_researcher, is_company")
        .order("criado_em", { ascending: false })
        .limit(50); // Buscar mais para ter opções de filtro

      if (error) {
        console.error("Erro ao buscar editais:", error);
        return;
      }

      setEditais(data || []);
    } catch (error) {
      console.error("Erro ao carregar editais:", error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredEditais = (): EditalDisplay[] => {
    let filtered = [...editais];

    switch (activeFilter) {
      case "alta-aderencia":
        // Simular alta aderência - editais com match alto (se tivéssemos scores)
        // Por enquanto, ordenar por relevância (editais com mais informações)
        filtered = filtered
          .filter(e => e.descricao && e.valor_projeto && e.prazo_inscricao)
          .slice(0, 5);
        break;
      
      case "prazo-proximo":
        // Filtrar por prazo próximo (próximos 120 dias ou editais ainda não encerrados)
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); // Normalizar para início do dia
        const em120Dias = new Date();
        em120Dias.setDate(hoje.getDate() + 120);
        em120Dias.setHours(23, 59, 59, 999); // Fim do dia
        
        // Função auxiliar para extrair data de um edital
        const extrairDataFim = (edital: EditalDisplay): Date | null => {
          try {
            // Priorizar data_encerramento (tipo DATE no banco)
            if (edital.data_encerramento) {
              const dataEncerramento = new Date(edital.data_encerramento);
              if (!isNaN(dataEncerramento.getTime())) {
                return dataEncerramento;
              }
            }
            
            // Se não tiver data_encerramento, tentar extrair de prazo_inscricao
            if (edital.prazo_inscricao) {
              const prazoFormatado = formatPrazoInscricao(edital.prazo_inscricao);
              
              // Tentar extrair data dos detalhes
              if (prazoFormatado.details && prazoFormatado.details.length > 0) {
                for (const prazo of prazoFormatado.details) {
                  let dataStr: string | null = null;
                  
                  if (typeof prazo === 'string') {
                    // Tentar extrair data da string (formato DD/MM/YYYY ou YYYY-MM-DD)
                    const dateMatch = prazo.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                      dataStr = dateMatch[1];
                    }
                  } else if (prazo.fim) {
                    dataStr = prazo.fim;
                  } else if (prazo.prazo && typeof prazo.prazo === 'string') {
                    const dateMatch = prazo.prazo.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                      dataStr = dateMatch[1];
                    }
                  }
                  
                  if (dataStr) {
                    // Converter DD/MM/YYYY para YYYY-MM-DD se necessário
                    let dataFormatada = dataStr;
                    if (dataStr.includes('/')) {
                      const [dia, mes, ano] = dataStr.split('/');
                      dataFormatada = `${ano}-${mes}-${dia}`;
                    }
                    
                    const dataParsed = new Date(dataFormatada);
                    if (!isNaN(dataParsed.getTime())) {
                      return dataParsed;
                    }
                  }
                }
              }
            }
            
            return null;
          } catch (error) {
            console.error('Erro ao extrair data do edital:', edital.id, error);
            return null;
          }
        };
        
        filtered = filtered
          .map(e => ({ edital: e, dataFim: extrairDataFim(e) }))
          .filter(({ dataFim }) => {
            if (!dataFim || isNaN(dataFim.getTime())) return false;
            
            // Normalizar data para comparação
            const dataNormalizada = new Date(dataFim);
            dataNormalizada.setHours(0, 0, 0, 0);
            
            // Aceitar editais que ainda não encerraram (data >= hoje) e estão dentro de 120 dias
            return dataNormalizada >= hoje && dataNormalizada <= em120Dias;
          })
          .sort((a, b) => {
            // Ordenar por data de encerramento (mais próximo primeiro)
            if (!a.dataFim && !b.dataFim) return 0;
            if (!a.dataFim) return 1;
            if (!b.dataFim) return -1;
            
            return a.dataFim.getTime() - b.dataFim.getTime();
          })
          .map(({ edital }) => edital)
          .slice(0, 5);
        break;
      
      case "alto-valor":
        // Filtrar por alto valor (acima de R$ 100k)
        filtered = filtered
          .filter(e => {
            if (!e.valor_projeto) return false;
            const valorFormatado = formatValorProjeto(e.valor_projeto);
            if (valorFormatado.display === 'Não informado') return false;
            
            // Extrair número do valor
            const match = valorFormatado.display.match(/[\d.]+/);
            if (!match) return false;
            
            const valor = parseFloat(match[0].replace(/\./g, ''));
            return valor >= 100000;
          })
          .slice(0, 5);
        break;
      
      default:
        filtered = filtered.slice(0, 5);
    }

    return filtered;
  };

  const filteredEditais = getFilteredEditais();

  return (
    <section className="py-20 bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="container">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
            <Sparkles className="w-4 h-4" />
            Painel inteligente em ação
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Veja como a IA ranqueia e apresenta as melhores oportunidades para você
          </h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <button
            onClick={() => setActiveFilter("todos")}
            className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-200 ${
              activeFilter === "todos"
                ? "bg-blue-600 text-white shadow-md hover:shadow-lg"
                : "bg-white text-gray-700 border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50"
            }`}
          >
            Todos os editais
          </button>
          <button
            onClick={() => setActiveFilter("alta-aderencia")}
            className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeFilter === "alta-aderencia"
                ? "bg-green-600 text-white shadow-md hover:shadow-lg"
                : "bg-white text-gray-700 border-2 border-gray-200 hover:border-green-500 hover:bg-green-50"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Alta aderência
          </button>
          <button
            onClick={() => setActiveFilter("prazo-proximo")}
            className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeFilter === "prazo-proximo"
                ? "bg-orange-600 text-white shadow-md hover:shadow-lg"
                : "bg-white text-gray-700 border-2 border-gray-200 hover:border-orange-500 hover:bg-orange-50"
            }`}
          >
            <Clock className="w-4 h-4" />
            Prazo próximo
          </button>
          <button
            onClick={() => setActiveFilter("alto-valor")}
            className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeFilter === "alto-valor"
                ? "bg-purple-600 text-white shadow-md hover:shadow-lg"
                : "bg-white text-gray-700 border-2 border-gray-200 hover:border-purple-500 hover:bg-purple-50"
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Alto valor
          </button>
        </div>

        {/* Lista de Editais */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Carregando editais...</span>
          </div>
        ) : filteredEditais.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Nenhum edital encontrado com este filtro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {filteredEditais.map((edital) => (
              <Card
                key={edital.id}
                className="p-6 hover:shadow-lg transition-all duration-200 border border-gray-200"
              >
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-lg font-bold text-gray-900 line-clamp-2 flex-1">
                        {edital.titulo}
                      </h3>
                    </div>
                    
                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {(() => {
                        const isResearcher = edital.is_researcher === true;
                        const isCompany = edital.is_company === true;
                        
                        if (isResearcher && isCompany) {
                          return (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                              <Users className="w-3 h-3 mr-1" />
                              Pesquisadores e Empresas
                            </Badge>
                          );
                        } else if (isResearcher) {
                          return (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                              <GraduationCap className="w-3 h-3 mr-1" />
                              Pesquisadores
                            </Badge>
                          );
                        } else if (isCompany) {
                          return (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                              <Building2 className="w-3 h-3 mr-1" />
                              Empresas
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Órgão */}
                    {edital.orgao && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{edital.orgao}</span>
                      </div>
                    )}
                  </div>

                  {/* Informações */}
                  <div className="space-y-2 mb-4 flex-1">
                    {(() => {
                      const valorFormatado = formatValorProjeto(edital.valor_projeto || null);
                      if (valorFormatado.display !== 'Não informado') {
                        return (
                          <div className="flex items-center gap-2 text-sm">
                            <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="font-semibold text-gray-900">{valorFormatado.display}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {(() => {
                      const prazoFormatado = formatPrazoInscricao(edital.prazo_inscricao || null);
                      if (prazoFormatado.display !== 'Não informado') {
                        return (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span>{prazoFormatado.display}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {edital.area && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Target className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span>{edital.area}</span>
                      </div>
                    )}
                  </div>

                  {/* Match Score (simulado para demonstração) */}
                  {edital.match !== undefined ? (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Match</span>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-blue-600">{edital.match}%</span>
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Match</span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-gray-600">Calculado após login</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Botão */}
                  <Button 
                    variant="outline" 
                    className="w-full transition-all duration-200 hover:scale-[1.02] group"
                    onClick={() => {
                      if (!user) {
                        toast.info("Faça login para ver os detalhes completos do edital");
                        setLocation(`/login?redirect=/edital/${edital.id}`);
                      } else {
                        setLocation(`/edital/${edital.id}`);
                      }
                    }}
                  >
                    {user ? (
                      <>
                        <Eye className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                        Ver detalhes
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2 transition-transform duration-200 group-hover:scale-110" />
                        Fazer login para ver detalhes
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="text-center mt-12">
          <Link href="/dashboard">
            <Button 
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
            >
              Ver todos os editais
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
