/**
 * Exporta todos os scrapers disponíveis
 */
import { SigfapesScraper } from './sigfapes-scraper';
import { FapesScraper } from './fapes-scraper';
import { CnpqScraper } from './cnpq-scraper';
import { Scraper } from '../types';

// Lista de todos os scrapers
export const scrapers: Scraper[] = [
  // new SigfapesScraper(), // Removido temporariamente - usar apenas FAPES
  new FapesScraper(),
  new CnpqScraper(),
  // Adicionar outros scrapers aqui no futuro:
  // new FapespScraper(),
  // etc.
];

export { SigfapesScraper, FapesScraper, CnpqScraper };




