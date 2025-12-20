import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { improveText, countWords } from "@/lib/improveTextApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TextFieldWithAIProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  wordLimit?: number | null;
  fieldDescription: string;
  editalId: string;
  className?: string;
}

export default function TextFieldWithAI({
  id,
  label,
  value,
  onChange,
  rows = 6,
  wordLimit,
  fieldDescription,
  editalId,
  className,
}: TextFieldWithAIProps) {
  const [isImproving, setIsImproving] = useState(false);
  const wordCount = countWords(value);
  const isOverLimit = wordLimit ? wordCount > wordLimit : false;
  const isEmpty = !value || !value.trim();

  const handleImprove = async () => {
    if (isEmpty) {
      toast.error("O campo deve ter algum conteúdo para ser melhorado");
      return;
    }

    setIsImproving(true);
    try {
      const improvedText = await improveText({
        edital_id: editalId,
        field_name: label,
        field_description: fieldDescription,
        current_text: value,
        word_limit: wordLimit || null,
      });

      onChange(improvedText);
      toast.success("Texto melhorado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao melhorar texto:", error);
      toast.error(error?.message || "Erro ao melhorar texto. Tente novamente.");
    } finally {
      setIsImproving(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {wordLimit && (
          <span
            className={cn(
              "text-sm font-medium",
              isOverLimit ? "text-red-600" : "text-gray-500"
            )}
          >
            {wordCount} / {wordLimit} palavras
            {isOverLimit && (
              <AlertCircle className="inline-block w-4 h-4 ml-1" />
            )}
          </span>
        )}
      </div>

      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={cn(
          isOverLimit && "border-red-500 focus-visible:border-red-500"
        )}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleImprove}
        disabled={isEmpty || isImproving}
        className="w-full"
      >
        {isImproving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Melhorando com IA...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Melhore com IA
          </>
        )}
      </Button>

      {isOverLimit && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          O texto excede o limite de {wordLimit} palavras. Por favor, reduza o
          conteúdo.
        </p>
      )}
    </div>
  );
}

