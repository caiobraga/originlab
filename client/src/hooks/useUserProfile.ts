import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUserProfile, UserProfile } from "@/lib/userProfile";

/**
 * Hook para acessar o perfil do usuário atual (tabela profiles).
 * refetch: força nova leitura do banco (ex.: ao abrir a página de perfil).
 */
export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const userProfile = await getUserProfile(user);
      setProfile(userProfile);
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const refetch = useCallback(() => {
    if (user) void fetchProfile();
  }, [user, fetchProfile]);

  return { profile, loading, refetch };
}

