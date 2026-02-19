/**
 * POST /api/calculate-edital-scores
 * Calcula match e probabilidade de aprovação (edital + usuário).
 * Se N8N_WEBHOOK_URL estiver definida (mesma URL usada em extract-edital-info e improve-text), usa o webhook n8n;
 * o webhook recebe: { message, file_ids } (message = prompt; file_ids = IDs dos PDFs do edital).
 * Resposta esperada do webhook: { match: 0-100, probabilidade: 0-100, justificativa: string }.
 * Caso contrário usa Gemini (requer GEMINI_API_KEY válida).
 */
import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
router.use(express.json({ limit: '50mb' }));

// Inicializar Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyARNPj2fdFb4RSnuI39gO0TGwWzgNXxisk';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Inicializar Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente do Supabase não configuradas');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Extrai informações do edital para o prompt
 */
function formatEditalInfo(edital: any): string {
  const info: string[] = [];
  
  if (edital.titulo) info.push(`Título: ${edital.titulo}`);
  if (edital.numero) info.push(`Número: ${edital.numero}`);
  if (edital.orgao) info.push(`Órgão: ${edital.orgao}`);
  if (edital.area) info.push(`Área: ${edital.area}`);
  if (edital.descricao) info.push(`Descrição: ${edital.descricao.substring(0, 500)}...`);
  if (edital.valor_projeto) info.push(`Valor por Projeto: ${edital.valor_projeto}`);
  if (edital.localizacao) info.push(`Localização: ${edital.localizacao}`);
  if (edital.vagas) info.push(`Vagas: ${edital.vagas}`);
  if (edital.is_researcher !== null) info.push(`Para Pesquisadores: ${edital.is_researcher}`);
  if (edital.is_company !== null) info.push(`Para Empresas: ${edital.is_company}`);
  if (edital.sobre_programa) info.push(`Sobre o Programa: ${edital.sobre_programa.substring(0, 500)}...`);
  if (edital.criterios_elegibilidade) info.push(`Critérios de Elegibilidade: ${edital.criterios_elegibilidade.substring(0, 500)}...`);
  if (edital.data_encerramento) info.push(`Data de Encerramento: ${edital.data_encerramento}`);
  
  return info.join('\n');
}

/**
 * Formata dados do usuário para o prompt (inclui Lattes completo para melhor cálculo de match/probabilidade)
 */
function formatUserData(userData: any): string {
  const info: string[] = [];

  if (userData.lattesData) {
    info.push(`Dados Currículo Lattes:`);
    if (userData.lattesData.nome) info.push(`  - Nome: ${userData.lattesData.nome}`);
    if (userData.lattesData.resumo) info.push(`  - Resumo: ${userData.lattesData.resumo}`);
    if (userData.lattesData.areasAtuacao?.length) info.push(`  - Áreas de Atuação: ${userData.lattesData.areasAtuacao.join(', ')}`);
    if (userData.lattesData.vinculoInstitucional?.length) info.push(`  - Vínculo Institucional: ${userData.lattesData.vinculoInstitucional.join('; ')}`);
    if (userData.lattesData.enderecoProfissional) {
      const ep = userData.lattesData.enderecoProfissional;
      const loc = [ep.cidade, ep.uf, ep.pais].filter(Boolean).join(', ');
      if (loc) info.push(`  - Localização profissional: ${loc}`);
    }
    if (userData.lattesData.tipoVinculo) info.push(`  - Tipo de vínculo: ${userData.lattesData.tipoVinculo}`);
    if (userData.lattesData.formacao?.length) {
      const formacaoStr = userData.lattesData.formacao.map((f: any) =>
        [f.nivel, f.curso, f.instituicao, f.anoConclusao].filter(Boolean).join(' - ')
      ).join('; ');
      info.push(`  - Formação: ${formacaoStr}`);
    }
    if (userData.lattesData.experienciaProfissional?.length) {
      info.push(`  - Experiência Profissional: ${userData.lattesData.experienciaProfissional.join('; ')}`);
    }
    if (userData.lattesData.resumoProducoes) info.push(`  - Produções (resumo): ${userData.lattesData.resumoProducoes}`);
    if (userData.lattesData.colaboracaoInternacional) info.push(`  - Colaboração internacional: ${userData.lattesData.colaboracaoInternacional}`);
    if (userData.lattesData.elegibilidade) {
      const e = userData.lattesData.elegibilidade;
      const titulos = [];
      if (e.possuiDoutorado) titulos.push('Doutorado');
      if (e.possuiMestrado) titulos.push('Mestrado');
      if (e.possuiGraduacao) titulos.push('Graduação');
      if (titulos.length) info.push(`  - Títulos: ${titulos.join(', ')}`);
      info.push(`  - Elegível para editais: ${e.podeParticiparEditais ? 'Sim' : 'Não'}`);
      if (e.anosExperiencia != null) info.push(`  - Anos de experiência: ${e.anosExperiencia}`);
      if (e.observacoes?.length) info.push(`  - Observações elegibilidade: ${e.observacoes.join('; ')}`);
    }
  }

  if (userData.cnpjData) {
    info.push(`Dados CNPJ:`);
    if (userData.cnpjData.razaoSocial) info.push(`  - Razão Social: ${userData.cnpjData.razaoSocial}`);
    if (userData.cnpjData.porte) info.push(`  - Porte: ${userData.cnpjData.porte}`);
    if (userData.cnpjData.atividadePrincipal) info.push(`  - Atividade Principal: ${userData.cnpjData.atividadePrincipal}`);
    if (userData.cnpjData.situacao) info.push(`  - Situação: ${userData.cnpjData.situacao}`);
    if (userData.cnpjData.elegibilidade) {
      const e = userData.cnpjData.elegibilidade;
      info.push(`  - Elegível para editais: ${e.podeParticiparEditais ? 'Sim' : 'Não'}`);
    }
  }

  if (userData.cpfData) {
    info.push(`Dados CPF:`);
    if (userData.cpfData.nome) info.push(`  - Nome: ${userData.cpfData.nome}`);
    if (userData.cpfData.idade) info.push(`  - Idade: ${userData.cpfData.idade}`);
    if (userData.cpfData.elegibilidade) {
      info.push(`  - Elegível para editais: ${userData.cpfData.elegibilidade.podeParticiparEditais ? 'Sim' : 'Não'}`);
    }
  }

  if (userData.userType) {
    info.push(`Tipo de Usuário: ${userData.userType}`);
  }

  return info.join('\n');
}

