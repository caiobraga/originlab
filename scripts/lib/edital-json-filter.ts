/**
 * Regras para persistência em JSON (scrapers / output):
 * - Manter apenas editais com pelo menos um PDF (URL ou caminho local).
 * - Manter apenas editais cujo ano (inferido dos campos) caia no intervalo configurável
 *   (padrão: a partir de 2025 até o ano civil atual, no mínimo até 2026).
 *
 * Variáveis de ambiente (opcional):
 * - EDITAIS_JSON_MIN_YEAR (default 2025)
 * - EDITAIS_JSON_MAX_YEAR (default max(2026, ano atual))
 * - EDITAIS_JSON_KEEP_WHEN_YEAR_UNKNOWN=true — mantém editais sem ano detectável (não recomendado)
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Edital } from '../types';

export function getEditalJsonYearRange(): { min: number; max: number } {
  const now = new Date().getFullYear();
  const min = Number(process.env.EDITAIS_JSON_MIN_YEAR || 2025);
  const envMax = process.env.EDITAIS_JSON_MAX_YEAR
    ? Number(process.env.EDITAIS_JSON_MAX_YEAR)
    : Math.max(2026, now);
  const max = Number.isFinite(envMax) ? envMax : Math.max(2026, now);
  return { min, max };
}

/** Extrai anos 20xx plausíveis de um texto (datas BR/ISO, número do edital, título). */
export function extractYearsFromText(s: string): number[] {
  if (!s || typeof s !== 'string') return [];
  const out = new Set<number>();
  // ISO YYYY-MM-DD
  for (const m of s.matchAll(/\b(20[0-9]{2})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g)) {
    out.add(parseInt(m[1], 10));
  }
  // dd/mm/yyyy or dd-mm-yyyy
  for (const m of s.matchAll(
    /\b(?:0?[1-9]|[12]\d|3[01])[\/\-](?:0?[1-9]|1[0-2])[\/\-](20[0-9]{2})\b/g,
  )) {
    out.add(parseInt(m[1], 10));
  }
  // Número tipo 01/2025 ou 2025/01
  for (const m of s.matchAll(/\b(?:\d{1,4}\/)?(20[0-9]{2})(?:\/\d{1,4})?\b/g)) {
    const y = parseInt(m[1], 10);
    if (y >= 2000 && y <= 2100) out.add(y);
  }
  // Qualquer 20xx isolado (título, descrição)
  for (const m of s.matchAll(/\b(20[0-9]{2})\b/g)) {
    const y = parseInt(m[1], 10);
    if (y >= 2000 && y <= 2100) out.add(y);
  }
  return [...out];
}

export function inferEditalYears(e: Edital): number[] {
  const parts = [e.dataPublicacao, e.dataEncerramento, e.numero, e.titulo, e.descricao];
  const years = new Set<number>();
  for (const p of parts) {
    if (p) extractYearsFromText(String(p)).forEach((y) => years.add(y));
  }
  return [...years];
}

export function editalHasPdf(e: Edital): boolean {
  const urls = e.pdfUrls?.filter(Boolean) ?? [];
  const paths = e.pdfPaths?.filter(Boolean) ?? [];
  if (urls.length > 0 || paths.length > 0) return true;
  if (e.pdfUrl && String(e.pdfUrl).trim()) return true;
  if (e.pdfPath && String(e.pdfPath).trim()) return true;
  return false;
}

export function yearMatchesEditalJsonRange(years: number[], range: { min: number; max: number }): boolean {
  return years.some((y) => y >= range.min && y <= range.max);
}

export function shouldKeepEditalForJson(e: Edital): boolean {
  if (!editalHasPdf(e)) return false;
  const range = getEditalJsonYearRange();
  const years = inferEditalYears(e);
  if (years.length === 0) {
    return process.env.EDITAIS_JSON_KEEP_WHEN_YEAR_UNKNOWN === 'true';
  }
  return yearMatchesEditalJsonRange(years, range);
}

export function filterEditaisForJson<T extends Edital>(editais: T[]): T[] {
  return editais.filter((e) => shouldKeepEditalForJson(e));
}

export function filterEditaisForJsonWithStats<T extends Edital>(editais: T[]): {
  list: T[];
  kept: number;
  removed: number;
} {
  const list = filterEditaisForJson(editais);
  return { list, kept: list.length, removed: editais.length - list.length };
}

/**
 * Grava JSON já filtrado (PDF + janela de anos). Cria diretório pai se necessário.
 */
export function writeFilteredEditaisJson(
  filePath: string,
  editais: Edital[],
  options?: { indent?: number; log?: boolean },
): { kept: number; removed: number } {
  const indent = options?.indent ?? 2;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const { list, kept, removed } = filterEditaisForJsonWithStats(editais);
  fs.writeFileSync(filePath, JSON.stringify(list, null, indent), 'utf-8');
  if (options?.log) {
    const { min, max } = getEditalJsonYearRange();
    console.log(
      `📋 Filtro JSON (${path.basename(filePath)}): ${kept} mantidos, ${removed} removidos (exige PDF + ano ${min}–${max})`,
    );
  }
  return { kept, removed };
}
