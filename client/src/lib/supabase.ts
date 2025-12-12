import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return !!(
    supabaseUrl && 
    supabaseAnonKey && 
    supabaseUrl !== "your_supabase_project_url" && 
    supabaseAnonKey !== "your_supabase_anon_key" &&
    supabaseUrl !== "https://placeholder.supabase.co" &&
    !supabaseAnonKey.includes("placeholder") &&
    supabaseUrl.startsWith("https://") &&
    supabaseAnonKey.length > 50 && // Basic validation - real keys are much longer
    supabaseAnonKey.startsWith("eyJ") // JWT tokens start with "eyJ"
  );
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

