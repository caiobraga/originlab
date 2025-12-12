import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl mx-4 bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Demonstração da Plataforma
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Fechar"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Video Section */}
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Vídeo Explicativo
            </h3>
            <div className="aspect-video bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
              <div className="text-center text-white">
                <div className="w-20 h-20 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <svg
                    className="w-10 h-10"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <p className="text-lg font-medium">
                  Vídeo de demonstração em breve
                </p>
                <p className="text-sm opacity-90 mt-2">
                  Conheça todas as funcionalidades da Origem.Lab
                </p>
              </div>
            </div>
          </div>

          {/* Tour Guiado */}
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Tour Guiado das Funcionalidades
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  title: "1. Dashboard Inteligente",
                  description:
                    "Visualize editais ranqueados por aderência ao seu perfil com probabilidade de aprovação em tempo real.",
                },
                {
                  title: "2. IA Redatora",
                  description:
                    "Gere propostas técnicas completas e aderentes aos critérios de avaliação em minutos.",
                },
                {
                  title: "3. Filtros Avançados",
                  description:
                    "Busque editais por valor, prazo, área de atuação, tipo de fomento e muito mais.",
                },
                {
                  title: "4. Alertas Personalizados",
                  description:
                    "Receba notificações sobre novos editais compatíveis com seu perfil e prazos importantes.",
                },
                {
                  title: "5. Acompanhamento",
                  description:
                    "Monitore o status das suas submissões e gerencie prazos de prestação de contas.",
                },
                {
                  title: "6. Análise de Performance",
                  description:
                    "Visualize histórico de submissões, taxa de aprovação e valores captados.",
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 transition-colors"
                >
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {item.title}
                  </h4>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Screenshots */}
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Screenshots da Plataforma
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  title: "Dashboard Principal",
                  description: "Visão geral dos editais recomendados",
                },
                {
                  title: "Detalhes do Edital",
                  description: "Análise completa de requisitos e critérios",
                },
                {
                  title: "Editor de Propostas",
                  description: "Interface da IA redatora com sugestões",
                },
              ].map((screenshot, index) => (
                <div key={index} className="space-y-2">
                  <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center border border-gray-300">
                    <div className="text-center text-gray-500">
                      <svg
                        className="w-12 h-12 mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-xs">Preview em breve</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      {screenshot.title}
                    </p>
                    <p className="text-xs text-gray-600">
                      {screenshot.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-gradient-to-r from-blue-50 to-violet-50 rounded-lg p-6 text-center border border-blue-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Quer ver a plataforma em ação?
            </h3>
            <p className="text-gray-600 mb-4">
              Agende uma demonstração personalizada com nossa equipe
            </p>
            <Button
              onClick={() => {
                onClose();
                window.location.href = "/demo";
              }}
              className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700"
            >
              Agendar Demonstração Personalizada
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
