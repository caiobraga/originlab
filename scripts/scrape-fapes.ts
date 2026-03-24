#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FAPES
 * 
 * Uso:
 *   npm run scrape:fapes
 *   ou
 *   tsx scripts/scrape-fapes.ts
 */

import './load-env';
import { FapesScraper } from './scrapers/fapes-scraper';
import * as fs from 'fs';
import * as path from 'path';
import { writeFilteredEditaisJson } from './lib/edital-json-filter';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              SCRAPER FAPES                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const scraper = new FapesScraper();

  try {
    const editais = await scraper.scrape();

    // Salvar JSON
    const outputDir = path.join(process.cwd(), 'scripts', 'output');
    const outputFile = path.join(outputDir, 'editais-fapes.json');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { kept, removed } = writeFilteredEditaisJson(outputFile, editais);
    console.log(`\n✅ ${editais.length} extraído(s) → ${kept} gravados no JSON (${removed} filtrados por PDF/ano): ${outputFile}`);

  } catch (error) {
    console.error('\n❌ Erro:', error);
    process.exit(1);
  } finally {
    await scraper.cleanup();
  }
}

main().catch(console.error);


















