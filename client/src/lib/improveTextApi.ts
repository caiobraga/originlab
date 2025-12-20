/**
 * API para melhorar texto de campos de proposta usando IA
 */

export interface ImproveTextParams {
  edital_id: string;
  field_name: string;
  field_description: string;
  current_text: string;
  word_limit?: number | null;
}

export interface ImproveTextResponse {
  improved_text: string;
}

/**
 * Melhora um texto de campo usando IA com contexto do edital
 */
export async function improveText(params: ImproveTextParams): Promise<string> {
  try {
    const response = await fetch("/api/improve-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
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

