import { supabase } from "./supabase";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getUserProfile, UserProfile } from "./userProfile";
import { fetchLattesData, LattesData } from "./externalAPIs";
import { fetchCNPJData, CNPJData } from "./externalAPIs";
import { fetchCPFData, CPFData } from "./externalAPIs";
import { User } from "@supabase/supabase-js";

export interface DatabaseEdital {
  id: string;
  numero: string | null;
  titulo: string;
  descricao: string | null;
  data_publicacao: string | null;
  data_encerramento: string | null;
  status: string | null;
  valor: string | null;
  area: string | null;
  orgao: string | null;
  fonte: string;
  link: string | null;
  processado_em: string | null;
  criado_em: string;
  atualizado_em: string | null;
  valor_projeto?: string | null;
  prazo_inscricao?: string | null; // Pode ser string ou JSON string com array
  localizacao?: string | null;
  vagas?: string | null;
  is_researcher?: boolean | null;
  is_company?: boolean | null;
  sobre_programa?: string | null;
  criterios_elegibilidade?: string | null;
  timeline_estimada?: any | null;
}

export interface EditalWithScores extends DatabaseEdital {
  match: number; // % de match com o perfil do usuário
  probabilidade: number; // Probabilidade de aprovação (%)
  justificativa?: string | null; // Justificativa detalhada do match
}

/**
 * Busca todos os editais do Supabase
 */
