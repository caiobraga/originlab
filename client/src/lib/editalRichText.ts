type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

const CANONICAL_HEADING_BY_KEY: Array<{ test: (k: string) => boolean; heading: string }> = [
  { test: (k) => /sobre\s+o\s+programa/.test(k), heading: "Sobre o Programa" },
  { test: (k) => /sobre\s+o\s+edital/.test(k), heading: "Sobre o Edital" },
  { test: (k) => /objetiv/.test(k), heading: "Objetivos" },
  { test: (k) => /elegibil|requisit|perfil|publico|p[úu]blico/.test(k), heading: "Elegibilidade e Requisitos" },
  { test: (k) => /cronogram|etapas|fases/.test(k), heading: "Cronograma" },
  { test: (k) => /avalia|sele[cç][aã]o/.test(k), heading: "Avaliação e Seleção" },
  { test: (k) => /financ|recursos|valor|contrapart/.test(k), heading: "Financiamento" },
];

const normalizeHeadingKey = (raw: string): string => {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const canonicalHeadingForKey = (rawKey: string): string => {
  const k = normalizeHeadingKey(rawKey);
  for (const rule of CANONICAL_HEADING_BY_KEY) {
    if (rule.test(k)) return rule.heading;
  }
  return String(rawKey || "").trim() || "Seção";
};

const isProbablyMarkdown = (text: string): boolean => {
  const t = String(text || "");
  if (!t) return false;
  if (/^#{1,6}\s/m.test(t)) return true;
  if (/\*\*[^*]+\*\*/.test(t)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(t)) return true;
  if (/^>\s/m.test(t)) return true;
  if (/^[-*+]\s/m.test(t)) return true;
  if (/^\d+\.\s/m.test(t)) return true;
  return false;
};

const collapseWhitespace = (text: string): string => {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const mergeUniqueParagraphs = (parts: string[]): string => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const s = collapseWhitespace(String(p || ""));
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.join("\n\n");
};

const skipWs = (s: string, i: number): number => {
  let j = i;
  while (j < s.length && /\s/.test(s[j]!)) j++;
  return j;
};

const readJsonString = (s: string, startQuoteIdx: number): { end: number; value: string } | null => {
  if (s[startQuoteIdx] !== '"') return null;
  let j = startQuoteIdx + 1;
  let out = "";
  while (j < s.length) {
    const ch = s[j]!;
    if (ch === "\\") {
      const n = s[j + 1];
      if (!n) return null;
      // JSON escapes mínimos
      if (n === '"' || n === "\\" || n === "/") {
        out += n;
        j += 2;
        continue;
      }
      if (n === "b") {
        out += "\b";
        j += 2;
        continue;
      }
      if (n === "f") {
        out += "\f";
        j += 2;
        continue;
      }
      if (n === "n") {
        out += "\n";
        j += 2;
        continue;
      }
      if (n === "r") {
        out += "\r";
        j += 2;
        continue;
      }
      if (n === "t") {
        out += "\t";
        j += 2;
        continue;
      }
      if (n === "u") {
        const hex = s.slice(j + 2, j + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        out += String.fromCharCode(parseInt(hex, 16));
        j += 6;
        continue;
      }
      // fallback: manter o caractere escapado
      out += n;
      j += 2;
      continue;
    }
    if (ch === '"') {
      return { end: j + 1, value: out };
    }
    out += ch;
    j++;
  }
  return null;
};

const readJsonNumber = (s: string, i: number): { end: number; value: number } | null => {
  let j = i;
  if (s[j] === "-") j++;
  if (j >= s.length) return null;
  if (s[j] === "0" && /\d/.test(s[j + 1] || "")) return null; // leading zeros inválidas (exceto "0.")
  let intPart = "";
  while (j < s.length && /\d/.test(s[j]!)) {
    intPart += s[j]!;
    j++;
  }
  if (s[j] === ".") {
    j++;
    let frac = "";
    while (j < s.length && /\d/.test(s[j]!)) {
      frac += s[j]!;
      j++;
    }
    if (!intPart && !frac) return null;
    const n = Number(`${intPart || "0"}.${frac || "0"}`);
    if (!Number.isFinite(n)) return null;
    return { end: j, value: n };
  }
  if (!intPart) return null;
  const n = Number(intPart);
  if (!Number.isFinite(n)) return null;
  return { end: j, value: n };
};

const readJsonLiteral = (s: string, i: number): { end: number; value: JsonPrimitive } | null => {
  if (s.startsWith("true", i)) return { end: i + 4, value: true };
  if (s.startsWith("false", i)) return { end: i + 5, value: false };
  if (s.startsWith("null", i)) return { end: i + 4, value: null };
  return null;
};

const readJsonValue = (s: string, i: number): { end: number; value: JsonValue } | null => {
  let j = skipWs(s, i);
  if (j >= s.length) return null;
  const ch = s[j]!;
  if (ch === '"') {
    const str = readJsonString(s, j);
    if (!str) return null;
    return { end: str.end, value: str.value };
  }
  if (ch === "{") return readJsonObject(s, j);
  if (ch === "[") return readJsonArray(s, j);
  if (ch === "-" || /\d/.test(ch)) {
    const num = readJsonNumber(s, j);
    if (!num) return null;
    return { end: num.end, value: num.value };
  }
  const lit = readJsonLiteral(s, j);
  if (!lit) return null;
  return { end: lit.end, value: lit.value };
};

const readJsonArray = (s: string, i: number): { end: number; value: JsonValue[] } | null => {
  if (s[i] !== "[") return null;
  let j = i + 1;
  const out: JsonValue[] = [];
  j = skipWs(s, j);
  if (s[j] === "]") return { end: j + 1, value: out };
  while (j < s.length) {
    const v = readJsonValue(s, j);
    if (!v) return null;
    out.push(v.value);
    j = skipWs(s, v.end);
    if (s[j] === ",") {
      j++;
      j = skipWs(s, j);
      continue;
    }
    if (s[j] === "]") {
      return { end: j + 1, value: out };
    }
    return null;
  }
  return null;
};

const readJsonObject = (s: string, i: number): { end: number; value: Record<string, JsonValue> } | null => {
  if (s[i] !== "{") return null;
  let j = i + 1;
  const merged = new Map<string, JsonValue[]>();
  j = skipWs(s, j);
  if (s[j] === "}") return { end: j + 1, value: {} };

  while (j < s.length) {
    j = skipWs(s, j);
    if (s[j] !== '"') return null;
    const keyRead = readJsonString(s, j);
    if (!keyRead) return null;
    j = skipWs(s, keyRead.end);
    if (s[j] !== ":") return null;
    j++;
    const valRead = readJsonValue(s, j);
    if (!valRead) return null;
    const key = keyRead.value;
    const arr = merged.get(key) || [];
    arr.push(valRead.value);
    merged.set(key, arr);
    j = skipWs(s, valRead.end);
    if (s[j] === ",") {
      j++;
      continue;
    }
    if (s[j] === "}") {
      j++;
      const out: Record<string, JsonValue> = {};
      for (const [k, vals] of merged.entries()) {
        if (vals.length === 1) {
          out[k] = vals[0]!;
        } else {
          // Mesclar duplicatas: strings viram parágrafos; demais tipos viram JSON legível
          const strings = vals.filter((v) => typeof v === "string") as string[];
          const nonStrings = vals.filter((v) => typeof v !== "string");
          const mergedText = mergeUniqueParagraphs(strings);
          const extras = nonStrings.map((v) => JSON.stringify(v));
          const combined = mergeUniqueParagraphs([mergedText, ...extras].filter(Boolean));
          out[k] = combined;
        }
      }
      return { end: j, value: out };
    }
    return null;
  }
  return null;
};

const tryParseJsonObjectWithDuplicateMerge = (text: string): Record<string, JsonValue> | null => {
  const t = String(text || "").trim();
  if (!t.startsWith("{")) return null;
  const parsed = readJsonObject(t, 0);
  if (!parsed) return null;
  // garantir que consumiu até o fim (ignorando whitespace)
  const rest = t.slice(skipWs(t, parsed.end)).trim();
  if (rest.length > 0) return null;
  return parsed.value;
};

const toMdFromObject = (obj: any): string => {
  if (!obj || typeof obj !== "object") return "";

  if (Array.isArray(obj)) {
    return obj
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "string") return `- ${item}`;
        if (typeof item === "number" || typeof item === "boolean") return `- ${String(item)}`;
        if (typeof item === "object") return `- ${JSON.stringify(item)}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  const entries = Object.entries(obj);
  if (entries.length === 0) return "";

  const orderRank = (rawKey: string): number => {
    const h = normalizeHeadingKey(canonicalHeadingForKey(rawKey));
    const preferred = [
      normalizeHeadingKey("Sobre o Programa"),
      normalizeHeadingKey("Sobre o Edital"),
      normalizeHeadingKey("Objetivos"),
      normalizeHeadingKey("Elegibilidade e Requisitos"),
      normalizeHeadingKey("Cronograma"),
      normalizeHeadingKey("Avaliação e Seleção"),
      normalizeHeadingKey("Financiamento"),
    ];
    const idx = preferred.indexOf(h);
    return idx === -1 ? 999 : idx;
  };

  entries.sort(([a], [b]) => {
    const ra = orderRank(a);
    const rb = orderRank(b);
    if (ra !== rb) return ra - rb;
    return String(a).localeCompare(String(b), "pt-BR");
  });

  return entries
    .map(([k, v]) => {
      const rawTitle = String(k || "").trim();
      if (!rawTitle) return "";
      const title = canonicalHeadingForKey(rawTitle);
      if (v == null) return `### ${title}\n\n—`;
      if (typeof v === "string") {
        const text = collapseWhitespace(v);
        return `### ${title}\n\n${text || "—"}`;
      }
      if (Array.isArray(v)) {
        const list = toMdFromObject(v);
        return `### ${title}\n\n${list || "—"}`;
      }
      if (typeof v === "object") {
        const nested = Object.entries(v as Record<string, unknown>)
          .map(([nk, nv]) => {
            const key = String(nk || "").trim();
            if (!key) return "";
            const val =
              typeof nv === "string"
                ? collapseWhitespace(nv)
                : typeof nv === "number" || typeof nv === "boolean"
                  ? String(nv)
                  : nv == null
                    ? "—"
                    : JSON.stringify(nv);
            return `- **${key}**: ${val || "—"}`;
          })
          .filter(Boolean)
          .join("\n");
        return `### ${title}\n\n${nested || "—"}`;
      }
      return `### ${title}\n\n${String(v)}`;
    })
    .filter(Boolean)
    .join("\n\n");
};

const prettifyNonObjectJson = (value: JsonValue): string => {
  if (typeof value === "string") return collapseWhitespace(value);
  if (value == null) return "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => `- ${prettifyNonObjectJson(v as any)}`)
      .join("\n");
  }
  // objeto genérico (não esperado no topo, mas ok)
  return toMdFromObject(value) || "—";
};

