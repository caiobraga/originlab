#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FUNCAP (CE) - Editais Montenegro
 *
 * Uso:
 *   npm run scrape:funcap
 *   ou
 *   tsx scripts/scrape-funcap.ts
 *
 * Env:
 *   FUNCAP_MAX_ITEMS=N   limita número de editais
 *   FUNCAP_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FuncapScraper } from "./scrapers/funcap-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FUNCAP (CE)                         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FuncapScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-funcap.json");

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
