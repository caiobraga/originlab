import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

// Usar n8n por padrão, API local apenas se explicitamente habilitada
const USE_LOCAL_API = process.env.USE_LOCAL_API === 'true'; // Default: false (usa n8n)
const LOCAL_API_URL = process.env.LOCAL_API_URL || "http://localhost:3000/api/extract-edital-info";
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://n8n.srv652789.hstgr.cloud/webhook/789b0959-b90f-40e8-afe8-03aa8e486b43";

// Inicializar Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Busca informações do edital por ID
 */
async function fetchEditalInfo(editalId: string): Promise<any | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("editais")
      .select("*")
      .eq("id", editalId)
      .single();

    if (error || !data) {
      console.error(`Erro ao buscar edital ${editalId}:`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Erro ao processar edital ${editalId}:`, error);
    return null;
  }
}

/**
 * Busca PDFs do edital para contexto
 */
async function fetchEditalPdfIds(editalId: string): Promise<string[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("edital_pdfs")
      .select("file_id")
      .eq("edital_id", editalId)
      .not("file_id", "is", null);

    if (error || !data) {
      console.error(`Erro ao buscar PDFs do edital ${editalId}:`, error);
      return [];
    }

    return data.map((pdf: any) => pdf.file_id).filter(Boolean);
  } catch (error) {
    console.error(`Erro ao processar PDFs do edital ${editalId}:`, error);
    return [];
  }
}

/**
 * Melhora texto usando webhook do n8n (mesma abordagem do process-edital-info)
 */
async function improveTextWithWebhook(
  fieldName: string,
  fieldDescription: string,
  currentText: string,
  wordLimit: number | null,
  editalInfo: any,
  fileIds: string[]
): Promise<string> {
  // Formatar informações do edital
  const editalContext = editalInfo
    ? `
Informações do Edital:
- Título: ${editalInfo.titulo || "N/A"}
- Número: ${editalInfo.numero || "N/A"}
- Órgão: ${editalInfo.orgao || "N/A"}
- Descrição: ${editalInfo.descricao?.substring(0, 500) || "N/A"}
`
    : "";

  const limitText = wordLimit
    ? `IMPORTANTE: O texto melhorado DEVE ter no máximo ${wordLimit} palavras. Se o texto atual já estiver próximo do limite, mantenha-o conciso.`
    : "";

  const prompt = `
Você é um assistente especializado em melhorar textos de propostas para editais de fomento à pesquisa.

Contexto do Campo:
- Nome do Campo: ${fieldName}
- Descrição: ${fieldDescription}
${limitText}

${editalContext}

Texto Atual para Melhorar:
"""
${currentText}
"""

Tarefa:
Melhore o texto fornecido, mantendo o conteúdo e a essência, mas:
1. Torne-o mais claro, profissional e impactante
2. Use linguagem técnica adequada para propostas acadêmicas
3. Melhore a estrutura e a coesão
4. Corrija erros gramaticais e ortográficos
5. ${wordLimit ? `Respeite o limite de ${wordLimit} palavras` : "Seja conciso mas completo"}

Responda APENAS com o texto melhorado, sem explicações adicionais ou comentários.
`;

  // Verificar se file_ids está vazio
  if (!fileIds || fileIds.length === 0) {
    throw new Error("Nenhum file_id disponível! Não é possível melhorar o texto sem os arquivos do edital.");
  }

  // Formato esperado pelo n8n: o body HTTP é acessado como $json.body
  const requestBody = {
    message: prompt,
    file_ids: fileIds,
  };

  const apiUrl = USE_LOCAL_API ? LOCAL_API_URL : WEBHOOK_URL;
  console.log(`  🔗 URL: ${apiUrl} ${USE_LOCAL_API ? '(API Local)' : '(n8n)'}`);
  console.log(`  📁 File IDs: ${fileIds.length} arquivo(s)`);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      
      if (response.status === 404) {
        throw new Error('Webhook não registrado (404). O workflow do n8n precisa estar ativo.');
      }
      
      throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
    }

    // Processar resposta
    const contentType = response.headers.get('content-type');
    let responseText = await response.text();
    
    // Se estiver usando API local, extrair o campo "result" do JSON
    if (USE_LOCAL_API && contentType?.includes('application/json')) {
      try {
        const jsonResponse = JSON.parse(responseText);
        responseText = jsonResponse.result || responseText;
      } catch (e) {
        // Se não for JSON válido, usar o texto original
      }
    }

    if (!responseText || responseText.trim() === '') {
      throw new Error('Resposta vazia do webhook');
    }

    // Processar resposta do n8n (pode vir como array com output)
    responseText = responseText.trim();
    
    // Se a resposta é um array JSON (formato n8n comum), extrair o primeiro item
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(responseText);
      if (Array.isArray(parsedResponse) && parsedResponse.length > 0) {
        const firstItem = parsedResponse[0];
        if (firstItem.output) {
          responseText = typeof firstItem.output === 'string' ? firstItem.output : JSON.stringify(firstItem.output);
        } else {
          responseText = JSON.stringify(firstItem);
        }
      }
    } catch (e) {
      // Se não for JSON válido, usar o texto original
    }

    // Remover possíveis marcadores de markdown code blocks
    if (responseText.includes('```')) {
      const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        responseText = codeBlockMatch[1].trim();
      }
    }

    // Remover possíveis marcadores ou formatação extra
    const improvedText = responseText.replace(/^```\w*\n?/gm, "").replace(/```$/gm, "").trim();

    return improvedText;
  } catch (error) {
    console.error("Erro ao melhorar texto via webhook:", error);
    throw error;
  }
}

/**
 * Endpoint POST /api/improve-text
 */
router.post("/improve-text", async (req, res) => {
  try {
    const {
      edital_id,
      field_name,
      field_description,
      current_text,
      word_limit,
    } = req.body;

    if (!edital_id || !field_name || !current_text) {
      return res.status(400).json({
        error: "Campos obrigatórios: edital_id, field_name, current_text",
      });
    }

    if (!field_description) {
      return res.status(400).json({
        error: "Campo field_description é obrigatório",
      });
    }

    console.log(`📥 Melhorando texto do campo: ${field_name}`);
    console.log(`📄 Edital ID: ${edital_id}`);

    // Buscar informações do edital
    const editalInfo = await fetchEditalInfo(edital_id);
    if (!editalInfo) {
      return res.status(404).json({ error: "Edital não encontrado" });
    }

    // Buscar PDFs do edital
    const fileIds = await fetchEditalPdfIds(edital_id);

    // Melhorar texto usando webhook do n8n
    const improvedText = await improveTextWithWebhook(
      field_name,
      field_description,
      current_text,
      word_limit || null,
      editalInfo,
      fileIds
    );

    console.log(`✅ Texto melhorado (${improvedText.length} caracteres)`);

    res.json({ improved_text: improvedText });
  } catch (error) {
    console.error("❌ Erro ao melhorar texto:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

