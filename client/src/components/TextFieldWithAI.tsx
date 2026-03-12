import { useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  Wand2,
  Eye,
  PencilLine,
  Copy,
  ScanText,
} from "lucide-react";
import { improveText, countWords } from "@/lib/improveTextApi";
import { generateFieldText } from "@/lib/generateFieldTextApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { analyzeField } from "@/lib/analyzeFieldApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TextFieldWithAIProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  wordLimit?: number | null;
  charLimit?: number | null;
  required?: boolean;
  showDescription?: boolean;
  fieldDescription: string;
  editalId?: string;
  propostaId?: string;
  allFormData?: unknown;
  placeholder?: string;
  className?: string;
}

export default function TextFieldWithAI({
  id,
  label,
  value,
  onChange,
  rows = 6,
  wordLimit,
  charLimit,
  required = false,
  showDescription = false,
  fieldDescription,
  editalId,
  propostaId,
  allFormData,
  placeholder,
  className,
}: TextFieldWithAIProps) {
  const [isImproving, setIsImproving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRegeneratingFromAnalysis, setIsRegeneratingFromAnalysis] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [analysisMarkdown, setAnalysisMarkdown] = useState<string>("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const wordCount = countWords(value);
  const charCount = (value || "").length;
  const isOverWordLimit = wordLimit ? wordCount > wordLimit : false;
  const isOverCharLimit = charLimit ? charCount > charLimit : false;
  const isOverLimit = isOverWordLimit || isOverCharLimit;
  const isEmpty = !value || !value.trim();
  const canImprove = !!(editalId || propostaId);
  const minFieldHeightPx = useMemo(() => Math.max(120, rows * 24), [rows]);

  const handleImprove = async () => {
    if (isEmpty) {
      toast.error("O campo deve ter algum conteúdo para ser melhorado");
      return;
    }
    if (!canImprove) {
      toast.error("Edital ou proposta não identificada. Recarregue a página e tente novamente.");
      return;
    }

    setIsImproving(true);
    try {
      const improvedText = await improveText({
        edital_id: editalId,
        proposta_id: propostaId,
        field_name: label,
        field_description: fieldDescription,
        current_text: value,
        word_limit: wordLimit || null,
        char_limit: charLimit || null,
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

  const inferTargetLanguage = (): "pt" | "en" => {
    if (/_en\b/i.test(id)) return "en";
    if (/\b(ingl[eê]s|english)\b/i.test(label)) return "en";
    return "pt";
  };

  const handleGenerateFromScratch = async () => {
    if (!canImprove) {
      toast.error("Edital ou proposta não identificada. Recarregue a página e tente novamente.");
      return;
    }

    const hasText = !!value && value.trim().length > 0;
    if (hasText) {
      const ok = window.confirm(
        "Isso vai gerar um novo texto e substituir o conteúdo atual deste campo. Deseja continuar?"
      );
      if (!ok) return;
    }

    setIsGenerating(true);
    try {
      const generated = await generateFieldText({
        edital_id: editalId,
        proposta_id: propostaId,
        field_id: id,
        field_name: label,
        field_description: fieldDescription,
        word_limit: wordLimit ?? null,
        char_limit: charLimit ?? null,
        form_data: allFormData ?? null,
        target_language: inferTargetLanguage(),
      });
      if (!generated) {
        toast.error("A IA não retornou texto. Tente novamente.");
        return;
      }
      onChange(generated);
      toast.success("Texto gerado do zero!");
    } catch (error: any) {
      console.error("Erro ao gerar texto:", error);
      toast.error(error?.message || "Erro ao gerar texto. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    const text =
      showPreview && previewRef.current
        ? String(previewRef.current.innerText || "")
        : String(value || "");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado para a área de transferência!");
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        toast.success("Copiado para a área de transferência!");
      } catch {
        toast.error("Não foi possível copiar.");
      }
    }
  };

  const updateSelectionFromEl = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    const start = typeof el.selectionStart === "number" ? el.selectionStart : 0;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : 0;
    selectionRef.current = { start, end };
    setSelection({ start, end });
  };

  const hasSelection = () => {
    const { start, end } = selection;
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  };

  const handleImproveSelection = async () => {
    if (showPreview) {
      toast.error("Troque para edição para melhorar um trecho selecionado.");
      return;
    }
    if (!canImprove) {
      toast.error("Edital ou proposta não identificada. Recarregue a página e tente novamente.");
      return;
    }
    if (!hasSelection()) {
      toast.error("Selecione um trecho do texto para melhorar.");
      return;
    }
    const { start, end } = selectionRef.current;
    const selectedText = String(value || "").slice(start, end);
    if (!selectedText.trim()) {
      toast.error("Selecione um trecho com conteúdo.");
      return;
    }

    setIsImproving(true);
    try {
      const improved = await improveText({
        edital_id: editalId,
        proposta_id: propostaId,
        field_name: `${label} (trecho selecionado)`,
        field_description: `${fieldDescription}\n\nInstrução: melhore APENAS o trecho selecionado abaixo. Não adicione conteúdo fora desse trecho. Não inclua explicações.`,
        current_text: selectedText,
        word_limit: wordLimit || null,
        char_limit: null,
      });
      const before = String(value || "").slice(0, start);
      const after = String(value || "").slice(end);
      const next = `${before}${improved}${after}`;
      onChange(next);
      toast.success("Trecho melhorado!");

      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const newEnd = start + improved.length;
        el.focus();
        el.setSelectionRange(start, newEnd);
        selectionRef.current = { start, end: newEnd };
        setSelection({ start, end: newEnd });
      });
    } catch (error: any) {
      console.error("Erro ao melhorar trecho:", error);
      toast.error(error?.message || "Erro ao melhorar trecho. Tente novamente.");
    } finally {
      setIsImproving(false);
    }
  };

  const handleAnalyze = async () => {
    if (!canImprove) {
      toast.error("Edital ou proposta não identificada. Recarregue a página e tente novamente.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const out = await analyzeField({
        edital_id: editalId,
        proposta_id: propostaId,
        field_id: id,
        field_name: label,
        field_description: fieldDescription,
        current_text: String(value || ""),
        word_limit: wordLimit ?? null,
        char_limit: charLimit ?? null,
        form_data: allFormData ?? null,
        target_language: inferTargetLanguage(),
      });
      setAnalysisMarkdown(out);
      setAnalysisOpen(true);
      toast.success("Análise pronta!");
    } catch (error: any) {
      console.error("Erro ao analisar campo:", error);
      toast.error(error?.message || "Erro ao analisar campo. Tente novamente.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const doRegenerateUsingAnalysis = async () => {
    if (!canImprove) {
      toast.error("Edital ou proposta não identificada. Recarregue a página e tente novamente.");
      return;
    }
    const analysis = String(analysisMarkdown || "").trim();
    if (!analysis) {
      toast.error("Rode a análise antes de refazer com base nela.");
      return;
    }

    setIsRegeneratingFromAnalysis(true);
    try {
      const analysisSnippet =
        analysis.length > 4000 ? analysis.slice(0, 4000) + "\n…" : analysis;
      const guidance = `Use a análise abaixo como guia para refazer este campo do zero. Siga o checklist e aplique as sugestões. Se houver conflitos com o edital, priorize o edital.\n\nANÁLISE (Markdown):\n${analysisSnippet}\n\nTEXTO ATUAL (para referência, não para reescrever):\n"""${String(value || "").trim()}"""`;

      const regenerated = await generateFieldText({
        edital_id: editalId,
        proposta_id: propostaId,
        field_id: id,
        field_name: label,
        field_description: `${fieldDescription}\n\n${guidance}`,
        word_limit: wordLimit ?? null,
        char_limit: charLimit ?? null,
        form_data: allFormData ?? null,
        target_language: inferTargetLanguage(),
      });

      if (!regenerated) {
        toast.error("A IA não retornou texto. Tente novamente.");
        return;
      }
      onChange(regenerated);
      setShowPreview(true);
      toast.success("Campo refeito com base na análise!");
    } catch (error: any) {
      console.error("Erro ao refazer com base na análise:", error);
      toast.error(error?.message || "Erro ao refazer com base na análise. Tente novamente.");
    } finally {
      setIsRegeneratingFromAnalysis(false);
    }
  };

  const handleRegenerateUsingAnalysis = () => {
    if (!analysisMarkdown.trim()) {
      toast.error("Rode a análise antes de refazer com base nela.");
      return;
    }
    setConfirmRegenerateOpen(true);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <Label htmlFor={id} className="select-text">
            <span className="break-words">{label}</span>
            {required && (
              <>
                <span className="text-red-600" aria-hidden="true">
                  *
                </span>
                <span className="sr-only"> (obrigatório)</span>
              </>
            )}
          </Label>
          {showDescription && (
            <p className="text-xs text-gray-500 mt-1 select-text whitespace-pre-wrap">
              {fieldDescription}
            </p>
          )}
        </div>
        {(wordLimit || charLimit) && (
          <span
            className={cn(
              "text-sm font-medium",
              isOverLimit ? "text-red-600" : "text-gray-500"
            )}
          >
            {wordLimit ? `${wordCount} / ${wordLimit} palavras` : null}
            {wordLimit && charLimit ? " • " : null}
            {charLimit ? `${charCount} / ${charLimit} caracteres` : null}
            {isOverLimit && <AlertCircle className="inline-block w-4 h-4 ml-1" />}
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8 px-2"
          aria-label="Copiar conteúdo"
          title={showPreview ? "Copiar como exibido" : "Copiar texto"}
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAnalyze}
          disabled={isAnalyzing || !canImprove}
          className="h-8 px-2"
          aria-label="Analisar campo com IA"
          title="Analisar"
        >
          {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanText className="w-4 h-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview((v) => !v)}
          className="h-8 px-2"
          aria-label={showPreview ? "Editar texto" : "Pré-visualizar Markdown"}
          title={showPreview ? "Editar" : "Pré-visualizar"}
        >
          {showPreview ? <PencilLine className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
      </div>

      {showPreview ? (
        <div
          ref={previewRef}
          className={cn(
            "rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm cursor-pointer",
            "prose prose-sm max-w-none select-text overflow-auto",
            isOverLimit && "border-red-500"
          )}
          style={{ minHeight: minFieldHeightPx }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) return;
            setShowPreview(false);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowPreview(false); } }}
          aria-label="Clique para editar"
        >
          {value && value.trim() ? (
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => (
                  <h1 className="text-base font-bold mb-2 text-gray-900" {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2 className="text-sm font-bold mb-2 text-gray-900" {...props} />
                ),
                h3: ({ node, ...props }) => (
                  <h3 className="text-sm font-semibold mb-1 text-gray-900" {...props} />
                ),
                p: ({ node, ...props }) => (
                  <p className="mb-2 leading-relaxed text-sm text-gray-800" {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul className="list-disc list-inside mb-2 space-y-0.5 text-sm" {...props} />
                ),
                ol: ({ node, ...props }) => (
                  <ol className="list-decimal list-inside mb-2 space-y-0.5 text-sm" {...props} />
                ),
                li: ({ node, ...props }) => <li className="ml-1" {...props} />,
                strong: ({ node, ...props }) => (
                  <strong className="font-semibold text-gray-900" {...props} />
                ),
                em: ({ node, ...props }) => <em className="italic" {...props} />,
                code: ({ node, ...props }) => (
                  <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono" {...props} />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-3 border-gray-400 pl-2 italic my-2 text-sm" {...props} />
                ),
                a: ({ node, ...props }) => (
                  <a
                    className="text-blue-600 hover:text-blue-800 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  />
                ),
              }}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-gray-500 m-0">
              {placeholder || "Nada para pré-visualizar."}
            </p>
          )}
        </div>
      ) : (
        <Textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={(e) => updateSelectionFromEl(e.currentTarget)}
          onMouseUp={() => updateSelectionFromEl(textareaRef.current)}
          onKeyUp={() => updateSelectionFromEl(textareaRef.current)}
          onFocus={() => updateSelectionFromEl(textareaRef.current)}
          rows={rows}
          placeholder={placeholder}
          className={cn(isOverLimit && "border-red-500 focus-visible:border-red-500")}
        />
      )}

      {!showPreview && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleImproveSelection}
          onMouseDown={(e) => {
            // Capturar seleção antes do textarea perder o foco ao clicar no botão
            updateSelectionFromEl(textareaRef.current);
            // Evita colapsar seleção em alguns navegadores
            e.preventDefault();
          }}
          disabled={!canImprove || isImproving || !hasSelection()}
          className="w-full"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Melhorar apenas a seleção
        </Button>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleImprove}
        disabled={isEmpty || isImproving || !canImprove}
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

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleGenerateFromScratch}
        disabled={isImproving || isGenerating || !canImprove}
        className="w-full border-violet-300 text-violet-800 hover:bg-violet-50 hover:text-violet-900 hover:border-violet-400"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Gerando do zero...
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4 mr-2" />
            Gerar do zero com IA
          </>
        )}
      </Button>

      {isOverLimit && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          O texto excede o limite. Por favor, reduza o conteúdo.
        </p>
      )}

      {analysisOpen && (
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm text-gray-900 select-text">Análise do campo</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRegenerateUsingAnalysis}
                disabled={isRegeneratingFromAnalysis || !canImprove || !analysisMarkdown.trim()}
                className="h-8"
              >
                {isRegeneratingFromAnalysis ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Refazendo...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Refazer com base na análise
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAnalysisOpen(false)}
                className="h-8 px-2"
              >
                Fechar
              </Button>
            </div>
          </div>
          <div className="prose prose-sm max-w-none select-text">
            <ReactMarkdown>{analysisMarkdown || "Sem análise disponível."}</ReactMarkdown>
          </div>
        </div>
      )}

      <AlertDialog open={confirmRegenerateOpen} onOpenChange={setConfirmRegenerateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refazer com base na análise</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai gerar um novo texto com base na análise e substituir o conteúdo atual deste
              campo. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRegeneratingFromAnalysis}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmRegenerateOpen(false);
                await doRegenerateUsingAnalysis();
              }}
              disabled={isRegeneratingFromAnalysis}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

