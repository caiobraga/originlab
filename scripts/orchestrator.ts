import * as fs from 'fs';
import * as path from 'path';
import { Scraper, Edital } from './types';

/**
 * Orquestrador que executa múltiplos scrapers e consolida os resultados
 */
export class ScraperOrchestrator {
  private readonly outputDir = path.join(process.cwd(), 'scripts', 'output');
  private readonly jsonFile = path.join(this.outputDir, 'editais.json');
  private scrapers: Scraper[] = [];

  /**
   * Registra um scraper para ser executado
   */
  register(scraper: Scraper) {
    this.scrapers.push(scraper);
  }

  /**
   * Executa todos os scrapers registrados
   */
  async run(): Promise<Edital[]> {
    console.log(`🚀 Iniciando orquestrador com ${this.scrapers.length} scraper(s)...\n`);

    const allEditais: Edital[] = [];
    const errors: Array<{ scraper: string; error: Error }> = [];

    // Executar cada scraper
    for (const scraper of this.scrapers) {
      console.log(`\n📋 Executando scraper: ${scraper.name}`);
      console.log('─'.repeat(50));
      
      try {
        const editais = await scraper.scrape();
        
        // Adicionar fonte se não estiver presente
        const editaisWithSource = editais.map(edital => ({
          ...edital,
          fonte: edital.fonte || scraper.name,
          processadoEm: edital.processadoEm || new Date().toISOString(),
        }));

        allEditais.push(...editaisWithSource);
        console.log(`✅ ${scraper.name}: ${editais.length} edital(is) extraído(s)`);
      } catch (error) {
        const err = error as Error;
        console.error(`❌ Erro no scraper ${scraper.name}:`, err.message);
        errors.push({ scraper: scraper.name, error: err });
      } finally {
        // Limpar recursos do scraper se disponível
        if (scraper.cleanup) {
          try {
            await scraper.cleanup();
          } catch (cleanupError) {
            console.warn(`⚠️ Erro ao limpar recursos do ${scraper.name}:`, cleanupError);
          }
        }
      }
    }

    // Consolidar com dados existentes
    const consolidatedEditais = this.consolidateEditais(allEditais);

    // Salvar JSON consolidado
    this.saveJson(consolidatedEditais);

    // Resumo
    console.log('\n' + '═'.repeat(50));
    console.log('📊 RESUMO DA EXECUÇÃO');
    console.log('═'.repeat(50));
    console.log(`✅ Scrapers executados com sucesso: ${this.scrapers.length - errors.length}/${this.scrapers.length}`);
    console.log(`📄 Total de editais extraídos: ${allEditais.length}`);
    console.log(`💾 Total de editais consolidados: ${consolidatedEditais.length}`);
    
    if (errors.length > 0) {
      console.log(`\n❌ Erros encontrados: ${errors.length}`);
      errors.forEach(({ scraper, error }) => {
        console.log(`   - ${scraper}: ${error.message}`);
      });
    }

    return consolidatedEditais;
  }

  /**
   * Valida se um edital tem título válido
   */
  private isValidEdital(edital: Edital): boolean {
    const titulo = edital.titulo?.trim();
    return !!titulo && 
           titulo.length > 3 && 
           titulo !== 'Sem título' && 
           titulo !== 'N/A' &&
           !titulo.match(/^N\/A\s*-\s*Sem título$/i);
  }

  /**
   * Consolida novos editais com os existentes, evitando duplicatas
   */
  private consolidateEditais(newEditais: Edital[]): Edital[] {
    // Filtrar editais sem título válido antes de consolidar
    const validNewEditais = newEditais.filter(edital => this.isValidEdital(edital));
    const filteredCount = newEditais.length - validNewEditais.length;
    
    if (filteredCount > 0) {
      console.log(`⚠️ ${filteredCount} edital(is) sem título válido foram filtrados durante consolidação`);
    }

    // Carregar editais existentes
    let existingEditais: Edital[] = [];
    
    if (fs.existsSync(this.jsonFile)) {
      try {
        const content = fs.readFileSync(this.jsonFile, 'utf-8');
        const loaded = JSON.parse(content);
        // Filtrar também os existentes
        existingEditais = Array.isArray(loaded) ? loaded.filter((e: Edital) => this.isValidEdital(e)) : [];
      } catch (error) {
        console.warn('⚠️ Erro ao ler editais existentes, criando novo arquivo');
      }
    }

    // Criar mapa de editais existentes (chave: numero + fonte)
    const existingMap = new Map<string, Edital>();
    existingEditais.forEach(edital => {
      const key = this.getEditalKey(edital);
      if (key) {
        existingMap.set(key, edital);
      }
    });

    // Adicionar novos editais ou atualizar existentes
    validNewEditais.forEach(edital => {
      const key = this.getEditalKey(edital);
      if (key) {
        // Se já existe, mesclar informações (priorizar dados mais recentes)
        const existing = existingMap.get(key);
        if (existing) {
          // Mesclar PDFs (evitar duplicatas)
          const mergedPdfUrls = new Set([
            ...(existing.pdfUrls || []),
            ...(edital.pdfUrls || [])
          ]);
          const mergedPdfPaths = new Set([
            ...(existing.pdfPaths || []),
            ...(edital.pdfPaths || [])
          ]);

          existingMap.set(key, {
            ...existing,
            ...edital, // Atualizar com dados mais recentes
            pdfUrls: Array.from(mergedPdfUrls),
            pdfPaths: Array.from(mergedPdfPaths),
            processadoEm: edital.processadoEm || existing.processadoEm,
          });
        } else {
          existingMap.set(key, edital);
        }
      } else {
        // Se não tem chave, adicionar com timestamp como chave temporária
        existingMap.set(`${Date.now()}-${Math.random()}`, edital);
      }
    });

    return Array.from(existingMap.values());
  }

  /**
   * Gera chave única para um edital (numero + fonte)
   */
  private getEditalKey(edital: Edital): string | null {
    if (edital.numero && edital.fonte) {
      return `${edital.fonte}:${edital.numero}`;
    }
    return null;
  }

  /**
   * Salva editais em JSON
   */
  private saveJson(editais: Edital[]): void {
    // Criar diretório se não existir
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Salvar JSON formatado
    fs.writeFileSync(
      this.jsonFile,
      JSON.stringify(editais, null, 2),
      'utf-8'
    );

    console.log(`\n💾 JSON salvo em: ${this.jsonFile}`);
  }
}

