import { useQuery } from "@tanstack/react-query";
import {
  fetchEditaisFromSupabase,
} from "@/lib/editaisApi";

/** Quantidade de editais na primeira carga (acelera muito o carregamento) */
const LIST_LIMIT = 250;

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
