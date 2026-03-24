#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FAPEMIG (MG) - Chamadas e Editais
 *
 * Uso:
 *   npm run scrape:fapemig
 *   ou
 *   tsx scripts/scrape-fapemig.ts
 *
 * Env:
 *   FAPEMIG_MAX_ITEMS=5   limita número de chamadas
 *   FAPEMIG_DOWNLOAD_PDFS=0  não baixa PDFs
 *   FAPEMIG_HEADLESS=0    mostra o navegador
 */

import "./load-env";
import { FapemigScraper } from "./scrapers/fapemig-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPEMIG (MG)                        ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapemigScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapemig.json");

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
