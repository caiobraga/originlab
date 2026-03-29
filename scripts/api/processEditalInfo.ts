// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getDelayBetweenEditaisMs,
  getOllamaFieldConcurrency,
  getProcessEditalBatchConcurrency,
  getWebhookOrLocalApiDefaultDelayMs,
  sleepFieldExtractDelay,
} from '../lib/process-edital-delays';
import { runWithConcurrency } from '../lib/run-with-concurrency';

// Modo de extração: Ollama local > API local > n8n webhook
const USE_OLLAMA = process.env.USE_OLLAMA === 'true';
const USE_LOCAL_API = process.env.USE_LOCAL_API === 'true'; // Default: false (usa n8n)
const LOCAL_API_URL = process.env.LOCAL_API_URL || "http://localhost:3000/api/extract-edital-info";
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://n8n.srv652789.hstgr.cloud/webhook/basic";
const WEBHOOK_LIGHT_URL = process.env.N8N_WEBHOOK_LIGHT_URL || WEBHOOK_URL;

interface EditalInfo {
  id: string;
  numero: string | null;
  titulo: string;
  fonte?: string | null;
  valor_projeto?: string | null;
  prazo_inscricao?: string | null;
  localizacao?: string | null;
  vagas?: string | null;
  is_researcher?: boolean | null;
  is_company?: boolean | null;
  sobre_programa?: string | null;
  criterios_elegibilidade?: string | null;
  timeline_estimada?: any | null;
}

interface ProcessedInfo {
  valor_projeto?: string;
  prazo_inscricao?: string | string[]; // Pode ser string única ou array de prazos
  localizacao?: string;
  vagas?: string;
  is_researcher?: boolean;
  is_company?: boolean;
  sobre_programa?: string;
  criterios_elegibilidade?: string;
  timeline_estimada?: any;
}

/**
 * Busca os IDs dos PDFs de um edital para uso no RAG (documents) e no Ollama.
 * Retorna file_id (storage) quando existir, senão edital_pdfs.id, para bater com documents.file_id.
 */
async function fetchEditalPdfIds(supabase: SupabaseClient, editalId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('edital_pdfs')
      .select('file_id, id')
      .eq('edital_id', editalId);

    if (error) {
      console.error(`Erro ao buscar PDFs do edital ${editalId}:`, error);
      return [];
    }

    return data?.map((pdf: any) => pdf.file_id || pdf.id).filter((p: any): p is string => typeof p === 'string' && p.trim().length > 0) || [];
  } catch (error) {
    console.error(`Erro ao buscar PDFs do edital ${editalId}:`, error);
    return [];
  }
}

/**
 * Verifica se o valor indica "não encontrado"
 */
function isNotFoundMessage(value: string): boolean {
  const lowerValue = value.toLowerCase();
  
  // Padrões que definitivamente indicam "não encontrado"
  const definitiveNotFoundPatterns = [
    'não foi possível encontrar',
    'não foi possível determinar',
    'não foi possível identificar',
    'não foi possível obter',
    'não consegui obter',
    'não consegui encontrar',
    'não retornou nenhuma informação',
    'não posso fornecer',
    'ferramenta de consulta não retornou',
    'não há informações sobre',
    'não há dados disponíveis sobre',
    'informação não está disponível',
    'informação não está disponível para',
    'dados não estão disponíveis',
    'sem informação',
    'não localizado',
    'não encontrada',
    'não encontrado',
    'não disponível',
    'file_id fornecido',
    'file_id especificado',
    'file_id não foi encontrado',
    'identificador não foi encontrado',
    'não foi encontrado nas informações',
    'não contém esses dados',
    'não continham esses dados',
    'não especifica o número',
    'não foram encontradas quantidades',
    'não especifica',
  ];
  
  // Verificar se contém padrões definitivos de "não encontrado"
  const hasDefinitiveNotFound = definitiveNotFoundPatterns.some(pattern => 
    lowerValue.includes(pattern)
  );
  
  // Se tem padrão definitivo, verificar se NÃO contém informações válidas
  if (hasDefinitiveNotFound) {
    // Se contém informações válidas (números, datas, localizações conhecidas), não é "não encontrado"
    // Regex para detectar valores monetários com várias moedas
    const currencyRegex = /(r\$|us\$|\$|€|£|¥|chf|cad|aud|nzd|brl|eur|gbp|jpy)\s*[\d.,]+/i;
    const hasValidInfo = 
      /\d+/.test(value) || // Contém números
      /espírito santo|brasil|es|rj|mg|sp/i.test(value) || // Contém localizações
      /\d{2}\/\d{2}\/\d{4}/.test(value) || // Contém datas
      currencyRegex.test(value); // Contém valores monetários (qualquer moeda)
    
    // Se tem informações válidas, não é "não encontrado"
    if (hasValidInfo) {
      return false;
    }
    
    return true;
  }
  
  // Se não tem padrão definitivo, não é "não encontrado"
  return false;
}

/**
 * Valida se o JSON tem a estrutura esperada para o campo
 * Retorna true apenas se estiver no formato JSON correto
 */
function isValidJsonFormat(jsonData: any, field: string): boolean {
  // Para valor_projeto, aceitar objeto JSON (pode ser complexo como {"valor": {...}})
  // OU array dentro de chave "valor" (ex: {"valor": [...]})
  if (field === 'valor_projeto') {
    // Aceitar string (ex.: {"valor":"3.000,00"} extraído como string)
    if (typeof jsonData === 'string' && jsonData.trim().length > 0) {
      return true;
    }
    // Deve ser um objeto JSON válido (não string, não array simples)
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      return true; // Objeto válido (pode ser complexo)
    }
    // Aceitar array se estiver dentro de chave "valor"
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      return true; // Array de valores é válido
    }
    return false;
  }
  
  // Para prazo_inscricao, aceitar objeto com array "prazos" ou array direto de objetos
  if (field === 'prazo_inscricao') {
    if (Array.isArray(jsonData)) {
      // Array deve conter objetos com estrutura de prazo
      return (
        jsonData.length > 0 &&
        jsonData.some(
          (p: any) =>
            (typeof p === 'string' && p.trim().length > 0) ||
            (typeof p === 'object' && p !== null && (p.inicio || p.fim || p.chamada || p.prazo)),
        )
      );
    }
    if (typeof jsonData === 'object' && jsonData !== null) {
      // Objeto deve ter "prazos" como array
      return Array.isArray(jsonData.prazos);
    }
    return false; // Não aceitar string simples
  }
  
  // Para localizacao, aceitar APENAS objeto JSON com chave "localizacao": {"localizacao": "valor"}
  if (field === 'localizacao') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "localizacao" com valor string não vazio
      return typeof jsonData.localizacao === 'string' && jsonData.localizacao.trim().length > 0;
    }
    return false; // Não aceitar string simples ou outros formatos
  }
  
  // Para vagas, aceitar APENAS objeto JSON com chave "vagas": {"vagas": "valor"}
  if (field === 'vagas') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "vagas" com valor string não vazio
      return typeof jsonData.vagas === 'string' && jsonData.vagas.trim().length > 0;
    }
    return false; // Não aceitar string simples ou outros formatos
  }
  
  // Para is_researcher, aceitar objeto JSON com chave "is_researcher": {"is_researcher": true/false/null}
  if (field === 'is_researcher') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "is_researcher" com valor boolean ou null
      return jsonData.is_researcher !== undefined && (typeof jsonData.is_researcher === 'boolean' || jsonData.is_researcher === null);
    }
    return false;
  }
  
  // Para is_company, aceitar objeto JSON com chave "is_company": {"is_company": true/false/null}
  if (field === 'is_company') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "is_company" com valor boolean ou null
      return jsonData.is_company !== undefined && (typeof jsonData.is_company === 'boolean' || jsonData.is_company === null);
    }
    return false;
  }
  
  // Para sobre_programa, aceitar objeto JSON com chave "sobre_programa": {"sobre_programa": "texto"}
  if (field === 'sobre_programa') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "sobre_programa" com valor string (ou null)
      return jsonData.sobre_programa !== undefined && (typeof jsonData.sobre_programa === 'string' || jsonData.sobre_programa === null);
    }
    return false;
  }
  
  // Para criterios_elegibilidade, aceitar objeto JSON com chave "criterios_elegibilidade": {"criterios_elegibilidade": "texto"}
  if (field === 'criterios_elegibilidade') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "criterios_elegibilidade" com valor string (ou null)
      return jsonData.criterios_elegibilidade !== undefined && (typeof jsonData.criterios_elegibilidade === 'string' || jsonData.criterios_elegibilidade === null);
    }
    return false;
  }
  
  // Para timeline_estimada, aceitar objeto JSON com chave "timeline_estimada": {"timeline_estimada": {"fases": [...]}}
  if (field === 'timeline_estimada') {
    if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
      // Deve ter a chave "timeline_estimada" com valor objeto (ou null)
      return jsonData.timeline_estimada !== undefined && (typeof jsonData.timeline_estimada === 'object' || jsonData.timeline_estimada === null);
    }
    return false;
  }
  
  return false; // Por padrão, rejeitar formatos não especificados
}

/**
 * Normaliza uma resposta removendo prefixos comuns e limpando formatação
 */
function normalizeResponse(value: string, field: string): string {
  let normalized = value.trim();
  
  // Remover prefixos comuns que não agregam informação
  const prefixesToRemove = [
    /^com base nas informações (obtidas|consultadas|recuperadas|fornecidas),?\s*/i,
    /^com base nas informações dos documentos fornecidos,?\s*/i,
    /^com base nas informações consultadas,?\s*/i,
    /^a localização, região ou área geográfica onde o edital é válido é\s*/i,
    /^a localização onde o edital é válido é\s*/i,
    /^o valor financeiro disponível neste edital é\s*/i,
    /^os valores financeiros disponíveis neste edital são:?\s*/i,
    /^os prazos de inscrição ou submissão (são|para este edital são):?\s*/i,
    /^com base nas informações obtidas anteriormente,?\s*/i,
    /^conforme informações obtidas,?\s*/i,
    /^conforme informações consultadas,?\s*/i,
  ];
  
  for (const prefix of prefixesToRemove) {
    normalized = normalized.replace(prefix, '');
  }
  
  // Limpar formatação markdown desnecessária
  normalized = normalized
    .replace(/\*\*/g, '') // Remove **bold**
    .replace(/\*/g, '')   // Remove *italic*
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Para localização, extrair apenas o nome do lugar se houver
  if (field === 'localizacao') {
    const locationMatch = normalized.match(/(?:é|são|localizado em|válido em|válido para)\s*([^,\.]+)/i);
    if (locationMatch) {
      normalized = locationMatch[1].trim();
    }
    // Remover "Brasil" se vier depois de um estado
    normalized = normalized.replace(/,\s*brasil\.?$/i, '');
  }
  
  return normalized.trim();
}

/**
 * Faz uma requisição ao webhook para extrair uma informação específica
 */