/** Monta o prompt usado para scores (Gemini ou n8n). */
function buildScoresPrompt(editalInfo: string, userData: string): string {
  return `Você é um especialista em análise de elegibilidade para editais de fomento à pesquisa e inovação.

Analise o seguinte edital e o perfil do usuário e retorne UM ÚNICO objeto JSON com exatamente três campos:

1. "match" (número 0-100): quanto o perfil do usuário se alinha com os requisitos e características do edital.
2. "probabilidade" (número 0-100): probabilidade de o usuário ser aprovado neste edital (requisitos, competitividade, prazo).
3. "justificativa" (string, OBRIGATÓRIA): explicação detalhada em português com Pontos Fortes, Pontos Fracos/Informações Ausentes e Conclusão. Nunca retorne sem justificativa.

Critérios:
- Match: alinhamento de área de atuação, experiência, tipo de perfil (pesquisador/empresa), localização, critérios de elegibilidade.
- Probabilidade: competitividade do edital, qualificação do usuário, histórico, prazo disponível.
- Justificativa: sempre preenchida, clara, em português, com seções como Pontos Fortes, Pontos Fracos e Conclusão.

EDITAL:
${editalInfo}

PERFIL DO USUÁRIO:
${userData}

EXEMPLO DE RESPOSTA PADRONIZADA (siga exatamente esta estrutura):

{
  "match": 35,
  "probabilidade": 15,
  "justificativa": "O perfil do usuário se alinha apenas parcialmente com os requisitos do edital. **Pontos Fortes:** O usuário é pesquisador, compatível com o edital. **Pontos Fracos e Informações Ausentes:** Não há informações sobre área de atuação, qualificação (ex.: doutorado), currículo Lattes ou vínculo institucional. **Conclusão:** Match e probabilidade são baixos pela falta de dados e pela competitividade do edital."
}

INSTRUÇÕES FINAIS:
- Retorne APENAS um objeto JSON com os três campos: "match", "probabilidade" e "justificativa".
- Pode enviar o JSON dentro de um bloco markdown \`\`\`json ... \`\`\` ou direto.
- O campo "justificativa" é OBRIGATÓRIO: sempre inclua um texto detalhado em português (pontos fortes, fracos e conclusão). Nunca retorne justificativa vazia ou null.`;
}

/** Extrai um objeto JSON de um texto (aceita bloco ```json ... ``` ou JSON solto). */
function parseJsonFromText(text: string): { match?: number; probabilidade?: number; justificativa?: string } | null {
  if (!text || typeof text !== 'string') return null;
  let trimmed = text.trim();
  // Resposta pode vir com \n literal (backslash+n) em vez de quebra de linha
  trimmed = trimmed.replace(/\\n/g, '\n');
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : trimmed;
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  try {
    return JSON.parse(objectMatch[0]) as { match?: number; probabilidade?: number; justificativa?: string };
  } catch {
    return null;
  }
}

