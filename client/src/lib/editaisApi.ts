import { supabase } from "./supabase";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getUserProfile, UserProfile } from "./userProfile";
import { LattesData } from "./externalAPIs";
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

export interface EditalIndicacao {
  edital: DatabaseEdital;
  score: number; // 0-100 (heurística no banco)
  motivos: string[];
  gerado_em: string;
}

/**
 * Busca editais do Supabase com paginação opcional
 */
export async function fetchEditaisFromSupabase(options?: {
  limit?: number;
  offset?: number;
}): Promise<DatabaseEdital[]> {
  try {
    let query = supabase
      .from("editais_corretos")
      .select("*")
      // Recém validados primeiro (evita “sumir” do painel quando criado_em do edital antigo fica fora do top N)
      .order("validado_em", { ascending: false, nullsFirst: false })
      .order("criado_em", { ascending: false });

    if (options?.limit != null) {
      const offset = options.offset ?? 0;
      query = query.range(offset, offset + options.limit - 1);
    }

    const { data, error } = await query;

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
 * Retorna o total de editais (para paginação)
 */
export async function fetchEditaisCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("editais_corretos")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("Erro ao contar editais:", error);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.error("Erro ao contar editais:", error);
    return 0;
  }
}

/** Mapeamento área onboarding -> termos para filtrar editais */
export const AREA_FILTER_MAP: Record<string, string[]> = {
  tech: ["tecnologia", "tecnológico", "inovação", "software", "digital", "ti"],
  health: ["saúde", "health", "medicina", "biotecnologia", "farmácia"],
  agro: ["agro", "agronegócio", "agricultura", "rural", "agrícola"],
  energy: ["energia", "energético", "sustentável", "renovável"],
  bio: ["bio", "biotecnologia", "biologia", "genética"],
  other: [],
};

/** Opções de área para filtro no Dashboard */
export const AREA_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "todos", label: "Todas as áreas" },
  { value: "tech", label: "Tecnologia" },
  { value: "health", label: "Saúde" },
  { value: "agro", label: "Agronegócio" },
  { value: "energy", label: "Energia" },
  { value: "bio", label: "Biotecnologia" },
  { value: "other", label: "Outra" },
];

/** Verifica se o edital corresponde ao filtro de área */
export function editalMatchesArea(edital: { area?: string | null; descricao?: string | null }, areaFilter: string): boolean {
  if (areaFilter === "todos" || !areaFilter) return true;
  const termos = AREA_FILTER_MAP[areaFilter];
  if (!termos || termos.length === 0) return true; // "other" ou desconhecido = mostra todos
  const areaText = (edital.area || edital.descricao || "").toLowerCase();
  return termos.some((t) => areaText.includes(t));
}

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

export async function refreshMyIndicacoes(limit = 20): Promise<number> {
  const { data, error } = await supabase.rpc("refresh_my_indicacoes", { p_limit: limit });
  if (error) {
    console.warn("Erro ao atualizar indicações (rpc):", error);
    return 0;
  }
  const n = typeof data === "number" ? data : Number(data);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchMyIndicacoes(options?: { limit?: number }): Promise<EditalIndicacao[]> {
  try {
    const limit = options?.limit ?? 20;
    const { data, error } = await supabase
      .from("edital_indicacoes")
      .select("score, motivos, gerado_em, edital:editais(*)")
      .order("score", { ascending: false })
      .order("gerado_em", { ascending: false })
      .limit(limit);

    if (error || !data) {
      if (error) console.warn("Erro ao buscar indicações:", error);
      return [];
    }

    return (data as any[]).map((row) => ({
      edital: row.edital as DatabaseEdital,
      score: Number(row.score) || 0,
      motivos: Array.isArray(row.motivos) ? row.motivos.filter(Boolean).map(String) : [],
      gerado_em: String(row.gerado_em),
    }));
  } catch (err) {
    console.warn("Erro ao buscar indicações:", err);
    return [];
  }
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






