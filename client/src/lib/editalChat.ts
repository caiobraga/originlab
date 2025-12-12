import { supabase } from "./supabase";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WEBHOOK_URL = "https://n8n.srv652789.hstgr.cloud/webhook/789b0959-b90f-40e8-afe8-03aa8e486b43";

/**
 * Fetches PDF file IDs for a specific edital
 */
export async function fetchEditalPdfIds(editalId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("edital_pdfs")
      .select("id")
      .eq("edital_id", editalId);

    if (error) {
      console.error("Erro ao buscar PDFs do edital:", error);
      throw error;
    }

    return data?.map((pdf) => pdf.id) || [];
  } catch (error) {
    console.error("Erro ao buscar PDFs do edital:", error);
    return [];
  }
}

/**
 * Gets user context data for the chat
 */
export function getUserContext(user: any, profile: any) {
  return {
    userId: user?.id || null,
    email: user?.email || null,
    cpf: profile?.cpf || null,
    cnpj: profile?.cnpj || null,
    lattesId: profile?.lattesId || null,
    userType: profile?.userType || null,
  };
}

/**
 * Sends a message to the webhook with user context and PDF IDs
 */
export async function sendChatMessage(
  message: string,
  editalId: string,
  user: any,
  profile: any,
  chatHistory: ChatMessage[]
): Promise<string> {
  try {
    // Fetch PDF IDs
    const pdfIds = await fetchEditalPdfIds(editalId);

    // Get user context
    const userContext = getUserContext(user, profile);

    // Prepare request body
    const requestBody = {
      message,
      userContext,
      file_ids: pdfIds,
      chatHistory: chatHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
      })),
    };

    // Log for debugging
    console.log("Enviando POST para:", WEBHOOK_URL);
    console.log("Request body:", requestBody);

    // Send POST request to webhook
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`HTTP error! status: ${response.status}${errorText ? ` - ${errorText}` : ""}`);
    }

    // Get response text
    const responseText = await response.text();
    console.log("Resposta do webhook (raw):", responseText);
    console.log("Content-Type:", response.headers.get("content-type"));

    // If response is empty, return default message
    if (!responseText || responseText.trim() === "") {
      console.warn("Resposta vazia do webhook");
      return "Resposta recebida do assistente";
    }

    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");

    // If not JSON, return as text
    if (!isJson) {
      console.log("Resposta não é JSON, retornando como texto");
      return responseText;
    }

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(responseText);
      console.log("Resposta parseada (JSON):", data);
    } catch (parseError) {
      console.error("Erro ao fazer parse da resposta JSON:", parseError);
      // If JSON parse fails but we have text, return the text
      return responseText;
    }
    
    // Try multiple possible response formats
    // n8n webhook might return: { output: "..." }, { result: "..." }, { data: "..." }, etc.
    if (typeof data === "string") {
      return data;
    }
    
    if (Array.isArray(data) && data.length > 0) {
      // If response is an array, get the first item
      const firstItem = data[0];
      if (typeof firstItem === "string") {
        return firstItem;
      }
      // Try to extract from first item - prioritize "output" for n8n webhooks
      if (firstItem.output !== undefined && firstItem.output !== null) {
        return String(firstItem.output);
      }
      return firstItem.result || firstItem.message || firstItem.text || firstItem.content || JSON.stringify(firstItem);
    }
    
    // Try common response property names
    const possibleKeys = [
      "output",
      "result", 
      "response",
      "message",
      "text",
      "content",
      "data",
      "answer",
      "reply"
    ];
    
    for (const key of possibleKeys) {
      if (data[key] !== undefined && data[key] !== null) {
        const value = data[key];
        if (typeof value === "string") {
          return value;
        }
        // If it's an object, try to stringify or get nested value
        if (typeof value === "object") {
          return value.text || value.message || value.content || JSON.stringify(value);
        }
      }
    }
    
    // If we have data but couldn't find a string value, return stringified version
    console.warn("Não foi possível encontrar output na resposta:", data);
    return JSON.stringify(data);
  } catch (error: any) {
    console.error("Erro completo na função sendChatMessage:", error);
    console.error("Tipo do erro:", error?.constructor?.name);
    console.error("Mensagem do erro:", error?.message);
    console.error("Stack do erro:", error?.stack);
    
    // Check if it's a CORS error
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes("CORS") || errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
      throw new Error("Erro de conexão: O servidor não está permitindo requisições do navegador. Verifique as configurações de CORS no servidor.");
    }
    
    // Re-throw with more context if needed
    if (error instanceof Error) {
      throw error;
    }
    
    // If it's not an Error object, wrap it
    throw new Error(errorMsg || "Erro desconhecido ao enviar mensagem");
  }
}

/**
 * Saves chat history to localStorage
 */
export function saveChatHistory(editalId: string, messages: ChatMessage[]) {
  try {
    const key = `chat_history_${editalId}`;
    const serialized = JSON.stringify(
      messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp.toISOString(),
      }))
    );
    localStorage.setItem(key, serialized);
  } catch (error) {
    console.error("Erro ao salvar histórico do chat:", error);
  }
}

/**
 * Loads chat history from localStorage
 */
export function loadChatHistory(editalId: string): ChatMessage[] {
  try {
    const key = `chat_history_${editalId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return parsed.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  } catch (error) {
    console.error("Erro ao carregar histórico do chat:", error);
    return [];
  }
}