/**
 * Normaliza campos que podem vir como:
 * - objeto JSON já parseado
 * - string JSON (inclui chaves repetidas *inválidas* para `JSON.parse`)
 * - markdown
 * - texto “cru” com quebras ruins
 */
export function normalizeJsonLikeToMarkdown(value: unknown): string {
  if (value && typeof value === "object") {
    const md = toMdFromObject(value);
    return md || String(value);
  }

  const text = collapseWhitespace(String(value ?? ""));
  if (!text || text === "Não informado") return "";

  // JSON string (objeto) com merge de chaves duplicadas
  if (text.startsWith("{")) {
    const mergedObj = tryParseJsonObjectWithDuplicateMerge(text);
    if (mergedObj) {
      const md = toMdFromObject(mergedObj);
      if (md) return md;
    }
    try {
      const parsed = JSON.parse(text);
      const md = toMdFromObject(parsed);
      if (md) return md;
    } catch {
      // segue
    }
    // Fallback seguro: não devolver JSON cru
    return collapseWhitespace(text.replace(/^\{|\}$/g, "").replace(/","/g, '", "')) || text;
  }

  // JSON string (array)
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as JsonValue;
      return prettifyNonObjectJson(parsed);
    } catch {
      return text;
    }
  }

  // Markdown “óbvio” ou texto com quebras ruins
  if (isProbablyMarkdown(text)) return text;
  return collapseWhitespace(text.replace(/\\n/g, "\n"));
}