async function extractInfoFromWebhook(
  field: 'valor_projeto' | 'prazo_inscricao' | 'localizacao' | 'vagas' | 'is_researcher' | 'is_company' | 'sobre_programa' | 'criterios_elegibilidade' | 'timeline_estimada',
  fileIds: string[],
  editalId?: string,
): Promise<string | string[] | boolean | any | null> {
  try {
    const extractPrazoRangesFromText = (input: string): string[] => {
      const s = String(input || '');

      const isValidBrDate = (dmy: string): boolean => {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
        if (!m) return false;
        const dd = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const yyyy = parseInt(m[3], 10);
        if (yyyy < 1900 || yyyy > 2100) return false;
        if (mm < 1 || mm > 12) return false;
        if (dd < 1 || dd > 31) return false;
        const daysInMonth = new Date(yyyy, mm, 0).getDate();
        return dd <= daysInMonth;
      };

      const normalizeDateToken = (tok: string): string | null => {
        const t = String(tok || '').trim();
        if (!t) return null;

        // DD/MM/AAAA
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return isValidBrDate(t) ? t : null;

        // MM/AAAA -> assumir dia 01
        if (/^\d{2}\/\d{4}$/.test(t)) {
          const d = `01/${t}`;
          return isValidBrDate(d) ? d : null;
        }

        return null;
      };

      // Captura intervalos: "DD/MM/AAAA a DD/MM/AAAA" e também "MM/AAAA a DD/MM/AAAA" etc.
      const token = String.raw`(?:\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4})`;
      const re = new RegExp(`(${token})\\s*(?:a|-|até|ate)\\s*(${token})`, 'gi');

      const out: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) != null) {
        const start = normalizeDateToken(m[1]);
        const end = normalizeDateToken(m[2]);
        if (start && end) out.push(`${start} a ${end}`);
      }

      return [...new Set(out)];
    };

    const repairJsonCandidate = (input: string): string | null => {
      const s = String(input || '').trim();
      if (!s.startsWith('{') && !s.startsWith('[')) return null;

      // Limpar code fences se existirem
      let cand = s.replace(/```(?:json)?/gi, '').trim();

      // Balancear colchetes/chaves (saída truncada por num_predict)
      const count = (str: string, re: RegExp) => (str.match(re) || []).length;
      const openBraces = count(cand, /\{/g);
      const closeBraces = count(cand, /\}/g);
      const openBrackets = count(cand, /\[/g);
      const closeBrackets = count(cand, /\]/g);

      const missingBrackets = Math.max(0, openBrackets - closeBrackets);
      const missingBraces = Math.max(0, openBraces - closeBraces);

      if (missingBrackets === 0 && missingBraces === 0) return cand;
      return cand + ']'.repeat(missingBrackets) + '}'.repeat(missingBraces);
    };

    const extractFirstIntegerLike = (input: string): string | null => {
      const s = String(input || '');
      // pegar primeiro número inteiro "razoável" (1..100000), ignorando anos 19xx/20xx quando possível
      const matches = s.match(/\b\d{1,6}\b/g) || [];
      for (const m of matches) {
        const n = parseInt(m, 10);
        if (!Number.isFinite(n)) continue;
        if (n >= 1900 && n <= 2099) continue; // provavelmente ano
        if (n <= 0) continue;
        return String(n);
      }
      return null;
    };

    const extractCurrencyLike = (input: string): string | null => {
      const s = String(input || '');
      // Suporta: $12.6M, US$ 1.2B, R$ 3.000,00, R$ 1.500.000,00, € 120k, etc.
      // Regra: preferir o match mais "longo" (ex.: 1.500.000,00 ao invés de 1.500).
      const patterns: RegExp[] = [
        // Com símbolo + formato BR/Europeu (milhares com "." ou espaço e decimais com ",")
        /(R\$|US\$|\$|€|£|¥)\s*\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})?\b/gi,
        // Com símbolo + formato simples (ponto/vírgula como decimal) + sufixos (K/M/B/mil/mi/...)
        /(R\$|US\$|\$|€|£|¥)\s*\d+(?:[.,]\d+)?\s*(?:[KMB]|mil|mi|milhões|milhoes|bilhões|bilhoes)?\b/gi,
        // Sem símbolo + sufixos (K/M/B/mil/mi/...)
        /\b\d+(?:[.,]\d+)?\s*(?:[KMB]|mil|mi|milhões|milhoes|bilhões|bilhoes)\b/gi,
        // Fallback sem símbolo (formato BR/Europeu)
        /\b\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})\b/gi,
      ];

      const candidates: string[] = [];
      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(s)) != null) candidates.push(m[0].trim());
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.length - a.length);
      return candidates[0];
    };

    const extractTruncatedJsonStringField = (input: string, key: string): string | null => {
      const s = String(input || '');
      const keyPos = s.indexOf(`"${key}"`);
      if (keyPos < 0) return null;
      const colonPos = s.indexOf(':', keyPos);
      if (colonPos < 0) return null;

      let i = colonPos + 1;
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length || s[i] !== '"') return null;
      i++; // pula aspas iniciais

      let out = '';
      let escaped = false;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (escaped) {
          // preservar escapes comuns
          if (ch === 'n') out += '\n';
          else if (ch === 'r') out += '\r';
          else if (ch === 't') out += '\t';
          else out += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        // se a string fechou corretamente, parar
        if (ch === '"') break;
        out += ch;
      }

      const cleaned = out.replace(/\s+/g, ' ').trim();
      return cleaned.length > 0 ? cleaned : null;
    };

    const tryParseTopLevelJsonEvenIfTruncated = (txt: string): any | null => {
      const s = String(txt || '').trim();
      if (!s.startsWith('{') && !s.startsWith('[')) return null;
      try {
        return JSON.parse(s);
      } catch {
        const repaired = repairJsonCandidate(s);
        if (!repaired) return null;
        try {
          return JSON.parse(repaired);
        } catch {
          return null;
        }
      }
    };

    const extractTimelineFromTruncatedText = (input: string): { fases: any[] } | null => {
      const s = String(input || '');
      if (!s.includes('"timeline_estimada"') && !s.includes('"fases"')) return null;

      const fases: any[] = [];
      const objRegex = /\{[^{}]*"nome"\s*:\s*"[^"]+"[^{}]*\}/g;
      const matches = s.match(objRegex) || [];

      for (const rawObj of matches) {
        try {
          const obj = JSON.parse(rawObj);
          if (!obj || typeof obj !== 'object') continue;
          if (typeof obj.nome !== 'string' || obj.nome.trim().length === 0) continue;

          const fase: any = {
            nome: obj.nome.trim(),
          };
          if (typeof obj.prazo === 'string' && obj.prazo.trim().length > 0) fase.prazo = obj.prazo.trim();
          if (typeof obj.status === 'string' && obj.status.trim().length > 0) fase.status = obj.status.trim();
          if (typeof obj.data_inicio === 'string' && obj.data_inicio.trim().length > 0) fase.data_inicio = obj.data_inicio.trim();
          if (typeof obj.data_fim === 'string' && obj.data_fim.trim().length > 0) fase.data_fim = obj.data_fim.trim();
          fases.push(fase);
        } catch {
          // ignora objeto inválido/parcial
        }
      }

      if (fases.length === 0) return null;

      // Dedup básico por (nome + prazo + status + datas)
      const seen = new Set<string>();
      const dedup = fases.filter((f) => {
        const key = `${f.nome}|${f.prazo || ''}|${f.status || ''}|${f.data_inicio || ''}|${f.data_fim || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return { fases: dedup };
    };

    // Mapear campos para perguntas em português (melhoradas e mais específicas)
    const fieldQuestions: Record<string, string> = {
      valor_projeto: "Qual é o valor financeiro disponível neste edital? Procure ESPECIFICAMENTE por valores numéricos que contenham símbolos monetários: R$ (reais), $ (dólar), US$ (dólar americano), € (euro), £ (libra esterlina), ¥ (iene), CHF (franco suíço), CAD (dólar canadense), AUD (dólar australiano), NZD (dólar neozelandês), BRL (reais), EUR (euro), GBP (libra), JPY (iene), ou outras moedas internacionais. Procure por valores de bolsa, auxílio, subvenção, investimento ou recurso financeiro que estejam expressos com qualquer símbolo monetário. Se houver múltiplos valores ou modalidades, liste todos. IMPORTANTE: Foque em valores que tenham símbolo monetário (R$, $, US$, €, £, ¥, CHF, CAD, AUD, NZD, BRL, EUR, GBP, JPY, etc.) e sejam numéricos. Mantenha o símbolo da moeda original no valor retornado. Retorne em formato JSON: {\"valor\": \"valor encontrado ou lista de valores\"}. Se não encontrar valor específico com símbolo monetário, retorne null.",
      prazo_inscricao:
        'Extraia os prazos de inscrição/submissão deste edital. Retorne SOMENTE JSON válido no formato {"prazos":["DD/MM/AAAA a DD/MM/AAAA (descrição opcional)", "..."]}. Se não encontrar, {"prazos":[]}. Não retorne objetos, só strings dentro do array.',
      localizacao: "Do edital, qual localização preciso estar para participar desse edital? Ou posso participar de qualquer lugar do Brasil? Procure por informações sobre requisitos de localização, residência, ou área geográfica necessária para participar. IMPORTANTE: Você DEVE retornar SEMPRE em formato JSON válido, nunca em texto livre. Se o edital aceita participantes de qualquer lugar do Brasil (sem restrição geográfica), retorne: {\"localizacao\": \"Brasil\"} ou {\"localizacao\": \"Nacional\"}. Se houver restrição geográfica específica (ex: apenas Espírito Santo, apenas São Paulo, apenas região Sudeste), retorne: {\"localizacao\": \"Espírito Santo\"} ou {\"localizacao\": \"São Paulo\"} ou {\"localizacao\": \"Região Sudeste\"} com o estado, cidade ou região específica encontrada. Procure também por termos como 'localização', 'residência', 'área de atuação', 'abrangência', 'região', 'estado', 'município', 'nacional', 'brasileiro'. Se não encontrar nenhuma informação sobre restrição geográfica, retorne: {\"localizacao\": \"Brasil\"} (assumindo que não há restrição). Se não encontrar nenhuma informação no documento, retorne: {\"localizacao\": null}. LEMBRE-SE: Retorne APENAS o JSON, sem texto adicional antes ou depois.",
      vagas: "Qual é o número máximo de participantes, projetos ou propostas que este edital aceita para inscrição? Procure ESPECIFICAMENTE por valores numéricos inteiros (números como 10, 20, 50, 100, 200, etc) que estejam próximos ou ao lado das palavras: 'vagas', 'propostas', 'projetos', 'inscrições', 'beneficiados', 'beneficiários', 'selecionados', 'aprovados', 'contratados', 'quantidade', 'total de', 'número de', 'máximo de', 'limite de', 'até', 'serão selecionados', 'serão aprovados', 'serão contratados', 'projetos aprovados', 'propostas aprovadas', 'número de projetos', 'quantidade de projetos', 'total de projetos', 'número de beneficiários', 'quantidade de beneficiários'. REGRAS CRÍTICAS: 1) Busque apenas números inteiros (10, 20, 50, 100) que NÃO sejam parte do nome/número do edital (ignore 'Edital 21/2024', 'Nº 10', datas '2024', '2025'). 2) Os números devem representar quantidade de vagas/propostas/projetos/beneficiados/selecionados, NÃO valores monetários ou datas. 3) Procure por padrões como: 'X vagas', 'X propostas', 'até X projetos', 'máximo de X', 'limite de X', 'X beneficiados', 'serão selecionados X', 'serão aprovados X', 'total de X projetos', 'quantidade de X', 'número de X', onde X é um número inteiro. 4) CÁLCULO BASEADO EM VALORES: Se encontrar valores financeiros totais e valores por projeto/beneficiário, calcule o número de vagas. Exemplo: se há R$ 1.000.000 total e cada projeto recebe R$ 50.000, então há 20 vagas. Procure por tabelas de 'recursos disponíveis', 'distribuição de recursos', 'valores por projeto', 'valores por beneficiário'. 5) PROCURE EM SEÇÕES ESPECÍFICAS: 'Objetivo', 'Recursos', 'Seleção', 'Aprovação', 'Quantidade de Projetos', 'Número de Vagas', 'Distribuição de Recursos', 'Critérios de Seleção', 'Resultado Esperado'. 6) Se encontrar 'cada proponente pode apresentar apenas uma proposta', isso é limite por proponente, NÃO o total de vagas - continue procurando pelo número total de vagas/projetos aprovados. 7) Ignore números de identificação do edital, datas, valores monetários ou contextos não relacionados. FORMATO DE RESPOSTA OBRIGATÓRIO: Você DEVE retornar APENAS JSON válido, SEM texto adicional. Se encontrar um número, retorne: {\"vagas\": \"X\"} onde X é o número encontrado. Se não encontrar nenhum número específico, retorne: {\"vagas\": null}. NUNCA retorne texto livre como 'Não foi possível encontrar' - sempre retorne JSON válido.",
      is_researcher: `Analise o edital COMPLETO e determine se ele é direcionado EXCLUSIVA ou PRINCIPALMENTE para PESQUISADORES ACADÊMICOS.

REGRAS CRÍTICAS DE CLASSIFICAÇÃO:

RETORNE {"is_researcher": true} APENAS SE:
1. O edital menciona PROGRAMAS ACADÊMICOS CONHECIDOS no título ou texto principal:
   - "Marie Skłodowska-Curie", "MSCA", "Horizon Europe", "Horizon 2020", "ERC", "European Research Council"
   - "intercâmbio de pessoal", "mobility", "fellowship", "research grant", "research fellowship"
   Estes programas são SEMPRE para pesquisadores acadêmicos, mesmo que mencionem empresas.

2. O edital EXIGE EXPLICITAMENTE títulos acadêmicos como REQUISITO OBRIGATÓRIO:
   - "requisito de doutorado", "requisito de mestrado"
   - "título de doutor obrigatório", "título de mestre obrigatório"
   - "deve ter doutorado", "deve ter mestrado", "exige doutorado", "exige mestrado"
   - "PhD obrigatório", "pós-doutorado", "postdoc", "post-doctoral"
   IMPORTANTE: Apenas se for REQUISITO OBRIGATÓRIO, não apenas menção casual.

3. O edital EXIGE vínculo com instituição de ensino como REQUISITO:
   - "vinculado a universidade", "pesquisador de universidade"
   - "pesquisador de instituição de ensino", "docente pesquisador", "professor pesquisador"
   - "requer vínculo institucional com universidade"
   IMPORTANTE: Apenas se for REQUISITO, não apenas menção casual de universidades.

4. O edital menciona bolsas acadêmicas específicas:
   - "bolsa de iniciação científica", "bolsista de iniciação científica", "IC - iniciação científica"
   - "bolsa de pesquisa científica", "bolsa científica"

RETORNE {"is_researcher": false} SE:
- O edital menciona "CNPJ obrigatório", "pessoa jurídica obrigatória", "formação de empresa obrigatória" E NÃO menciona títulos acadêmicos ou vínculo com instituição de ensino como requisito
- O edital menciona apenas "empresas", "startups", "negócios", "empreendedores", "MEI", "microempresa" SEM mencionar pesquisa acadêmica ou requisitos acadêmicos
- O edital é claramente para atividade empresarial/comercial sem componente acadêmico

RETORNE {"is_researcher": null} SE:
- Não houver informação suficiente no documento
- O edital menciona tanto empresas quanto pesquisadores sem deixar claro qual é o público principal
- Não for possível determinar com certeza baseado no conteúdo disponível

REGRA DE PRIORIDADE:
- Se o edital menciona programas acadêmicos conhecidos (MSCA, Horizon, ERC), SEMPRE retorne true, mesmo que também mencione empresas
- Se o edital menciona CNPJ/empresa como requisito obrigatório E NÃO menciona títulos acadêmicos ou vínculo institucional como requisito, retorne false
- Se o edital menciona títulos acadêmicos como requisito obrigatório E NÃO menciona CNPJ/empresa como requisito obrigatório, retorne true

EXEMPLOS ESPECÍFICOS:
- "MSCA - Marie Skłodowska-Curie Intercâmbio de Pessoal 2025" → true (programa acadêmico conhecido)
- "Edital para pesquisadores com doutorado vinculados a universidade" → true (requisito acadêmico explícito)
- "CNPJ obrigatório para empresas inovadoras" → false (requisito empresarial sem requisito acadêmico)
- "Edital para startups e pesquisadores" → null (ambos mencionados, não é claro qual é o principal)
- "Horizon Europe - Research and Innovation" → true (programa acadêmico conhecido)
- "Formação de empresa obrigatória para receber o recurso" → false (requisito empresarial sem requisito acadêmico)

Retorne APENAS o JSON válido: {"is_researcher": true/false/null}`,
      is_company: `Analise o edital COMPLETO e determine se ele é direcionado EXCLUSIVA ou PRINCIPALMENTE para EMPRESAS ou requer CNPJ como requisito obrigatório.

REGRAS CRÍTICAS DE CLASSIFICAÇÃO:

RETORNE {"is_company": true} APENAS SE:
1. O edital EXIGE EXPLICITAMENTE CNPJ ou Pessoa Jurídica como REQUISITO OBRIGATÓRIO:
   - "CNPJ obrigatório", "CNPJ é obrigatório", "requer CNPJ", "necessário CNPJ"
   - "pessoa jurídica obrigatória", "PJ obrigatória", "requer pessoa jurídica"
   - "inscrição como pessoa jurídica obrigatória"
   IMPORTANTE: Apenas se for REQUISITO OBRIGATÓRIO, não apenas menção casual.

2. O edital EXIGE formação ou constituição de empresa como REQUISITO:
   - "formação de empresa obrigatória", "constituição de empresa obrigatória"
   - "deve constituir empresa", "deve formar empresa", "deve abrir empresa"
   - "obrigatório constituir empresa", "exige formação de empresa"
   IMPORTANTE: Apenas se for REQUISITO, não apenas menção casual.

3. O edital menciona tipos específicos de empresa como público-alvo PRINCIPAL:
   - "microempresa", "pequena empresa", "média empresa", "grande empresa"
   - "startup", "startups", "MEI", "microempreendedor individual"
   - "empresa de base tecnológica", "EBT", "ME", "EPP", "MPE"
   IMPORTANTE: Apenas se forem o público-alvo PRINCIPAL, não apenas mencionados.

RETORNE {"is_company": false} SE:
- O edital menciona PROGRAMAS ACADÊMICOS CONHECIDOS (MSCA, Horizon Europe, ERC, Marie Skłodowska-Curie) mesmo que também mencione empresas
- O edital EXIGE títulos acadêmicos (doutorado, mestrado) como requisito obrigatório E NÃO exige CNPJ/empresa como requisito obrigatório
- O edital EXIGE vínculo com instituição de ensino (universidade, faculdade) como requisito E NÃO exige CNPJ/empresa como requisito obrigatório
- O edital menciona apenas "pesquisadores acadêmicos", "bolsas de pesquisa científica" SEM mencionar CNPJ ou empresa como requisito obrigatório
- Não houver menção clara a CNPJ obrigatório, formação de empresa obrigatória, ou empresas como público-alvo principal

RETORNE {"is_company": null} SE:
- Não houver informação suficiente no documento
- O edital menciona tanto empresas quanto pesquisadores sem deixar claro qual é o público principal
- Não for possível determinar com certeza baseado no conteúdo disponível

REGRA DE PRIORIDADE:
- Se o edital menciona programas acadêmicos conhecidos (MSCA, Horizon, ERC), SEMPRE retorne false, mesmo que também mencione empresas
- Se o edital exige CNPJ/empresa como requisito obrigatório E NÃO exige títulos acadêmicos ou vínculo institucional como requisito obrigatório, retorne true
- Se o edital exige títulos acadêmicos como requisito obrigatório E NÃO exige CNPJ/empresa como requisito obrigatório, retorne false
- Se o edital exige ambos (CNPJ E títulos acadêmicos), avalie qual é o requisito PRINCIPAL ou retorne null se não for claro

EXEMPLOS ESPECÍFICOS:
- "CNPJ obrigatório para empresas inovadoras" → true (requisito empresarial explícito)
- "Formação de startup obrigatória para receber o recurso" → true (requisito empresarial explícito)
- "MSCA - Marie Skłodowska-Curie Intercâmbio de Pessoal" → false (programa acadêmico conhecido)
- "Edital para pesquisadores com doutorado vinculados a universidade" → false (requisito acadêmico sem requisito empresarial)
- "Horizon Europe - Research and Innovation" → false (programa acadêmico conhecido)
- "Edital para startups e pesquisadores" → null (ambos mencionados, não é claro qual é o principal)
- "CNPJ obrigatório E título de doutor obrigatório" → null (ambos são requisitos, precisa avaliar qual é o principal)

Retorne APENAS o JSON válido: {"is_company": true/false/null}`,
      sobre_programa: "Quais são as informações sobre o programa deste edital? Procure por seções como 'Sobre o Programa', 'Sobre o Edital', 'Objetivo do Programa', 'Descrição do Programa', 'Apresentação', 'Introdução', 'Contexto', 'Justificativa', 'Objetivos Gerais', 'Objetivos Específicos', 'Público-alvo', 'Área de Atuação'. Extraia um resumo completo e informativo sobre o programa, incluindo seus objetivos, público-alvo, área de atuação e contexto. IMPORTANTE: Retorne em formato JSON: {\"sobre_programa\": \"texto completo extraído sobre o programa\"}. Se não encontrar informações, retorne: {\"sobre_programa\": null}. LEMBRE-SE: Retorne APENAS o JSON, sem texto adicional antes ou depois.",
      criterios_elegibilidade: "Quais são os CRITÉRIOS DE ELEGIBILIDADE deste edital? Procure ESPECIFICAMENTE pela seção 'Critérios de Elegibilidade', 'Critérios de Habilitação', 'Requisitos para Participação', 'Condições de Elegibilidade', 'Condições de Habilitação', 'Requisitos de Elegibilidade', 'Critérios de Participação', 'Condições para Participação'. Extraia TODOS os critérios, requisitos e condições necessários para participar do edital. IMPORTANTE: Retorne em formato JSON: {\"criterios_elegibilidade\": \"texto completo com todos os critérios de elegibilidade encontrados\"}. Se não encontrar a seção de critérios de elegibilidade, retorne: {\"criterios_elegibilidade\": null}. LEMBRE-SE: Retorne APENAS o JSON, sem texto adicional antes ou depois.",
      timeline_estimada: "IMPORTANTE: Você recebeu os arquivos do edital através dos file_ids fornecidos. Analise o conteúdo desses arquivos para responder esta pergunta. Quais são as fases e cronograma deste edital? Procure por seções como 'Cronograma', 'Timeline', 'Calendário', 'Fases do Edital', 'Etapas', 'Fases de Execução', 'Cronograma de Atividades', 'Calendário de Execução', 'Linha do Tempo'. Para cada fase encontrada, extraia: nome da fase, prazo (em dias ou datas), status (aberto/fechado/pendente), data de início (se disponível), data de fim (se disponível). IMPORTANTE: Retorne em formato JSON: {\"timeline_estimada\": {\"fases\": [{\"nome\": \"Inscrição\", \"prazo\": \"30 dias\", \"status\": \"aberto\", \"data_inicio\": \"2024-01-01\", \"data_fim\": \"2024-01-31\"}, {\"nome\": \"Fase 1\", \"prazo\": \"60 dias\", \"status\": \"pendente\"}, ...]}}. Se não encontrar informações sobre cronograma/fases, retorne: {\"timeline_estimada\": null}. LEMBRE-SE: Retorne APENAS o JSON, sem texto adicional antes ou depois.",
    };
    const fieldFallbackQuestions: Partial<Record<keyof typeof fieldQuestions, string>> = {
      localizacao:
        'Extraia APENAS a localização geográfica do edital (estado/cidade/região/país). Retorne somente JSON válido: {"localizacao":"..."}; se não encontrar, {"localizacao":null}.',
      vagas:
        'Extraia APENAS número de vagas/quantidade de bolsas/beneficiários do edital. Retorne somente JSON válido: {"vagas":"..."}; se não encontrar, {"vagas":null}.',
      prazo_inscricao:
        'Extraia APENAS o prazo de inscrição. Retorne somente JSON válido no formato {"prazos":["..."]}; se não encontrar, {"prazos":[]}.',
    };

    // Verificar se file_ids está vazio
    if (!fileIds || fileIds.length === 0) {
      console.error(`  ❌ ERRO: Nenhum file_id disponível para ${field}! Não é possível extrair informações sem os arquivos.`);
      return null;
    }

    console.log(`  📝 Mensagem: ${fieldQuestions[field].substring(0, 80)}...`);
    console.log(`  📁 File IDs: ${fileIds.length} arquivo(s)`);

    let responseText = '';
    let contentType: string | null = null;
    let response: Response | null = null;

    if (USE_OLLAMA) {
      const { extractInfoViaOllama } = await import('../lib/ollama-edital');
      const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
      console.log(`  📤 Extraindo via Ollama (${model}) para: ${field}`);
      const maxEmptyRetries = Math.max(0, parseInt(process.env.OLLAMA_EMPTY_RESPONSE_RETRIES || '1', 10) || 1);
      for (let attempt = 0; attempt <= maxEmptyRetries; attempt++) {
        const useFallback = attempt > 0;
        const prompt = useFallback && fieldFallbackQuestions[field]
          ? fieldFallbackQuestions[field]!
          : fieldQuestions[field];
        const ollamaText = await extractInfoViaOllama(prompt, fileIds, {
          editalId: editalId || undefined,
        });
        responseText = ollamaText ?? '';
        if (responseText.trim()) break;
        if (attempt < maxEmptyRetries) {
          console.warn(`  ⚠️ Resposta vazia do Ollama para ${field}. Tentando novamente com prompt simplificado (${attempt + 1}/${maxEmptyRetries})...`);
        }
      }
      if (!responseText.trim()) {
        console.warn(`  ⚠️ Resposta vazia do Ollama para ${field} (após retries)`);
        return null;
      }
      console.log(`  📥 Resposta Ollama: ${responseText.length} caracteres`);
    } else {
    // Formato esperado pelo n8n: o body HTTP é acessado como $json.body
    const requestBody = {
      message: fieldQuestions[field],
      file_ids: fileIds,
    };
    console.log(`  📋 IDs completos sendo enviados:`, fileIds);
    const apiUrl = USE_LOCAL_API ? LOCAL_API_URL : WEBHOOK_URL;
    console.log(`  📤 Enviando requisição para extrair: ${field}`);
    console.log(`  🔗 URL: ${apiUrl} ${USE_LOCAL_API ? '(API Local)' : '(n8n)'}`);
    console.log(`  📦 Request body completo:`, JSON.stringify(requestBody, null, 2));

    // Adicionar delay entre requisições para evitar rate limiting e sobrecarga do n8n
    // Cloudflare tem timeout de 100s; n8n pode demorar se houver muitas requisições
    const delayMs = parseInt(
      process.env.API_REQUEST_DELAY_MS || String(getWebhookOrLocalApiDefaultDelayMs()),
      10,
    );
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const isVectorInsertError = (txt: string) =>
      String(txt || '').toLowerCase().includes('vector must have at least 1 dimension');

    const isCloudflareTimeout = (status: number, txt: string) =>
      status === 524 || (status >= 520 && status <= 530 && txt.toLowerCase().includes('cloudflare'));

    const webhookTimeoutMs = parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS || '240000', 10);
    const maxEmptyRetries = parseInt(process.env.N8N_EMPTY_RESPONSE_RETRIES || '2', 10);
    const emptyRetryDelayMs = parseInt(process.env.N8N_EMPTY_RETRY_DELAY_MS || '15000', 10);
    const max524Retries = parseInt(process.env.N8N_524_RETRIES || '3', 10);
    const initial524BackoffMs = parseInt(process.env.N8N_524_BACKOFF_MS || '30000', 10);

    const doRequest = (url: string, signal?: AbortSignal) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal,
      });

    let response: Response;
    let attempt524 = 0;

    const tryRequest = async (): Promise<Response | null> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhookTimeoutMs);
      try {
        const res = await doRequest(apiUrl, controller.signal);
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        const isTimeout = (err as Error & { name?: string }).name === 'AbortError';
        console.error(`  ❌ Erro ao chamar webhook para ${field}: ${isTimeout ? `timeout após ${webhookTimeoutMs}ms` : (err as Error).message}`);
        if (isTimeout) {
          console.warn(`     Dica: Aumente N8N_WEBHOOK_TIMEOUT_MS (ex: 180000) se o workflow n8n demorar mais.`);
        }
        return null;
      }
    };

    let firstRes = await tryRequest();
    if (!firstRes) return null;
    response = firstRes;

    // Retry com backoff exponencial para erro 524 (Cloudflare timeout)
    while (!response.ok && attempt524 < max524Retries) {
      const errorText = await response.text().catch(() => '');
      if (!isCloudflareTimeout(response.status, errorText)) break;

      attempt524++;
      const backoff = initial524BackoffMs * Math.pow(2, attempt524 - 1);
      console.warn(`  ⚠️ Cloudflare timeout (524) para ${field}. Tentativa ${attempt524}/${max524Retries} após ${backoff / 1000}s...`);
      console.warn(`     O servidor n8n está sobrecarregado. Aguardando antes de tentar novamente.`);
      await new Promise((r) => setTimeout(r, backoff));

      const retryRes = await tryRequest();
      if (!retryRes) return null;
      response = retryRes;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      
      // Verificar se é erro 404 (webhook não registrado)
      if (response.status === 404) {
        console.warn(`  ⚠️ Webhook não registrado (404) para ${field}. O workflow do n8n precisa estar ativo.`);
        console.warn(`     Dica: Execute o workflow no n8n ou ative-o em produção.`);
        return null;
      }

      // Erro 524 após todas as tentativas
      if (isCloudflareTimeout(response.status, errorText)) {
        console.error(`  ❌ Cloudflare timeout (524) persistente para ${field} após ${attempt524} tentativa(s).`);
        console.warn(`     O servidor n8n está muito sobrecarregado. Sugestões:`);
        console.warn(`     1. Aumente API_REQUEST_DELAY_MS (ex: 20000 ou 30000)`);
        console.warn(`     2. Processe menos editais por vez`);
        console.warn(`     3. Verifique se há outros processos usando o n8n`);
        return null;
      }

      // Fallback para webhook "light" quando o n8n falha ao inserir embeddings no vector store (pgvector)
      if (!USE_LOCAL_API && response.status === 400 && isVectorInsertError(errorText) && WEBHOOK_LIGHT_URL !== WEBHOOK_URL) {
        console.warn(`  ⚠️ n8n vector store falhou (embedding vazio) ao extrair ${field}. Tentando fallback (light)...`);
        response = await doRequest(WEBHOOK_LIGHT_URL);
        if (!response.ok) {
          const errorText2 = await response.text().catch(() => '');
          console.error(`  ❌ Erro HTTP ${response.status} (light) ao extrair ${field}:`, errorText2);
          return null;
        }
      } else {
        console.error(`  ❌ Erro HTTP ${response.status} ao extrair ${field}:`, errorText);
        return null;
      }
    }

    // Processar resposta
    let contentType = response.headers.get('content-type');
    let responseText = await response.text();

    // Retry quando resposta é 200 mas corpo vazio (n8n às vezes responde antes de preencher o body)
    let emptyAttempt = 0;
    while ((!responseText || responseText.trim() === '') && emptyAttempt < maxEmptyRetries) {
      emptyAttempt++;
      console.warn(`  ⚠️ Resposta vazia para ${field}. Tentativa ${emptyAttempt}/${maxEmptyRetries} em ${emptyRetryDelayMs}ms...`);
      await new Promise((r) => setTimeout(r, emptyRetryDelayMs));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhookTimeoutMs);
      try {
        response = await doRequest(apiUrl, controller.signal);
        clearTimeout(timeoutId);
        if (!response.ok) break;
        contentType = response.headers.get('content-type');
        responseText = await response.text();
      } catch {
        clearTimeout(timeoutId);
        break;
      }
    }
    
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
      console.warn(`  ⚠️ Resposta vazia para ${field} (após ${emptyAttempt > 0 ? emptyAttempt + 1 : 1} tentativa(s))`);
      console.warn(`     Status: ${response.status}, Content-Type: ${contentType || 'não especificado'}`);
      console.warn(`     O webhook está respondendo, mas o corpo da resposta está vazio.`);
      console.warn(`     Possíveis causas:`);
      console.warn(`     1. No n8n, no nó "Respond to Webhook" use "Respond When" = "When Last Node Finishes"`);
      console.warn(`     2. O nó de resposta deve retornar o output do AI (ex: {{ $json.output }}) no body`);
      console.warn(`     3. O workflow pode estar falhando antes do nó de resposta`);
      console.warn(`     Ação: Verifique os logs do workflow no n8n e certifique-se de que há um nó de resposta retornando os dados`);
      return null;
    }
    } // fim else (n8n / API local)

    // Log detalhado da resposta
    const statusLabel = USE_OLLAMA ? 'Ollama' : (response ? String(response.status) : '');
    console.log(`  📥 Status: ${statusLabel}`);
    console.log(`  📥 Content-Type: ${contentType || 'não especificado'}`);
    console.log(`  📥 Tamanho da resposta: ${responseText?.length || 0} caracteres`);

    // Log da resposta bruta para debug (apenas primeiros 500 caracteres)
    const preview = responseText.substring(0, 500);
    console.log(`  📥 Resposta recebida: ${preview}${responseText.length > 500 ? '...' : ''}`);

    // Tentar extrair JSON da resposta (pode estar dentro de texto)
    responseText = responseText.trim();
    
    // PRIMEIRO: Se a resposta é um array JSON (formato n8n comum), extrair o primeiro item
    let parsedResponse: any = null;
    try {
      parsedResponse = JSON.parse(responseText);
      if (Array.isArray(parsedResponse) && parsedResponse.length > 0) {
        const firstItem = parsedResponse[0];
        if (firstItem.output) {
          // Se output é uma string, verificar se contém markdown code blocks
          if (typeof firstItem.output === 'string') {
            let outputContent = firstItem.output;
            
            // Extrair JSON de markdown code blocks se presente
            if (outputContent.includes('```')) {
              const codeBlockMatch = outputContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
              if (codeBlockMatch && codeBlockMatch[1]) {
                outputContent = codeBlockMatch[1];
              } else {
                // Tentar com regex mais permissivo
                const codeBlockPermissive = outputContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (codeBlockPermissive && codeBlockPermissive[1]) {
                  const extracted = codeBlockPermissive[1].trim();
                  if (extracted.startsWith('{')) {
                    outputContent = extracted;
                  }
                }
              }
            }
            
            // Se output (processado) é uma string JSON, tentar parsear
            if (outputContent.trim().startsWith('{')) {
            try {
                const innerJson = JSON.parse(outputContent);
              // Se parseou com sucesso, usar o JSON interno
              parsedResponse = innerJson;
              responseText = JSON.stringify(innerJson);
            } catch (e) {
                // Se não conseguir parsear, usar o texto original processado
                responseText = outputContent;
              }
            } else {
              responseText = outputContent;
            }
          } else {
            responseText = String(firstItem.output);
          }
        } else {
          responseText = JSON.stringify(firstItem);
        }
      } else if (typeof parsedResponse === 'object') {
        // Se já é um objeto, usar diretamente
        responseText = JSON.stringify(parsedResponse);
      }
    } catch (e) {
      // Se não for JSON válido, continuar com o texto original
    }
    
    // Procurar por JSON na resposta (pode estar em markdown code blocks ou texto puro)
    let jsonMatch: RegExpMatchArray | null = null;
    
    // 1. Tentar extrair de markdown code blocks primeiro (mais comum no n8n)
    // Primeiro, tentar encontrar code blocks com ```json ou apenas ```
    // Usar abordagem mais robusta para capturar JSON completo
    const codeBlockStart = responseText.indexOf('```');
    if (codeBlockStart !== -1) {
      const codeBlockEnd = responseText.lastIndexOf('```');
      if (codeBlockEnd !== -1 && codeBlockEnd > codeBlockStart) {
        // Extrair conteúdo entre os code blocks
        const codeContent = responseText.substring(codeBlockStart + 3, codeBlockEnd).trim();
        // Remover "json" se presente
        const jsonContent = codeContent.replace(/^json\s*/i, '').trim();
        if (jsonContent.startsWith('{')) {
          jsonMatch = [jsonContent];
        }
      }
    }
    
    // Se não encontrou com a abordagem acima, tentar regex
    if (!jsonMatch) {
      const codeBlockPatterns = [
        /```json\s*(\{[\s\S]*?\})\s*```/,  // ```json {...} ```
        /```\s*(\{[\s\S]*?\})\s*```/,      // ``` {...} ```
      ];
      
      for (const pattern of codeBlockPatterns) {
        const match = responseText.match(pattern);
        if (match && match[1]) {
          const codeContent = match[1].trim();
        if (codeContent.startsWith('{')) {
          jsonMatch = [codeContent];
            break;
          }
        }
      }
    }
    
    // 2. Se não encontrou, tentar encontrar JSON completo no texto
    if (!jsonMatch) {
      jsonMatch = responseText.match(/\{[\s\S]*\}/);
    }

    // Se começa com "{" mas está truncado (sem "}" no fim), ainda assim tentar parse/repair
    if (!jsonMatch && responseText.trim().startsWith('{')) {
      jsonMatch = [responseText.trim()];
    }
    
    // 3. Tentar encontrar JSON dentro de strings escapadas (ex: "output": "{\"key\": \"value\"}")
    if (!jsonMatch) {
      const stringJsonMatch = responseText.match(/"output"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (stringJsonMatch) {
        try {
          // Desescapar JSON dentro da string
          const escaped = stringJsonMatch[1];
          const unescaped = escaped.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
          if (unescaped.trim().startsWith('{')) {
            jsonMatch = [unescaped];
          }
        } catch (e) {
          // Ignorar erro de desescape
        }
      }
    }


    // Se encontrou JSON, tentar parsear
    if (jsonMatch) {
      try {
        let jsonData = JSON.parse(jsonMatch[0]);
        
        // Se o JSON parseado tem uma chave "output" que é string JSON, tentar parsear novamente
        if (typeof jsonData === 'object' && jsonData !== null && jsonData.output && typeof jsonData.output === 'string') {
          try {
            let outputContent = jsonData.output;
            
            // Se o output contém markdown code blocks, extrair o JSON de dentro
            if (outputContent.includes('```')) {
              // Método robusto: encontrar primeiro { e último } dentro do code block
              const firstBrace = outputContent.indexOf('{');
              const lastBrace = outputContent.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                outputContent = outputContent.substring(firstBrace, lastBrace + 1).trim();
                console.log(`  🔍 JSON extraído do code block (${outputContent.length} chars)`);
              } else {
                // Fallback: tentar regex
                const codeBlockMatch = outputContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (codeBlockMatch && codeBlockMatch[1]) {
                  outputContent = codeBlockMatch[1].trim();
                }
              }
            }
            
            const innerJson = JSON.parse(outputContent);
            console.log(`  ✅ JSON parseado do output com sucesso`);
            jsonData = innerJson;
          } catch (e) {
            console.warn(`  ⚠️ Erro ao parsear output como JSON: ${e}`);
            // Se não conseguir parsear, usar o JSON original
          }
        }
        
        // Para localizacao e vagas, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'localizacao' && jsonData.localizacao !== undefined) {
          if (jsonData.localizacao === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const locValue = String(jsonData.localizacao).trim();
          if (locValue.length > 0 && !isNotFoundMessage(locValue)) {
            console.log(`  ✅ Extraído ${field} do JSON: ${locValue}`);
            return locValue;
          }
        }
        
        if (field === 'vagas' && jsonData.vagas !== undefined) {
          if (jsonData.vagas === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const vagasValue = String(jsonData.vagas).trim();
          if (vagasValue.length > 0 && !isNotFoundMessage(vagasValue)) {
            console.log(`  ✅ Extraído ${field} do JSON: ${vagasValue}`);
            return vagasValue;
          }
        }
        
        // Para is_researcher, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'is_researcher' && jsonData.is_researcher !== undefined) {
          if (jsonData.is_researcher === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          if (typeof jsonData.is_researcher === 'boolean') {
            console.log(`  ✅ Extraído ${field} do JSON: ${jsonData.is_researcher}`);
            return jsonData.is_researcher;
          }
        }
        
        // Para is_company, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'is_company' && jsonData.is_company !== undefined) {
          if (jsonData.is_company === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          if (typeof jsonData.is_company === 'boolean') {
            console.log(`  ✅ Extraído ${field} do JSON: ${jsonData.is_company}`);
            return jsonData.is_company;
          }
        }
        
        // Para sobre_programa, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'sobre_programa' && jsonData.sobre_programa !== undefined) {
          if (jsonData.sobre_programa === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const sobreRaw = String(jsonData.sobre_programa).trim();
          if (sobreRaw.length > 0 && !isNotFoundMessage(sobreRaw)) {
            // Alguns modelos devolvem {"sobre_programa":"{\"sobre_programa\":\"...\"}"} (JSON dentro de string)
            if (sobreRaw.startsWith('{') && sobreRaw.includes('sobre_programa')) {
              try {
                const repaired = repairJsonCandidate(sobreRaw) || sobreRaw;
                const inner = JSON.parse(repaired);
                if (inner && typeof inner === 'object' && inner.sobre_programa !== undefined) {
                  const innerText = inner.sobre_programa === null ? null : String(inner.sobre_programa).trim();
                  if (innerText && !isNotFoundMessage(innerText)) {
                    console.log(`  ✅ Extraído ${field} (inner JSON string)`);
                    return innerText;
                  }
                  if (inner.sobre_programa === null) return null;
                }
              } catch {
                // se falhar, cair no raw
              }
            }
            console.log(`  ✅ Extraído ${field} do JSON: ${sobreRaw.substring(0, 100)}...`);
            return sobreRaw;
          }
        }
        
        // Para criterios_elegibilidade, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'criterios_elegibilidade' && jsonData.criterios_elegibilidade !== undefined) {
          if (jsonData.criterios_elegibilidade === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          const criteriosValue = String(jsonData.criterios_elegibilidade).trim();
          if (criteriosValue.length > 0 && !isNotFoundMessage(criteriosValue)) {
            console.log(`  ✅ Extraído ${field} do JSON: ${criteriosValue.substring(0, 100)}...`);
            return criteriosValue;
          }
        }
        
        // Para timeline_estimada, verificar primeiro se o JSON já tem a estrutura correta
        if (field === 'timeline_estimada' && jsonData.timeline_estimada !== undefined) {
          const timeline = jsonData.timeline_estimada;
          if (timeline === null) {
            console.log(`  ℹ️ ${field}: null (não encontrado)`);
            return null;
          }
          if (typeof timeline === 'object' && timeline !== null) {
            const fasesCount = timeline.fases && Array.isArray(timeline.fases) ? timeline.fases.length : 0;
            console.log(`  ✅ Extraído ${field} do JSON: objeto timeline com ${fasesCount} fase(s)`);
            return JSON.stringify(timeline);
          }
        }
        
        // Tentar extrair o valor do campo específico
        const fieldKeys: Record<string, string[]> = {
          valor_projeto: ['valor', 'valor_projeto', 'value', 'output', 'result'],
          prazo_inscricao: ['prazo', 'prazos', 'prazo_inscricao', 'deadline', 'output', 'result'],
          localizacao: ['localizacao', 'localização', 'location', 'regiao', 'região', 'output', 'result'],
          vagas: ['vagas', 'vagas_disponiveis', 'projects', 'numero_vagas', 'output', 'result'],
          is_researcher: ['is_researcher', 'isResearcher', 'pesquisador', 'researcher', 'output', 'result'],
          is_company: ['is_company', 'isCompany', 'empresa', 'company', 'output', 'result'],
          sobre_programa: ['sobre_programa', 'sobrePrograma', 'sobre_programa', 'about_program', 'output', 'result'],
          criterios_elegibilidade: ['criterios_elegibilidade', 'criteriosElegibilidade', 'critérios_elegibilidade', 'elegibilidade', 'output', 'result'],
          timeline_estimada: ['timeline_estimada', 'timelineEstimada', 'timeline', 'cronograma', 'fases', 'output', 'result'],
        };

        const keysToTry = fieldKeys[field] || ['output', 'result', 'value', field];
        
        for (const key of keysToTry) {
          if (jsonData[key] !== undefined && jsonData[key] !== null) {
            const extractedValue = jsonData[key];
            
            // Para localizacao e vagas, se a chave é o nome do campo e o valor é string, aceitar diretamente
            if ((field === 'localizacao' && key === 'localizacao') || (field === 'vagas' && key === 'vagas')) {
              if (typeof extractedValue === 'string' && extractedValue.trim().length > 0) {
                const value = extractedValue.trim();
                if (!isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value}`);
                  return value;
                }
              }
              // Se for null, aceitar também (indica que não foi encontrado)
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
            }
            
            // Validar se o formato é válido para o campo
            if (!isValidJsonFormat(extractedValue, field)) {
              console.warn(`  ⚠️ JSON encontrado mas formato inválido para ${field}, tentando próximo...`);
              continue; // Tentar próxima chave
            }
            // Para prazo_inscricao, verificar se é array de prazos
            if (field === 'prazo_inscricao' && Array.isArray(extractedValue)) {
              const prazos = extractedValue;
              if (prazos.length > 0) {
                // Validar que são objetos com informações de prazo ou strings
                const prazosValidos = prazos.filter((p: any) => 
                  p && (typeof p === 'string' || (typeof p === 'object' && (p.fim || p.inicio || p.chamada || p.prazo)))
                );
                if (prazosValidos.length > 0) {
                  console.log(`  ✅ Extraído array de ${prazosValidos.length} prazo(s) em formato válido`);
                  // Retornar JSON stringificado para manter estrutura
                  return JSON.stringify({ prazos: prazosValidos });
                }
              }
            }
            
            // Para valor_projeto, aceitar objeto complexo OU array dentro de chave "valor"
            if (field === 'valor_projeto') {
              if (typeof extractedValue === 'object' && extractedValue !== null && !Array.isArray(extractedValue)) {
                console.log(`  ✅ Extraído objeto JSON válido para ${field}`);
                return JSON.stringify(extractedValue);
              }
              // Se for array dentro de "valor", aceitar também
              if (Array.isArray(extractedValue) && extractedValue.length > 0) {
                console.log(`  ✅ Extraído array de valores para ${field}`);
                return JSON.stringify({ valor: extractedValue });
              }
            }
            
            // Para localizacao, deve ter chave "localizacao" com valor string
            if (field === 'localizacao' && typeof extractedValue === 'object' && extractedValue !== null) {
              if (typeof extractedValue.localizacao === 'string' && extractedValue.localizacao.trim().length > 0) {
                const locValue = extractedValue.localizacao.trim();
                if (!isNotFoundMessage(locValue)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${locValue}`);
                  return locValue;
                }
              }
              console.warn(`  ⚠️ JSON não contém "localizacao" válida`);
              continue; // Tentar próxima chave
            }
            
            // Para vagas, deve ter chave "vagas" com valor string
            if (field === 'vagas' && typeof extractedValue === 'object' && extractedValue !== null) {
              if (typeof extractedValue.vagas === 'string' && extractedValue.vagas.trim().length > 0) {
                const vagasValue = extractedValue.vagas.trim();
                if (!isNotFoundMessage(vagasValue)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${vagasValue}`);
                  return vagasValue;
                }
              }
              console.warn(`  ⚠️ JSON não contém "vagas" válida`);
              continue; // Tentar próxima chave
            }
            
            // Para is_researcher, deve ter chave "is_researcher" com valor boolean
            if (field === 'is_researcher') {
              if (typeof extractedValue === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue}`);
                return extractedValue;
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.is_researcher === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue.is_researcher}`);
                return extractedValue.is_researcher;
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "is_researcher" válido`);
              continue;
            }
            
            // Para is_company, deve ter chave "is_company" com valor boolean
            if (field === 'is_company') {
              if (typeof extractedValue === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue}`);
                return extractedValue;
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.is_company === 'boolean') {
                console.log(`  ✅ Extraído ${field} do JSON: ${extractedValue.is_company}`);
                return extractedValue.is_company;
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "is_company" válido`);
              continue;
            }
            
            // Para sobre_programa, deve ter chave "sobre_programa" com valor string
            if (field === 'sobre_programa') {
              if (typeof extractedValue === 'string' && extractedValue.trim().length > 0) {
                const value = extractedValue.trim();
                if (!isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.sobre_programa === 'string') {
                const value = extractedValue.sobre_programa.trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "sobre_programa" válido`);
              continue;
            }
            
            // Para criterios_elegibilidade, deve ter chave "criterios_elegibilidade" com valor string
            if (field === 'criterios_elegibilidade') {
              if (typeof extractedValue === 'string' && extractedValue.trim().length > 0) {
                const value = extractedValue.trim();
                if (!isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (typeof extractedValue === 'object' && extractedValue !== null && typeof extractedValue.criterios_elegibilidade === 'string') {
                const value = extractedValue.criterios_elegibilidade.trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} do JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "criterios_elegibilidade" válido`);
              continue;
            }
            
            // Para timeline_estimada, deve ter chave "timeline_estimada" com valor objeto
            if (field === 'timeline_estimada') {
              if (typeof extractedValue === 'object' && extractedValue !== null) {
                // Se extractedValue já é o objeto timeline_estimada completo
                if (extractedValue.timeline_estimada !== undefined) {
                  const timeline = extractedValue.timeline_estimada;
                  if (timeline === null) {
                    console.log(`  ℹ️ ${field}: null (não encontrado)`);
                    return null;
                  }
                  if (typeof timeline === 'object' && timeline !== null) {
                    console.log(`  ✅ Extraído ${field} do JSON: objeto com fases`);
                    return JSON.stringify(timeline);
                  }
                }
                // Se extractedValue é o objeto timeline_estimada diretamente (sem chave wrapper)
                if (extractedValue.fases && Array.isArray(extractedValue.fases)) {
                  console.log(`  ✅ Extraído ${field} do JSON: objeto com fases`);
                  return JSON.stringify(extractedValue);
                }
              }
              if (extractedValue === null) {
                console.log(`  ℹ️ ${field}: null (não encontrado)`);
                return null;
              }
              console.warn(`  ⚠️ JSON não contém "timeline_estimada" válido`);
              continue;
            }
            
            // Se chegou aqui, o formato não é válido para este campo
            console.warn(`  ⚠️ Formato inválido para ${field}, tentando próxima chave...`);
            continue;
          }
        }

        // Se não encontrou nas chaves específicas, verificar se o JSON tem a estrutura esperada
        // Para localizacao, vagas e novos campos, tentar extrair de "output" se contiver JSON válido
        if (field === 'localizacao' || field === 'vagas' || field === 'is_researcher' || field === 'is_company' || field === 'sobre_programa' || field === 'criterios_elegibilidade' || field === 'timeline_estimada') {
          // Tentar extrair de "output" se for uma string JSON
          if (jsonData.output && typeof jsonData.output === 'string') {
            try {
              const outputJson = JSON.parse(jsonData.output);
              if (field === 'localizacao' && outputJson.localizacao) {
                const locValue = String(outputJson.localizacao).trim();
                if (!isNotFoundMessage(locValue)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${locValue}`);
                  return locValue;
                }
              }
              if (field === 'vagas' && outputJson.vagas) {
                const vagasValue = String(outputJson.vagas).trim();
                if (!isNotFoundMessage(vagasValue)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${vagasValue}`);
                  return vagasValue;
                }
              }
              if (field === 'is_researcher' && outputJson.is_researcher !== undefined) {
                if (typeof outputJson.is_researcher === 'boolean') {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${outputJson.is_researcher}`);
                  return outputJson.is_researcher;
                }
                if (outputJson.is_researcher === null) {
                  console.log(`  ℹ️ ${field}: null (não encontrado)`);
                  return null;
                }
              }
              if (field === 'is_company' && outputJson.is_company !== undefined) {
                if (typeof outputJson.is_company === 'boolean') {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${outputJson.is_company}`);
                  return outputJson.is_company;
                }
                if (outputJson.is_company === null) {
                  console.log(`  ℹ️ ${field}: null (não encontrado)`);
                  return null;
                }
              }
              if (field === 'sobre_programa' && outputJson.sobre_programa) {
                const value = String(outputJson.sobre_programa).trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (field === 'criterios_elegibilidade' && outputJson.criterios_elegibilidade) {
                const value = String(outputJson.criterios_elegibilidade).trim();
                if (value.length > 0 && !isNotFoundMessage(value)) {
                  console.log(`  ✅ Extraído ${field} de output JSON: ${value.substring(0, 100)}...`);
                  return value;
                }
              }
              if (field === 'timeline_estimada' && outputJson.timeline_estimada !== undefined) {
                const timeline = outputJson.timeline_estimada;
                if (timeline === null) {
                  console.log(`  ℹ️ ${field}: null (não encontrado)`);
                  return null;
                }
                if (typeof timeline === 'object' && timeline !== null) {
                  // Validar se tem estrutura de fases
                  if (timeline.fases && Array.isArray(timeline.fases)) {
                    console.log(`  ✅ Extraído ${field} de output JSON: objeto com ${timeline.fases.length} fase(s)`);
                    return JSON.stringify(timeline);
                  } else if (typeof timeline === 'object') {
                    // Aceitar objeto mesmo sem fases explícitas
                    console.log(`  ✅ Extraído ${field} de output JSON: objeto timeline`);
                    return JSON.stringify(timeline);
                  }
                }
              }
            } catch (e) {
              // Se não conseguir parsear, continuar
            }
          }
          console.warn(`  ⚠️ JSON não contém a chave "${field}" no formato esperado`);
          return null; // Retornar null para usar valor default
        }
        
        // Para outros campos, tentar qualquer valor string no JSON
        for (const key in jsonData) {
          if (typeof jsonData[key] === 'string' && jsonData[key].trim()) {
            const value = jsonData[key].trim();
            // Verificar se é uma mensagem de "não encontrado"
            if (isNotFoundMessage(value)) {
              console.log(`  ⚠️ Resposta indica que informação não foi encontrada: ${value}`);
              return null; // Retornar null para usar valor default
            }
            console.log(`  ✅ Extraído de JSON (chave genérica): ${value}`);
            return value;
          }
        }
      } catch (parseError) {
        // Campo textual longo pode vir truncado como {"sobre_programa":"... sem fechar aspas/chaves
        if (field === 'sobre_programa' || field === 'criterios_elegibilidade') {
          const key = field === 'sobre_programa' ? 'sobre_programa' : 'criterios_elegibilidade';
          const partial = extractTruncatedJsonStringField(responseText, key);
          if (partial && !isNotFoundMessage(partial)) {
            console.warn(`  ⚠️ ${field}: JSON truncado; usando conteúdo parcial extraído (${partial.length} chars).`);
            return partial;
          }
        }

        // Ajuda quando faltou só o "}" final (ou estava truncado no fim)
        const repairedData = tryParseTopLevelJsonEvenIfTruncated(jsonMatch[0]);
        if (repairedData != null && isValidJsonFormat(repairedData, field)) {
          console.warn(`  ⚠️ JSON reparado automaticamente (truncado no fim)`);
          responseText = JSON.stringify(repairedData);
          // e segue para os próximos estágios de extração abaixo
        }

        // Caso especial: prazo_inscricao frequentemente vem truncado dentro de string.
        // Em vez de depender do JSON, reconstruímos a lista a partir do texto bruto.
        if (field === 'prazo_inscricao') {
          const ranges = extractPrazoRangesFromText(responseText);
          if (ranges.length > 0) {
            console.warn(`  ⚠️ prazo_inscricao: JSON inválido/truncado; reconstruindo a partir de ${ranges.length} intervalo(s) detectado(s).`);
            return JSON.stringify({ prazos: ranges });
          }
        }

        // Caso especial: timeline_estimada truncada no meio do array fases.
        if (field === 'timeline_estimada') {
          const timeline = extractTimelineFromTruncatedText(responseText);
          if (timeline && Array.isArray(timeline.fases) && timeline.fases.length > 0) {
            console.warn(`  ⚠️ timeline_estimada: JSON inválido/truncado; reconstruindo ${timeline.fases.length} fase(s) válidas.`);
            return JSON.stringify(timeline);
          }
        }

        // Tentar reparar JSON truncado (muito comum com num_predict baixo)
        try {
          const repaired = repairJsonCandidate(jsonMatch[0]);
          if (repaired) {
            const jsonData2 = JSON.parse(repaired);
            if (isValidJsonFormat(jsonData2, field)) {
              console.warn(`  ⚠️ JSON reparado automaticamente (saída truncada)`);
              // Reusar fluxo padrão: converter para texto e deixar o pipeline extrair
              responseText = JSON.stringify(jsonData2);
            }
          }
        } catch {
          // ignore
        }
        console.warn(`  ⚠️ Erro ao parsear JSON encontrado: ${parseError}`);
        // Continuar para tentar outros métodos
      }
    }

    // Se não encontrou JSON ou não conseguiu parsear, tentar processar como resposta normal
    // Verificar se é JSON direto (array com output)
    if (contentType && contentType.includes('application/json')) {
      try {
        const data = JSON.parse(responseText);
        
        if (Array.isArray(data) && data.length > 0) {
          const firstItem = data[0];
          if (typeof firstItem === 'object' && firstItem.output) {
            // Tentar extrair JSON do output
            const outputValue = firstItem.output;
            if (typeof outputValue === 'string' && outputValue.trim().startsWith('{')) {
              try {
                const outputJson = JSON.parse(outputValue);
                // Validar formato
                if (isValidJsonFormat(outputJson, field)) {
                  if (field === 'localizacao' && outputJson.localizacao) {
                    const locValue = outputJson.localizacao.trim();
                    if (!isNotFoundMessage(locValue)) {
                      console.log(`  ✅ Extraído ${field} do output: ${locValue}`);
                      return locValue;
                    }
                  }
                  if (field === 'vagas' && outputJson.vagas) {
                    const vagasValue = outputJson.vagas.trim();
                    if (!isNotFoundMessage(vagasValue)) {
                      console.log(`  ✅ Extraído ${field} do output: ${vagasValue}`);
                      return vagasValue;
                    }
                  }
                  if (field === 'is_researcher' && outputJson.is_researcher !== undefined) {
                    if (typeof outputJson.is_researcher === 'boolean') {
                      console.log(`  ✅ Extraído ${field} do output: ${outputJson.is_researcher}`);
                      return outputJson.is_researcher;
                    }
                  }
                  if (field === 'is_company' && outputJson.is_company !== undefined) {
                    if (typeof outputJson.is_company === 'boolean') {
                      console.log(`  ✅ Extraído ${field} do output: ${outputJson.is_company}`);
                      return outputJson.is_company;
                    }
                  }
                  if (field === 'sobre_programa' && outputJson.sobre_programa) {
                    const value = String(outputJson.sobre_programa).trim();
                    if (value.length > 0 && !isNotFoundMessage(value)) {
                      console.log(`  ✅ Extraído ${field} do output: ${value.substring(0, 100)}...`);
                      return value;
                    }
                  }
                  if (field === 'criterios_elegibilidade' && outputJson.criterios_elegibilidade) {
                    const value = String(outputJson.criterios_elegibilidade).trim();
                    if (value.length > 0 && !isNotFoundMessage(value)) {
                      console.log(`  ✅ Extraído ${field} do output: ${value.substring(0, 100)}...`);
                      return value;
                    }
                  }
                  if (field === 'valor_projeto') {
                    console.log(`  ✅ Extraído ${field} do output`);
                    return JSON.stringify(outputJson);
                  }
                  if (field === 'prazo_inscricao' && outputJson.prazos) {
                    console.log(`  ✅ Extraído ${field} do output`);
                    return JSON.stringify({ prazos: outputJson.prazos });
                  }
                }
              } catch (e) {
                // Se não conseguir parsear, continuar
              }
            }
          }
        }
      } catch (parseError) {
        console.warn(`  ⚠️ Erro ao parsear resposta JSON: ${parseError}`);
      }
    }

    // Fallbacks quando o modelo ignora o formato JSON (principalmente em modelos menores)
    if (field === 'vagas') {
      const n = extractFirstIntegerLike(responseText);
      if (n) {
        console.warn(`  ⚠️ vagas: resposta em texto; extraindo número ${n}`);
        return n;
      }
    }
    if (field === 'valor_projeto') {
      const v = extractCurrencyLike(responseText);
      if (v) {
        console.warn(`  ⚠️ valor_projeto: resposta fora do JSON; extraindo valor ${v}`);
        return JSON.stringify({ valor: v });
      }
    }

    // Se não conseguiu extrair JSON no formato esperado, retornar null
    console.warn(`  ⚠️ Resposta não está no formato JSON esperado para ${field}`);
    return null;
  } catch (error) {
    console.error(`  ❌ Erro ao extrair ${field}:`, error);
    return null;
  }
}

