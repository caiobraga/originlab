#!/usr/bin/env tsx

/**
 * Script para executar o scraper FAPESQ (PB) - Editais
 * Extrai apenas editais até 2024 (não extrai 2025 em diante).
 *
 * Uso:
 *   npm run scrape:fapesq
 *   ou
 *   tsx scripts/scrape-fapesq.ts
 *
 * Env:
 *   FAPESQ_MAX_ITEMS=N   limita número de editais
 *   FAPESQ_DOWNLOAD_PDFS=0  não baixa PDFs
 */

import "./load-env";
import { FapesqScraper } from "./scrapers/fapesq-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPESQ (PB)                       ║");
  console.log("║            (apenas editais até 2024)                       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapesqScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapesq.json");

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
