import type { Edital } from '../types';

/**
 * Chave estável para casar JSON ↔ banco (mesma lógica usada em db/sync.ts ao deduplicar).
 * numero+fonte (lowercase) ou, sem número, fonte + trecho do título normalizado.
 */
export function editalSyncKey(e: {
  fonte?: string | null;
  numero?: string | null;
  titulo?: string | null;
}): string {
  const fonte = (e.fonte || 'unknown').trim().toLowerCase();
  const numero = (e.numero || '').trim().toLowerCase();
  const titulo = (e.titulo || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
  return numero ? `${fonte}:${numero}` : `${fonte}:${titulo}`;
}

export function wantedKeySetFromEditais(editais: Edital[]): Set<string> {
  return new Set(editais.map((e) => editalSyncKey(e)));
}
