#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FAPEAL (AL) - Editais
 *
 * Uso:
 *   npm run scrape:fapeal
 *   ou
 *   tsx scripts/scrape-fapeal.ts
 *
 * Env:
 *   FAPEAL_MAX_ITEMS=N   limita número de editais
 *   FAPEAL_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FapealScraper } from "./scrapers/fapeal-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPEAL (AL)                        ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapealScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapeal.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { kept, removed } = writeFilteredEditaisJson(outputFile, editais);
    console.log(`\n✅ ${editais.length} extraído(s) → ${kept} gravados no JSON (${removed} filtrados por PDF/ano): ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await scraper.cleanup();
  }
}

main().catch(console.error);
