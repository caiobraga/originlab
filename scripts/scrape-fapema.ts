#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper FAPEMA (MA) - Editais em aberto
 *
 * Uso:
 *   npm run scrape:fapema
 *   ou
 *   tsx scripts/scrape-fapema.ts
 *
 * Env:
 *   FAPEMA_MAX_ITEMS=N   limita número de editais
 *   FAPEMA_MAX_PAGES=N   limita páginas de listagem (default 20)
 *   FAPEMA_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FapemaScraper } from "./scrapers/fapema-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPEMA (MA)                         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapemaScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapema.json");

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

