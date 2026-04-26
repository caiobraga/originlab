import { useQuery } from "@tanstack/react-query";
import { refreshMyIndicacoes, fetchMyIndicacoes } from "@/lib/indicacoesApi";

export function useEditaisIndicacoes(userId: string | undefined, opts?: { limit?: number; autoRefresh?: boolean }) {
  const limit = opts?.limit ?? 20;
  const autoRefresh = opts?.autoRefresh ?? true;

  return useQuery({
    queryKey: ["editais-indicacoes", userId, limit, autoRefresh],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      if (autoRefresh) {
        try {
          await refreshMyIndicacoes(limit);
        } catch {
          // Se a RPC falhar (permissão/indisponível), ainda tenta ler o cache existente.
        }
      }
      return fetchMyIndicacoes(userId, limit);
    },
    staleTime: 60 * 1000,
    cacheTime: 5 * 60 * 1000,
  });
}

