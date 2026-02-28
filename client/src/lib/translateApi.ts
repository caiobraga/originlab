export async function translateText(params: {
  text: string;
  source?: string;
  target?: string;
}): Promise<string> {
  const { text, source = "pt", target = "en" } = params;
  const input = String(text || "").trim();
  if (!input) return "";

  const r = await fetch("/api/translate", {
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

