export interface GenerateFieldTextParams {
  edital_id?: string;
  proposta_id?: string;
  field_id?: string;
  field_name: string;
  field_description: string;
  word_limit?: number | null;
  char_limit?: number | null;
  form_data?: unknown;
  target_language?: "pt" | "en";
}

export interface GenerateFieldTextResponse {
  generated_text: string;
}

export async function generateFieldText(
  params: GenerateFieldTextParams
): Promise<string> {
  const body: Record<string, unknown> = {
    field_id: params.field_id ?? null,
    field_name: params.field_name,
    field_description: params.field_description,
    word_limit: params.word_limit ?? null,
    char_limit: params.char_limit ?? null,
    form_data: params.form_data ?? null,
    target_language: params.target_language ?? null,
  };
  if (params.edital_id) body.edital_id = params.edital_id;
  if (params.proposta_id) body.proposta_id = params.proposta_id;
  if (!body.edital_id && !body.proposta_id) {
    throw new Error("É necessário edital_id ou proposta_id para gerar o texto.");
  }

  // Envia bearer quando houver sessão: permite auditoria (redacoes_ai) e controles (admin).
  const { supabase } = await import("./supabase");
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token || null;

  const response = await fetch("/api/generate-field-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as any).error || "Erro ao gerar texto");
  }

  const data: GenerateFieldTextResponse = await response.json();
  return String(data.generated_text || "").trim();
}

