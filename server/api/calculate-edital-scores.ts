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
 * Formata dados do usuário para o prompt
 */
function formatUserData(userData: any): string {
  const info: string[] = [];
  
  if (userData.lattesData) {
    info.push(`Dados Lattes:`);
    if (userData.lattesData.nome) info.push(`  - Nome: ${userData.lattesData.nome}`);
    if (userData.lattesData.areasAtuacao) info.push(`  - Áreas de Atuação: ${userData.lattesData.areasAtuacao.join(', ')}`);
    if (userData.lattesData.formacao) info.push(`  - Formação: ${userData.lattesData.formacao.join(', ')}`);
    if (userData.lattesData.experienciaProfissional) info.push(`  - Experiência Profissional: ${userData.lattesData.experienciaProfissional.join('; ')}`);
  }
  
  if (userData.cnpjData) {
    info.push(`Dados CNPJ:`);
    if (userData.cnpjData.razaoSocial) info.push(`  - Razão Social: ${userData.cnpjData.razaoSocial}`);
    if (userData.cnpjData.porte) info.push(`  - Porte: ${userData.cnpjData.porte}`);
    if (userData.cnpjData.atividadePrincipal) info.push(`  - Atividade Principal: ${userData.cnpjData.atividadePrincipal}`);
    if (userData.cnpjData.situacao) info.push(`  - Situação: ${userData.cnpjData.situacao}`);
  }
  
  if (userData.cpfData) {
    info.push(`Dados CPF:`);
    if (userData.cpfData.nome) info.push(`  - Nome: ${userData.cpfData.nome}`);
    if (userData.cpfData.idade) info.push(`  - Idade: ${userData.cpfData.idade}`);
  }
  
  if (userData.userType) {
    info.push(`Tipo de Usuário: ${userData.userType}`);
  }
  
  return info.join('\n');
}

/**
 * Calcula scores usando Gemini
 */
async function calculateScoresWithGemini(editalInfo: string, userData: string): Promise<{ match: number; probabilidade: number; justificativa: string }> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
  const model = genAI.getGenerativeModel({ model: modelName });
  
  const prompt = `Você é um especialista em análise de elegibilidade para editais de fomento à pesquisa e inovação.

Analise o seguinte edital e o perfil do usuário para calcular:
1. MATCH PERCENT: O quanto o perfil do usuário se alinha com os requisitos e características do edital (0-100%)
2. PROBABILIDADE DE APROVAÇÃO: A probabilidade de o usuário ser aprovado neste edital baseado em histórico, requisitos e competitividade (0-100%)
3. JUSTIFICATIVA: Uma explicação detalhada do match, listando pontos fortes e fracos do perfil do usuário em relação ao edital

IMPORTANTE:
- Match deve considerar: alinhamento de área de atuação, experiência, tipo de perfil (pesquisador/empresa), localização, critérios de elegibilidade
- Probabilidade deve considerar: competitividade do edital, histórico de aprovações similares, qualificação do usuário em relação aos requisitos, prazo disponível
- Justificativa deve ser clara, objetiva e em português, destacando os principais fatores que influenciam o match

EDITAL:
${editalInfo}

PERFIL DO USUÁRIO:
${userData}

Retorne APENAS um JSON válido no formato:
{
  "match": número entre 0 e 100,
  "probabilidade": número entre 0 e 100,
  "justificativa": "texto detalhado explicando o match, pontos fortes e fracos"
}

Não inclua texto adicional, apenas o JSON.`;

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
    const { edital_id, user_id, user_data } = req.body;

    if (!edital_id) {
      return res.status(400).json({ error: 'Campo "edital_id" é obrigatório' });
    }

    if (!user_id) {
      return res.status(400).json({ error: 'Campo "user_id" é obrigatório' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }

    // Verificar se já existe score para este usuário e edital
    const { data: existingScore } = await supabase
      .from('edital_scores')
      .select('*')
      .eq('edital_id', edital_id)
      .eq('user_id', user_id)
      .single();

    if (existingScore) {
      console.log(`✅ Score já existe para edital ${edital_id} e usuário ${user_id}`);
      return res.json({
        match: existingScore.match_percent,
        probabilidade: existingScore.probabilidade_percent,
        justificativa: existingScore.justificativa || null,
        from_cache: true,
      });
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

    // Formatar informações
    const editalInfo = formatEditalInfo(edital);
    const userData = formatUserData(user_data || {});

    // Calcular scores
    console.log(`🔄 Calculando scores para edital ${edital_id} e usuário ${user_id}...`);
    const scores = await calculateScoresWithGemini(editalInfo, userData);

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
      // Se for erro de duplicate key (race condition), buscar o score existente
      if (insertError.code === '23505') {
        console.log(`⚠️ Score já existe (race condition detectada), buscando score existente...`);
        const { data: existingScore, error: fetchError } = await supabase
          .from('edital_scores')
          .select('*')
          .eq('edital_id', edital_id)
          .eq('user_id', user_id)
          .single();
        
        if (fetchError) {
          console.error('Erro ao buscar score existente após race condition:', fetchError);
        } else if (existingScore) {
          console.log(`✅ Score encontrado após race condition: match=${existingScore.match_percent}%, probabilidade=${existingScore.probabilidade_percent}%`);
          return res.json({
            match: existingScore.match_percent,
            probabilidade: existingScore.probabilidade_percent,
            justificativa: existingScore.justificativa || null,
            from_cache: true,
          });
        }
      } else {
        console.error('Erro ao salvar score:', insertError);
        // Mesmo com erro ao salvar, retornar os scores calculados
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
    console.error('❌ Erro no endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

