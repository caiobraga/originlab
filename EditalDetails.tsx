import { useState } from "react";
import { Link, useParams } from "wouter";
import { 
  ArrowLeft, CheckCircle2, AlertCircle, XCircle, Loader2,
  Calendar, DollarSign, MapPin, Users, FileText, Sparkles,
  Shield, Clock, TrendingUp, Download, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ValidacaoItem {
  criterio: string;
  status: "aprovado" | "atencao" | "reprovado" | "nao_aplicavel";
  valor: string;
  requisito: string;
  fonte: string;
  acaoNecessaria?: string;
}

interface ResultadoValidacao {
  tipo: "cpf" | "cnpj";
  documento: string;
  validacoes: ValidacaoItem[];
  resumo: {
    aprovados: number;
    atencao: number;
    reprovados: number;
    naoAplicavel?: number;
    percentualElegibilidade: number;
  };
}

export default function EditalDetails() {
  const params = useParams();
  const [documento, setDocumento] = useState("");
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoValidacao | null>(null);

  // Simular validação automática
  const handleValidar = async () => {
    if (!documento) {
      toast.error("Informe um CPF ou CNPJ");
      return;
    }

    setValidando(true);
    
    // Simular chamada de API (2 segundos)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const isCPF = documento.replace(/\D/g, "").length === 11;

    if (isCPF) {
      // Simulação de validação CPF
      setResultado({
        tipo: "cpf",
        documento,
        validacoes: [
          {
            criterio: "Idade",
            status: "aprovado",
            valor: "32 anos",
            requisito: "Maior de 18 anos",
            fonte: "Receita Federal"
          },
          {
            criterio: "Residência no ES",
            status: "aprovado",
            valor: "Vitória/ES",
            requisito: "Residente no Espírito Santo",
            fonte: "Receita Federal"
          },
          {
            criterio: "Situação Cadastral",
            status: "aprovado",
            valor: "Regular",
            requisito: "Situação regular no país",
            fonte: "Receita Federal"
          },
          {
            criterio: "Adimplência FAPES",
            status: "aprovado",
            valor: "Adimplente",
            requisito: "Estar adimplente junto à Fapes",
            fonte: "API FAPES"
          },
          {
            criterio: "Centelha Anterior",
            status: "aprovado",
            valor: "Não participou",
            requisito: "Não contratado em edições anteriores",
            fonte: "Base FAPES"
          },
          {
            criterio: "Servidor Público",
            status: "atencao",
            valor: "Não encontrado no SIAPE",
            requisito: "Se servidor, precisa anuência",
            fonte: "SIAPE",
            acaoNecessaria: "Confirmar se é servidor estadual/municipal. Se SIM, precisará de carta de anuência."
          },
          {
            criterio: "Empresas Similares",
            status: "aprovado",
            valor: "Nenhuma empresa vinculada",
            requisito: "Não ser sócio de empresas afins",
            fonte: "Receita Federal"
          }
        ],
        resumo: {
          aprovados: 6,
          atencao: 1,
          reprovados: 0,
          percentualElegibilidade: 95
        }
      });
    } else {
      // Simulação de validação CNPJ
      setResultado({
        tipo: "cnpj",
        documento,
        validacoes: [
          {
            criterio: "Data de Constituição",
            status: "aprovado",
            valor: "15/03/2025",
            requisito: "Constituída após 07/10/2024",
            fonte: "Receita Federal"
          },
          {
            criterio: "Sede no ES",
            status: "aprovado",
            valor: "Vila Velha/ES",
            requisito: "Sediada no Espírito Santo",
            fonte: "Receita Federal"
          },
          {
            criterio: "Porte",
            status: "aprovado",
            valor: "ME - Microempresa",
            requisito: "Enquadrada como ME ou EPP",
            fonte: "Receita Federal"
          },
          {
            criterio: "Faturamento",
            status: "aprovado",
            valor: "R$ 0 (empresa nova)",
            requisito: "Faturamento < R$ 4.8M/ano",
            fonte: "Receita Federal"
          },
          {
            criterio: "Situação Cadastral",
            status: "aprovado",
            valor: "Ativa",
            requisito: "Situação cadastral ativa",
            fonte: "Receita Federal"
          },
          {
            criterio: "Natureza Jurídica",
            status: "aprovado",
            valor: "Sociedade Limitada",
            requisito: "Não pode ser EI ou MEI",
            fonte: "Receita Federal"
          },
          {
            criterio: "Objeto Social",
            status: "atencao",
            valor: "CNAE: 6201-5/00 - Desenvolvimento de software",
            requisito: "Objeto social relacionado à proposta",
            fonte: "Receita Federal",
            acaoNecessaria: "Verificar alinhamento específico com sua proposta inovadora."
          },
          {
            criterio: "Adimplência FAPES",
            status: "aprovado",
            valor: "Adimplente",
            requisito: "Estar adimplente junto à Fapes",
            fonte: "API FAPES"
          },
          {
            criterio: "Centelha Anterior",
            status: "aprovado",
            valor: "Não participou",
            requisito: "Não contratada em edições anteriores",
            fonte: "Base FAPES"
          },
          {
            criterio: "Inova Simples",
            status: "nao_aplicavel",
            valor: "Não é Inova Simples",
            requisito: "Opcional - pode ser Inova Simples",
            fonte: "Receita Federal"
          }
        ],
        resumo: {
          aprovados: 8,
          atencao: 1,
          reprovados: 0,
          naoAplicavel: 1,
          percentualElegibilidade: 98
        }
      });
    }

    setValidando(false);
    toast.success("Validação concluída!");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "aprovado":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "atencao":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "reprovado":
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Shield className="w-5 h-5 text-gray-400" />;
    }
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
              <h1 className="text-2xl font-bold text-gray-900">Centelha III - Espírito Santo</h1>
              <p className="text-sm text-gray-600">FAPES + FINEP + CNPq</p>
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
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-blue-600 mt-1" />
                  <div>
                    <div className="text-sm text-gray-600">Valor por Projeto</div>
                    <div className="font-bold text-lg">Até R$ 139.600</div>
                    <div className="text-xs text-gray-500">R$ 89.600 subvenção + R$ 50.000 bolsas</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-blue-600 mt-1" />
                  <div>
                    <div className="text-sm text-gray-600">Prazo de Inscrição</div>
                    <div className="font-bold text-lg">30 dias</div>
                    <div className="text-xs text-gray-500">Até 10/12/2025</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-blue-600 mt-1" />
                  <div>
                    <div className="text-sm text-gray-600">Localização</div>
                    <div className="font-bold text-lg">Espírito Santo</div>
                    <div className="text-xs text-gray-500">Empresa deve ser sediada no ES</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-blue-600 mt-1" />
                  <div>
                    <div className="text-sm text-gray-600">Vagas</div>
                    <div className="font-bold text-lg">47 projetos</div>
                    <div className="text-xs text-gray-500">R$ 4.211.200 total</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Validação Automática */}
            <div className="bg-gradient-to-r from-blue-50 to-violet-50 rounded-xl p-6 border border-blue-200">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-6 h-6 text-blue-600" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Validação Automática de Elegibilidade</h2>
                  <p className="text-sm text-gray-600">Verifique instantaneamente se você atende aos critérios objetivos</p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Informe seu CPF ou CNPJ
                </label>
                <div className="flex gap-3">
                  <Input
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    disabled={validando}
                  />
                  <Button 
                    onClick={handleValidar}
                    disabled={validando}
                    className="bg-gradient-to-r from-blue-600 to-violet-600"
                  >
                    {validando ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Validando...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4 mr-2" />
                        Validar
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  ✓ Seguro e confidencial • Dados consultados em bases oficiais (Receita Federal, FAPES)
                </p>
              </div>

              {/* Resultado da Validação */}
              {resultado && (
                <div className="space-y-4">
                  {/* Resumo */}
                  <div className="bg-white rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-sm text-gray-600">Elegibilidade Calculada</div>
                        <div className="text-4xl font-bold text-blue-600">{resultado.resumo.percentualElegibilidade}%</div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 text-green-600 mb-1">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="font-bold">{resultado.resumo.aprovados} aprovados</span>
                        </div>
                        {resultado.resumo.atencao > 0 && (
                          <div className="flex items-center gap-2 text-yellow-600 mb-1">
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-bold">{resultado.resumo.atencao} atenção</span>
                          </div>
                        )}
                        {resultado.resumo.reprovados > 0 && (
                          <div className="flex items-center gap-2 text-red-600">
                            <XCircle className="w-5 h-5" />
                            <span className="font-bold">{resultado.resumo.reprovados} reprovados</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg ${
                      resultado.resumo.percentualElegibilidade >= 90 ? 'bg-green-50 border border-green-200' :
                      resultado.resumo.percentualElegibilidade >= 70 ? 'bg-yellow-50 border border-yellow-200' :
                      'bg-red-50 border border-red-200'
                    }`}>
                      <p className="font-medium">
                        {resultado.resumo.percentualElegibilidade >= 90 ? '✅ Recomendação: CANDIDATAR-SE' :
                         resultado.resumo.percentualElegibilidade >= 70 ? '⚠️ Recomendação: REVISAR PONTOS DE ATENÇÃO' :
                         '❌ Recomendação: VERIFICAR REQUISITOS'}
                      </p>
                      <p className="text-sm mt-1">
                        {resultado.resumo.percentualElegibilidade >= 90 ? 'Você atende a maioria dos critérios objetivos!' :
                         resultado.resumo.percentualElegibilidade >= 70 ? 'Alguns critérios precisam de atenção.' :
                         'Você não atende a critérios essenciais.'}
                      </p>
                    </div>
                  </div>

                  {/* Critérios Aprovados */}
                  {resultado.validacoes.filter(v => v.status === "aprovado").length > 0 && (
                    <div className="bg-white rounded-lg p-4">
                      <h3 className="font-bold text-green-700 mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5" />
                        Critérios Aprovados ({resultado.validacoes.filter(v => v.status === "aprovado").length})
                      </h3>
                      <div className="space-y-2">
                        {resultado.validacoes.filter(v => v.status === "aprovado").map((val, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                            {getStatusIcon(val.status)}
                            <div className="flex-1">
                              <div className="font-medium text-sm">{val.criterio}</div>
                              <div className="text-xs text-gray-600">{val.valor}</div>
                              <div className="text-xs text-gray-500 mt-1">Requisito: {val.requisito}</div>
                            </div>
                            <div className="text-xs text-gray-400">{val.fonte}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Critérios de Atenção */}
                  {resultado.validacoes.filter(v => v.status === "atencao").length > 0 && (
                    <div className="bg-white rounded-lg p-4">
                      <h3 className="font-bold text-yellow-700 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Pontos de Atenção ({resultado.validacoes.filter(v => v.status === "atencao").length})
                      </h3>
                      <div className="space-y-2">
                        {resultado.validacoes.filter(v => v.status === "atencao").map((val, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                            {getStatusIcon(val.status)}
                            <div className="flex-1">
                              <div className="font-medium text-sm">{val.criterio}</div>
                              <div className="text-xs text-gray-600">{val.valor}</div>
                              <div className="text-xs text-gray-500 mt-1">Requisito: {val.requisito}</div>
                              {val.acaoNecessaria && (
                                <div className="text-xs text-yellow-700 mt-2 font-medium">
                                  → {val.acaoNecessaria}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">{val.fonte}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Critérios Reprovados */}
                  {resultado.validacoes.filter(v => v.status === "reprovado").length > 0 && (
                    <div className="bg-white rounded-lg p-4">
                      <h3 className="font-bold text-red-700 mb-3 flex items-center gap-2">
                        <XCircle className="w-5 h-5" />
                        Critérios Não Atendidos ({resultado.validacoes.filter(v => v.status === "reprovado").length})
                      </h3>
                      <div className="space-y-2">
                        {resultado.validacoes.filter(v => v.status === "reprovado").map((val, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                            {getStatusIcon(val.status)}
                            <div className="flex-1">
                              <div className="font-medium text-sm">{val.criterio}</div>
                              <div className="text-xs text-gray-600">{val.valor}</div>
                              <div className="text-xs text-gray-500 mt-1">Requisito: {val.requisito}</div>
                              {val.acaoNecessaria && (
                                <div className="text-xs text-red-700 mt-2 font-medium">
                                  → {val.acaoNecessaria}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">{val.fonte}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Descrição do Edital */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Sobre o Programa</h2>
              <div className="prose prose-sm max-w-none text-gray-700">
                <p>
                  O Programa Centelha – Espírito Santo tem como objetivo estimular o empreendedorismo inovador 
                  por meio de capacitações para o desenvolvimento de produtos (bens e/ou serviços) ou de processos 
                  inovadores e apoiar, por meio da concessão de recursos de subvenção econômica (recursos não 
                  reembolsáveis) e Bolsas de Fomento Tecnológico e Extensão Inovadora, a geração de empresas de 
                  base tecnológica a partir da transformação de ideias inovadoras em negócios que incorporem novas 
                  tecnologias aos setores econômicos estratégicos do estado do Espírito Santo.
                </p>
                <p className="mt-3">
                  O processo seletivo possui duas fases: <strong>Fase 1 (Ideias Inovadoras)</strong> e{" "}
                  <strong>Fase 2 (Projetos de Fomento)</strong>. Durante as duas fases de seleção, os proponentes 
                  receberão capacitações gratuitas online ou presenciais.
                </p>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4">Ações</h3>
              <div className="space-y-3">
                <Button className="w-full bg-gradient-to-r from-blue-600 to-violet-600">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar proposta com IA
                </Button>
                <Button variant="outline" className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Baixar edital completo
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
