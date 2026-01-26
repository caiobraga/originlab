/**
 * Utilitários para gerenciamento de consentimento de cookies
 */

const COOKIE_CONSENT_KEY = "originlab_cookie_consent";

export type CookieConsent = "accepted" | "rejected" | null;

/**
 * Verifica se o usuário já deu consentimento para cookies
 * @returns "accepted" | "rejected" | null
 */
export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  
  const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
  return (consent === "accepted" || consent === "rejected") ? consent : null;
}

/**
 * Verifica se os cookies foram aceitos
 * @returns true se os cookies foram aceitos, false caso contrário
 */
export function hasAcceptedCookies(): boolean {
  return getCookieConsent() === "accepted";
}

/**
 * Define o consentimento de cookies
 * @param consent - "accepted" | "rejected"
 */
export function setCookieConsent(consent: "accepted" | "rejected"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOKIE_CONSENT_KEY, consent);
}

/**
 * Remove o consentimento de cookies (útil para testes ou reset)
 */
export function clearCookieConsent(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COOKIE_CONSENT_KEY);
}
