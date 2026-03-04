#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FAPAC (AC) - Editais
 *
 * Uso:
 *   npm run scrape:fapac
 *   ou
 *   tsx scripts/scrape-fapac.ts
 *
 * Env:
 *   FAPAC_MAX_ITEMS=N   limita número de editais
 *   FAPAC_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FapacScraper } from "./scrapers/fapac-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPAC (AC)                          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapacScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapac.json");

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
