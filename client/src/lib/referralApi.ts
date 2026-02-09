import { supabase } from "./supabase";
import { nanoid } from "nanoid";

const REFERRAL_STORAGE_KEY = "originlab_referral_code";
const CREDITO_POR_CONVERSAO = 50;

/**
 * Armazena o código de referência quando alguém visita /ref/:code
 */
export function storeReferralCode(code: string): void {
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch (e) {
    console.warn("Não foi possível salvar código de referência:", e);
  }
}

/**
 * Obtém o código de referência armazenado (se houver)
 */
export function getStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Remove o código de referência após processar
 */
export function clearStoredReferralCode(): void {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {}
}

/**
 * Gera código determinístico a partir do userId (fallback quando DB não tem a coluna)
 */
function fallbackCodeFromUserId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8);
}

/**
 * Gera ou obtém o código de referência do usuário
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  try {
    const { data: profile, error: selectError } = await supabase
      .from("profiles")
      .select("referral_code")
      .eq("user_id", userId)
      .maybeSingle();

    if (selectError) {
      return fallbackCodeFromUserId(userId);
    }

    if (profile?.referral_code) {
      return profile.referral_code;
    }

    const newCode = nanoid(8);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ referral_code: newCode })
      .eq("user_id", userId);

    if (updateError) {
      return fallbackCodeFromUserId(userId);
    }

    return newCode;
  } catch (error) {
    console.warn("Erro ao obter/criar referral code:", error);
    return fallbackCodeFromUserId(userId);
  }
}

/**
 * Registra uma conversão de referência (chamado após signup)
 */
export async function recordReferralConversion(
  referrerUserId: string,
  referredUserId: string
): Promise<boolean> {
  try {
    const { error } = await supabase.from("referrals").insert({
      referrer_id: referrerUserId,
      referred_id: referredUserId,
      status: "convertido",
      ganhos_referrer: CREDITO_POR_CONVERSAO,
    });
    return !error;
  } catch (error) {
    console.warn("Erro ao registrar referral:", error);
    return false;
  }
}

/**
 * Busca referrer pelo código
 */
export async function getReferrerByCode(code: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("referral_code", code)
      .single();
    return data?.user_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Busca estatísticas de referência do usuário
 */
export async function getReferralStats(userId: string): Promise<{
  convites: number;
  conversoes: number;
  ganhos: number;
  potencial: number;
}> {
  try {
    const { data: referrals } = await supabase
      .from("referrals")
      .select("status, ganhos_referrer")
      .eq("referrer_id", userId);

    const conversoes = referrals?.filter((r) => r.status === "convertido").length ?? 0;
    const ganhos = referrals?.reduce((sum, r) => sum + (r.ganhos_referrer ?? 0), 0) ?? 0;

    return {
      convites: referrals?.length ?? 0,
      conversoes,
      ganhos: Math.round(ganhos),
      potencial: conversoes * CREDITO_POR_CONVERSAO,
    };
  } catch (error) {
    console.warn("Erro ao buscar stats de referral:", error);
    return { convites: 0, conversoes: 0, ganhos: 0, potencial: 0 };
  }
}

export { CREDITO_POR_CONVERSAO };
