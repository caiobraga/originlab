export async function translateText(params: {
  text: string;
  source?: string;
  target?: string;
}): Promise<string> {
  const { text, source = "pt", target = "en" } = params;
  const input = String(text || "").trim();
  if (!input) return "";

  const API_BASE = String((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const apiUrl = (path: string) =>
    API_BASE ? `${API_BASE}${path.startsWith("/") ? path : `/${path}`}` : path;

  const r = await fetch(apiUrl("/api/translate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: input, source, target }),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `Erro ao traduzir (${r.status})`);
  }

  const data = (await r.json()) as { translatedText?: string };
  return String(data?.translatedText || "").trim();
}

