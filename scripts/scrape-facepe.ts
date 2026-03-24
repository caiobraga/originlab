#!/usr/bin/env tsx

/**
 * Script para executar o scraper FACEPE (PE) - Editais
 * Extrai apenas editais de 2025 e 2026.
 *
 * Uso:
 *   npm run scrape:facepe
 *   ou
 *   tsx scripts/scrape-facepe.ts
 *
 * Env:
 *   FACEPE_MAX_ITEMS=N   limita número de editais
 *   FACEPE_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FacepeScraper } from "./scrapers/facepe-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FACEPE (PE)                        ║");
  console.log("║            (editais 2025 e 2026)                            ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FacepeScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-facepe.json");

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
