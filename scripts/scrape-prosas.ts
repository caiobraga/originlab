#!/usr/bin/env tsx

/**
 * Scraper da Central de Editais da Prosas (https://prosas.com.br/editais).
 *
 * Uso:
 *   npm run scrape:prosas
 *   tsx scripts/scrape-prosas.ts
 *
 * Env:
 *   PROSAS_HEADLESS=true (default)
 *   PROSAS_TIMEOUT_MS=30000
 *   PROSAS_MAX_PAGES=10
 */

import "./load-env";
import { ProsasScraper } from "./scrapers/prosas-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER PROSAS (Central de Editais)          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new ProsasScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-prosas.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { kept, removed } = writeFilteredEditaisJson(outputFile, editais);
    console.log(`\n✅ ${editais.length} extraído(s) → ${kept} gravados no JSON (${removed} filtrados por PDF/ano): ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    if (scraper.cleanup) await scraper.cleanup();
  }
}

main().catch(console.error);
