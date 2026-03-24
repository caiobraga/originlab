#!/usr/bin/env tsx

/**
 * Script para executar o scraper FAPEMAT (MT) - Editais
 *
 * Uso:
 *   npm run scrape:fapemat
 *   ou
 *   tsx scripts/scrape-fapemat.ts
 *
 * Env:
 *   FAPEMAT_MAX_ITEMS=N   limita número de editais
 *   FAPEMAT_DOWNLOAD_PDFS=0  não baixa PDFs
 *   FAPEMAT_EDITAL_URLS=url1,url2  URLs de detalhe (quando a lista é carregada por JS)
 *   FAPEMAT_USE_PUPPETEER=1        usa navegador headless para lista e detalhes (recomendado para FAPEMAT)
 *   FAPEMAT_HEADLESS=0             mostra o navegador ao usar Puppeteer
 */

import "./load-env";
import { FapematScraper } from "./scrapers/fapemat-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPEMAT (MT)                       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapematScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapemat.json");

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
