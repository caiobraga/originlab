/**
 * Exporta todos os scrapers disponíveis
 */
import { SigfapesScraper } from './sigfapes-scraper';
import { FapesScraper } from './fapes-scraper';
import { CnpqScraper } from './cnpq-scraper';
import { FinepScraper } from './finep-scraper';
import { SectiScraper } from './secti-scraper';
import { CaptaScraper } from './capta-scraper';
import { FapemigScraper } from './fapemig-scraper';
import { FaperjScraper } from './faperj-scraper';
import { FapealScraper } from './fapeal-scraper';
import { FapacScraper } from './fapac-scraper';
import { FapeamScraper } from './fapeam-scraper';
import { FuncapScraper } from './funcap-scraper';
import { FapdfScraper } from './fapdf-scraper';
import { FapemaScraper } from './fapema-scraper';
import { FapematScraper } from './fapemat-scraper';
import { FapespaScraper } from './fapespa-scraper';
import { FapesqScraper } from './fapesq-scraper';
import { FacepeScraper } from './facepe-scraper';
import { FapepiScraper } from './fapepi-scraper';
import { FapergsScraper } from './fapergs-scraper';
import { FapernScraper } from './fapern-scraper';
import { FapescScraper } from './fapesc-scraper';
import { FapitecScraper } from './fapitec-scraper';
import { FaptScraper } from './fapt-scraper';
import { ProsasScraper } from './prosas-scraper';
import { PlataformaInovacaoScraper } from './plataforma-inovacao-scraper';
import { RotadofomentoScraper } from './rotadofomento-scraper';
import { Scraper } from '../types';

// Lista de todos os scrapers
export const scrapers: Scraper[] = [
  // new SigfapesScraper(), // Removido temporariamente - usar apenas FAPES
  new FapesScraper(),
  new CnpqScraper(),
  new FinepScraper(),
  new SectiScraper(),
  new CaptaScraper(),
  new FapemigScraper(),
  new FaperjScraper(),
  new FapealScraper(),
  new FapacScraper(),
  new FapeamScraper(),
  new FuncapScraper(),
  new FapdfScraper(),
  new FapemaScraper(),
  new FapematScraper(),
  new FapespaScraper(),
  new FapesqScraper(),
  new FapepiScraper(),
  new FapergsScraper(),
  new FapernScraper(),
  new FapescScraper(),
  new FapitecScraper(),
  new FaptScraper(),
  new ProsasScraper(),
  new PlataformaInovacaoScraper(),
  // Adicionar outros scrapers aqui no futuro:
  // new FapespScraper(),
  // etc.
];

export { SigfapesScraper, FapesScraper, CnpqScraper, FinepScraper, SectiScraper, CaptaScraper, FapemigScraper, FaperjScraper, FapealScraper, FapacScraper, FapeamScraper, FuncapScraper, FapdfScraper, FapemaScraper, FapematScraper, FapespaScraper, FapesqScraper, FacepeScraper, FapepiScraper, FapergsScraper, FapernScraper, FapescScraper, FapitecScraper, FaptScraper, ProsasScraper, PlataformaInovacaoScraper, RotadofomentoScraper };