/**
 * Processa as informações de um edital
 */
export async function processEditalInfo(
  supabase: SupabaseClient,
  edital: EditalInfo,
  options?: {
    /** Reextrair todos os campos mesmo que já estejam preenchidos. */
    forceReextract?: boolean;
    /**
     * Se a reextração vier vazia (null/""/[]), manter o valor antigo vindo do banco.
     * Normalmente faz sentido junto com `forceReextract`.
     */
    keepExistingOnEmpty?: boolean;
  }
): Promise<ProcessedInfo> {
  console.log(`\n📄 Processando edital: ${edital.numero || 'N/A'} - ${edital.titulo.substring(0, 50)}...`);

  const forceReextract = options?.forceReextract ?? false;
  const keepExistingOnEmpty = options?.keepExistingOnEmpty ?? false;

  // Buscar PDF IDs
  const pdfIds = await fetchEditalPdfIds(supabase, edital.id);
  
  if (pdfIds.length === 0) {
    console.log(`  ⚠️ Nenhum PDF encontrado para este edital`);
    return {};
  }

  console.log(`  📁 Encontrados ${pdfIds.length} PDF(s)`);

  // Verificar se é edital do CNPq pela fonte
  const isCNPqEdital = edital.fonte?.toLowerCase().includes('cnpq') || false;
  
  // Verificar quais campos precisam ser extraídos (só extrair se for null, undefined ou "Não informado")
  const needsValorProjeto = forceReextract
    ? true
    : !edital.valor_projeto || edital.valor_projeto === 'Não informado';
  const needsPrazoInscricao = forceReextract
    ? true
    : !edital.prazo_inscricao || edital.prazo_inscricao === 'Não informado';
  const needsLocalizacao = forceReextract
    ? true
    : !edital.localizacao || edital.localizacao === 'Não informado';
  const needsVagas = forceReextract
    ? true
    : !edital.vagas || edital.vagas === 'Não informado';
  
  // Para CNPq: sempre considerar como pesquisador, não perguntar sobre empresa
  const needsIsResearcher = isCNPqEdital ? false : (edital.is_researcher === null || edital.is_researcher === undefined);
  const needsIsCompany = isCNPqEdital ? false : (edital.is_company === null || edital.is_company === undefined);
  const needsSobrePrograma = forceReextract ? true : (!edital.sobre_programa || edital.sobre_programa === 'Não informado');
  const needsCriteriosElegibilidade = forceReextract
    ? true
    : !edital.criterios_elegibilidade || edital.criterios_elegibilidade === 'Não informado';
  const needsTimelineEstimada = forceReextract ? true : (!edital.timeline_estimada || edital.timeline_estimada === null);
  
  let valor_projeto: string | string[] | null = null;
  let prazo_inscricao: string | string[] | null = null;
  let localizacao: string | string[] | null = null;
  let vagas: string | string[] | null = null;
  let is_researcher: boolean | null = null;
  let is_company: boolean | null = null;
  let sobre_programa: string | null = null;
  let criterios_elegibilidade: string | null = null;
  let timeline_estimada: any | null = null;

  // Campos que não precisam de nova extração: manter valor + log
  if (!needsValorProjeto) {
    valor_projeto = edital.valor_projeto || null;
    console.log(`  ⏭️  Valor por Projeto já possui valor válido, mantendo valor existente`);
  }
  if (!needsPrazoInscricao) {
    prazo_inscricao = edital.prazo_inscricao || null;
    console.log(`  ⏭️  Prazo de Inscrição já possui valor válido, mantendo valor existente`);
  }
  if (!needsLocalizacao) {
    localizacao = edital.localizacao || null;
    console.log(`  ⏭️  Localização já possui valor válido, mantendo valor existente`);
  }
  if (!needsVagas) {
    vagas = edital.vagas || null;
    console.log(`  ⏭️  Vagas já possui valor válido, mantendo valor existente`);
  }

  if (isCNPqEdital) {
    is_researcher = true;
    is_company = false;
    console.log(`  ✅ Edital CNPq: definido automaticamente como pesquisador (is_researcher=true, is_company=false)`);
  } else {
    if (!needsIsResearcher) {
      is_researcher = edital.is_researcher ?? null;
      console.log(`  ⏭️  Is Researcher já possui valor válido, mantendo valor existente`);
    }
    if (!needsIsCompany) {
      is_company = edital.is_company ?? null;
      console.log(`  ⏭️  Is Company já possui valor válido, mantendo valor existente`);
    }
  }

  if (!needsSobrePrograma) {
    sobre_programa = edital.sobre_programa || null;
    console.log(`  ⏭️  Sobre Programa já possui valor válido, mantendo valor existente`);
  }
  if (!needsCriteriosElegibilidade) {
    criterios_elegibilidade = edital.criterios_elegibilidade || null;
    console.log(`  ⏭️  Critérios de Elegibilidade já possui valor válido, mantendo valor existente`);
  }
  if (!needsTimelineEstimada) {
    timeline_estimada = edital.timeline_estimada || null;
    console.log(`  ⏭️  Timeline Estimada já possui valor válido, mantendo valor existente`);
  }

  const extractionTasks: (() => Promise<void>)[] = [];

  if (needsValorProjeto) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('valor_projeto', pdfIds, edital.id);
      valor_projeto = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!valor_projeto || (Array.isArray(valor_projeto) ? valor_projeto.length === 0 : valor_projeto.trim().length === 0))) {
        valor_projeto = edital.valor_projeto || null;
      }
    });
  }
  if (needsPrazoInscricao) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('prazo_inscricao', pdfIds, edital.id);
      prazo_inscricao = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!prazo_inscricao || (Array.isArray(prazo_inscricao) ? prazo_inscricao.length === 0 : prazo_inscricao.trim().length === 0))) {
        prazo_inscricao = edital.prazo_inscricao || null;
      }
    });
  }
  if (needsLocalizacao) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('localizacao', pdfIds, edital.id);
      localizacao = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!localizacao || (Array.isArray(localizacao) ? localizacao.length === 0 : localizacao.trim().length === 0))) {
        localizacao = edital.localizacao || null;
      }
    });
  }
  if (needsVagas) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('vagas', pdfIds, edital.id);
      vagas = (typeof result === 'string' || Array.isArray(result)) ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!vagas || (Array.isArray(vagas) ? vagas.length === 0 : vagas.trim().length === 0))) {
        vagas = edital.vagas || null;
      }
    });
  }

  if (!isCNPqEdital) {
    if (needsIsResearcher) {
      extractionTasks.push(async () => {
        const result = await extractInfoFromWebhook('is_researcher', pdfIds, edital.id);
        is_researcher = typeof result === 'boolean' ? result : null;
      });
    }
    if (needsIsCompany) {
      extractionTasks.push(async () => {
        const result = await extractInfoFromWebhook('is_company', pdfIds, edital.id);
        is_company = typeof result === 'boolean' ? result : null;
      });
    }
  }

  if (needsSobrePrograma) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('sobre_programa', pdfIds, edital.id);
      sobre_programa = typeof result === 'string' ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!sobre_programa || !sobre_programa.trim())) {
        sobre_programa = edital.sobre_programa || null;
      }
    });
  }
  if (needsCriteriosElegibilidade) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('criterios_elegibilidade', pdfIds, edital.id);
      criterios_elegibilidade = typeof result === 'string' ? result : null;
      if (forceReextract && keepExistingOnEmpty && (!criterios_elegibilidade || !criterios_elegibilidade.trim())) {
        criterios_elegibilidade = edital.criterios_elegibilidade || null;
      }
    });
  }
  if (needsTimelineEstimada) {
    extractionTasks.push(async () => {
      const result = await extractInfoFromWebhook('timeline_estimada', pdfIds, edital.id);
      if (typeof result === 'string' && result.trim().length > 0) {
        try {
          const parsedTimeline = JSON.parse(result);
          timeline_estimada = (typeof parsedTimeline === 'object' && parsedTimeline !== null) ? parsedTimeline : null;
          if (timeline_estimada) {
            console.log(`  ✅ Timeline Estimada extraída com sucesso`);
          } else {
            console.log(`  ℹ️ Timeline Estimada: null (não encontrado)`);
          }
        } catch (e) {
          console.warn(`  ⚠️ Erro ao parsear timeline_estimada: ${e}`);
          timeline_estimada = null;
        }
      } else if (typeof result === 'object' && result !== null) {
        timeline_estimada = result;
      } else {
        timeline_estimada = null;
        console.log(`  ℹ️ Timeline Estimada: null (não encontrado)`);
      }
      if (forceReextract && keepExistingOnEmpty && !timeline_estimada) {
        timeline_estimada = edital.timeline_estimada || null;
      }
    });
  }

  const fieldConcurrency = getOllamaFieldConcurrency();
  if (fieldConcurrency <= 1 || !USE_OLLAMA) {
    for (const t of extractionTasks) {
      await t();
      await sleepFieldExtractDelay();
    }
  } else {
    if (extractionTasks.length > 0) {
      console.log(`  ⚡ Extração paralela: até ${fieldConcurrency} campo(s) ao mesmo tempo (OLLAMA_FIELD_CONCURRENCY)`);
    }
    await runWithConcurrency(extractionTasks, fieldConcurrency);
  }

  const processedInfo: ProcessedInfo = {};
  
  // Função auxiliar para processar e validar campo
  const processField = (value: string | string[] | null, field: string, fieldName: string): string => {
    if (!value) {
      console.log(`  ⚠️ ${fieldName}: não encontrado (usando default)`);
      return 'Não informado';
    }
    
    // Se for array (prazos), converter para JSON stringificado
    if (Array.isArray(value)) {
      if (field === 'prazo_inscricao') {
        const jsonStr = JSON.stringify({ prazos: value });
        console.log(`  ✅ ${fieldName} (${value.length} prazo(s)): ${jsonStr.substring(0, 100)}...`);
        return jsonStr;
      }
      return value.join(', ');
    }
    
    // Se for string, verificar se é JSON válido
    const stringValue = String(value).trim();
    
    // Se começa com {, tentar parsear e validar formato
    if (stringValue.startsWith('{')) {
      try {
        const parsed = JSON.parse(stringValue);
        if (isValidJsonFormat(parsed, field)) {
          // Extrair valor da chave específica para localizacao e vagas
          if (field === 'localizacao' && parsed.localizacao) {
            console.log(`  ✅ ${fieldName}: ${parsed.localizacao}`);
            return parsed.localizacao;
          }
          if (field === 'vagas' && parsed.vagas) {
            if (!isNotFoundMessage(parsed.vagas)) {
              console.log(`  ✅ ${fieldName}: ${parsed.vagas}`);
              return parsed.vagas;
            }
            console.warn(`  ⚠️ ${fieldName}: valor indica não encontrado (usando default)`);
            return 'Não informado';
          }
          // Para valor_projeto e prazo_inscricao, retornar JSON stringificado
          console.log(`  ✅ ${fieldName}: JSON válido extraído`);
          return JSON.stringify(parsed);
        } else {
          console.warn(`  ⚠️ ${fieldName}: JSON encontrado mas formato inválido (usando default)`);
          return 'Não informado';
        }
      } catch (e) {
        // Se não conseguir parsear, usar default
        console.warn(`  ⚠️ ${fieldName}: JSON inválido (usando default)`);
        return 'Não informado';
      }
    }
    
    // Para localizacao e vagas, aceitar strings simples (não precisam estar em JSON)
    if (field === 'localizacao' || field === 'vagas') {
      if (stringValue.length > 0 && !isNotFoundMessage(stringValue)) {
        console.log(`  ✅ ${fieldName}: ${stringValue}`);
        return stringValue;
      }
      console.warn(`  ⚠️ ${fieldName}: valor inválido ou não encontrado (usando default)`);
      return 'Não informado';
    }
    
    // Para sobre_programa e criterios_elegibilidade, aceitar strings simples
    if (field === 'sobre_programa' || field === 'criterios_elegibilidade') {
      if (stringValue.length > 0 && !isNotFoundMessage(stringValue)) {
        console.log(`  ✅ ${fieldName}: ${stringValue.substring(0, 100)}...`);
        return stringValue;
      }
      console.warn(`  ⚠️ ${fieldName}: valor inválido ou não encontrado (usando default)`);
      return 'Não informado';
    }
    
    // Se não é JSON, usar default (todos os campos devem estar em formato JSON)
    console.warn(`  ⚠️ ${fieldName}: resposta não está em formato JSON (usando default)`);
    return 'Não informado';
  };

  processedInfo.valor_projeto = processField(valor_projeto, 'valor_projeto', 'Valor por Projeto');
  processedInfo.prazo_inscricao = processField(prazo_inscricao, 'prazo_inscricao', 'Prazo de Inscrição');
  processedInfo.localizacao = processField(localizacao, 'localizacao', 'Localização');
  processedInfo.vagas = processField(vagas, 'vagas', 'Vagas');
  
  // Processar campos booleanos
  if (is_researcher !== null && is_researcher !== undefined) {
    processedInfo.is_researcher = is_researcher;
    console.log(`  ✅ Is Researcher: ${is_researcher}`);
  } else {
    console.log(`  ⚠️ Is Researcher: não encontrado (usando null)`);
  }
  
  if (is_company !== null && is_company !== undefined) {
    processedInfo.is_company = is_company;
    console.log(`  ✅ Is Company: ${is_company}`);
  } else {
    console.log(`  ⚠️ Is Company: não encontrado (usando null)`);
  }
  
  // Processar campos de texto
  processedInfo.sobre_programa = sobre_programa && sobre_programa.trim().length > 0 && !isNotFoundMessage(sobre_programa)
    ? sobre_programa
    : (needsSobrePrograma ? 'Não informado' : undefined);
  
  if (processedInfo.sobre_programa) {
    console.log(`  ✅ Sobre Programa: ${processedInfo.sobre_programa.substring(0, 100)}...`);
  } else if (needsSobrePrograma) {
    console.log(`  ⚠️ Sobre Programa: não encontrado (usando default)`);
  }
  
  processedInfo.criterios_elegibilidade = criterios_elegibilidade && criterios_elegibilidade.trim().length > 0 && !isNotFoundMessage(criterios_elegibilidade)
    ? criterios_elegibilidade
    : (needsCriteriosElegibilidade ? 'Não informado' : undefined);
  
  if (processedInfo.criterios_elegibilidade) {
    console.log(`  ✅ Critérios de Elegibilidade: ${processedInfo.criterios_elegibilidade.substring(0, 100)}...`);
  }
  
  // Processar timeline_estimada
  processedInfo.timeline_estimada = timeline_estimada && typeof timeline_estimada === 'object' && timeline_estimada !== null
    ? timeline_estimada
    : undefined;
  
  if (processedInfo.timeline_estimada) {
    const fasesCount = processedInfo.timeline_estimada.fases && Array.isArray(processedInfo.timeline_estimada.fases) 
      ? processedInfo.timeline_estimada.fases.length 
      : 0;
    console.log(`  ✅ Timeline Estimada: ${fasesCount} fase(s) encontrada(s)`);
  } else if (needsTimelineEstimada) {
    console.log(`  ⚠️ Timeline Estimada: não encontrada (usando null)`);
  }

  return processedInfo;
}

