#!/usr/bin/env tsx
/**
 * Limpa scripts/output/editais.json e scripts/output/editais-*.json:
 * remove entradas sem PDF e fora da janela de anos (mesma regra de scripts/lib/edital-json-filter.ts).
 *
 * Uso: npm run scrape:clean-json
 *      tsx scripts/clean-editais-json.ts
 *      tsx scripts/clean-editais-json.ts --dry-run
 */
import './load-env';
import * as fs from 'fs';
import * as path from 'path';
import {
  filterEditaisForJsonWithStats,
  getEditalJsonYearRange,
} from './lib/edital-json-filter';
import type { Edital } from './types';

const dryRun = process.argv.includes('--dry-run');

function main() {
  const outputDir = path.join(process.cwd(), 'scripts', 'output');
  const { min, max } = getEditalJsonYearRange();

  if (!fs.existsSync(outputDir)) {
    console.log(`Pasta inexistente: ${outputDir}`);
    process.exit(0);
  }

  const files = fs
    .readdirSync(outputDir)
    .filter((f) => f === 'editais.json' || /^editais-[^/\\]+\.json$/i.test(f))
    .map((f) => path.join(outputDir, f))
    .filter((p) => fs.statSync(p).isFile());

  if (files.length === 0) {
    console.log('Nenhum editais*.json encontrado.');
    process.exit(0);
  }

  console.log(`Janela de anos: ${min}–${max} | exige PDF | dry-run=${dryRun}\n`);

  let totalBefore = 0;
  let totalAfter = 0;

  for (const filePath of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      console.warn(`Ignorado (JSON inválido): ${filePath}`);
      continue;
    }
    if (!Array.isArray(raw)) {
      console.warn(`Ignorado (não é array): ${filePath}`);
      continue;
    }
    const editais = raw as Edital[];
    const before = editais.length;
    const { list, kept } = filterEditaisForJsonWithStats(editais);
    totalBefore += before;
    totalAfter += kept;

    if (dryRun) {
      console.log(
        `${path.basename(filePath)}: ${before} → ${kept} manteriam (${before - kept} removidos)`,
      );
      continue;
    }

    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
    console.log(`${path.basename(filePath)}: ${before} → ${kept} (${before - kept} removidos)`);
  }

  if (!dryRun) {
    console.log(`\nTotal: ${totalBefore} → ${totalAfter} (${totalBefore - totalAfter} removidos)`);
  }
}

main();
