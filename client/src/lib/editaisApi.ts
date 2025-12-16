import { supabase } from "./supabase";
import { useUserProfile } from "@/hooks/useUserProfile";

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
}

export interface EditalWithScores extends DatabaseEdital {
  match: number; // % de match com o perfil do usuário
  probabilidade: number; // Probabilidade de aprovação (%)
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

/**
 * API Mockada para calcular probabilidade de aprovação e % de match
 * TODO: Substituir por chamada real à API quando disponível
 */
export async function calculateEditalScores(
  edital: DatabaseEdital,
  userId?: string
): Promise<{ match: number; probabilidade: number }> {
  // Simular delay de API
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Por enquanto, retorna valores mockados baseados em características do edital
  // Em produção, isso viria de uma API real que analisa:
  // - Perfil do usuário (CPF, CNPJ, Lattes)
  // - Histórico de aprovações
  // - Requisitos do edital
  // - Similaridade com editais anteriores aprovados

  // Calcular match baseado em características básicas
  let match = 50; // Base
  let probabilidade = 40; // Base

  // Ajustar match baseado em área (se disponível)
  if (edital.area) {
    match += 10;
  }

  // Ajustar match baseado em descrição (quanto mais completa, melhor)
  if (edital.descricao && edital.descricao.length > 100) {
    match += 5;
  }

  // Ajustar probabilidade baseado em status
  if (edital.status?.toLowerCase().includes("ativo")) {
    probabilidade += 15;
  }

  // Ajustar probabilidade baseado em prazo (mais tempo = maior probabilidade)
  if (edital.data_encerramento) {
    const hoje = new Date();
    const encerramento = new Date(edital.data_encerramento);
    const diasRestantes = Math.ceil(
      (encerramento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diasRestantes > 30) {
      probabilidade += 10;
    } else if (diasRestantes > 15) {
      probabilidade += 5;
    }
  }

  // Adicionar variação aleatória para simular análise real
  const randomVariation = () => Math.random() * 20 - 10; // -10 a +10
  match = Math.min(100, Math.max(0, match + randomVariation()));
  probabilidade = Math.min(100, Math.max(0, probabilidade + randomVariation()));

  // Arredondar para inteiros
  match = Math.round(match);
  probabilidade = Math.round(probabilidade);

  return { match, probabilidade };
}

/**
 * Busca editais do Supabase e adiciona scores (match e probabilidade)
 */
export async function fetchEditaisWithScores(
  userId?: string
): Promise<EditalWithScores[]> {
  const editais = await fetchEditaisFromSupabase();

  // Calcular scores para cada edital
  const editaisComScores = await Promise.all(
    editais.map(async (edital) => {
      const scores = await calculateEditalScores(edital, userId);
      return {
        ...edital,
        ...scores,
      };
    })
  );

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






