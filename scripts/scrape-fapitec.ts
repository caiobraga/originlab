#!/usr/bin/env tsx

/**
 * Script para executar o scraper FAPITEC (SE) - Editais Abertos
 * Extrai apenas editais de 2025 e 2026.
 *
 * Uso:
 *   npm run scrape:fapitec
 *   ou
 *   tsx scripts/scrape-fapitec.ts
 *
 * Env:
 *   FAPITEC_MAX_ITEMS=N   limita número de editais
 *   FAPITEC_DOWNLOAD_PDFS=0  não baixa PDFs
 *   FAPITEC_CONCURRENCY=N   paralelismo ao buscar detalhes (default 3)
 */

import "./load-env";
import { FapitecScraper } from "./scrapers/fapitec-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPITEC (SE)                       ║");
  console.log("║            (editais 2025 e 2026)                          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapitecScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapitec.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(editais, null, 2), "utf-8");
    console.log(`\n✅ ${editais.length} edital(is) extraído(s) e salvo(s) em: ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  } finally {
    await scraper.cleanup?.();
  }
}

main().catch(console.error);