/**
 * Atualiza as informações processadas no banco de dados
 */
export async function updateEditalInfo(
  supabase: SupabaseClient,
  editalId: string,
  info: ProcessedInfo
): Promise<void> {
  const updateData: Record<string, any> = {
    ...info,
    informacoes_processadas_em: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('editais')
    .update(updateData)
    .eq('id', editalId);

  if (error) {
    throw new Error(`Erro ao atualizar informações do edital: ${error.message}`);
  }
}

/**
 * Busca editais para processar
 * @param supabase Cliente Supabase
 * @param includeProcessed Se true, inclui editais já processados (para atualização)
 * @param includeNotInformed Se true, também inclui editais com "Não informado" (para reprocessar)
 */
export async function fetchEditaisToProcess(
  supabase: SupabaseClient,
  includeProcessed: boolean = false,
  includeNotInformed: boolean = false
): Promise<EditalInfo[]> {
  let query = supabase
    .from('editais')
    .select('id, numero, titulo, fonte, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company, sobre_programa, criterios_elegibilidade, timeline_estimada, informacoes_processadas_em')
    .order('criado_em', { ascending: false });

  // Se includeNotInformed, buscar TODOS os editais (incluindo processados)
  // porque queremos reprocessar os que têm "Não informado"
  if (includeNotInformed) {
    // Não aplicar filtro de processados aqui, vamos filtrar depois
  } else if (!includeProcessed) {
    // Se não incluir processados e não incluir "Não informado", filtrar apenas não processados
    query = query.is('informacoes_processadas_em', null);
  }

  const { data: editais, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(`Erro ao buscar editais: ${fetchError.message}`);
  }

  if (!editais || editais.length === 0) {
    return [];
  }

  // Se includeNotInformed, filtrar editais que têm "Não informado" em qualquer campo
  // OU que não foram processados (mesmo que includeProcessed seja false)
  if (includeNotInformed) {
    return editais.filter(edital => {
      // Incluir se não foi processado ainda
      const notProcessed = !edital.informacoes_processadas_em;
      if (notProcessed) {
        return true; // Sempre processar editais não processados
      }
      
      // Se já foi processado, só incluir se tem "Não informado" em qualquer campo
      // E se o campo não é null (null significa que não foi processado ainda)
      const hasNotInformed = 
        (edital.valor_projeto === 'Não informado') ||
        (edital.prazo_inscricao === 'Não informado') ||
        (edital.localizacao === 'Não informado') ||
        (edital.vagas === 'Não informado') ||
        (edital.sobre_programa === 'Não informado') ||
        (edital.criterios_elegibilidade === 'Não informado') ||
        (edital.timeline_estimada === null || edital.timeline_estimada === undefined) ||
        (edital.is_researcher === null || edital.is_researcher === undefined) ||
        (edital.is_company === null || edital.is_company === undefined);
      
      return hasNotInformed;
    });
  }

  // Se não incluir processados, filtrar apenas os não processados
  if (!includeProcessed) {
    return editais.filter(edital => !edital.informacoes_processadas_em);
  }

  return editais;
}

/** Retorna true se o edital tem "Não informado" (ou null em campos chave) em algum campo. */
function editalHasNotInformed(edital: EditalInfo): boolean {
  return (
    edital.valor_projeto === 'Não informado' ||
    edital.prazo_inscricao === 'Não informado' ||
    edital.localizacao === 'Não informado' ||
    edital.vagas === 'Não informado' ||
    edital.sobre_programa === 'Não informado' ||
    edital.criterios_elegibilidade === 'Não informado' ||
    (edital.timeline_estimada == null) ||
    (edital.is_researcher == null) ||
    (edital.is_company == null)
  );
}

/**
 * Busca editais que tenham pelo menos um dos campos (valor_projeto, prazo_inscricao, localizacao,
 * vagas, sobre_programa, criterios_elegibilidade, timeline_estimada, is_researcher, is_company) = null.
 */
export async function fetchEditaisWithNullFields(supabase: SupabaseClient): Promise<EditalInfo[]> {
  const { data: editais, error } = await supabase
    .from('editais')
    .select('id, numero, titulo, fonte, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company, sobre_programa, criterios_elegibilidade, timeline_estimada, informacoes_processadas_em')
    .or('valor_projeto.is.null,prazo_inscricao.is.null,localizacao.is.null,vagas.is.null,sobre_programa.is.null,criterios_elegibilidade.is.null,timeline_estimada.is.null,is_researcher.is.null,is_company.is.null')
    .order('criado_em', { ascending: false });

  if (error) throw new Error(`Erro ao buscar editais: ${error.message}`);
  return editais ?? [];
}

/**
 * Busca apenas editais já processados que tenham "Não informado" em algum campo (para reprocessar).
 */
export async function fetchEditaisOnlyNotInformed(supabase: SupabaseClient): Promise<EditalInfo[]> {
  const { data: editais, error } = await supabase
    .from('editais')
    .select('id, numero, titulo, fonte, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company, sobre_programa, criterios_elegibilidade, timeline_estimada, informacoes_processadas_em')
    .not('informacoes_processadas_em', 'is', null)
    .order('criado_em', { ascending: false });

  if (error) throw new Error(`Erro ao buscar editais: ${error.message}`);
  if (!editais?.length) return [];

  return editais.filter(editalHasNotInformed);
}

/**
 * Processa informações de todos os editais (modo definido por PROCESS_EDITAL_MODE).
 * PROCESS_EDITAL_MODE=null → somente editais com algum campo null (valor_projeto, prazo_inscricao, sobre_programa, criterios_elegibilidade, timeline_estimada, etc.)
 * PROCESS_EDITAL_MODE=nao-informado → somente editais já processados com "Não informado" em algum campo
 * Caso contrário → editais não processados + editais com "Não informado" (comportamento anterior)
 */
export async function processAllEditaisInfo(): Promise<void> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                      process.env.SUPABASE_URL || 
                      process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.SUPABASE_SERVICE_ROLE_KEY ||
                      process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Variáveis de ambiente não encontradas!');
    console.error('   Configure no arquivo .env.local:');
    console.error('   VITE_SUPABASE_URL=https://seu-projeto.supabase.co');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role\n');
    throw new Error('Variáveis de ambiente do Supabase não configuradas');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const mode = (process.env.PROCESS_EDITAL_MODE || '').toLowerCase().trim();
  let editais: EditalInfo[];

  if (mode === 'null') {
    console.log('\n🔄 Processamento: somente editais com algum campo null (sobre_programa, criterios_elegibilidade, timeline_estimada, etc.).\n');
    editais = await fetchEditaisWithNullFields(supabase);
  } else if (mode === 'nao-informado') {
    console.log('\n🔄 Processamento: somente editais já processados com "Não informado" em algum campo.\n');
    editais = await fetchEditaisOnlyNotInformed(supabase);
  } else {
    console.log('\n🔄 Iniciando processamento de informações dos editais...\n');
    console.log('ℹ️  Processando editais não processados e editais com "Não informado".\n');
    editais = await fetchEditaisToProcess(supabase, false, true);
  }

  if (!editais || editais.length === 0) {
    if (mode === 'null') {
      console.log('⚠️ Nenhum edital com campos null (sobre_programa, criterios_elegibilidade, timeline_estimada, etc.) encontrado.');
    } else if (mode === 'nao-informado') {
      console.log('⚠️ Nenhum edital já processado com "Não informado" encontrado.');
    } else {
      console.log('⚠️ Nenhum edital a processar encontrado no banco de dados.');
    }
    return;
  }

  console.log(`📊 Total de editais a processar: ${editais.length}`);
  if (USE_OLLAMA) {
    console.log(
      `⚡ Paralelismo: até ${getOllamaFieldConcurrency()} campo(s) por edital · ${getProcessEditalBatchConcurrency()} edital(is) por lote (OLLAMA_FIELD_CONCURRENCY / PROCESS_EDITAL_CONCURRENCY)`,
    );
  }
  console.log('');

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ edital: string; error: string }> = [];

  type OneResult = { ok: true } | { ok: false; edital: string; error: string };

  async function runOneEdital(edital: EditalInfo): Promise<OneResult> {
    try {
      const processedInfo = await processEditalInfo(supabase, edital);
      await updateEditalInfo(supabase, edital.id, processedInfo);
      console.log(`  ✅ Edital processado com sucesso\n`);
      return { ok: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Erro ao processar edital: ${errorMsg}\n`);
      return {
        ok: false,
        edital: `${edital.numero || 'N/A'} - ${edital.titulo}`,
        error: errorMsg,
      };
    }
  }

  function accumulateResults(results: OneResult[]) {
    for (const r of results) {
      if (r.ok) successCount++;
      else {
        errorCount++;
        errors.push({ edital: r.edital, error: r.error });
      }
    }
  }

  const batchConc = getProcessEditalBatchConcurrency();
  if (batchConc <= 1) {
    for (let i = 0; i < editais.length; i++) {
      const r = await runOneEdital(editais[i]);
      accumulateResults([r]);
      if (i < editais.length - 1) {
        const delayBetweenEditais = getDelayBetweenEditaisMs();
        if (delayBetweenEditais > 0) {
          console.log(`⏳ Aguardando ${delayBetweenEditais / 1000}s antes do próximo edital...\n`);
          await new Promise((resolve) => setTimeout(resolve, delayBetweenEditais));
        }
      }
    }
  } else {
    console.log(`⚡ PROCESS_EDITAL_CONCURRENCY=${batchConc}: processando editais em lotes paralelos (USE_OLLAMA).\n`);
    for (let i = 0; i < editais.length; i += batchConc) {
      const chunk = editais.slice(i, i + batchConc);
      const results = await Promise.all(chunk.map((e) => runOneEdital(e)));
      accumulateResults(results);
      if (i + batchConc < editais.length) {
        const delayBetweenEditais = getDelayBetweenEditaisMs();
        if (delayBetweenEditais > 0) {
          console.log(`⏳ Aguardando ${delayBetweenEditais / 1000}s antes do próximo lote...\n`);
          await new Promise((resolve) => setTimeout(resolve, delayBetweenEditais));
        }
      }
    }
  }

  // Resumo
  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO DO PROCESSAMENTO');
  console.log('═'.repeat(50));
  console.log(`📥 Editais processados: ${editais.length}`);
  console.log(`✅ Editais processados com sucesso: ${successCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n❌ Detalhes dos erros:');
    errors.forEach(({ edital, error }) => {
      console.log(`   - ${edital}: ${error}`);
    });
  }
}

// Executar se chamado diretamente (compatível com ESM)
// Usa endsWith para evitar execução duplicada quando importado por processEditalInfoNull.ts
const scriptFile = process.argv[1] || '';
const isDirectRun = import.meta.url === `file://${scriptFile}` || 
                    (scriptFile.endsWith('processEditalInfo.ts') && !scriptFile.includes('Null') && !scriptFile.includes('NaoInformado'));
if (isDirectRun) {
  processAllEditaisInfo()
    .then(() => {
      console.log('\n✅ Processamento concluído!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erro fatal:', error);
      process.exit(1);
    });
}

