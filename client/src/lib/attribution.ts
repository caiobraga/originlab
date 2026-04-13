import { supabase } from "./supabase";

const STORAGE_KEY = "originlab_signup_attribution";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const CLICK_ID_KEYS = ["gclid", "fbclid"] as const;

export type StoredAttribution = {
  affiliateCode: string | null;
  /** Chaves utm_* e opcionalmente gclid/fbclid */
  params: Record<string, string>;
  capturedAt: string;
};

function sanitizeSegment(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function sanitizeAffiliateCode(raw: string | null): string | null {
  if (!raw) return null;
  const t = sanitizeSegment(raw, 64);
  if (!t || !/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  return t;
}

function parseAttributionFromSearch(search: string): {
  affiliateCode: string | null;
  params: Record<string, string>;
} {
  const params = new URLSearchParams(search);
  const affiliateCode =
    sanitizeAffiliateCode(params.get("aff")) ??
    sanitizeAffiliateCode(params.get("affiliate"));

  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) out[k] = sanitizeSegment(v, 200);
  }
  for (const k of CLICK_ID_KEYS) {
    const v = params.get(k);
    if (v) out[k] = sanitizeSegment(v, 500);
  }
  return { affiliateCode, params: out };
}

/**
 * First-touch: grava no localStorage na primeira visita com parâmetros de campanha/afiliado.
 * Chamado uma vez na inicialização do app (qualquer rota).
 */
export function captureAttributionFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;

    const { affiliateCode, params } = parseAttributionFromSearch(
      window.location.search
    );
    if (!affiliateCode && Object.keys(params).length === 0) return;

    const payload: StoredAttribution = {
      affiliateCode,
      params,
      capturedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("Não foi possível capturar atribuição:", e);
  }
}

export function getStoredAttribution(): StoredAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredAttribution(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function paramsToJsonb(
  params: Record<string, string>
): Record<string, string> | null {
  if (!params || Object.keys(params).length === 0) return null;
  return params;
}

/**
 * Persiste atribuição no perfil após signup (funciona sem sessão, via RPC).
 */
export async function recordSignupAttribution(userId: string): Promise<boolean> {
  const stored = getStoredAttribution();
  if (!stored) return false;

  const utm = paramsToJsonb(stored.params);
  const affiliate = stored.affiliateCode;
  if (!affiliate && !utm) return false;

  try {
    const { error } = await supabase.rpc("merge_signup_attribution", {
      p_user_id: userId,
      p_affiliate: affiliate,
      p_utm: utm,
    });
    if (error) {
      console.warn("merge_signup_attribution:", error);
      return false;
    }
    clearStoredAttribution();
    return true;
  } catch (e) {
    console.warn("Erro ao gravar atribuição de signup:", e);
    return false;
  }
}
