/**
 * Exporta todos os scrapers disponíveis
 */
import { SigfapesScraper } from './sigfapes-scraper';
import { FapesScraper } from './fapes-scraper';
import { Scraper } from '../types';

// Lista de todos os scrapers
export const scrapers: Scraper[] = [
  new SigfapesScraper(),
  new FapesScraper(),
  // Adicionar outros scrapers aqui no futuro:
  // new FapespScraper(),
  // new CnpqScraper(),
  // etc.
];

export { SigfapesScraper, FapesScraper };




