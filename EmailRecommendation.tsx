import { useEffect, useState } from "react";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface EmailRecommendationProps {
  userEmail?: string;
  onboarded?: boolean;
}

export default function EmailRecommendation({ userEmail = "usuario@example.com", onboarded = true }: EmailRecommendationProps) {
  const [emailSent, setEmailSent] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // Simular envio de email 24h após onboarding
    if (onboarded && !emailSent) {
      const timer = setTimeout(() => {
        setEmailSent(true);
        setShowNotification(true);
        
        // Esconder notificação após 5 segundos
        setTimeout(() => setShowNotification(false), 5000);
      }, 2000); // Simular 24h com 2 segundos

      return () => clearTimeout(timer);
    }
  }, [onboarded, emailSent]);

  if (!showNotification) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="border-2 border-green-500 bg-white shadow-lg">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">Email enviado! 📧</h3>
              <p className="text-sm text-gray-600 mb-4">
                Enviamos 3 novos editais com match &gt; 90% para <strong>{userEmail}</strong>
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">✨ Novos editais encontrados:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• FAPESP PIPE - Match 94% (R$ 1M)</li>
                  <li>• FINEP Startup - Match 91% (R$ 500k)</li>
                  <li>• CNPq Produtividade - Match 90% (R$ 300k)</li>
                </ul>
              </div>
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm">
                Ver Editais Recomendados
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
