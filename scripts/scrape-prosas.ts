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

    fs.writeFileSync(outputFile, JSON.stringify(editais, null, 2), "utf-8");
    console.log(`\n✅ ${editais.length} edital(is) extraído(s) e salvo(s) em: ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    if (scraper.cleanup) await scraper.cleanup();
  }
}

main().catch(console.error);
