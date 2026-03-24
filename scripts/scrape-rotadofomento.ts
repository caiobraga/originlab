#!/usr/bin/env tsx

/**
 * Scraper de editais da Rota do Fomento (https://rotadofomento.org/editais/).
 * Extrai apenas editais com data em 2025 ou 2026 (EDITAL_MIN_YEAR=2025, EDITAL_MAX_YEAR=2026).
 *
 * Uso:
 *   npm run scrape:rotadofomento
 *   tsx scripts/scrape-rotadofomento.ts
 */

import "./load-env";
import { RotadofomentoScraper } from "./scrapers/rotadofomento-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║              SCRAPER ROTA DO FOMENTO                      ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new RotadofomentoScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-rotadofomento.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { kept, removed } = writeFilteredEditaisJson(outputFile, editais);
    console.log(`\n✅ ${editais.length} extraído(s) → ${kept} gravados no JSON (${removed} filtrados por PDF/ano): ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  }
}

main().catch(console.error);
