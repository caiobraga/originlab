import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Share2, Users, TrendingUp, Gift, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Referencia() {
  const [copiado, setCopiado] = useState(false);
  const [referralLink] = useState("https://origem.lab/ref/user123abc");
  const [stats] = useState({
    convites: 12,
    conversoes: 3,
    ganhos: 150,
    potencial: 500
  });

  const copiarLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiado(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopiado(false), 2000);
  };

  const compartilharWhatsApp = () => {
    const texto = `Descobri a Origem.Lab - plataforma de IA para encontrar editais de fomento! Ganhe R$ 50 por cada amigo que se cadastrar: ${referralLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`);
  };

  const compartilharEmail = () => {
    const assunto = "Descubra a Origem.Lab - Plataforma de IA para Fomento";
    const corpo = `Olá!\n\nDescobri uma plataforma incrível que encontra automaticamente editais de fomento com IA. Você ganha R$ 50 por cada amigo que se cadastrar!\n\nMeu link: ${referralLink}\n\nAcesse agora!`;
    window.open(`mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-violet-50 py-12">
      <div className="container max-w-4xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Programa de Referência
          </h1>
          <p className="text-xl text-gray-600">
            Ganhe R$ 50 por cada amigo que se cadastrar na Origem.Lab
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <Card className="p-6 text-center">
            <Users className="w-8 h-8 text-blue-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-gray-900">{stats.convites}</p>
            <p className="text-sm text-gray-600 mt-1">Convites enviados</p>
          </Card>
          <Card className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-gray-900">{stats.conversoes}</p>
            <p className="text-sm text-gray-600 mt-1">Conversões</p>
          </Card>
          <Card className="p-6 text-center">
            <Gift className="w-8 h-8 text-violet-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-gray-900">R$ {stats.ganhos}</p>
            <p className="text-sm text-gray-600 mt-1">Ganhos até agora</p>
          </Card>
          <Card className="p-6 text-center">
            <TrendingUp className="w-8 h-8 text-orange-600 mx-auto mb-3" />
            <p className="text-3xl font-bold text-gray-900">R$ {stats.potencial}</p>
            <p className="text-sm text-gray-600 mt-1">Potencial próximos 30 dias</p>
          </Card>
        </div>

        {/* Referral Link Section */}
        <Card className="p-8 mb-12 border-2 border-violet-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Seu Link de Referência</h2>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-6 flex items-center justify-between">
            <code className="text-sm font-mono text-gray-700 break-all">
              {referralLink}
            </code>
            <Button
              onClick={copiarLink}
              className={`ml-4 flex-shrink-0 ${
                copiado
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Copy className="w-4 h-4 mr-2" />
              {copiado ? "Copiado!" : "Copiar"}
            </Button>
          </div>

          <p className="text-sm text-gray-600 mb-6">
            Compartilhe este link com seus amigos, colegas e seguidores. Cada pessoa que se cadastrar usando seu link gerará R$ 50 em créditos para você!
          </p>

          {/* Share Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={compartilharWhatsApp}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Compartilhar no WhatsApp
            </Button>
            <Button
              onClick={compartilharEmail}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Enviar por Email
            </Button>
            <Button
              className="bg-gray-600 hover:bg-gray-700 text-white"
              onClick={() => toast.info("Copie o link e compartilhe em suas redes!")}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Outras Redes
            </Button>
          </div>
        </Card>

        {/* How It Works */}
        <Card className="p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Como Funciona</h2>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Compartilhe seu link</h3>
                <p className="text-gray-600">
                  Copie e compartilhe seu link de referência com amigos, colegas e seguidores
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Eles se cadastram</h3>
                <p className="text-gray-600">
                  Quando alguém clica no seu link e se cadastra na Origem.Lab, você ganha R$ 50
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Receba seus ganhos</h3>
                <p className="text-gray-600">
                  Os créditos são adicionados automaticamente à sua conta e podem ser usados para upgrade de plano
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold">
                4
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Ganhe ainda mais</h3>
                <p className="text-gray-600">
                  Quanto mais amigos você indicar, mais você ganha. Sem limite de ganhos!
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Leaderboard */}
        <Card className="p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Top Referrers</h2>
          
          <div className="space-y-4">
            {[
              { nome: "Maria Silva", ganhos: 1250, convites: 25 },
              { nome: "João Santos", ganhos: 950, convites: 19 },
              { nome: "Ana Costa", ganhos: 750, convites: 15 },
              { nome: "Você", ganhos: 150, convites: 3, destaque: true }
            ].map((user, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-4 rounded-lg ${
                  user.destaque
                    ? "bg-gradient-to-r from-blue-100 to-violet-100 border-2 border-blue-400"
                    : "bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold text-gray-400 w-8">
                    #{idx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{user.nome}</p>
                    <p className="text-sm text-gray-600">{user.convites} convites</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-600">R$ {user.ganhos}</p>
                  <p className="text-xs text-gray-600">ganhos</p>
                </div>
              </div>
            ))}
          </div>

          <Button className="w-full mt-8 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white">
            Ver Leaderboard Completo
          </Button>
        </Card>

        {/* FAQ */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Dúvidas Frequentes</h2>
          
          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Quanto tempo leva para receber os ganhos?</h3>
              <p className="text-gray-600">
                Os créditos são adicionados instantaneamente à sua conta após a confirmação do cadastro do seu referido.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Posso usar os ganhos para pagar meu plano?</h3>
              <p className="text-gray-600">
                Sim! Os créditos podem ser usados para fazer upgrade de plano ou renovar sua assinatura.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Há limite de ganhos?</h3>
              <p className="text-gray-600">
                Não! Quanto mais amigos você indicar, mais você ganha. Não há limite máximo de ganhos.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-2">E se meu amigo cancelar a assinatura?</h3>
              <p className="text-gray-600">
                Você mantém os ganhos mesmo que seu referido cancele. O crédito é seu!
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
