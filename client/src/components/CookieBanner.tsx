import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCookieConsent, setCookieConsent } from "@/lib/cookies";

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const handleAccept = useCallback(() => {
    setCookieConsent("accepted");
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  }, []);

  const handleReject = useCallback(() => {
    setCookieConsent("rejected");
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  }, []);

  useEffect(() => {
    // Verificar se já existe uma preferência salva
    const consent = getCookieConsent();
    
    if (!consent) {
      // Pequeno delay para animação suave
      setTimeout(() => {
        setShowBanner(true);
        setTimeout(() => setIsVisible(true), 10);
      }, 500);
    }
  }, []);

  useEffect(() => {
    // Fechar com ESC quando o banner estiver visível
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showBanner && isVisible) {
        handleReject();
      }
    };

    if (showBanner) {
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [showBanner, isVisible, handleReject]);

  if (!showBanner) return null;

  return (
    <>
      {/* Backdrop escuro para melhor visibilidade */}
      <div
        className={cn(
          "fixed inset-0 bg-black/20 dark:bg-black/40 z-40 transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />
      
      {/* Banner de cookies */}
      <div
        role="dialog"
        aria-label="Banner de consentimento de cookies"
        aria-live="polite"
        aria-modal="true"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 px-4 py-4 sm:px-6 transition-all duration-300",
          isVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0"
        )}
      >
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 rounded-lg shadow-xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Ícone e conteúdo */}
          <div className="flex items-start gap-3 flex-1">
            <div className="flex-shrink-0 mt-1">
              <Cookie 
                className="w-6 h-6 text-blue-600 dark:text-blue-400" 
                aria-hidden="true"
              />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Utilizamos cookies
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Utilizamos cookies para melhorar sua experiência, analisar o tráfego do site e personalizar conteúdo. 
                Ao continuar navegando, você concorda com nossa{" "}
                <a
                  href="/politica-privacidade"
                  className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  aria-label="Ler política de privacidade"
                >
                  política de privacidade
                </a>
                .
              </p>
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              onClick={handleReject}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              aria-label="Rejeitar cookies"
            >
              Rejeitar
            </Button>
            <Button
              onClick={handleAccept}
              size="sm"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
              aria-label="Aceitar cookies"
            >
              Aceitar todos
            </Button>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
