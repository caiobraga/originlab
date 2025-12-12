import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Calendar, DollarSign, Target } from "lucide-react";

const mockEditais = [
  {
    title: "Finep Inovacred 4.0 - Indústria Digital",
    organization: "Finep",
    value: "R$ 5.000.000",
    valueNumeric: 5000000,
    deadline: "30 dias",
    deadlineDays: 30,
    match: 95,
    probability: "Alta",
    tags: ["Tecnologia", "Indústria 4.0", "Inovação"]
  },
  {
    title: "FAPESP PIPE - Pesquisa Inovativa em Pequenas Empresas",
    organization: "FAPESP",
    value: "R$ 1.000.000",
    valueNumeric: 1000000,
    deadline: "45 dias",
    deadlineDays: 45,
    match: 88,
    probability: "Média-Alta",
    tags: ["Pesquisa", "Startups", "Tecnologia"]
  },
  {
    title: "BNDES Fundo Clima - Tecnologias Verdes",
    organization: "BNDES",
    value: "R$ 3.000.000",
    valueNumeric: 3000000,
    deadline: "60 dias",
    deadlineDays: 60,
    match: 82,
    probability: "Média",
    tags: ["Sustentabilidade", "Clima", "Inovação"]
  },
  {
    title: "CNPq - Chamada Universal",
    organization: "CNPq",
    value: "R$ 150.000",
    valueNumeric: 150000,
    deadline: "20 dias",
    deadlineDays: 20,
    match: 78,
    probability: "Média",
    tags: ["Pesquisa", "Ciência", "Tecnologia"]
  },
  {
    title: "SEBRAE - ALI Inovação",
    organization: "SEBRAE",
    value: "R$ 50.000",
    valueNumeric: 50000,
    deadline: "15 dias",
    deadlineDays: 15,
    match: 92,
    probability: "Alta",
    tags: ["Pequenas Empresas", "Consultoria", "Inovação"]
  }
];

type FilterType = "all" | "high-match" | "near-deadline" | "high-value";

export default function DemoPanel() {
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  const filteredEditais = mockEditais.filter((edital) => {
    switch (activeFilter) {
      case "high-match":
        return edital.match >= 85;
      case "near-deadline":
        return edital.deadlineDays <= 60;
      case "high-value":
        return edital.valueNumeric >= 500000;
      default:
        return true;
    }
  });

  return (
    <section className="py-24 bg-gradient-to-br from-violet-50 via-white to-blue-50">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Painel inteligente em ação
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Veja como a IA ranqueia e apresenta as melhores oportunidades para você
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-8">
            <Badge
              variant={activeFilter === "all" ? "secondary" : "outline"}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                activeFilter === "all"
                  ? "bg-violet-100 hover:bg-violet-200"
                  : "hover:bg-blue-50"
              }`}
              onClick={() => setActiveFilter("all")}
            >
              Todos os editais
            </Badge>
            <Badge
              variant={activeFilter === "high-match" ? "secondary" : "outline"}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                activeFilter === "high-match"
                  ? "bg-violet-100 hover:bg-violet-200"
                  : "hover:bg-blue-50"
              }`}
              onClick={() => setActiveFilter("high-match")}
            >
              Alta aderência
            </Badge>
            <Badge
              variant={activeFilter === "near-deadline" ? "secondary" : "outline"}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                activeFilter === "near-deadline"
                  ? "bg-violet-100 hover:bg-violet-200"
                  : "hover:bg-blue-50"
              }`}
              onClick={() => setActiveFilter("near-deadline")}
            >
              Prazo próximo
            </Badge>
            <Badge
              variant={activeFilter === "high-value" ? "secondary" : "outline"}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                activeFilter === "high-value"
                  ? "bg-violet-100 hover:bg-violet-200"
                  : "hover:bg-blue-50"
              }`}
              onClick={() => setActiveFilter("high-value")}
            >
              Alto valor
            </Badge>
          </div>

          {/* Results count */}
          <div className="mb-4 text-sm text-gray-600">
            Mostrando <span className="font-semibold text-gray-900">{filteredEditais.length}</span> {filteredEditais.length === 1 ? "edital" : "editais"}
          </div>

          {/* Editais List */}
          <div className="space-y-4">
            {filteredEditais.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">Nenhum edital encontrado com este filtro.</p>
              </div>
            ) : (
              filteredEditais.map((edital, index) => (
                <Card key={index} className="p-6 border-2 border-gray-100 hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold ${
                          edital.match >= 90 ? 'bg-green-100 text-green-700' :
                          edital.match >= 85 ? 'bg-blue-100 text-blue-700' :
                          'bg-violet-100 text-violet-700'
                        }`}>
                          {edital.match}%
                        </div>
                        
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 mb-1">
                            {edital.title}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">{edital.organization}</p>
                          
                          <div className="flex flex-wrap gap-2">
                            {edital.tags.map((tag, tagIndex) => (
                              <Badge key={tagIndex} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="w-4 h-4 text-green-600" />
                          <span className="text-gray-700">{edital.value}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span className="text-gray-700">{edital.deadline}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Target className="w-4 h-4 text-violet-600" />
                          <span className="text-gray-700">Match: {edital.match}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingUp className="w-4 h-4 text-orange-600" />
                          <span className="text-gray-700">{edital.probability}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <Button className="w-full md:w-auto bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700">
                        Iniciar Submissão
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              Demonstração com dados fictícios. Cadastre-se para ver oportunidades reais.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
