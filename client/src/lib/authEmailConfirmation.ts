import { supabase } from "@/lib/supabase";

/** URL para onde o Supabase redireciona após o usuário clicar no link do email. */
export function getEmailConfirmRedirectUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/login?emailConfirmado=1`;
}

export async function resendSignupConfirmationEmail(email: string): Promise<{ error: Error | null }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: new Error("Informe seu email.") };
  }
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: trimmed,
    options: {
      emailRedirectTo: getEmailConfirmRedirectUrl(),
    },
  });
  return { error: error ? new Error(error.message) : null };
}