/** Coleta todas as strings que podem conter o JSON de scores a partir da resposta do webhook (n8n). */
function getRawScoreCandidates(body: unknown): string[] {
  const candidates: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) candidates.push(v);
  };
  if (typeof body === 'string') {
    push(body);
    return candidates;
  }
  const obj = body && typeof body === 'object' ? body as Record<string, unknown> : null;
  if (!obj) return candidates;
  push(obj.result);
  push(obj.answer);
  push(obj.output);
  push(obj.text);
  push(obj.data);
  push(obj.message);
  push(obj.response);
  push(obj.body);
  if (Array.isArray(obj.output)) {
    for (const item of obj.output) {
      if (item && typeof item === 'object' && 'json' in item) {
        const j = (item as { json?: unknown }).json;
        if (j && typeof j === 'object') {
          const jj = j as Record<string, unknown>;
          push(jj.output);
          push(jj.text);
          push(jj.result);
          push(jj.data);
        }
      }
      push((item as Record<string, unknown>)?.output);
      push((item as Record<string, unknown>)?.text);
    }
  }
  if (Array.isArray(body)) {
    const first = body[0];
    if (first && typeof first === 'object') {
      const f = first as Record<string, unknown>;
      push(f.output);
      push(f.text);
      push(f.result);
      if (f.json && typeof f.json === 'object') {
        const j = (f.json as Record<string, unknown>);
        push(j.output);
        push(j.text);
      }
    }
  }
  return candidates;
}

/** Busca file_ids dos PDFs do edital (para enviar ao webhook n8n). */
async function getEditalFileIds(editalId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('edital_pdfs')
    .select('file_id, id')
    .eq('edital_id', editalId)
    .not('file_id', 'is', null);
  return (data?.map((p: { file_id: string | null; id: string }) => p.file_id || p.id).filter(Boolean) as string[]) || [];
}

/**
 * Calcula scores usando Gemini
 */
async function calculateScoresWithGemini(editalInfo: string, userData: string): Promise<{ match: number; probabilidade: number; justificativa: string }> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = buildScoresPrompt(editalInfo, userData);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // Tentar extrair JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Resposta não contém JSON válido');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validar e normalizar valores
    const match = Math.max(0, Math.min(100, Math.round(parsed.match || 0)));
    const probabilidade = Math.max(0, Math.min(100, Math.round(parsed.probabilidade || 0)));
    const justificativa = parsed.justificativa || 'Justificativa não disponível';
    
    return { match, probabilidade, justificativa };
  } catch (error) {
    console.error('Erro ao calcular scores com Gemini:', error);
    throw error;
  }
}

/**
 * Endpoint POST /api/calculate-edital-scores
 */
