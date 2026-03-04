#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FAPERJ (RJ) - Lista de Editais / Chamadas
 *
 * Uso:
 *   npm run scrape:faperj
 *   ou
 *   tsx scripts/scrape-faperj.ts
 *
 * Env:
 *   FAPERJ_MAX_ITEMS=N   limita número de editais
 *   FAPERJ_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FaperjScraper } from "./scrapers/faperj-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPERJ (RJ)                       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FaperjScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-faperj.json");

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
