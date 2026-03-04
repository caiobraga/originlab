#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper CAPTA (oportunidades)
 *
 * Uso:
 *   npm run scrape:capta
 *   ou
 *   tsx scripts/scrape-capta.ts
 *
 * Env:
 *   CAPTA_MAX_ITEMS=10
 *   CAPTA_MAX_LINKS_PER_ITEM=3
 *   CAPTA_DOWNLOAD_PDFS=0
 */

import "./load-env";
import { CaptaScraper } from "./scrapers/capta-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER CAPTA                              ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new CaptaScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-capta.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(editais, null, 2), "utf-8");
    console.log(`\n✅ ${editais.length} edital(is) extraído(s) e salvo(s) em: ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await scraper.cleanup();
  }
}

main().catch(console.error);

