#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FINEP
 *
 * Uso:
 *   npm run scrape:finep
 *   ou
 *   tsx scripts/scrape-finep.ts
 */

import "./load-env";
import { FinepScraper } from "./scrapers/finep-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FINEP                              ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FinepScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-finep.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(editais, null, 2), "utf-8");
    console.log(`\n✅ ${editais.length} chamada(s) extraída(s) e salvas em: ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await scraper.cleanup();
  }
}

main().catch(console.error);

