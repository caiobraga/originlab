import { useQuery } from "@tanstack/react-query";
import { User } from "@supabase/supabase-js";
import {
  fetchEditaisFromSupabase,
  fetchEditaisWithScores,
  EditalWithScores,
  DatabaseEdital,
} from "@/lib/editaisApi";
import { UserProfile } from "@/lib/userProfile";

/** Quantidade de editais na primeira carga (acelera muito o carregamento) */
const LIST_LIMIT = 120;

/**
 * Lista de editais em cache (sem scores) - carregamento rápido
 * Limita a LIST_LIMIT para não travar em bases grandes
 */
export function useEditaisList(userId: string | undefined) {
  return useQuery({
    queryKey: ["editais-list", userId],
    queryFn: () => fetchEditaisFromSupabase({ limit: LIST_LIMIT, offset: 0 }),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,  // 5 min
    cacheTime: 10 * 60 * 1000, // 10 min
  });
}

/**
 * Scores para uma lista específica de editais (ex: página visível)
 * forceRecalculate: quando true, ignora cache e recalcula na API (botão "Recalcular scores")
 */
export function useEditaisScores(
  editaisToScore: DatabaseEdital[],
  userId: string | undefined,
  user: User | null,
  profile: UserProfile | null,
  forceRecalculate?: boolean
) {
  return useQuery({
    queryKey: ["editais-scores", userId, editaisToScore.map((e) => e.id).sort().join(","), forceRecalculate ?? false],
    queryFn: () =>
      fetchEditaisWithScores(userId, user ?? undefined, profile ?? undefined, editaisToScore, { forceRecalculate: forceRecalculate ?? false }),
    enabled:
      !!userId &&
      !!user &&
      editaisToScore.length > 0 &&
      editaisToScore.every((e) => e.id),
    staleTime: 5 * 60 * 1000,
    cacheTime: 10 * 60 * 1000,
    // Enquanto houver itens sem justificativa, refazer em background para tentar preencher
    refetchInterval: (data) => {
      const list = data as EditalWithScores[] | undefined;
      if (!list || list.length === 0) return false;
      const hasIncomplete = list.some((e) => e.justificativa == null || String(e.justificativa).trim() === "");
      return hasIncomplete ? 15_000 : false;
    },
    refetchIntervalInBackground: true,
  });
}
