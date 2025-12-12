import { useState, useEffect } from "react";
import { Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrialBannerProps {
  isTrialActive?: boolean;
  daysRemaining?: number;
}

export default function TrialBanner({ isTrialActive = true, daysRemaining = 7 }: TrialBannerProps) {
  const [isVisible, setIsVisible] = useState(isTrialActive);

  if (!isVisible) return null;

  const urgencyColor = daysRemaining <= 2 ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200";
  const textColor = daysRemaining <= 2 ? "text-red-900" : "text-blue-900";
  const buttonColor = daysRemaining <= 2 ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700";

  return (
    <div className={`border-b ${urgencyColor} px-4 py-3`}>
      <div className="container flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Clock className={`w-5 h-5 flex-shrink-0 ${daysRemaining <= 2 ? "text-red-600" : "text-blue-600"}`} />
          <div className="flex-1">
            <p className={`font-semibold ${textColor}`}>
              {daysRemaining === 1 ? "Último dia do trial!" : `${daysRemaining} dias grátis restantes`}
            </p>
            <p className={`text-sm ${textColor} opacity-80`}>
              Seu trial termina em {new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className={`${buttonColor} text-white font-semibold`}
            onClick={() => {
              // Redirecionar para página de planos
              window.location.href = "/#planos";
            }}
          >
            Escolher Plano
          </Button>
          <button
            onClick={() => setIsVisible(false)}
            className={`text-sm font-semibold ${textColor} hover:opacity-70`}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
