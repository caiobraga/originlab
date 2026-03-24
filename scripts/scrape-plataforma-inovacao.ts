#!/usr/bin/env tsx

/**
 * Scraper da Plataforma Inovação para a Indústria (Portal da Indústria).
 * https://www.portaldaindustria.com.br/canais/plataforma-inovacao-para-industria/
 *
 * Uso:
 *   npm run scrape:plataforma-inovacao
 *   tsx scripts/scrape-plataforma-inovacao.ts
 *
 * Env:
 *   PLATAFORMA_MAX_CATEGORIAS=N  (0 = todas)
 *   PLATAFORMA_TIMEOUT_MS=20000
 */

import "./load-env";
import { PlataformaInovacaoScraper } from "./scrapers/plataforma-inovacao-scraper";
import * as fs from "fs";
import * as path from "path";
import { writeFilteredEditaisJson } from "./lib/edital-json-filter";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   SCRAPER PLATAFORMA INOVAÇÃO (Portal da Indústria)         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const scraper = new PlataformaInovacaoScraper();

  try {
    const editais = await scraper.scrape();

    const outputDir = path.join(process.cwd(), "scripts", "output");
    const outputFile = path.join(outputDir, "editais-plataforma-inovacao.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { kept, removed } = writeFilteredEditaisJson(outputFile, editais);
    console.log(`\n✅ ${editais.length} extraído(s) → ${kept} gravados no JSON (${removed} filtrados por PDF/ano): ${outputFile}`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    process.exit(1);
  }
}

main().catch(console.error);
