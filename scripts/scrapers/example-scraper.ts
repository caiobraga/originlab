/**
 * Exemplo de como criar um novo scraper
 * 
 * Para criar um novo scraper:
 * 1. Copie este arquivo e renomeie (ex: fapesp-scraper.ts)
 * 2. Implemente a interface Scraper
 * 3. Adicione o scraper em scripts/scrapers/index.ts
 */

import { Scraper, Edital } from '../types';

export class ExampleScraper implements Scraper {
  readonly name = 'example'; // Nome único do scraper

  async scrape(): Promise<Edital[]> {
    const editais: Edital[] = [];

    // TODO: Implementar lógica de scraping aqui
    // Exemplo:
    // 1. Fazer login (se necessário)
    // 2. Navegar para página de editais
    // 3. Extrair informações de cada edital
    // 4. Baixar PDFs (se necessário)
    // 5. Retornar array de editais

    // Exemplo de edital:
    const edital: Edital = {
      numero: '001/2025',
      titulo: 'Exemplo de Edital',
      descricao: 'Descrição do edital',
      dataPublicacao: '01/01/2025',
      dataEncerramento: '31/12/2025',
      status: 'Ativo',
      valor: 'R$ 100.000,00',
      area: 'Tecnologia',
      orgao: 'Órgão Exemplo',
      fonte: this.name,
      link: 'https://example.com/edital/001',
      pdfUrls: ['https://example.com/pdf/001.pdf'],
      pdfPaths: [], // Preencher após download
      processadoEm: new Date().toISOString(),
    };

    editais.push(edital);

    return editais;
  }

  async cleanup(): Promise<void> {
    // Limpar recursos (fechar navegadores, conexões, etc)
    // Exemplo:
    // if (this.browser) {
    //   await this.browser.close();
    // }
  }
}











