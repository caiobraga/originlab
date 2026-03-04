#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper SECTI (ES) - Editais Abertos
 *
 * Uso:
 *   npm run scrape:secti
 *   ou
 *   tsx scripts/scrape-secti.ts
 *
 * Env:
 *   SECTI_MAX_PAGES=1
 *   SECTI_DOWNLOAD_PDFS=0
 */

import "./load-env";
import { SectiScraper } from "./scrapers/secti-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER SECTI (ES)                         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new SectiScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-secti.json");

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

