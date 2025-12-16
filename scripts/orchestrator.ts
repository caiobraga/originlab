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
   * Verifica se um título é um anexo (não é um edital separado)
   */
  private isAnexo(titulo: string): boolean {
    if (!titulo) return false;
    const tituloLower = titulo.toLowerCase().trim();
    return tituloLower.startsWith('anexo') || 
           /^anexo\s+[ivx]+/i.test(tituloLower) ||
           /anexo\s+[ivx]+\s*[–-]/i.test(tituloLower) ||
           (tituloLower.includes('formulário') && tituloLower.includes('anexo')) ||
           (tituloLower.includes('formulario') && tituloLower.includes('anexo')) ||
           tituloLower.includes('anexo i –') ||
           tituloLower.includes('anexo ii') ||
           tituloLower.includes('anexo iii') ||
           tituloLower.includes('anexo iv') ||
           tituloLower.includes('anexo v') ||
           tituloLower.includes('anexo vi') ||
           tituloLower.includes('anexo vii') ||
           tituloLower.includes('anexo viii') ||
           tituloLower.includes('anexo ix') ||
           tituloLower.includes('anexo x');
  }

  /**
   * Gera uma chave única para identificar um edital (evita duplicatas)
   */
  private getEditalKey(edital: Edital): string | null {
    // Priorizar número + fonte (mais confiável)
    if (edital.numero && edital.fonte) {
      return `${edital.fonte}:${edital.numero}`;
    }
    // Fallback: título + fonte
    if (edital.titulo && edital.fonte) {
      const tituloNormalizado = edital.titulo.trim().toLowerCase().substring(0, 100);
      return `${edital.fonte}:${tituloNormalizado}`;
    }
    return null;
  }

  /**
   * Valida se um edital tem título válido
   */
  private isValidEdital(edital: Edital): boolean {
    const titulo = edital.titulo?.trim();
    if (!titulo || 
        titulo.length <= 3 || 
        titulo === 'Sem título' || 
        titulo === 'N/A' ||
        titulo.match(/^N\/A\s*-\s*Sem título$/i)) {
      return false;
    }
    
    // Filtrar anexos
    if (this.isAnexo(titulo)) {
      return false;
    }
    
    return true;
  }

  /**
   * Consolida novos editais com os existentes, evitando duplicatas
   */
  private consolidateEditais(newEditais: Edital[]): Edital[] {
    // Filtrar editais sem título válido antes de consolidar
    const validNewEditais = newEditais.filter(edital => this.isValidEdital(edital));
    
    // Carregar editais existentes para verificar duplicatas
    let existingEditais: Edital[] = [];
    if (fs.existsSync(this.jsonFile)) {
      try {
        const existingData = fs.readFileSync(this.jsonFile, 'utf-8');
        existingEditais = JSON.parse(existingData);
      } catch (e) {
        console.log('⚠️ Erro ao ler editais existentes, criando novo arquivo');
      }
    }
    
    // Criar mapa de editais existentes (chave: numero+fonte ou titulo+fonte)
    const existingMap = new Map<string, Edital>();
    existingEditais.forEach(edital => {
      const key = this.getEditalKey(edital);
      if (key) {
        existingMap.set(key, edital);
      }
    });
    
    // Filtrar duplicatas dos novos editais
    const uniqueNewEditais: Edital[] = [];
    const duplicates: string[] = [];
    
    validNewEditais.forEach(edital => {
      const key = this.getEditalKey(edital);
      if (key && existingMap.has(key)) {
        duplicates.push(`${edital.numero || edital.titulo} (${edital.fonte})`);
      } else {
        uniqueNewEditais.push(edital);
        if (key) {
          existingMap.set(key, edital);
        }
      }
    });
    
    if (duplicates.length > 0) {
      console.log(`\n⚠️ ${duplicates.length} edital(is) duplicado(s) ignorado(s):`);
      duplicates.forEach(dup => console.log(`   - ${dup}`));
    }
    
    // Combinar editais existentes com novos únicos
    const allEditais = [...existingEditais, ...uniqueNewEditais];
    
    // Remover duplicatas finais (caso haja duplicatas dentro dos existentes)
    const finalEditais: Edital[] = [];
    const finalMap = new Map<string, Edital>();
    
    allEditais.forEach(edital => {
      const key = this.getEditalKey(edital);
      if (key) {
        if (!finalMap.has(key)) {
          finalMap.set(key, edital);
          finalEditais.push(edital);
        } else {
          // Se já existe, manter o mais recente (com mais PDFs ou mais recente)
          const existing = finalMap.get(key)!;
          const existingPdfCount = existing.pdfUrls?.length || existing.pdfPaths?.length || 0;
          const newPdfCount = edital.pdfUrls?.length || edital.pdfPaths?.length || 0;
          
          if (newPdfCount > existingPdfCount || 
              (edital.processadoEm && existing.processadoEm && 
               edital.processadoEm > existing.processadoEm)) {
            // Substituir pelo mais recente
            const index = finalEditais.indexOf(existing);
            if (index >= 0) {
              finalEditais[index] = edital;
              finalMap.set(key, edital);
            }
          }
        }
      } else {
        // Se não tem chave única, adicionar mesmo assim (será filtrado depois)
        finalEditais.push(edital);
      }
    });
    
    const filteredCount = newEditais.length - validNewEditais.length;
    
    if (filteredCount > 0) {
      console.log(`⚠️ ${filteredCount} edital(is) sem título válido foram filtrados durante consolidação`);
    }
    
    return finalEditais;
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

