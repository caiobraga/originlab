export interface AnalyzeFieldParams {
  edital_id?: string;
  proposta_id?: string;
  field_id?: string;
  field_name: string;
  field_description: string;
  current_text: string;
  word_limit?: number | null;
  char_limit?: number | null;
  form_data?: unknown;
  target_language?: "pt" | "en";
}

export interface AnalyzeFieldResponse {
  analysis_markdown: string;
}

export async function analyzeField(params: AnalyzeFieldParams): Promise<string> {
  const body: Record<string, unknown> = {
    field_id: params.field_id ?? null,
    field_name: params.field_name,
    field_description: params.field_description,
    current_text: params.current_text ?? "",
    word_limit: params.word_limit ?? null,
    char_limit: params.char_limit ?? null,
    form_data: params.form_data ?? null,
    target_language: params.target_language ?? null,
  };
  if (params.edital_id) body.edital_id = params.edital_id;
  if (params.proposta_id) body.proposta_id = params.proposta_id;
  if (!body.edital_id && !body.proposta_id) {
    throw new Error("É necessário edital_id ou proposta_id para analisar o campo.");
  }

  const response = await fetch("/api/analyze-field", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as any).error || "Erro ao analisar campo");
  }

  const data: AnalyzeFieldResponse = await response.json();
  return String(data.analysis_markdown || "").trim();
}

