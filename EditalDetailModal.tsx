import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  Target, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  DollarSign,
  MapPin,
  Users,
  Lightbulb,
  BarChart3,
  FileText
} from "lucide-react";

interface EditalDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edital: {
    titulo: string;
    orgao: string;
    valor: string;
    prazo: string;
    match: number;
    probabilidade: number;
  };
}

export default function EditalDetailModal({ open, onOpenChange, edital }: EditalDetailModalProps) {
  // Dados do algoritmo de matching
  const matchBreakdown = [
    { categoria: "Elegibilidade Básica", peso: 25, score: 25, percentual: 100 },
    { categoria: "Perfil do Proponente", peso: 15, score: 13, percentual: 87 },
    { categoria: "Perfil da Empresa", peso: 15, score: 12, percentual: 80 },
    { categoria: "Área de Atuação", peso: 10, score: 9, percentual: 90 },
    { categoria: "Estágio de Maturidade", peso: 10, score: 8, percentual: 80 },
    { categoria: "Valor do Projeto", peso: 10, score: 10, percentual: 100 },
    { categoria: "Localização", peso: 10, score: 10, percentual: 100 },
    { categoria: "Requisitos Específicos", peso: 5, score: 4, percentual: 80 },
  ];

  // Dados do algoritmo de probabilidade
  const probabilidadeBreakdown = [
    { fator: "Taxa de Aprovação Histórica", peso: 30, score: 22, percentual: 73 },
    { fator: "Qualidade da Proposta", peso: 25, score: 20, percentual: 80 },
    { fator: "Experiência do Proponente", peso: 15, score: 11, percentual: 73 },
    { fator: "Viabilidade Técnica", peso: 15, score: 12, percentual: 80 },
    { fator: "Viabilidade Comercial", peso: 10, score: 7, percentual: 70 },
    { fator: "Apresentação", peso: 5, score: 4, percentual: 80 },
  ];

  const pontosFortes = [
    "Alinhamento perfeito com localização (ES)",
    "Valor do projeto dentro do limite",
    "Aceita proponentes sem empresa constituída",
    "Duas fases de seleção (mais chances)",
    "Capacitações gratuitas oferecidas"
  ];

  const pontosAtencao = [
    "Empresa precisa ser constituída se aprovado",
    "Vídeo pitch obrigatório na Fase 2",
    "Equipe limitada a 5 membros",
    "Coordenador não pode ser alterado após Fase 1",
    "Concorrência estimada: 200-300 propostas para 47 vagas"
  ];

  const timeline = [
    { fase: "Inscrição", status: "aberto", prazo: "30 dias" },
    { fase: "Fase 1: Ideias Inovadoras", status: "pendente", prazo: "60 dias" },
    { fase: "Capacitações", status: "pendente", prazo: "30 dias" },
    { fase: "Fase 2: Projetos de Fomento", status: "pendente", prazo: "90 dias" },
    { fase: "Resultado Final", status: "pendente", prazo: "30 dias" },
    { fase: "Contratação", status: "pendente", prazo: "60 dias" }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{edital.titulo}</DialogTitle>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline">{edital.orgao}</Badge>
            <Badge className="bg-green-500">{edital.match}% Match</Badge>
            <Badge className="bg-blue-500">{edital.probabilidade}% Aprovação</Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="match" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="match">Match</TabsTrigger>
            <TabsTrigger value="probabilidade">Probabilidade</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="recomendacoes">Recomendações</TabsTrigger>
          </TabsList>

          {/* Tab: Match Breakdown */}
          <TabsContent value="match" className="space-y-4">
            <div className="bg-gradient-to-r from-blue-50 to-violet-50 p-6 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-8 h-8 text-blue-600" />
                <div>
                  <h3 className="text-xl font-bold">Match de {edital.match}%</h3>
                  <p className="text-sm text-gray-600">Baseado em 50+ variáveis analisadas</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {matchBreakdown.map((item, index) => (
                  <div key={index} className="bg-white p-3 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm">{item.categoria}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Peso: {item.peso}%</span>
                        <Badge variant={item.percentual >= 90 ? "default" : item.percentual >= 75 ? "secondary" : "outline"}>
                          {item.percentual}%
                        </Badge>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          item.percentual >= 90 ? 'bg-green-500' : 
                          item.percentual >= 75 ? 'bg-blue-500' : 
                          'bg-yellow-500'
                        }`}
                        style={{ width: `${item.percentual}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {item.score}/{item.peso} pontos
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 bg-white rounded-lg">
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-600">91/100</div>
                  <div className="text-sm text-gray-600 mt-1">Pontuação Total</div>
                  <div className="text-xs text-gray-500 mt-2">
                    Arredondado para {edital.match}% para facilitar visualização
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Probabilidade Breakdown */}
          <TabsContent value="probabilidade" className="space-y-4">
            <div className="bg-gradient-to-r from-violet-50 to-blue-50 p-6 rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-8 h-8 text-violet-600" />
                <div>
                  <h3 className="text-xl font-bold">{edital.probabilidade}% de Probabilidade</h3>
                  <p className="text-sm text-gray-600">Baseado em dados históricos + análise preditiva</p>
                </div>
              </div>

              <div className="space-y-3">
                {probabilidadeBreakdown.map((item, index) => (
                  <div key={index} className="bg-white p-3 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm">{item.fator}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Peso: {item.peso}%</span>
                        <Badge variant={item.percentual >= 80 ? "default" : item.percentual >= 70 ? "secondary" : "outline"}>
                          {item.percentual}%
                        </Badge>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          item.percentual >= 80 ? 'bg-violet-500' : 
                          item.percentual >= 70 ? 'bg-blue-500' : 
                          'bg-orange-500'
                        }`}
                        style={{ width: `${item.percentual}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {item.score}/{item.peso} pontos
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-violet-600">~35%</div>
                  <div className="text-xs text-gray-600 mt-1">Taxa Fase 1</div>
                </div>
                <div className="bg-white p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-violet-600">~70%</div>
                  <div className="text-xs text-gray-600 mt-1">Taxa Fase 2</div>
                </div>
                <div className="bg-white p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-violet-600">47</div>
                  <div className="text-xs text-gray-600 mt-1">Vagas Totais</div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Timeline */}
          <TabsContent value="timeline" className="space-y-4">
            <div className="bg-gradient-to-r from-blue-50 to-violet-50 p-6 rounded-lg">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="w-8 h-8 text-blue-600" />
                <div>
                  <h3 className="text-xl font-bold">Timeline do Processo</h3>
                  <p className="text-sm text-gray-600">Estimativa de 270 dias (9 meses)</p>
                </div>
              </div>

              <div className="space-y-4">
                {timeline.map((item, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        item.status === 'aberto' ? 'bg-green-500' : 'bg-gray-300'
                      }`}>
                        {item.status === 'aberto' ? (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        ) : (
                          <div className="w-3 h-3 bg-white rounded-full" />
                        )}
                      </div>
                      {index < timeline.length - 1 && (
                        <div className="w-0.5 h-12 bg-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 pb-8">
                      <div className="bg-white p-4 rounded-lg">
                        <div className="font-medium">{item.fase}</div>
                        <div className="text-sm text-gray-600 mt-1">Duração estimada: {item.prazo}</div>
                        <Badge variant={item.status === 'aberto' ? 'default' : 'outline'} className="mt-2">
                          {item.status === 'aberto' ? 'Aberto' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Tab: Recomendações */}
          <TabsContent value="recomendacoes" className="space-y-4">
            <div className="space-y-4">
              {/* Pontos Fortes */}
              <div className="bg-green-50 p-6 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <h3 className="text-lg font-bold text-green-900">Pontos Fortes</h3>
                </div>
                <ul className="space-y-2">
                  {pontosFortes.map((ponto, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-green-900">{ponto}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pontos de Atenção */}
              <div className="bg-yellow-50 p-6 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                  <h3 className="text-lg font-bold text-yellow-900">Pontos de Atenção</h3>
                </div>
                <ul className="space-y-2">
                  {pontosAtencao.map((ponto, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-yellow-900">{ponto}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Informações do Edital */}
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-lg font-bold text-blue-900 mb-4">Informações do Edital</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">Valor por Projeto</div>
                      <div className="font-bold">Até R$ 139.600</div>
                      <div className="text-xs text-gray-500">R$ 89.600 subvenção + R$ 50.000 bolsas</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">Localização</div>
                      <div className="font-bold">Espírito Santo</div>
                      <div className="text-xs text-gray-500">Empresa deve ser sediada no ES</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">Equipe</div>
                      <div className="font-bold">Até 5 membros</div>
                      <div className="text-xs text-gray-500">Incluindo o coordenador</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Lightbulb className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">Estágio</div>
                      <div className="font-bold">Ideia a MVP</div>
                      <div className="text-xs text-gray-500">Aceita Fase 1 e Fase 2</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-3">
                <Button className="flex-1" size="lg">
                  <FileText className="w-4 h-4 mr-2" />
                  Gerar Proposta com IA
                </Button>
                <Button variant="outline" className="flex-1" size="lg">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Ver Edital Completo
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
