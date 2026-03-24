#!/usr/bin/env tsx

/**
 * Script para executar o scraper FAPERN (RN) - Editais Abertos
 * Extrai apenas editais de 2025 e 2026.
 *
 * Uso:
 *   npm run scrape:fapern
 *   ou
 *   tsx scripts/scrape-fapern.ts
 *
 * Env:
 *   FAPERN_MAX_ITEMS=N   limita número de editais
 *   FAPERN_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FapernScraper } from "./scrapers/fapern-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPERN (RN)                        ║");
  console.log("║            (editais 2025 e 2026)                           ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapernScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapern.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { kept, removed } = writeFilteredEditaisJson(outputFile, editais);
    console.log(`\n✅ ${editais.length} extraído(s) → ${kept} gravados no JSON (${removed} filtrados por PDF/ano): ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await scraper.cleanup?.();
  }
}

main().catch(console.error);
