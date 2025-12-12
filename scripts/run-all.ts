#!/usr/bin/env tsx

/**
 * Script principal que executa todos os scrapers e sincroniza com o banco de dados
 * 
 * Uso:
 *   npm run scrape:all
 *   ou
 *   tsx scripts/run-all.ts
 */

// Carregar variáveis de ambiente primeiro
import './load-env';

import { ScraperOrchestrator } from './orchestrator';
import { scrapers } from './scrapers';
import { syncEditaisToDatabase } from './db/sync';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     ORQUESTRADOR DE SCRAPERS DE EDITAIS                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Criar orquestrador
    const orchestrator = new ScraperOrchestrator();

    // 2. Registrar todos os scrapers
    scrapers.forEach(scraper => {
      orchestrator.register(scraper);
    });

    // 3. Executar todos os scrapers
    const editais = await orchestrator.run();

    // 4. Sincronizar com banco de dados (se houver editais)
    if (editais.length > 0) {
      console.log('\n' + '═'.repeat(50));
      console.log('🔄 SINCRONIZANDO COM BANCO DE DADOS');
      console.log('═'.repeat(50));
      
      try {
        await syncEditaisToDatabase();
        console.log('\n✅ Sincronização concluída com sucesso!');
      } catch (error) {
        console.error('\n❌ Erro ao sincronizar com banco de dados:', error);
        console.error('   Os dados foram salvos em JSON, mas não foram sincronizados.');
        process.exit(1);
      }
    } else {
      console.log('\n⚠️ Nenhum edital foi extraído. Pulando sincronização.');
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✅ PROCESSO CONCLUÍDO');
    console.log('═'.repeat(50));
  } catch (error) {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Executar
main().catch(console.error);

