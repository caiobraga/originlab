import { useState, useEffect } from "react";
import { Bell, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  type: "novo_edital" | "prazo_proximo" | "match_alto";
  titulo: string;
  descricao: string;
  timestamp: Date;
  lido: boolean;
}

export default function PushNotifications() {
  const [notificacoes, setNotificacoes] = useState<Notification[]>([]);
  const [mostrarPanel, setMostrarPanel] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);

  // Simular recebimento de notificações em tempo real
  useEffect(() => {
    const novasNotificacoes: Notification[] = [
      {
        id: "1",
        type: "novo_edital",
        titulo: "🎯 Novo edital com 95% de match!",
        descricao: "FAPESP PIPE - Pesquisa Inovativa (R$ 1M) - Prazo: 15 de março",
        timestamp: new Date(Date.now() - 5 * 60000), // 5 minutos atrás
        lido: false
      },
      {
        id: "2",
        type: "prazo_proximo",
        titulo: "⏰ Prazo se encerra em 7 dias!",
        descricao: "FINEP Startup - Inovação Tecnológica (R$ 500k)",
        timestamp: new Date(Date.now() - 30 * 60000), // 30 minutos atrás
        lido: false
      },
      {
        id: "3",
        type: "match_alto",
        titulo: "✨ Edital com match acima de 90%",
        descricao: "CNPq Produtividade - Sua proposta tem 90% de compatibilidade",
        timestamp: new Date(Date.now() - 2 * 60 * 60000), // 2 horas atrás
        lido: false
      }
    ];

    setNotificacoes(novasNotificacoes);
    setNaoLidas(novasNotificacoes.filter(n => !n.lido).length);
  }, []);

  const marcarComoLido = (id: string) => {
    setNotificacoes(prev =>
      prev.map(n => (n.id === id ? { ...n, lido: true } : n))
    );
    setNaoLidas(prev => Math.max(0, prev - 1));
  };

  const removerNotificacao = (id: string) => {
    setNotificacoes(prev => prev.filter(n => n.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "novo_edital":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "prazo_proximo":
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case "match_alto":
        return <Bell className="w-5 h-5 text-blue-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const formatarTempo = (data: Date) => {
    const agora = new Date();
    const diff = agora.getTime() - data.getTime();
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(diff / 3600000);
    const dias = Math.floor(diff / 86400000);

    if (minutos < 60) return `${minutos}m atrás`;
    if (horas < 24) return `${horas}h atrás`;
    return `${dias}d atrás`;
  };

  return (
    <>
      {/* Bell Icon com Badge */}
      <button
        onClick={() => setMostrarPanel(!mostrarPanel)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-6 h-6 text-gray-700" />
        {naoLidas > 0 && (
          <span className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {naoLidas}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {mostrarPanel && (
        <div className="fixed top-16 right-4 w-96 max-h-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-violet-600 text-white p-4 flex items-center justify-between">
            <h3 className="font-semibold text-lg">Notificações</h3>
            <button
              onClick={() => setMostrarPanel(false)}
              className="hover:bg-white hover:bg-opacity-20 p-1 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notificacoes.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notificacoes.map(notif => (
                  <div
                    key={notif.id}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      !notif.lido ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900">
                          {notif.titulo}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {notif.descricao}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {formatarTempo(notif.timestamp)}
                        </p>
                      </div>
                      <button
                        onClick={() => removerNotificacao(notif.id)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {!notif.lido && (
                      <button
                        onClick={() => marcarComoLido(notif.id)}
                        className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        Marcar como lido
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notificacoes.length > 0 && (
            <div className="border-t border-gray-200 p-3 bg-gray-50">
              <Button
                variant="outline"
                className="w-full text-sm"
                onClick={() => {
                  setNotificacoes([]);
                  setNaoLidas(0);
                }}
              >
                Limpar todas
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
