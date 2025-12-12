import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only initialize Supabase if properly configured
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let subscription: { unsubscribe: () => void } | null = null;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      // Handle errors gracefully
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    subscription = authSubscription;

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase não está configurado. Configure as variáveis de ambiente.");
      throw new Error("Supabase not configured");
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      const authError = error as AuthError;
      toast.error(authError.message || "Erro ao fazer login");
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      const errorMsg = "Supabase não está configurado. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local";
      console.error(errorMsg);
      toast.error(errorMsg);
      throw new Error("Supabase not configured");
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        // Provide more helpful error messages
        if (error.message.includes("Invalid API key") || error.message.includes("JWT")) {
          console.error("Erro de API key inválida. Verifique se VITE_SUPABASE_ANON_KEY está correto no .env.local");
          toast.error("Chave da API inválida. Verifique as configurações do Supabase no arquivo .env.local");
        } else if (error.message.includes("Invalid URL")) {
          console.error("Erro de URL inválida. Verifique se VITE_SUPABASE_URL está correto no .env.local");
          toast.error("URL do Supabase inválida. Verifique as configurações no arquivo .env.local");
        }
        throw error;
      }

      if (data.user) {
        toast.success("Conta criada com sucesso! Verifique seu email para confirmar.");
      }
    } catch (error) {
      const authError = error as AuthError;
      // Only show generic error if we haven't shown a specific one
      if (!authError.message.includes("Invalid API key") && !authError.message.includes("Invalid URL")) {
        toast.error(authError.message || "Erro ao criar conta");
      }
      throw error;
    }
  };

  const signOut = async () => {
    if (!isSupabaseConfigured()) {
      setUser(null);
      setSession(null);
      return;
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.info("Logout realizado");
    } catch (error) {
      const authError = error as AuthError;
      toast.error(authError.message || "Erro ao fazer logout");
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

