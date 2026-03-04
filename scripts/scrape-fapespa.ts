#!/usr/bin/env tsx

/**
 * Script para executar o scraper FAPESPA (PA) - Editais
 *
 * Uso:
 *   npm run scrape:fapespa
 *   ou
 *   tsx scripts/scrape-fapespa.ts
 *
 * Env:
 *   FAPESPA_MAX_ITEMS=N   limita número de editais
 *   FAPESPA_MAX_PAGES=N   limita páginas de listagem (default 10)
 *   FAPESPA_DOWNLOAD_PDFS=0  não baixa PDFs (bem mais rápido)
 *   FAPESPA_CONCURRENCY=N processa N editais em paralelo (default 3)
 */

import "./load-env";
import { FapespaScraper } from "./scrapers/fapespa-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPESPA (PA)                       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapespaScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapespa.json");

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