export async function fetchEditaisFromSupabase(): Promise<DatabaseEdital[]> {
  try {
    const { data, error } = await supabase
      .from("editais")
      .select("*")
      .order("criado_em", { ascending: false });

    if (error) {
      console.error("Erro ao buscar editais:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Erro ao buscar editais do Supabase:", error);
    return [];
  }
}

/** Mapeamento área onboarding -> termos para filtrar editais */
const AREA_FILTER_MAP: Record<string, string[]> = {
  tech: ["tecnologia", "tecnológico", "inovação", "software", "digital", "ti"],
  health: ["saúde", "health", "medicina", "biotecnologia", "farmácia"],
  agro: ["agro", "agronegócio", "agricultura", "rural", "agrícola"],
  energy: ["energia", "energético", "sustentável", "renovável"],
  bio: ["bio", "biotecnologia", "biologia", "genética"],
  other: [],
};

/**
 * Busca estatísticas de editais para onboarding (não requer autenticação)
 */
export async function fetchEditaisStatsForOnboarding(area?: string): Promise<{
  total: number;
  naArea: number;
  valorTotal: number;
  prazoMedioDias: number;
}> {
  try {
    const editais = await fetchEditaisFromSupabase();
    const hoje = new Date();

    const termos = area ? AREA_FILTER_MAP[area] || [] : [];
    const naArea = termos.length === 0
      ? editais
      : editais.filter((e) => {
          const areaText = (e.area || e.descricao || "").toLowerCase();
          return termos.some((t) => areaText.includes(t));
        });

    let valorTotal = 0;
    for (const e of naArea) {
      const val = e.valor_projeto || e.valor;
      if (val && typeof val === "string") {
        const match = val.match(/[\d.,]+/);
        if (match) {
          const num = parseFloat(match[0].replace(/\./g, "").replace(",", "."));
          if (!isNaN(num)) valorTotal += num;
        }
      }
    }

    const prazos = naArea
      .map((e) => e.data_encerramento ? Math.ceil((new Date(e.data_encerramento).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : 0)
      .filter((d) => d > 0);
    const prazoMedioDias = prazos.length > 0 ? Math.round(prazos.reduce((a, b) => a + b, 0) / prazos.length) : 30;

    return {
      total: editais.length,
      naArea: naArea.length,
      valorTotal,
      prazoMedioDias,
    };
  } catch (error) {
    console.error("Erro ao buscar stats de editais:", error);
    return { total: 0, naArea: 0, valorTotal: 0, prazoMedioDias: 30 };
  }
}

/**
 * Busca score existente no banco de dados
 */
async function fetchEditalScore(
  editalId: string,
  userId: string
): Promise<{ match: number; probabilidade: number; justificativa: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from("edital_scores")
      .select("match_percent, probabilidade_percent, justificativa")
      .eq("edital_id", editalId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      match: data.match_percent,
      probabilidade: data.probabilidade_percent,
      justificativa: data.justificativa || null,
    };
  } catch (error) {
    console.error("Erro ao buscar score:", error);
    return null;
  }
}

/**
 * Busca dados do usuário para envio à API
 */
async function fetchUserDataForScoring(
  user: User | null,
  profile: UserProfile | null
): Promise<{
  lattesData?: LattesData;
  cnpjData?: CNPJData;
  cpfData?: CPFData;
  userType?: string;
}> {
  const userData: any = {};

  if (!user || !profile) {
    return userData;
  }

  userData.userType = profile.userType;

  // Buscar dados do Lattes se disponível
  if (profile.lattesId) {
    try {
      const lattesData = await fetchLattesData(profile.lattesId);
      if (lattesData) {
        userData.lattesData = lattesData;
      }
    } catch (error) {
      console.warn("Erro ao buscar dados do Lattes:", error);
    }
  }

  // Buscar dados do CNPJ se disponível
  if (profile.cnpj) {
    try {
      const cnpjData = await fetchCNPJData(profile.cnpj);
      if (cnpjData) {
        userData.cnpjData = cnpjData;
      }
    } catch (error) {
      console.warn("Erro ao buscar dados do CNPJ:", error);
    }
  }

  // Buscar dados do CPF se disponível
  if (profile.cpf) {
    try {
      const cpfData = await fetchCPFData(profile.cpf);
      if (cpfData) {
        userData.cpfData = cpfData;
      }
    } catch (error) {
      console.warn("Erro ao buscar dados do CPF:", error);
    }
  }

  return userData;
}

/**
 * Calcula probabilidade de aprovação e % de match usando API
 * Usa cache para evitar requisições duplicadas simultâneas
 */
export async function calculateEditalScores(
  edital: DatabaseEdital,
  userId?: string,
  user?: User | null,
  profile?: UserProfile | null
): Promise<{ match: number; probabilidade: number; justificativa?: string | null }> {
  // Se não tiver userId, usar cálculo mockado como fallback
  if (!userId || !user) {
    console.warn("UserId não fornecido, usando cálculo mockado");
    // Retornar valores mockados básicos
    return {
      match: 50,
      probabilidade: 40,
      justificativa: null,
    };
  }

  // Criar chave única para cache (edital_id + user_id)
  const cacheKey = `${edital.id}-${userId}`;

  // Verificar se já existe uma requisição em andamento para este edital+usuário
  if (scoreCalculationCache.has(cacheKey)) {
    console.log(`⏳ Aguardando cálculo de score já em andamento para edital ${edital.id}...`);
    return await scoreCalculationCache.get(cacheKey)!;
  }

  // Criar promise para o cálculo
  const calculationPromise = (async () => {
    try {
      // Verificar se já existe score no banco
      const existingScore = await fetchEditalScore(edital.id, userId);
      if (existingScore) {
        console.log(`✅ Score já existe para edital ${edital.id} e usuário ${userId}`);
        return existingScore;
      }

      // Buscar dados do usuário
      const userProfile = profile || await getUserProfile(user);
      const userData = await fetchUserDataForScoring(user, userProfile);

      // Fazer requisição para API
      const response = await fetch("/api/calculate-edital-scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          edital_id: edital.id,
          user_id: userId,
          user_data: userData,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        match: result.match || 50,
        probabilidade: result.probabilidade || 40,
        justificativa: result.justificativa || null,
      };
    } catch (error) {
      console.error("Erro ao calcular scores:", error);
      // Fallback para valores padrão em caso de erro
      return {
        match: 50,
        probabilidade: 40,
        justificativa: null,
      };
    } finally {
      // Remover do cache após completar (sucesso ou erro)
      scoreCalculationCache.delete(cacheKey);
    }
  })();

  // Adicionar ao cache antes de executar
  scoreCalculationCache.set(cacheKey, calculationPromise);

  return await calculationPromise;
}

// Cache para evitar requisições duplicadas simultâneas
const scoreCalculationCache = new Map<string, Promise<{ match: number; probabilidade: number; justificativa?: string | null }>>();

/**
 * Busca editais do Supabase e adiciona scores (match e probabilidade)
 */
export async function fetchEditaisWithScores(
  userId?: string,
  user?: User | null,
  profile?: UserProfile | null
): Promise<EditalWithScores[]> {
  const editais = await fetchEditaisFromSupabase();

  // Processar editais em batches para evitar rate limits
  // Calcular scores em batches de 5 para não sobrecarregar a API
  const batchSize = 5;
  const editaisComScores: EditalWithScores[] = [];

  for (let i = 0; i < editais.length; i += batchSize) {
    const batch = editais.slice(i, i + batchSize);
    
    // Processar batch com Promise.all, mas limitado ao tamanho do batch
    const batchResults = await Promise.all(
      batch.map(async (edital) => {
        const scores = await calculateEditalScores(edital, userId, user, profile);
        return {
          ...edital,
          ...scores,
        };
      })
    );
    
    editaisComScores.push(...batchResults);
    
    // Pequeno delay entre batches para evitar rate limits
    if (i + batchSize < editais.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return editaisComScores;
}

/**
 * Formata data para exibição (ex: "30 dias")
 */
export function formatPrazo(dataEncerramento: string | null): string {
  if (!dataEncerramento) return "Prazo não informado";

  const hoje = new Date();
  const encerramento = new Date(dataEncerramento);
  const diasRestantes = Math.ceil(
    (encerramento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diasRestantes < 0) {
    return "Prazo encerrado";
  } else if (diasRestantes === 0) {
    return "Último dia";
  } else if (diasRestantes === 1) {
    return "1 dia";
  } else {
    return `${diasRestantes} dias`;
  }
}

/**
 * Determina o país baseado no órgão ou fonte
 */
export function getPaisFromEdital(edital: DatabaseEdital): {
  pais: string;
  flag: string;
} {
  const orgao = edital.orgao?.toLowerCase() || "";
  const fonte = edital.fonte?.toLowerCase() || "";

  // Mapear órgãos conhecidos para países
  if (orgao.includes("fapesp") || orgao.includes("fapes") || fonte.includes("sigfapes")) {
    return { pais: "Brasil", flag: "🇧🇷" };
  }
  if (orgao.includes("finep") || orgao.includes("cnpq")) {
    return { pais: "Brasil", flag: "🇧🇷" };
  }
  if (orgao.includes("european") || orgao.includes("horizon")) {
    return { pais: "União Europeia", flag: "🇪🇺" };
  }
  if (orgao.includes("uk") || orgao.includes("british")) {
    return { pais: "Reino Unido", flag: "🇬🇧" };
  }
  if (orgao.includes("corfo") || orgao.includes("chile")) {
    return { pais: "Chile", flag: "🇨🇱" };
  }
  if (orgao.includes("minciencias") || orgao.includes("colombia")) {
    return { pais: "Colômbia", flag: "🇨🇴" };
  }

  // Default para Brasil se não identificar
  return { pais: "Brasil", flag: "🇧🇷" };
}

/**
 * Determina o status do edital
 */
export function getStatusFromEdital(
  edital: DatabaseEdital
): "novo" | "em_analise" | "submetido" {
  const statusLower = edital.status?.toLowerCase() || "";

  if (statusLower.includes("encerrado") || statusLower.includes("finalizado")) {
    return "submetido";
  }
  if (statusLower.includes("ativo") || statusLower.includes("aberto")) {
    return "novo";
  }

  // Verificar por data de encerramento
  if (edital.data_encerramento) {
    const hoje = new Date();
    const encerramento = new Date(edital.data_encerramento);
    if (encerramento < hoje) {
      return "submetido";
    }
  }

  return "novo";
}






