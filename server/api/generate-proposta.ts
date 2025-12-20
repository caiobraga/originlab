import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Inicializar Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Busca PDF do storage e retorna buffer
 */
async function fetchPdfFromStorage(fileId: string): Promise<Buffer | null> {
  if (!supabase) return null;

  try {
    const { data: pdfRecord, error: fetchError } = await supabase
      .from("edital_pdfs")
      .select("caminho_storage, nome_arquivo")
      .eq("id", fileId)
      .single();

    if (fetchError || !pdfRecord) {
      console.error(`Erro ao buscar PDF ${fileId}:`, fetchError);
      return null;
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("edital-pdfs")
      .download(pdfRecord.caminho_storage);

    if (downloadError || !fileData) {
      console.error(`Erro ao baixar PDF ${fileId}:`, downloadError);
      return null;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Erro ao processar PDF ${fileId}:`, error);
    return null;
  }
}

/**
 * Faz upload do arquivo para Gemini e retorna URI
 * Usa a API REST diretamente para compatibilidade com Node.js
 */
async function uploadFileToGemini(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY não configurada");
    }

    // Construir multipart/form-data manualmente
    const boundary = `----formdata-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    
    const metadata = JSON.stringify({
      file: {
        displayName: fileName,
      },
    });

    const parts: Buffer[] = [];
    
    // Parte 1: metadata JSON
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Type: application/json\r\n\r\n`));
    parts.push(Buffer.from(metadata));
    parts.push(Buffer.from(`\r\n`));
    
    // Parte 2: arquivo binário
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Type: ${mimeType}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="data"; filename="${fileName}"\r\n\r\n`));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    
    const formData = Buffer.concat(parts);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Erro ao fazer upload para Gemini (${response.status}):`, errorText);
      return null;
    }

    const result = await response.json();
    const fileUri = result.file?.uri || result.uri;
    
    if (!fileUri) {
      console.error(`Upload bem-sucedido mas sem URI:`, result);
      return null;
    }

    // Aguardar o arquivo estar pronto (polling)
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileUri}?key=${GEMINI_API_KEY}`
      );
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (statusData.state === 'ACTIVE') {
          return fileUri;
        }
      }
      
      attempts++;
    }

    console.warn(`Arquivo não ficou pronto após ${maxAttempts} tentativas, retornando URI mesmo assim`);
    return fileUri;
  } catch (error) {
    console.error("Erro ao fazer upload para Gemini:", error);
    return null;
  }
}

/**
 * Gera proposta inicial usando Gemini
 */
async function generatePropostaWithGemini(
  editalInfo: any,
  fileIds: string[],
  userContext: any
): Promise<Record<string, any>> {
  const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const model = genAI.getGenerativeModel({ model: modelName });

  // Buscar e fazer upload dos PDFs
  const geminiFileUris: string[] = [];

  for (const fileId of fileIds) {
    const pdfBuffer = await fetchPdfFromStorage(fileId);
    if (!pdfBuffer) {
      console.warn(`⚠️ Não foi possível buscar PDF ${fileId}, pulando...`);
      continue;
    }

    const { data: pdfRecord } = await supabase!
      .from("edital_pdfs")
      .select("nome_arquivo")
      .eq("id", fileId)
      .single();

    const fileName = pdfRecord?.nome_arquivo || `file_${fileId}.pdf`;
    const fileUri = await uploadFileToGemini(pdfBuffer, "application/pdf", fileName);
    
    if (fileUri) {
      geminiFileUris.push(fileUri);
      console.log(`✅ PDF ${fileName} enviado para Gemini`);
    }
  }

  if (geminiFileUris.length === 0) {
    throw new Error("Nenhum arquivo foi enviado com sucesso para o Gemini");
  }

  // Preparar prompt para gerar proposta
  const prompt = `Você é um assistente especializado em ajudar pesquisadores e empresas a criar propostas para editais de fomento.

Analise o edital fornecido e gere uma proposta inicial preenchendo os campos comuns de formulários de submissão. Baseie-se nas informações do edital, nos critérios de elegibilidade e no perfil do usuário.

INFORMAÇÕES DO EDITAL:
- Título: ${editalInfo.titulo}
- Descrição: ${editalInfo.descricao || "Não disponível"}
- Critérios de Elegibilidade: ${editalInfo.criterios_elegibilidade || "Não disponível"}
- Sobre o Programa: ${editalInfo.sobre_programa || "Não disponível"}

PERFIL DO USUÁRIO:
- Tipo: ${userContext.userType || "pesquisador"}
- Lattes ID: ${userContext.lattesId || "Não informado"}
- CNPJ: ${userContext.cnpj || "Não informado"}

IMPORTANTE:
1. Analise o formulário de submissão fornecido nos PDFs
2. Identifique todos os campos que precisam ser preenchidos
3. Gere uma proposta inicial preenchendo os campos com informações realistas baseadas no edital e perfil do usuário
4. Se não souber alguma informação específica, deixe o campo vazio ou use um placeholder como "[PREENCHER]"
5. Retorne APENAS um JSON válido com a estrutura dos campos do formulário

FORMATO DE RESPOSTA:
Retorne um objeto JSON onde cada chave representa um campo do formulário e o valor é o conteúdo sugerido. Exemplo:
{
  "nome_projeto": "Nome sugerido do projeto",
  "descricao_projeto": "Descrição detalhada do projeto",
  "objetivo_geral": "Objetivo geral do projeto",
  "objetivos_especificos": ["Objetivo 1", "Objetivo 2"],
  "metodologia": "Metodologia proposta",
  "cronograma": "Cronograma de execução",
  "orcamento": {
    "total": "R$ 100.000,00",
    "itens": [...]
  },
  ...
}

Retorne APENAS o JSON, sem texto adicional antes ou depois.`;

  // Criar partes do conteúdo incluindo os arquivos
  const parts: any[] = [{ text: prompt }];
  for (const fileUri of geminiFileUris) {
    parts.push({
      fileData: {
        fileUri: fileUri,
        mimeType: "application/pdf",
      },
    });
  }

  const result = await model.generateContent(parts);
  const response = await result.response;
  const text = response.text();

  // Extrair JSON da resposta
  let jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Não foi possível extrair JSON da resposta da IA");
  }

  try {
    const camposFormulario = JSON.parse(jsonMatch[0]);
    return camposFormulario;
  } catch (error) {
    console.error("Erro ao parsear JSON:", error);
    console.error("Texto recebido:", text);
    throw new Error("Resposta da IA não está em formato JSON válido");
  }
}

/**
 * Endpoint POST /api/generate-proposta
 */
router.post("/generate-proposta", async (req, res) => {
  try {
    const { edital_id, edital_info, file_ids, user_context } = req.body;

    if (!edital_id || !file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return res.status(400).json({ error: "Campos obrigatórios: edital_id, file_ids (array não vazio)" });
    }

    if (!edital_info) {
      return res.status(400).json({ error: "Campo edital_info é obrigatório" });
    }

    console.log(`📥 Gerando proposta para edital: ${edital_id}`);
    console.log(`📁 File IDs: ${file_ids.length} arquivo(s)`);

    const camposFormulario = await generatePropostaWithGemini(
      edital_info,
      file_ids,
      user_context || {}
    );

    console.log(`✅ Proposta gerada com ${Object.keys(camposFormulario).length} campos`);

    res.json({ campos_formulario: camposFormulario });
  } catch (error) {
    console.error("❌ Erro ao gerar proposta:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

