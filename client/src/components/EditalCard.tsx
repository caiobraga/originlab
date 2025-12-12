import { User } from "@supabase/supabase-js";
import { getEditalRelevanceInfo, Edital } from "@/lib/editalRelevance";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

interface EditalCardProps {
  edital: Edital;
  user: User | null;
}

export function EditalCard({ edital, user }: EditalCardProps) {
  const relevanceInfo = getEditalRelevanceInfo(edital, user);

  return (
    <div className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{edital.titulo}</h3>
          <p className="text-sm text-gray-600">Edital Nº {edital.numero}</p>
        </div>
        {relevanceInfo.isRelevant ? (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Relevante
          </Badge>
        ) : (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Não Relevante
          </Badge>
        )}
      </div>

      {edital.dataEncerramento && (
        <p className="text-sm text-gray-600 mb-4">
          <strong>Data de Encerramento:</strong> {edital.dataEncerramento}
        </p>
      )}

      {relevanceInfo.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
          <div className="flex items-start">
            <Info className="w-4 h-4 text-yellow-600 mr-2 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800 mb-1">Avisos:</p>
              <ul className="text-sm text-yellow-700 list-disc list-inside">
                {relevanceInfo.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {relevanceInfo.reasons.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
          <div className="flex items-start">
            <AlertCircle className="w-4 h-4 text-red-600 mr-2 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800 mb-1">Motivos:</p>
              <ul className="text-sm text-red-700 list-disc list-inside">
                {relevanceInfo.reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {edital.pdfUrls && edital.pdfUrls.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">
            <strong>{edital.pdfUrls.length}</strong> arquivo(s) disponível(is)
          </p>
        </div>
      )}
    </div>
  );
}

