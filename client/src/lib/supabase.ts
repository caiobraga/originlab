import { createClient } from "@supabase/supabase-js";

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Em dev, usa proxy do Vite para evitar CORS ao chamar Supabase de localhost
const supabaseUrl =
  import.meta.env.DEV && typeof window !== "undefined"
    ? `${window.location.origin}/supabase-proxy`
    : envSupabaseUrl;

// Check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  const validKey =
    supabaseAnonKey &&
    supabaseAnonKey !== "your_supabase_anon_key" &&
    supabaseAnonKey !== "placeholder" &&
    !supabaseAnonKey.includes("placeholder") &&
    supabaseAnonKey.length > 50 &&
    supabaseAnonKey.startsWith("eyJ");
  const validUrl =
    envSupabaseUrl &&
    envSupabaseUrl !== "your_supabase_project_url" &&
    envSupabaseUrl !== "https://placeholder.supabase.co" &&
    envSupabaseUrl.startsWith("https://");
  return !!(validKey && validUrl);
};

// Create Supabase client only if properly configured
let supabaseClient: ReturnType<typeof createClient> | null = null;

// Create Supabase client - only create if properly configured
export const supabase = (() => {
  // Check configuration first
  if (!isSupabaseConfigured()) {
    console.warn("⚠️ Supabase não está configurado. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local");
    // Return a client that will fail with clear error messages
    return createClient(
      supabaseUrl || "https://placeholder.supabase.co",
      supabaseAnonKey || "placeholder-key",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    );
  }

  // Create client with validated values
  if (!supabaseClient) {
    const url = supabaseUrl!;
    const key = supabaseAnonKey!;

    supabaseClient = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  }
  
  return supabaseClient;
})();