router.post('/calculate-edital-scores', async (req, res) => {
  try {
    const { edital_id, user_id, user_data, force } = req.body;

    if (!edital_id) {
      return res.status(400).json({ error: 'Campo "edital_id" é obrigatório' });
    }

    if (!user_id) {
      return res.status(400).json({ error: 'Campo "user_id" é obrigatório' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    const forceRecalc = force === true || force === 'true' || force === 1;

    // Se não for recálculo forçado, retornar score existente quando houver
    if (!forceRecalc) {
      const { data: existingScore } = await supabase
        .from('edital_scores')
        .select('*')
        .eq('edital_id', edital_id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (existingScore) {
        console.log(`✅ Score já existe para edital ${edital_id} e usuário ${user_id}`);
        return res.json({
          match: existingScore.match_percent,
          probabilidade: existingScore.probabilidade_percent,
          justificativa: existingScore.justificativa || null,
          from_cache: true,
        });
      }
    } else {
      console.log(`🔄 Recálculo forçado para edital ${edital_id} e usuário ${user_id}`);
    }

    // Buscar dados do edital
    const { data: edital, error: editalError } = await supabase
      .from('editais')
      .select('*')
      .eq('id', edital_id)
      .single();

    if (editalError || !edital) {
      return res.status(404).json({ error: 'Edital não encontrado' });
    }

    const editalInfo = formatEditalInfo(edital);
    const userData = formatUserData(user_data || {});

    const n8nWebhookFull = process.env.N8N_WEBHOOK_URL || 'https://n8n.srv652789.hstgr.cloud/webhook/789b0959-b90f-40e8-afe8-03aa8e486b43';
    const n8nWebhookLight = process.env.N8N_WEBHOOK_LIGHT_URL || n8nWebhookFull;

    let scores: { match: number; probabilidade: number; justificativa: string };

    if (n8nWebhookFull) {
      try {
        const message = buildScoresPrompt(editalInfo, userData);
        const file_ids = await getEditalFileIds(edital_id);
        const useLight = file_ids.length === 0 && n8nWebhookLight !== n8nWebhookFull;
        const n8nWebhookUrl = useLight ? n8nWebhookLight : n8nWebhookFull;
        console.log(`🔄 Calculando scores via n8n (${useLight ? 'light' : 'full'}) para edital ${edital_id} e usuário ${user_id}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), useLight ? 12000 : 18000);
        const webhookRes = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, file_ids }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!webhookRes.ok) {
          throw new Error(`n8n webhook respondeu ${webhookRes.status}: ${await webhookRes.text()}`);
        }
        const body = await webhookRes.json();
        let match: number = 50;
        let probabilidade: number = 40;
        let justificativa: string = 'Justificativa não disponível';
        // 1) Tentar root do body (resposta direta { match, probabilidade, justificativa })
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const b = body as Record<string, unknown>;
          if (typeof b.match === 'number') match = b.match;
          else if (typeof b.match === 'string') match = Number(b.match) || 50;
          if (typeof b.probabilidade === 'number') probabilidade = b.probabilidade;
          else if (typeof b.probabilidade === 'string') probabilidade = Number(b.probabilidade) || 40;
          if (typeof b.justificativa === 'string' && b.justificativa.trim()) justificativa = b.justificativa;
        }
        // 2) Tentar extrair de strings (```json ... ``` ou JSON solto) em vários campos
        const rawCandidates = getRawScoreCandidates(body);
        for (const raw of rawCandidates) {
          const parsed = parseJsonFromText(raw);
          if (parsed && (parsed.match != null || parsed.probabilidade != null || parsed.justificativa != null)) {
            if (parsed.match != null && !Number.isNaN(Number(parsed.match))) match = Number(parsed.match);
            if (parsed.probabilidade != null && !Number.isNaN(Number(parsed.probabilidade))) probabilidade = Number(parsed.probabilidade);
            if (parsed.justificativa != null && String(parsed.justificativa).trim()) justificativa = String(parsed.justificativa).trim();
            console.log(`✅ Scores extraídos do webhook: match=${match}, probabilidade=${probabilidade}, justificativa length=${justificativa.length}`);
            break;
          }
        }
        scores = {
          match: Math.max(0, Math.min(100, Math.round(match))),
          probabilidade: Math.max(0, Math.min(100, Math.round(probabilidade))),
          justificativa,
        };
      } catch (webhookError) {
        const err = webhookError as Error & { code?: string };
        const msg = err.code === 'UND_ERR_CONNECT_TIMEOUT' || err.name === 'AbortError'
          ? 'Timeout ao conectar no n8n; usando scores padrão.'
          : 'Webhook n8n indisponível; usando scores padrão.';
        console.warn(`⚠️ ${msg}`);
        scores = { match: 50, probabilidade: 40, justificativa: 'Justificativa indisponível (serviço de scores temporariamente indisponível).' };
      }
    } else {
      console.log(`🔄 Calculando scores para edital ${edital_id} e usuário ${user_id}...`);
      scores = await calculateScoresWithGemini(editalInfo, userData);
    }

    // Salvar no banco
    const dadosUtilizados = {
      lattesId: !!user_data?.lattesData,
      cnpj: !!user_data?.cnpjData,
      cpf: !!user_data?.cpfData,
      userType: user_data?.userType || null,
    };

    // Tentar inserir o score
    // Se já existir (race condition), buscar o existente ao invés de atualizar
    const { error: insertError } = await supabase
      .from('edital_scores')
      .insert({
        edital_id,
        user_id,
        match_percent: scores.match,
        probabilidade_percent: scores.probabilidade,
        justificativa: scores.justificativa,
        dados_usuario_utilizados: dadosUtilizados,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        // Score já existe: atualizar com os valores recém calculados para não perder a justificativa
        const { error: updateError } = await supabase
          .from('edital_scores')
          .update({
            match_percent: scores.match,
            probabilidade_percent: scores.probabilidade,
            justificativa: scores.justificativa,
            dados_usuario_utilizados: dadosUtilizados,
          })
          .eq('edital_id', edital_id)
          .eq('user_id', user_id);
        if (updateError) {
          console.warn('Erro ao atualizar score existente:', updateError);
        } else {
          console.log(`✅ Score existente atualizado: match=${scores.match}%, probabilidade=${scores.probabilidade}%`);
        }
      } else {
        console.error('Erro ao salvar score:', insertError);
      }
    }

    console.log(`✅ Scores calculados: match=${scores.match}%, probabilidade=${scores.probabilidade}%`);

    res.json({
      match: scores.match,
      probabilidade: scores.probabilidade,
      justificativa: scores.justificativa,
      from_cache: false,
    });
  } catch (error) {
    console.error('❌ Erro no endpoint calculate-edital-scores:', error);
    // Retornar 200 com scores padrão para o dashboard não quebrar; o cliente já trata fallback
    res.status(200).json({
      match: 50,
      probabilidade: 40,
      justificativa: null,
      from_cache: false,
      _fallback: true,
    });
  }
});

export default router;

