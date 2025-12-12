import { useState } from "react";
import { ArrowLeft, Search, Filter, Calendar, DollarSign, Building2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export default function Demo() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedValue, setSelectedValue] = useState<string>("all");
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  const areas = [
    { id: "all", label: "Todas as áreas" },
    { id: "tech", label: "Tecnologia" },
    { id: "health", label: "Saúde" },
    { id: "agro", label: "Agronegócio" },
    { id: "energy", label: "Energia" },
    { id: "education", label: "Educação" },
  ];

  const valueRanges = [
    { id: "all", label: "Todos os valores" },
    { id: "low", label: "Até R$ 100k" },
    { id: "medium", label: "R$ 100k - R$ 500k" },
    { id: "high", label: "R$ 500k - R$ 2M" },
    { id: "very-high", label: "Acima de R$ 2M" },
  ];

  const mockEditais = [
    {
      id: 1,
      title: "FAPESP - Pesquisa Inovativa em Pequenas Empresas (PIPE)",
      agency: "FAPESP",
      value: "R$ 1.000.000",
      deadline: "30/12/2025",
      area: "Tecnologia",
      match: 95,
      probability: 87,
      description: "Apoio a pesquisa científica e tecnológica em micro, pequenas e médias empresas",
    },
    {
      id: 2,
      title: "FINEP - Subvenção Econômica à Inovação",
      agency: "FINEP",
      value: "R$ 3.500.000",
      deadline: "15/01/2026",
      area: "Tecnologia",
      match: 92,
      probability: 82,
      description: "Recursos não reembolsáveis para desenvolvimento de produtos e processos inovadores",
    },
    {
      id: 3,
      title: "CNPq - Chamada Universal",
      agency: "CNPq",
      value: "R$ 150.000",
      deadline: "20/11/2025",
      area: "Saúde",
      match: 88,
      probability: 75,
      description: "Apoio a projetos de pesquisa científica, tecnológica e de inovação",
    },
    {
      id: 4,
      title: "BNDES - Fundo Clima",
      agency: "BNDES",
      value: "R$ 5.000.000",
      deadline: "28/02/2026",
      area: "Energia",
      match: 85,
      probability: 78,
      description: "Financiamento para projetos de mitigação e adaptação às mudanças climáticas",
    },
    {
      id: 5,
      title: "SEBRAE - ALI - Agentes Locais de Inovação",
      agency: "SEBRAE",
      value: "R$ 50.000",
      deadline: "10/12/2025",
      area: "Tecnologia",
      match: 82,
      probability: 90,
      description: "Consultoria gratuita em inovação para micro e pequenas empresas",
    },
  ];

  const filteredEditais = mockEditais.filter((edital) => {
    const matchesSearch =
      searchTerm === "" ||
      edital.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      edital.agency.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesArea = selectedArea === "all" || edital.area === areas.find(a => a.id === selectedArea)?.label;
    return matchesSearch && matchesArea;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">Voltar</span>
            </a>
          </Link>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
            Origem.Lab - Demo Interativa
          </h1>
          <Button
            onClick={() => setShowScheduleForm(true)}
            className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
          >
            Agendar Demonstração
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Intro */}
        <div className="bg-gradient-to-r from-blue-50 to-violet-50 rounded-lg p-6 mb-8 border border-blue-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Explore a Plataforma Origem.Lab
          </h2>
          <p className="text-gray-700">
            Esta é uma demonstração interativa do nosso dashboard. Teste os filtros, busque editais e veja como a IA ranqueia oportunidades por aderência ao seu perfil.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="md:col-span-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Buscar por título ou agência..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Area Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Área de Atuação
              </label>
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Value Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Faixa de Valor
              </label>
              <select
                value={selectedValue}
                onChange={(e) => setSelectedValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {valueRanges.map((range) => (
                  <option key={range.id} value={range.id}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Deadline Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prazo
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option>Todos os prazos</option>
                <option>Até 30 dias</option>
                <option>30-60 dias</option>
                <option>Mais de 60 dias</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {filteredEditais.length} editais encontrados
            </h3>
            <div className="text-sm text-gray-600">
              Ordenado por: <span className="font-medium text-blue-600">Maior aderência</span>
            </div>
          </div>

          <div className="space-y-4">
            {filteredEditais.map((edital) => (
              <div
                key={edital.id}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow border border-gray-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">
                      {edital.title}
                    </h4>
                    <p className="text-sm text-gray-600 mb-3">
                      {edital.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4">
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      {edital.match}% match
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                      {edital.probability}% aprovação
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{edital.agency}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{edital.value}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{edital.deadline}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-700">{edital.area}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="default" className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700">
                    Ver Detalhes
                  </Button>
                  <Button variant="outline">
                    Gerar Proposta com IA
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Schedule Form Modal */}
      {showScheduleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-2xl p-6">
            <button
              onClick={() => setShowScheduleForm(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Agendar Demonstração Personalizada
            </h2>

            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome completo
                </label>
                <Input type="text" placeholder="Seu nome" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <Input type="email" placeholder="seu@email.com" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Telefone
                </label>
                <Input type="tel" placeholder="(00) 00000-0000" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Organização
                </label>
                <Input type="text" placeholder="Empresa, universidade ou instituição" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de perfil
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option>Startup</option>
                  <option>Pesquisador</option>
                  <option>Empresa</option>
                  <option>Universidade</option>
                  <option>Incubadora/Aceleradora</option>
                  <option>Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mensagem (opcional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Conte-nos sobre suas necessidades..."
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Obrigado! Nossa equipe entrará em contato em breve.");
                  setShowScheduleForm(false);
                }}
              >
                Enviar Solicitação
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
