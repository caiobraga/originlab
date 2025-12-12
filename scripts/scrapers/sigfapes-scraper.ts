import { Scraper, Edital } from '../types';
import { SigfapesScraper as OriginalScraper } from '../scrape-sigfapes';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Wrapper do scraper SIGFAPES que implementa a interface Scraper
 */
export class SigfapesScraper implements Scraper {
  readonly name = 'sigfapes';
  private originalScraper: OriginalScraper | null = null;

  async scrape(): Promise<Edital[]> {
    this.originalScraper = new OriginalScraper();
    
    try {
      await this.originalScraper.init();
      await this.originalScraper.login();
      await this.originalScraper.navigateToEditais();
      const editais = await this.originalScraper.extractEditais();
      await this.originalScraper.downloadPdfs(editais);
      
      // Adicionar fonte e processar
      return editais.map(edital => ({
        ...edital,
        fonte: 'sigfapes',
        processadoEm: edital.processadoEm || new Date().toISOString(),
      }));
    } catch (error) {
      console.error(`Erro no scraper ${this.name}:`, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    // O cleanup será feito automaticamente pelo originalScraper
    // Mas podemos forçar fechamento aqui se necessário
    if (this.originalScraper) {
      // O browser será fechado no finally do método run()
      // Por enquanto, apenas limpar referência
      this.originalScraper = null;
    }
  }
}

