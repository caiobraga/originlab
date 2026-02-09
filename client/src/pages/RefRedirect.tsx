import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { storeReferralCode } from "@/lib/referralApi";
import { Loader2 } from "lucide-react";

/**
 * Página de redirecionamento para links de referência (/ref/:code)
 * Armazena o código e redireciona para a home ou cadastro
 */
export default function RefRedirect() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const code = params.code;

  useEffect(() => {
    if (code) {
      storeReferralCode(code);
      setLocation("/cadastro");
    } else {
      setLocation("/");
    }
  }, [code, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-violet-50">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">Redirecionando...</p>
      </div>
    </div>
  );
}
