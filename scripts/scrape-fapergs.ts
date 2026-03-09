#!/usr/bin/env tsx

/**
 * Script para executar o scraper FAPERGS (RS) - Editais
 * Extrai apenas editais de 2025 e 2026.
 * Listas: Abertos e Encerrados.
 *
 * Uso:
 *   npm run scrape:fapergs
 *   ou
 *   tsx scripts/scrape-fapergs.ts
 *
 * Env:
 *   FAPERGS_MAX_ITEMS=N   limita número de editais
 *   FAPERGS_DOWNLOAD_PDFS=0  não baixa PDFs
 *   FAPERGS_CONCURRENCY=N   paralelismo ao buscar detalhes (default 3)
 */

import "./load-env";
import { FapergsScraper } from "./scrapers/fapergs-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║                SCRAPER FAPERGS (RS)                        ║");
  console.log("║            (editais 2025 e 2026)                           ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new FapergsScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-fapergs.json");

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
