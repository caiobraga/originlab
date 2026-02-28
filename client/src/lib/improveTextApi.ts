/**
 * API para melhorar texto de campos de proposta usando IA
 */

export interface ImproveTextParams {
  edital_id?: string;
  proposta_id?: string;
  field_name: string;
  field_description: string;
  current_text: string;
  word_limit?: number | null;
  char_limit?: number | null;
}

export interface ImproveTextResponse {
  improved_text: string;
}

/**
 * Melhora um texto de campo usando IA com contexto do edital
 */
export async function improveText(params: ImproveTextParams): Promise<string> {
  try {
    const body: Record<string, unknown> = {
      field_name: params.field_name,
      field_description: params.field_description,
      current_text: params.current_text,
      word_limit: params.word_limit ?? null,
      char_limit: params.char_limit ?? null,
    };
    if (params.edital_id) body.edital_id = params.edital_id;
    if (params.proposta_id) body.proposta_id = params.proposta_id;
    if (!body.edital_id && !body.proposta_id) {
      throw new Error("É necessário edital_id ou proposta_id para melhorar o texto.");
    }
    const response = await fetch("/api/improve-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Erro ao melhorar texto");
    }

    const data: ImproveTextResponse = await response.json();
    return data.improved_text;
  } catch (error) {
    console.error("Erro ao melhorar texto:", error);
    throw error;
  }
}

/**
 * Conta o número de palavras em um texto
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

