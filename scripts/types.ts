/**
 * Interface comum para todos os scrapers de editais
 */
export interface Edital {
  // Identificação
  numero?: string;
  titulo?: string;
  descricao?: string;
  
  // Datas
  dataPublicacao?: string;
  dataEncerramento?: string;
  
  // Status e informações
  status?: string;
  valor?: string;
  area?: string;
  orgao?: string; // Órgão responsável (ex: FAPES, FAPESP, etc)
  fonte?: string; // Fonte do scraper (ex: "sigfapes", "fapesp", etc)
  
  // Links e documentos
  link?: string;
  pdfUrl?: string; // URL original do PDF
  pdfPath?: string; // Caminho local do PDF (deprecated, usar pdfPaths)
  pdfUrls?: string[]; // URLs originais dos PDFs
  pdfPaths?: string[]; // Caminhos locais dos PDFs
  
  // Metadados
  processadoEm?: string; // ISO timestamp
  [key: string]: any; // Permite campos adicionais específicos de cada scraper
}

/**
 * Interface que todos os scrapers devem implementar
 */
export interface Scraper {
  /**
   * Nome identificador do scraper
   */
  readonly name: string;
  
  /**
   * Executa o scraping e retorna lista de editais
   */
  scrape(): Promise<Edital[]>;
  
  /**
   * Limpa recursos (fecha navegadores, conexões, etc)
   */
  cleanup?(): Promise<void>;
}

















