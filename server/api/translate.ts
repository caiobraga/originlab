import express from "express";

const router = express.Router();
router.use(express.json({ limit: "1mb" }));

type TranslateRequestBody = {
  text: string;
  source?: string; // ex.: "pt"
  target?: string; // ex.: "en"
};

function parseGoogleTranslateResponse(body: unknown): string | null {
  // Formato típico: [[["Hello","Olá",null,null, ... ]], null, "pt", ...]
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0];
  if (!Array.isArray(first)) return null;
  const parts = first
    .map((seg: any) => (Array.isArray(seg) ? seg[0] : null))
    .filter((s: any) => typeof s === "string");
  const joined = parts.join("");
  return joined.trim() ? joined.trim() : null;
}

router.post("/translate", async (req, res) => {
  try {
    const { text, source = "pt", target = "en" } = (req.body || {}) as TranslateRequestBody;
    const input = String(text || "").trim();
    if (!input) {
      return res.status(400).json({ error: 'Campo "text" é obrigatório' });
    }

    const url =
      "https://translate.googleapis.com/translate_a/single" +
      `?client=gtx&sl=${encodeURIComponent(source)}` +
      `&tl=${encodeURIComponent(target)}` +
      `&dt=t&q=${encodeURIComponent(input)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(502).json({ error: "Falha ao traduzir", details: txt || r.statusText });
    }

    const body = (await r.json()) as unknown;
    const translated = parseGoogleTranslateResponse(body);
    if (!translated) {
      return res.status(502).json({ error: "Resposta inválida do tradutor" });
    }

    return res.json({ translatedText: translated });
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    return res.status(502).json({ error: isAbort ? "Timeout ao traduzir" : "Erro ao traduzir" });
  }
});

export default router;

