import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreditCard, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface StripeCheckoutProps {
  planName: string;
  planPrice: number;
  billingPeriod: "monthly" | "annual";
  onSuccess?: () => void;
}

export default function StripeCheckout({ 
  planName, 
  planPrice, 
  billingPeriod,
  onSuccess 
}: StripeCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleCheckout = async () => {
    setIsLoading(true);
    
    // Simular integração com Stripe
    setTimeout(() => {
      toast.success(`Redirecionando para Stripe para ${planName}...`);
      
      // Em produção, isso seria:
      // const response = await fetch('/api/create-checkout-session', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     planName,
      //     planPrice,
      //     billingPeriod,
      //     userEmail: currentUser.email
      //   })
      // });
      // const { url } = await response.json();
      // window.location.href = url;
      
      setIsLoading(false);
      setShowModal(true);
      
      if (onSuccess) onSuccess();
    }, 1000);
  };

  return (
    <>
      <Button
        onClick={handleCheckout}
        disabled={isLoading}
        className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold py-6 text-base"
      >
        {isLoading ? "Processando..." : "Começar 7 dias grátis"}
      </Button>

      {/* Stripe Checkout Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-8">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <CreditCard className="w-12 h-12 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Checkout Seguro</h2>
              <p className="text-gray-600">Plano {planName} - R$ {planPrice.toLocaleString("pt-BR")}/{billingPeriod === "monthly" ? "mês" : "ano"}</p>
            </div>

            {/* Simulated Stripe Form */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Email</label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Número do Cartão</label>
                <input
                  type="text"
                  placeholder="4242 4242 4242 4242"
                  maxLength={19}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Validade</label>
                  <input
                    type="text"
                    placeholder="MM/AA"
                    maxLength={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">CVC</label>
                  <input
                    type="text"
                    placeholder="123"
                    maxLength={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-6 pb-6 border-b border-gray-200">
              <Lock className="w-4 h-4" />
              <span>Pagamento seguro com Stripe</span>
            </div>

            {/* Benefits */}
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700"><strong>7 dias grátis</strong> - Sem cobranças agora</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700"><strong>Cancele a qualquer momento</strong> - Sem compromisso</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700"><strong>Suporte 24/7</strong> - Estamos aqui para ajudar</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={() => {
                  toast.success("Assinatura confirmada! Bem-vindo ao plano Pro!");
                  setShowModal(false);
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold py-3"
              >
                Confirmar Pagamento
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                className="w-full"
              >
                Cancelar
              </Button>
            </div>

            {/* Test Card Info */}
            <p className="text-xs text-gray-500 text-center mt-4">
              Para teste, use: 4242 4242 4242 4242 | Qualquer data futura | Qualquer CVC
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
