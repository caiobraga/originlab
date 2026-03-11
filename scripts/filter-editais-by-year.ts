/**
 * Filtro de editais por ano (dataPublicacao ou dataEncerramento).
 * Usado por scrapers para retornar apenas editais de 2025 e 2026.
 *
 * Env: EDITAL_MIN_YEAR=2025, EDITAL_MAX_YEAR=2026
 * Se não definidos, usa 2025 e 2026 como padrão.
 */
import type { Edital } from "./types";

const DEFAULT_MIN = 2025;
const DEFAULT_MAX = 2026;

function parseYearFromPtBrDate(s: string | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/(\d{4})/);
  if (!m) {
    const ddmmyy = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (ddmmyy) return parseInt(ddmmyy[3], 10);
    return null;
  }
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

export function getEditalYears(): { min: number; max: number } {
  const min = Number(process.env.EDITAL_MIN_YEAR || String(DEFAULT_MIN));
  const max = Number(process.env.EDITAL_MAX_YEAR || String(DEFAULT_MAX));
  return {
    min: Number.isFinite(min) ? min : DEFAULT_MIN,
    max: Number.isFinite(max) ? max : DEFAULT_MAX,
  };
}

/**
 * Retorna apenas editais cujo ano (de dataPublicacao ou dataEncerramento) está entre min e max (inclusive).
 * Se o edital não tiver nenhuma data, é mantido (incluído).
 */
export function filterEditaisByYear(
  editais: Edital[],
  minYear?: number,
  maxYear?: number
): Edital[] {
  const { min, max } = minYear != null && maxYear != null
    ? { min: minYear, max: maxYear }
    : getEditalYears();

  return editais.filter((e) => {
    const yPub = parseYearFromPtBrDate(e.dataPublicacao);
    const yEnc = parseYearFromPtBrDate(e.dataEncerramento);
    const year = yEnc ?? yPub ?? null;
    if (year === null) return true;
    return year >= min && year <= max;
  });
}
