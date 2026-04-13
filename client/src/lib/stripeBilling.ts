import { supabase } from "@/lib/supabase";

export async function createCheckoutSession(
  planKey: "pro" | "empresas",
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Faça login para assinar um plano.");
  }

  const res = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ planKey }),
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Não foi possível iniciar o checkout.");
  }
  if (!data.url) {
    throw new Error("Resposta inválida do servidor.");
  }
  return data.url;
}

export async function createBillingPortalSession(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Faça login para gerenciar a assinatura.");
  }

  const res = await fetch("/api/stripe/create-portal-session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Não foi possível abrir o portal de cobrança.");
  }
  if (!data.url) {
    throw new Error("Resposta inválida do servidor.");
  }
  return data.url;
}
