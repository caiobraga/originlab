import { Scraper, Edital } from '../types';
import { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export class CnpqScraper implements Scraper {
  readonly name = 'cnpq';
  private browser: Browser | null = null;
  private page: Page | null = null;
  /** URL da listagem de chamadas públicas (Liferay; opcional: CNPQ_CHAMADAS_URL no .env). */
  private readonly editaisUrl =
    process.env.CNPQ_CHAMADAS_URL || 'http://memoria2.cnpq.br/web/guest/chamadas-publicas';
  private readonly outputDir = path.join(process.cwd(), 'scripts', 'output', 'pdfs', 'cnpq');

  private async init() {
    if (this.browser) return;

    const puppeteer = await import('puppeteer');
    this.browser = await puppeteer.default.launch({
      headless: false, // Modo visível para debug
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security', // Permitir downloads de sites não seguros
        '--allow-running-insecure-content', // Permitir conteúdo inseguro
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled', // Evitar detecção de automação
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-default-apps',
        '--window-size=1920,1080'
      ],
      defaultViewport: null,
      ignoreHTTPSErrors: true, // Ignorar erros SSL
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    // Adicionar headers realistas para evitar detecção de bot
    await this.page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await this.page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });
    
    // Configurar para aceitar downloads automaticamente
    const client = await this.page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: this.outputDir,
    });
    
    // Ignorar erros do console do browser (como __name is not a function)
    this.page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('__name') || text.includes('is not defined') || text.includes('is not a function')) {
        // Ignorar esses erros específicos do site
        return;
      }
    });
    
    // Interceptar erros de página antes de navegar
    await this.page.evaluateOnNewDocument(() => {
      // Sobrescrever __name se não existir ou não for função
      if (typeof window !== 'undefined') {
        if (typeof (window as any).__name === 'undefined') {
          (window as any).__name = function() { return ''; };
        } else if (typeof (window as any).__name !== 'function') {
          const originalName = (window as any).__name;
          (window as any).__name = function() { return originalName || ''; };
        }
      }
      
      // Remover propriedades que indicam automação
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });
    
    // Criar diretório de output se não existir
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extrai informações de um edital da lista
   */
  private async extractEditalFromCard(cardElement: any, index: number): Promise<Edital | null> {
    try {
      const editalData = await this.page!.evaluate((element, baseUrl) => {
        const edital: Partial<Edital> = {};
        
        // Extrair título (h4 ou h6 dentro do card)
        const titleElement = element.querySelector('h4, h6, .portlet-title, [class*="title"]');
        if (titleElement) {
          edital.titulo = titleElement.textContent?.trim() || '';
        }
        
        // Extrair número do edital do título
        if (edital.titulo) {
          const numeroMatch = edital.titulo.match(/N[º°°]?\s*(\d+\/\d+)/i) || 
                             edital.titulo.match(/Chamada\s+(?:Pública\s+)?(?:CNPq\s*)?N[º°°]?\s*(\d+\/\d+)/i) ||
                             edital.titulo.match(/(\d+\/\d+)/);
          if (numeroMatch) {
            edital.numero = numeroMatch[1];
          }
        }
        
        // Extrair descrição
        const descElement = element.querySelector('p, .portlet-body, [class*="description"], [class*="content"]');
        if (descElement) {
          edital.descricao = descElement.textContent?.trim() || '';
        }
        
        // Extrair datas de inscrição
        const inscricoesElement = element.querySelector('strong:contains("Inscrições"), b:contains("Inscrições")');
        let inscricoesText = '';
        if (inscricoesElement) {
          inscricoesText = inscricoesElement.textContent || '';
        } else {
          // Tentar encontrar texto que contenha "Inscrições"
          const allText = element.textContent || '';
          const inscricoesMatch = allText.match(/Inscrições[:\s]+([^]*?)(?:\n|$)/i);
          if (inscricoesMatch) {
            inscricoesText = inscricoesMatch[1];
          }
        }
        
        // Extrair datas do texto de inscrições
        const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
        const dates = inscricoesText.match(datePattern) || [];
        if (dates.length > 0) {
          edital.dataPublicacao = dates[0];
          if (dates.length > 1) {
            edital.dataEncerramento = dates[dates.length - 1];
          } else {
            edital.dataEncerramento = dates[0];
          }
        }
        
        // Extrair link permanente ou link da chamada
        const linkElement = element.querySelector('a[href*="chamada"], a[href*="edital"], a[href*="link-permanente"]');
        if (linkElement) {
          const href = (linkElement as HTMLAnchorElement).href;
          if (href && !href.startsWith('javascript:')) {
            edital.link = href.startsWith('http') ? href : new URL(href, baseUrl).href;
          }
        }
        
        // Procurar por links de PDF
        const pdfLinks: string[] = [];
        const allLinks = element.querySelectorAll('a[href*=".pdf"], a[href*="download"]');
        allLinks.forEach((link: any) => {
          const href = link.href;
          if (href && (href.includes('.pdf') || href.includes('download'))) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
            if (!pdfLinks.includes(fullUrl)) {
              pdfLinks.push(fullUrl);
            }
          }
        });
        
        if (pdfLinks.length > 0) {
          edital.pdfUrls = pdfLinks;
        }
        
        // Definir órgão
        edital.orgao = 'CNPq';
        
        return edital;
      }, cardElement, this.editaisUrl);
      
      if (!editalData.titulo) {
        console.log(`  ⚠️ Edital ${index + 1}: Título não encontrado, pulando...`);
        return null;
      }
      
      const edital: Edital = {
        ...editalData,
        fonte: this.name,
        status: 'Ativo', // Assumir ativo se está na lista de abertas
        processadoEm: new Date().toISOString(),
      };
      
      console.log(`  ✅ Edital extraído: ${edital.titulo?.substring(0, 60)}...`);
      
      return edital;
    } catch (error) {
      console.error(`  ❌ Erro ao extrair edital ${index + 1}:`, error);
      return null;
    }
  }

  /**
   * Baixa PDFs de um edital
   */
  private async downloadPdf(pdfUrl: string, editalNumero: string): Promise<string | null> {
    try {
      // IMPORTANTE: Não filtrar URLs sem .pdf ou /documents/ - podem ser PDFs sem extensão
      // O sistema tentará baixar e validar se é PDF pelo magic number (%PDF)
      // Apenas logar para debug
      if (!pdfUrl.includes('.pdf') && !pdfUrl.includes('/documents/')) {
        console.log(`    🔍 URL sem extensão .pdf ou /documents/, tentando baixar mesmo assim: ${pdfUrl.substring(0, 80)}...`);
      }
      
      const url = new URL(pdfUrl);
      let filename = path.basename(url.pathname) || `edital-${editalNumero || 'unknown'}`;
      
      // Garantir que tenha extensão .pdf
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename = `${filename}.pdf`;
      }
      
      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = path.join(this.outputDir, safeFilename);
      
      // Se já existe, verificar se é realmente PDF
      if (fs.existsSync(filePath)) {
        const existingFile = fs.readFileSync(filePath);
        // Verificar magic number do PDF (%PDF)
        const isPdf = existingFile.length >= 4 && 
                      existingFile[0] === 0x25 && 
                      existingFile[1] === 0x50 && 
                      existingFile[2] === 0x44 && 
                      existingFile[3] === 0x46;
        
        if (isPdf) {
          console.log(`    📄 PDF já existe: ${safeFilename}`);
          return filePath;
        } else {
          // Remover arquivo que não é PDF
          console.log(`    🗑️ Removendo arquivo que não é PDF: ${safeFilename}`);
          fs.unlinkSync(filePath);
        }
      }
      
      console.log(`    📥 Baixando PDF: ${safeFilename}...`);
      
      // Navegar para a URL e aguardar o download
      // Primeiro, tentar clicar no link se estiver na página
      try {
        // Verificar se o link está na página atual
        const linkExists = await this.page!.evaluate((url) => {
          const links = document.querySelectorAll(`a[href="${url}"], a[href*="${url.split('/').pop()}"]`);
          return links.length > 0;
        }, pdfUrl);
        
        if (linkExists) {
          // Clicar no link para iniciar o download
          await this.page!.evaluate((url) => {
            const links = document.querySelectorAll(`a[href="${url}"], a[href*="${url.split('/').pop()}"]`);
            if (links.length > 0) {
              (links[0] as HTMLAnchorElement).click();
            }
          }, pdfUrl);
          
          // Aguardar um pouco para o download iniciar
          await this.delay(2000);
        } else {
          // Se o link não está na página, navegar diretamente
          await this.page!.goto(pdfUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
          });
          await this.delay(2000);
        }
      } catch (error: any) {
        console.log(`    ⚠️ Erro ao navegar/clicar no link: ${error.message}`);
      }
      
      // Usar Puppeteer para baixar (mantém cookies/sessão)
      const fileData = await this.page!.evaluate(async (url) => {
        try {
          const response = await fetch(url, {
            credentials: 'include',
            mode: 'no-cors', // Permitir requisições cross-origin
            headers: {
              'Accept': 'application/pdf,application/octet-stream,*/*',
            }
          });
          
          if (!response.ok && response.status !== 0) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const contentType = response.headers.get('content-type') || '';
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Verificar magic number do PDF (%PDF)
          const isPdf = uint8Array.length >= 4 && 
                        uint8Array[0] === 0x25 && 
                        uint8Array[1] === 0x50 && 
                        uint8Array[2] === 0x44 && 
                        uint8Array[3] === 0x46;
          
          return {
            data: Array.from(uint8Array),
            contentType: contentType,
            isPdf: isPdf,
            size: uint8Array.length
          };
        } catch (error: any) {
          // Se fetch falhar, tentar usar XMLHttpRequest
          return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function() {
              const uint8Array = new Uint8Array(xhr.response);
              const isPdf = uint8Array.length >= 4 && 
                            uint8Array[0] === 0x25 && 
                            uint8Array[1] === 0x50 && 
                            uint8Array[2] === 0x44 && 
                            uint8Array[3] === 0x46;
              
              resolve({
                data: Array.from(uint8Array),
                contentType: xhr.getResponseHeader('content-type') || '',
                isPdf: isPdf,
                size: uint8Array.length
              });
            };
            xhr.onerror = function() {
              resolve({
                data: [],
                contentType: '',
                isPdf: false,
                size: 0
              });
            };
            xhr.send();
          });
        }
      }, pdfUrl);
      
      // Validar se é realmente um PDF
      if (!fileData.isPdf && !fileData.contentType.includes('pdf')) {
        console.log(`    ⚠️ Arquivo não é PDF (tipo: ${fileData.contentType}), pulando...`);
        return null;
      }
      
      if (fileData.size === 0) {
        console.log(`    ⚠️ Arquivo vazio, pulando...`);
        return null;
      }
      
      // Converter array de números para Buffer
      const buffer = Buffer.from(fileData.data);
      
      // Salvar arquivo
      fs.writeFileSync(filePath, buffer);
      console.log(`    ✅ PDF salvo: ${safeFilename} (${(buffer.length / 1024).toFixed(2)} KB)`);
      
      return filePath;
    } catch (error: any) {
      console.error(`    ❌ Erro ao baixar PDF ${pdfUrl.substring(0, 80)}...:`, error.message);
      return null;
    }
  }

  /**
   * Tenta navegar para uma URL com retry e backoff exponencial
   */
  private async navigateWithRetry(url: string, maxRetries: number = 3, useWaitUntil: 'networkidle0' | 'domcontentloaded' | 'load' = 'networkidle0'): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📍 Tentativa ${attempt}/${maxRetries}: Acessando ${url}`);
        
        // Para links resultado.cnpq.br, usar estratégia diferente
        if (url.includes('resultado.cnpq.br')) {
          // Tentar com waitUntil mais tolerante e timeout maior
          try {
            await this.page!.goto(url, { 
              waitUntil: 'load', // Mais tolerante
              timeout: 120000, // Timeout ainda maior para resultado.cnpq.br
            });
            await this.delay(5000); // Aguardar mais tempo para JavaScript carregar
            
            // Verificar se a página carregou
            const pageTitle = await this.page!.title();
            if (pageTitle && !pageTitle.includes('Error') && !pageTitle.includes('Erro')) {
              console.log(`✅ Página carregada com sucesso: ${pageTitle.substring(0, 50)}...`);
              return;
            }
          } catch (gotoError: any) {
            // Se goto falhar, tentar com domcontentloaded
            console.log(`    ⚠️ Tentativa com 'load' falhou, tentando 'domcontentloaded'...`);
            await this.page!.goto(url, { 
              waitUntil: 'domcontentloaded',
              timeout: 120000,
            });
            await this.delay(5000);
            
            const pageTitle = await this.page!.title();
            if (pageTitle && !pageTitle.includes('Error') && !pageTitle.includes('Erro')) {
              console.log(`✅ Página carregada com sucesso: ${pageTitle.substring(0, 50)}...`);
              return;
            }
          }
        } else {
          await this.page!.goto(url, { 
            waitUntil: useWaitUntil,
            timeout: 90000,
          });
          
          // Aguardar um pouco após carregar
          await this.delay(3000);
          
          // Verificar se a página carregou corretamente
          const pageTitle = await this.page!.title();
          if (pageTitle && !pageTitle.includes('Error') && !pageTitle.includes('Erro')) {
            console.log(`✅ Página carregada com sucesso: ${pageTitle.substring(0, 50)}...`);
            return; // Sucesso!
          }
        }
        
        throw new Error('Página não carregou corretamente');
      } catch (error: any) {
        lastError = error;
        const errorMsg = error.message || String(error);
        
        // Se for ERR_ABORTED, pode ser que o site esteja bloqueando ou redirecionando
        if (errorMsg.includes('ERR_ABORTED') || errorMsg.includes('net::ERR')) {
          console.log(`    ⚠️ Erro de rede (${errorMsg}) - pode ser bloqueio ou redirecionamento`);
          
          // Tentar aguardar mais tempo e verificar se a página carregou mesmo assim
          await this.delay(5000);
          
          try {
            const currentUrl = this.page!.url();
            const pageTitle = await this.page!.title();
            
            // IMPORTANTE: Se a URL mudou para uma página diferente (redirecionamento),
            // NÃO considerar sucesso - isso significa que o link falhou
            if (currentUrl !== url) {
              // Verificar se foi redirecionado para página principal ou outra página
              if (currentUrl.includes('chamadas-publicas') && !url.includes('chamadas-publicas')) {
                console.log(`    ⚠️ Redirecionado para página principal (esperado: ${url.substring(0, 60)}..., atual: ${currentUrl.substring(0, 60)}...)`);
                throw new Error(`Redirecionado para página diferente: ${currentUrl}`);
              }
              // Se foi redirecionado mas ainda está no mesmo domínio resultado.cnpq.br, pode ser OK
              if (!currentUrl.includes('resultado.cnpq.br') && url.includes('resultado.cnpq.br')) {
                console.log(`    ⚠️ Redirecionado para fora de resultado.cnpq.br`);
                throw new Error(`Redirecionado para fora do domínio esperado`);
              }
            }
            
            // Se a URL é a mesma e a página tem título válido, pode ter carregado mesmo com erro
            if (currentUrl === url && pageTitle && !pageTitle.includes('Error')) {
              console.log(`    ✅ Página pode ter carregado apesar do erro (URL: ${currentUrl.substring(0, 60)}...)`);
              return; // Considerar sucesso apenas se a URL for a mesma
            }
          } catch (checkError: any) {
            // Se não conseguir verificar ou foi redirecionado, continuar para próxima tentativa
            if (checkError.message) {
              throw checkError; // Re-lançar erro de redirecionamento
            }
          }
        }
        
        if (attempt < maxRetries) {
          // Backoff exponencial: 5s, 10s, 20s
          const delayMs = 5000 * Math.pow(2, attempt - 1);
          console.log(`⚠️ Erro na tentativa ${attempt}: ${errorMsg}`);
          console.log(`   Aguardando ${delayMs / 1000}s antes de tentar novamente...`);
          await this.delay(delayMs);
          
          // Tentar recarregar a página se ainda estiver aberta
          try {
            await this.page!.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await this.delay(2000);
          } catch (reloadError) {
            // Se recarregar falhar, continuar para próxima tentativa
          }
        } else {
          console.error(`❌ Todas as ${maxRetries} tentativas falharam`);
        }
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    throw lastError || new Error('Falha ao navegar para a URL após múltiplas tentativas');
  }

  async scrape(): Promise<Edital[]> {
    await this.init();

    try {
      // Usar retry logic para navegar
      await this.navigateWithRetry(this.editaisUrl);
      await this.delay(5000); // Aguardar carregamento completo adicional
      
      console.log('🔍 Procurando editais na página...');
      
      // Extrair todos os cards de editais
      const editaisCards = await this.page!.evaluate(() => {
        // Procurar por diferentes seletores possíveis
        const selectors = [
          '.portlet-content',
          '.portlet-body',
          '[class*="chamada"]',
          '[class*="edital"]',
          '.search-results > div',
          'article',
          '.result-item',
        ];
        
        const cards: Element[] = [];
        
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach(el => {
              // Verificar se contém título (h4, h6, etc)
              const hasTitle = el.querySelector('h4, h6, h3, .portlet-title');
              if (hasTitle && !cards.includes(el)) {
                cards.push(el);
              }
            });
          }
        }
        
        return cards.length;
      });
      
      console.log(`📊 Encontrados aproximadamente ${editaisCards} elementos para processar`);
      
      // Extrair informações de cada edital
      const allEditais: Edital[] = [];
      
      // Usar evaluate para extrair todos os editais de uma vez
      // Estrutura: cada edital está dentro de um elemento com classe "content"
      const editaisData = await this.page!.evaluate((baseUrl) => {
        const editais: any[] = [];
        
        // IMPORTANTE: Buscar cards de editais através dos <li> que contêm títulos de chamadas
        // Isso garante que cada card seja isolado e não pegue links de outros cards
        const listItems = Array.from(document.querySelectorAll('li'));
        const processedTitles = new Set<string>();
        
        listItems.forEach((listItem) => {
          // Procurar título dentro do <li>
          const titleElement = listItem.querySelector('h1, h2, h3, h4, h5, h6, .title, [class*="title"]');
          if (!titleElement) return;
          
          const headingText = titleElement.textContent?.trim() || '';
          
          // Verificar se é um título de chamada (contém número de chamada ou palavra "Chamada")
          if (!headingText.match(/N[º°°]?\s*\d+\/\d+/i) && !headingText.match(/Chamada/i)) {
            return; // Não é um título de chamada
          }
          
          // Evitar duplicatas
          if (processedTitles.has(headingText)) {
            return;
          }
          processedTitles.add(headingText);
          
          // Usar o <li> como container principal, não apenas .content
          // Isso garante isolamento entre cards
          const cardContainer = listItem; // Container isolado para este card específico
          const contentEl = cardContainer.querySelector('.content') || cardContainer;
          
          const edital: any = {};
          edital.titulo = headingText;
          
          // Número do edital
          const numeroMatch = headingText.match(/N[º°°]?\s*(\d+\/\d+)/i) || 
                             headingText.match(/Chamada\s+(?:Pública\s+)?(?:CNPq\s*)?N[º°°]?\s*(\d+\/\d+)/i) ||
                             headingText.match(/(\d+\/\d+)/);
          if (numeroMatch) {
            edital.numero = numeroMatch[1];
          }
          
          const contentText = contentEl.textContent || '';
          
          // Descrição - pegar texto após o título, removendo o título
          let descText = contentText.replace(headingText, '').trim();
          // Remover linhas muito curtas e espaços extras
          const descLines = descText.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 20)
            .slice(0, 10)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (descLines.length > 50) {
            edital.descricao = descLines.substring(0, 1500);
          }
          
          // Extrair datas de inscrição
          const inscricoesMatch = contentText.match(/Inscrições[:\s]+([^]*?)(?:\n\n|\n[A-Z]|$)/i);
          let inscricoesText = '';
          if (inscricoesMatch) {
            inscricoesText = inscricoesMatch[1];
          }
          
          // Extrair datas
          const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
          const dates = inscricoesText.match(datePattern) || contentText.match(datePattern) || [];
          if (dates.length > 0) {
            // Remover duplicatas
            const uniqueDates = [...new Set(dates)];
            edital.dataPublicacao = uniqueDates[0];
            if (uniqueDates.length > 1) {
              edital.dataEncerramento = uniqueDates[uniqueDates.length - 1];
            } else {
              edital.dataEncerramento = uniqueDates[0];
            }
          }
          
          // Links - procurar link dentro do card específico
          const allContentLinks = cardContainer.querySelectorAll('a[href]');
          const validLinks: Array<{href: string, text: string}> = [];
          
          allContentLinks.forEach((linkEl: any) => {
            const href = linkEl.href;
            const linkText = (linkEl.textContent || '').toLowerCase().trim();
            
            // Filtrar links inválidos
            if (!href || href.startsWith('javascript:') || href.includes('#')) return;
            // NÃO filtrar resultado.cnpq.br - essas páginas podem conter PDFs
            if (href.includes('facebook.com') || href.includes('twitter.com') || 
                href.includes('whatsapp.com') || href.includes('linkedin.com') ||
                href.includes('mailto:') || href.includes('tel:') ||
                href.includes('sharer') || href.includes('share')) return;
            
            const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
            
            // Aceitar apenas links do CNPq
            if ((fullUrl.includes('memoria2.cnpq.br') || fullUrl.includes('web/guest') || 
                fullUrl.includes('chamadas-publicas') || fullUrl.includes('cnpq.br')) &&
                !fullUrl.endsWith('#') && fullUrl !== baseUrl) {
              validLinks.push({href: fullUrl, text: linkText});
            }
          });
          
          // Priorizar links com texto "Chamada" ou "Link Permanente"
          const chamadaLink = validLinks.find(l => 
            l.text === 'chamada' || l.text === 'link permanente' ||
            (l.text.includes('chamada') && l.text.length < 20 && !l.text.includes('facebook')) ||
            (l.text.includes('link permanente') && l.text.length < 30)
          );
          
          if (chamadaLink) {
            edital.link = chamadaLink.href;
          } else if (validLinks.length > 0) {
            edital.link = validLinks[0].href;
          } else if (edital.numero) {
            // Construir URL baseada no número da chamada
            edital.link = `${baseUrl}?chamada=${edital.numero}`;
          }
          
          // IMPORTANTE: Definir o link do edital ANTES de coletar links resultado.cnpq.br
          // Isso permite validar se os links resultado.cnpq.br pertencem ao edital específico
          const editalLinkId = edital.link ? edital.link.split('/').pop() || '' : '';
          
          // PDFs - BUSCA QUALIFICADA com múltiplas estratégias
          // IMPORTANTE: Coletar também links resultado.cnpq.br (não têm .pdf mas contêm PDFs)
          const pdfLinks: string[] = [];
          const resultadoLinks: string[] = [];
          const seenPdfUrls = new Set<string>();
          
          function addPdfLink(href: string) {
            if (!href) return;
            const normalized = href.split('#')[0].split('?')[0].toLowerCase();
            if (!seenPdfUrls.has(normalized) && 
                href.indexOf('carta ao cidadão') === -1 &&
                href.indexOf('carta de serviços') === -1) {
              try {
                const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
                seenPdfUrls.add(normalized);
                
                // Separar links resultado.cnpq.br dos outros
                if (fullUrl.indexOf('resultado.cnpq.br') !== -1) {
                  // Não adicionar diretamente aqui - usar addResultadoLink para validação
                  addResultadoLink(href);
                } else {
                  pdfLinks.push(fullUrl);
                }
              } catch (e) {}
            }
          }
          
          function addResultadoLink(href: string) {
            if (!href) return;
            const normalized = href.split('#')[0].split('?')[0].toLowerCase();
            if (!seenPdfUrls.has(normalized)) {
              try {
                const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
                // IMPORTANTE: Validar que o link resultado.cnpq.br seja específico deste edital
                // Links resultado.cnpq.br devem ter um ID único (geralmente numérico longo)
                const urlId = fullUrl.split('/').pop() || '';
                
                // CRÍTICO: Verificar se o link está relacionado ao edital atual
                // Usar editalLinkId e edital.link que foram definidos antes desta função
                let isRelatedToEdital = false;
                if (editalLinkId && edital.link) {
                  // Verificar se o ID do resultado.cnpq.br está relacionado ao link do edital
                  // Ou se o link do edital contém o mesmo ID
                  if (urlId === editalLinkId || edital.link.includes(urlId) || fullUrl.includes(editalLinkId)) {
                    isRelatedToEdital = true;
                  }
                }
                // Se não temos link do edital, não aceitar links resultado.cnpq.br
                // Isso evita coletar links genéricos que aparecem em múltiplos editais
                
                // Aceitar apenas se:
                // 1. O ID for válido (mais de 5 caracteres, geralmente numérico)
                // 2. E estiver relacionado ao edital atual (precisamos ter link do edital E estar relacionado)
                const isValidId = urlId.length > 5 && /^\d+$/.test(urlId);
                const shouldAccept = isValidId && isRelatedToEdital;
                
                if (shouldAccept) {
                  seenPdfUrls.add(normalized);
                  resultadoLinks.push(fullUrl);
                } else {
                  // Log apenas se for um ID válido mas não relacionado (para debug)
                  if (isValidId) {
                    console.log(`      ⚠️ Link resultado.cnpq.br ignorado (não relacionado ao edital atual): ${fullUrl.substring(0, 80)}...`);
                    if (edital.link) {
                      console.log(`         Link do edital: ${edital.link.substring(0, 80)}... | ID do edital: ${editalLinkId} | ID do link: ${urlId}`);
                    }
                  }
                }
              } catch (e) {}
            }
          }
          
          // ESTRATÉGIA 1: Buscar TODOS os links no card específico (incluindo resultado.cnpq.br)
          // CRÍTICO: Usar cardContainer (que é o listItem) para garantir isolamento entre cards
          // Isso evita coletar links de outros editais na página
          const allLinks = cardContainer.querySelectorAll('a[href]');
          
          // Debug: contar links encontrados
          let totalLinksFound = 0;
          let resultadoLinksFound = 0;
          let pdfLinksFound = 0;
          
          allLinks.forEach((link: any) => {
            const href = link.href || link.getAttribute('href') || '';
            const linkText = (link.textContent || '').toLowerCase().trim();
            const parentText = (link.parentElement?.textContent || '').toLowerCase();
            
            if (!href) return;
            totalLinksFound++;
            
            // Coletar links resultado.cnpq.br (não têm .pdf mas contêm PDFs)
            if (href.indexOf('resultado.cnpq.br') !== -1) {
              resultadoLinksFound++;
              addResultadoLink(href);
            }
            
            // Coletar links .pdf e /documents/
            if (href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1) {
              if (linkText.indexOf('carta ao cidadão') === -1 &&
                  linkText.indexOf('carta de serviços') === -1 &&
                  parentText.indexOf('carta ao cidadão') === -1 &&
                  parentText.indexOf('carta de serviços') === -1) {
                pdfLinksFound++;
                addPdfLink(href);
              }
            }
            
            // Coletar links com texto relacionado a PDF/edital mesmo sem .pdf na URL
            if ((linkText.includes('pdf') || linkText.includes('edital') || 
                 linkText.includes('chamada') || linkText.includes('baixar') ||
                 linkText.includes('download') || linkText.includes('anexo')) &&
                href.indexOf('http') !== -1 && 
                href.indexOf('resultado.cnpq.br') === -1 &&
                href.indexOf('carta ao cidadão') === -1) {
              // Verificar se é um link que pode levar a PDF
              if (href.indexOf('/documents/') !== -1 || 
                  href.indexOf('/Media/') !== -1 ||
                  href.indexOf('/Editais/') !== -1 ||
                  href.indexOf('download') !== -1) {
                pdfLinksFound++;
                addPdfLink(href);
              }
            }
          });
          
          // Debug: mostrar estatísticas
          if (totalLinksFound > 0) {
            console.log(`      🔍 Debug listagem: ${totalLinksFound} links totais, ${resultadoLinksFound} resultado.cnpq.br, ${pdfLinksFound} PDFs`);
          }
          
          // ESTRATÉGIA 2: Buscar botões com texto relacionado
          // CRÍTICO: Usar cardContainer para garantir isolamento entre cards
          const buttons = cardContainer.querySelectorAll('button, a.btn, .btn, [class*="button"], [class*="btn"], [role="button"]');
          buttons.forEach((btn: any) => {
            const btnText = (btn.textContent || '').toLowerCase().trim();
            if (btnText.includes('chamada') || btnText.includes('pdf') || 
                btnText.includes('baixar') || btnText.includes('download') ||
                btnText.includes('edital') || btnText.includes('anexo')) {
              const linkInBtn = btn.querySelector('a[href]') || btn;
              const href = linkInBtn.href || linkInBtn.getAttribute('href') || linkInBtn.getAttribute('data-href') || '';
              
              if (href) {
                // Coletar links resultado.cnpq.br
                if (href.indexOf('resultado.cnpq.br') !== -1) {
                  addResultadoLink(href);
                }
                // Coletar outros links relacionados a PDF
                if (href.includes('.pdf') || href.includes('/documents/') ||
                    href.includes('/Media/') || href.includes('/Editais/')) {
                  addPdfLink(href);
                }
              }
            }
          });
          
          // ESTRATÉGIA 3: Buscar em listas (li) com texto relacionado
          const listItems = cardContainer.querySelectorAll('li, [class*="list-item"]');
          listItems.forEach((li: any) => {
            const liText = (li.textContent || '').toLowerCase();
            const linkInLi = li.querySelector('a[href]');
            
            if (linkInLi && (liText.includes('anexo') || liText.includes('faq') || 
                liText.includes('pdf') || liText.includes('documento') ||
                liText.includes('edital') || liText.includes('chamada') ||
                liText.includes('download') || liText.includes('baixar'))) {
              const href = (linkInLi as any).href || linkInLi.getAttribute('href') || '';
              if (href && (href.includes('.pdf') || href.includes('/documents/'))) {
                const linkText = (linkInLi.textContent || '').toLowerCase();
                if (linkText.indexOf('carta ao cidadão') === -1 &&
                    linkText.indexOf('carta de serviços') === -1) {
                  addPdfLink(href);
                }
              }
            }
          });
          
          // ESTRATÉGIA 4: Buscar em atributos data-*
          const dataElements = cardContainer.querySelectorAll('[data-href], [data-url], [data-pdf], [data-document], [data-link]');
          dataElements.forEach((el: any) => {
            const dataHref = el.getAttribute('data-href') || 
                            el.getAttribute('data-url') || 
                            el.getAttribute('data-pdf') ||
                            el.getAttribute('data-document') ||
                            el.getAttribute('data-link') || '';
            if (dataHref && (dataHref.includes('.pdf') || dataHref.includes('/documents/'))) {
              addPdfLink(dataHref);
            }
          });
          
          // ESTRATÉGIA 5: Buscar em tabelas
          const tables = cardContainer.querySelectorAll('table');
          tables.forEach((table: any) => {
            const tableLinks = table.querySelectorAll('a[href]');
            tableLinks.forEach((link: any) => {
              const href = link.href || link.getAttribute('href') || '';
              if (href && (href.includes('.pdf') || href.includes('/documents/'))) {
                const linkText = (link.textContent || '').toLowerCase();
                if (linkText.indexOf('carta ao cidadão') === -1) {
                  addPdfLink(href);
                }
              }
            });
          });
          
          // IMPORTANTE: Buscar também o PDF do botão "Chamada" na listagem
          // ACEITAR QUALQUER href do botão "Chamada", não apenas PDFs diretos
          const chamadaButtonPdf = (() => {
            const chamadaButtons = cardContainer.querySelectorAll('button, a.btn, .btn, [class*="button"], [class*="btn"], a, [role="button"]');
            for (let btnIdx = 0; btnIdx < chamadaButtons.length; btnIdx++) {
              const btn = chamadaButtons[btnIdx];
              const btnText = (btn.textContent || '').toLowerCase().trim();
              const btnHref = (btn as any).href || btn.getAttribute('href') || btn.getAttribute('data-href') || '';
              
              // Procurar botão com texto "Chamada" - ACEITAR QUALQUER href válido
              if (btnText === 'chamada' || 
                  (btnText.includes('chamada') && btnText.length < 30 && !btnText.includes('chamadas'))) {
                // Aceitar qualquer href válido do botão "Chamada"
                if (btnHref && btnHref.indexOf('http') !== -1 && !btnHref.includes('javascript:')) {
                  try {
                    const fullUrl = btnHref.startsWith('http') ? btnHref : new URL(btnHref, baseUrl).href;
                    // Filtrar apenas páginas de navegação genéricas
                    if (!fullUrl.includes('/web/guest/chamadas') && 
                        !fullUrl.includes('/web/guest/apresentacao') &&
                        !fullUrl.includes('/web/guest/organograma')) {
                      return fullUrl;
                    }
                  } catch (e) {}
                }
                
                // Verificar se tem link dentro do botão
                const linkInBtn = btn.querySelector('a[href]');
                if (linkInBtn) {
                  const linkHref = (linkInBtn as any).href || linkInBtn.getAttribute('href') || '';
                  if (linkHref && linkHref.indexOf('http') !== -1 && !linkHref.includes('javascript:')) {
                    try {
                      const fullUrl = linkHref.startsWith('http') ? linkHref : new URL(linkHref, baseUrl).href;
                      if (!fullUrl.includes('/web/guest/chamadas') && 
                          !fullUrl.includes('/web/guest/apresentacao')) {
                        return fullUrl;
                      }
                    } catch (e) {}
                  }
                }
              }
            }
            return null;
          })();
          
          // Combinar links PDF diretos com links resultado.cnpq.br e PDF do botão Chamada
          const allPdfUrlsRaw = [...pdfLinks, ...resultadoLinks];
          
          // IMPORTANTE: Adicionar SEMPRE o href do botão "Chamada" à lista
          // Mesmo que não tenha .pdf ou /documents/, pode ser um PDF sem extensão ou uma página com PDF
          if (chamadaButtonPdf && !allPdfUrlsRaw.includes(chamadaButtonPdf)) {
            allPdfUrlsRaw.unshift(chamadaButtonPdf);
            console.log(`      📎 Link do botão "Chamada" encontrado na listagem: ${chamadaButtonPdf.substring(0, 60)}...`);
            console.log(`      ✅ Link do botão "Chamada" adicionado à lista de downloads`);
          }
          
          // CRÍTICO: Filtrar links resultado.cnpq.br para garantir que pertencem ao edital específico
          const editalLinkIdForInitial = edital.link ? edital.link.split('/').pop() || '' : '';
          const allPdfUrls = allPdfUrlsRaw.filter((url: string) => {
            if (url.includes('resultado.cnpq.br')) {
              const urlId = url.split('/').pop() || '';
              if (editalLinkIdForInitial && edital.link && edital.link.includes('resultado.cnpq.br')) {
                const isValid = urlId === editalLinkIdForInitial;
                if (!isValid) {
                  console.log(`      ⚠️ Filtrando link resultado.cnpq.br da extração inicial: ${url.substring(0, 80)}... (ID esperado: ${editalLinkIdForInitial}, encontrado: ${urlId})`);
                }
                return isValid;
              }
              // Se o link do edital não é resultado.cnpq.br, não aceitar links resultado.cnpq.br genéricos
              console.log(`      ⚠️ Filtrando link resultado.cnpq.br genérico da extração inicial: ${url.substring(0, 80)}...`);
              return false;
            }
            return true; // Aceitar outros tipos de links
          });
          
          // NOTA: Não adicionar campos de debug ao edital - eles não devem ser salvos no JSON
          
          if (allPdfUrls.length > 0) {
            edital.pdfUrls = allPdfUrls;
          }
          
          edital.orgao = 'CNPq';
          
          if (edital.titulo && edital.titulo.length > 10) {
            editais.push(edital);
          }
        });
        
        return editais;
      }, this.editaisUrl);
      
      console.log(`\n📋 Extraídos ${editaisData.length} editais`);
      
      // IMPORTANTE: Remover editais duplicados antes de processar
      const seenEditais = new Map<string, number>(); // chave -> índice
      const uniqueEditaisData: any[] = [];
      
      for (let i = 0; i < editaisData.length; i++) {
        const editalData = editaisData[i];
        // Criar chave única baseada em número ou título
        const editalKey = editalData.numero 
          ? `numero:${editalData.numero}` 
          : editalData.titulo 
            ? `titulo:${editalData.titulo.toLowerCase().trim().replace(/\s+/g, ' ')}`
            : `index:${i}`;
        
        if (!seenEditais.has(editalKey)) {
          seenEditais.set(editalKey, uniqueEditaisData.length);
          uniqueEditaisData.push(editalData);
        } else {
          const existingIdx = seenEditais.get(editalKey)!;
          console.log(`  ⚠️ Edital duplicado encontrado: ${editalData.titulo?.substring(0, 50)}... (mantendo primeiro)`);
          // Se este edital tem mais informações (mais PDFs), substituir
          const existing = uniqueEditaisData[existingIdx];
          const existingPdfCount = (existing.pdfUrls || []).length;
          const newPdfCount = (editalData.pdfUrls || []).length;
          if (newPdfCount > existingPdfCount) {
            uniqueEditaisData[existingIdx] = editalData;
            console.log(`  ✅ Substituído por versão com mais PDFs (${newPdfCount} vs ${existingPdfCount})`);
          }
        }
      }
      
      console.log(`📋 Após remoção de duplicatas: ${uniqueEditaisData.length} editais únicos`);
      
      // Processar cada edital e baixar PDFs
      for (let i = 0; i < uniqueEditaisData.length; i++) {
        const editalData = uniqueEditaisData[i];
        console.log(`\n📄 Processando edital ${i + 1}/${uniqueEditaisData.length}: ${editalData.titulo?.substring(0, 60)}...`);
        
        // Remover campos de debug antes de criar o edital
        const { _debug, ...editalDataClean } = editalData as any;
        
        const edital: Edital = {
          ...editalDataClean,
          fonte: this.name,
          status: 'Ativo',
          processadoEm: new Date().toISOString(),
          pdfPaths: [],
        };
        
        // Debug: mostrar informações do edital
        if (edital.link) {
          console.log(`  🔗 Link: ${edital.link.substring(0, 100)}...`);
        }
        if (edital.pdfUrls && edital.pdfUrls.length > 0) {
          console.log(`  📎 PDFs encontrados na listagem: ${edital.pdfUrls.length}`);
        }
        
        // Debug: mostrar informações do edital
        console.log(`  🔗 Link: ${edital.link ? edital.link.substring(0, 100) + '...' : 'não encontrado'}`);
        
        // SEMPRE navegar para página de detalhes para buscar TODOS os PDFs
        // (mesmo que já tenhamos encontrado alguns na listagem, pode haver mais)
        // CRÍTICO: Filtrar links resultado.cnpq.br da listagem para garantir que pertencem ao edital específico
        const editalLinkIdForFilter = edital.link ? edital.link.split('/').pop() || '' : '';
        const rawPdfsFromListagem = Array.isArray(edital.pdfUrls) ? edital.pdfUrls : [];
        
        // Filtrar links resultado.cnpq.br que não pertencem ao edital específico
        const pdfsFromListagem = rawPdfsFromListagem.filter((url: any) => {
          if (!url || typeof url !== 'string') return false;
          if (url.includes('resultado.cnpq.br')) {
            const urlId = url.split('/').pop() || '';
            // Aceitar apenas se o ID corresponder ao link do edital
            if (editalLinkIdForFilter && edital.link && edital.link.includes('resultado.cnpq.br')) {
              const isValid = urlId === editalLinkIdForFilter;
              if (!isValid) {
                console.log(`  ⚠️ Filtrando link resultado.cnpq.br da listagem que não pertence ao edital: ${url.substring(0, 80)}... (ID esperado: ${editalLinkIdForFilter}, encontrado: ${urlId})`);
              }
              return isValid;
            }
            // Se o link do edital não é resultado.cnpq.br, não aceitar links resultado.cnpq.br genéricos da listagem
            console.log(`  ⚠️ Filtrando link resultado.cnpq.br genérico da listagem: ${url.substring(0, 80)}...`);
            return false;
          }
          return true; // Aceitar outros tipos de links
        });
        
        const resultadoLinksFromListagem = pdfsFromListagem.filter((url: any) => 
          url && typeof url === 'string' && url.includes('resultado.cnpq.br')
        );
        const directPdfLinksFromListagem = pdfsFromListagem.filter((url: any) => 
          url && typeof url === 'string' && !url.includes('resultado.cnpq.br')
        );
        
        console.log(`  📎 Links encontrados na listagem: ${pdfsFromListagem.length}`);
        if (resultadoLinksFromListagem.length > 0) {
          console.log(`     - Links resultado.cnpq.br: ${resultadoLinksFromListagem.length}`);
        }
        if (directPdfLinksFromListagem.length > 0) {
          console.log(`     - Links PDF diretos: ${directPdfLinksFromListagem.length}`);
        }
        
        // Processar links resultado.cnpq.br encontrados na listagem PRIMEIRO
        const pdfsFromResultadoPages: string[] = [];
        
        if (resultadoLinksFromListagem.length > 0) {
          console.log(`  🔍 Processando ${resultadoLinksFromListagem.length} link(s) resultado.cnpq.br da listagem...`);
          
          for (const resultadoUrl of resultadoLinksFromListagem) {
            try {
              console.log(`    📄 Navegando para: ${resultadoUrl.substring(0, 80)}...`);
              // Para resultado.cnpq.br, usar mais tentativas e timeout maior
              try {
                await this.navigateWithRetry(resultadoUrl, 3, 'load');
                await this.delay(5000); // Aguardar mais tempo para JavaScript carregar
                
                // IMPORTANTE: Verificar se realmente estamos na página correta
                const currentUrl = this.page!.url();
                if (!currentUrl.includes('resultado.cnpq.br')) {
                  console.log(`    ⚠️ Redirecionado para página diferente (esperado: resultado.cnpq.br, atual: ${currentUrl.substring(0, 60)}...)`);
                  console.log(`    ⚠️ Pulando busca de PDFs - página incorreta`);
                  continue; // Pular este link
                }
              } catch (navError: any) {
                // Se navegação falhar completamente, verificar se foi redirecionado
                const currentUrl = this.page!.url();
                if (!currentUrl.includes('resultado.cnpq.br')) {
                  console.log(`    ⚠️ Erro ao navegar e redirecionado para: ${currentUrl.substring(0, 60)}...`);
                  console.log(`    ⚠️ Pulando busca de PDFs - página incorreta`);
                  continue; // Pular este link
                }
                // Se ainda estamos em resultado.cnpq.br, continuar
                console.log(`    ⚠️ Erro na navegação mas ainda em resultado.cnpq.br, continuando...`);
              }
              
              // Buscar PDFs dentro da página resultado.cnpq.br - BUSCA AGRESSIVA PARA ENCONTRAR TODOS
              // IMPORTANTE: Filtrar links que são claramente de navegação do site (não são PDFs do edital)
              const pdfsInResultado = await this.page!.evaluate((baseUrl) => {
                const foundPdfs: string[] = [];
                const seen = new Set<string>();
                
                // URLs que devem ser ignoradas (navegação do site, não PDFs)
                const ignorePatterns = [
                  '/web/guest/chamadas',
                  '/web/guest/apresentacao',
                  '/web/guest/organograma',
                  '/web/guest/competencias',
                  '/web/guest/regimento',
                  '/web/guest/lei',
                  '/web/guest/decreto',
                  '/web/guest/conselho',
                  '/web/guest/presidencia',
                  '/web/guest/diretoria',
                  '/web/guest/membros',
                  '/web/guest/criterios',
                  '/web/guest/renovacao',
                  '/web/guest/calendario',
                  '/web/guest/comissao',
                  '/web/guest/composicao',
                  '/web/guest/diretrizes',
                  '/web/guest/documentos-da-ciac',
                  '/web/guest/quem-e-quem',
                  '/web/guest/sespi',
                  '/web/guest/restricao',
                  '/web/guest/normas',
                  '/web/guest/etica',
                  '/web/guest/gestao',
                  '/web/guest/a-criacao',
                  '/web/guest/questao',
                  '/web/guest/anos-',
                  '/web/guest/pesquisar',
                  '/web/guest/series',
                  '/web/guest/demanda',
                  '/web/guest/indicadores',
                  '/web/guest/titulacao',
                  '/web/guest/contatos',
                  '/web/guest/cartao',
                  '/web/guest/auxilio',
                  '/web/guest/bolsas',
                  '/web/guest/prestacao',
                  '/web/guest/programas',
                  '/web/guest/historico',
                  '/web/guest/publicacoes',
                  '/web/guest/cbab',
                  '/web/guest/view',
                  'dgp.cnpq.br',
                ];
                
                function shouldIgnore(url: string): boolean {
                  const urlLower = url.toLowerCase();
                  return ignorePatterns.some(pattern => urlLower.includes(pattern));
                }
                
                function addPdf(url: string) {
                  if (!url) return;
                  
                  // Ignorar links de navegação do site
                  if (shouldIgnore(url)) return;
                  
                  const normalized = url.split('#')[0].split('?')[0].toLowerCase();
                  if (!seen.has(normalized)) {
                    seen.add(normalized);
                    try {
                      const fullUrl = url.indexOf('http') === 0 ? url : new URL(url, baseUrl).href;
                      // Verificar novamente após normalizar
                      if (!shouldIgnore(fullUrl)) {
                        foundPdfs.push(fullUrl);
                      }
                    } catch (e) {}
                  }
                }
                
                // ESTRATÉGIA 1: Buscar apenas links .pdf e /documents/ relacionados ao edital
                const allLinks = document.querySelectorAll('a[href]');
                for (let i = 0; i < allLinks.length; i++) {
                  const link = allLinks[i];
                  const href = (link as any).href || link.getAttribute('href') || '';
                  const text = (link.textContent || '').toLowerCase();
                  const parentText = (link.parentElement?.textContent || '').toLowerCase();
                  
                  // Aceitar apenas links que são claramente PDFs ou documentos relacionados ao edital
                  if (href && (
                    href.indexOf('.pdf') !== -1 ||
                    (href.indexOf('/documents/') !== -1 && (
                      text.indexOf('edital') !== -1 ||
                      text.indexOf('anexo') !== -1 ||
                      text.indexOf('chamada') !== -1 ||
                      text.indexOf('formulário') !== -1 ||
                      text.indexOf('orientações') !== -1 ||
                      parentText.indexOf('edital') !== -1 ||
                      parentText.indexOf('anexo') !== -1
                    ))
                  )) {
                    // Filtrar "Carta ao Cidadão" e links de navegação
                    if (text.indexOf('carta ao cidadão') === -1 &&
                        text.indexOf('carta de serviços') === -1 &&
                        parentText.indexOf('carta ao cidadão') === -1 &&
                        !shouldIgnore(href)) {
                      addPdf(href);
                    }
                  }
                }
                
                // ESTRATÉGIA 2: Buscar em TODAS as listas (li) - podem ter múltiplos PDFs
                const listItems = document.querySelectorAll('li, [class*="list"], [class*="item"]');
                for (let i = 0; i < listItems.length; i++) {
                  const li = listItems[i];
                  const liText = (li.textContent || '').toLowerCase();
                  const linksInLi = li.querySelectorAll('a[href]');
                  
                  for (let j = 0; j < linksInLi.length; j++) {
                    const link = linksInLi[j];
                    const href = (link as any).href || link.getAttribute('href') || '';
                    const text = (link.textContent || '').toLowerCase();
                    
                    // Aceitar links relacionados a PDFs/edital/anexo
                    if (href && (
                      href.indexOf('.pdf') !== -1 ||
                      href.indexOf('/documents/') !== -1 ||
                      (liText.indexOf('pdf') !== -1) ||
                      (liText.indexOf('edital') !== -1) ||
                      (liText.indexOf('anexo') !== -1) ||
                      (liText.indexOf('chamada') !== -1) ||
                      (text.indexOf('pdf') !== -1) ||
                      (text.indexOf('edital') !== -1) ||
                      (text.indexOf('anexo') !== -1)
                    )) {
                      if (text.indexOf('carta ao cidadão') === -1) {
                        addPdf(href);
                      }
                    }
                  }
                }
                
                // ESTRATÉGIA 3: Buscar em TODAS as tabelas
                const tables = document.querySelectorAll('table');
                for (let i = 0; i < tables.length; i++) {
                  const table = tables[i];
                  const tableLinks = table.querySelectorAll('a[href]');
                  for (let j = 0; j < tableLinks.length; j++) {
                    const link = tableLinks[j];
                    const href = (link as any).href || link.getAttribute('href') || '';
                    if (href && (href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1)) {
                      const text = (link.textContent || '').toLowerCase();
                      if (text.indexOf('carta ao cidadão') === -1) {
                        addPdf(href);
                      }
                    }
                  }
                }
                
                // ESTRATÉGIA 4: Buscar em iframes/embeds
                const iframes = document.querySelectorAll('iframe[src], embed[src], object[data]');
                for (let i = 0; i < iframes.length; i++) {
                  const iframe = iframes[i];
                  const src = (iframe as any).src || (iframe as any).data || '';
                  if (src && (src.indexOf('.pdf') !== -1 || src.indexOf('/documents/') !== -1)) {
                    addPdf(src);
                  }
                }
                
                // ESTRATÉGIA 5: Buscar em botões com onclick ou data-*
                const buttons = document.querySelectorAll('button, [onclick], [data-href], [data-url], [data-pdf]');
                for (let i = 0; i < buttons.length; i++) {
                  const btn = buttons[i];
                  const onclick = btn.getAttribute('onclick') || '';
                  const dataHref = btn.getAttribute('data-href') || 
                                  btn.getAttribute('data-url') || 
                                  btn.getAttribute('data-pdf') || '';
                  const text = (btn.textContent || '').toLowerCase();
                  
                  // Extrair URLs de onclick
                  if (onclick) {
                    const urlMatches = onclick.match(/['"]([^'"]*\.pdf[^'"]*)['"]/g) || 
                                     onclick.match(/['"]([^'"]*\/documents\/[^'"]*)['"]/g);
                    if (urlMatches) {
                      urlMatches.forEach((match: string) => {
                        const url = match.replace(/['"]/g, '');
                        if (url.indexOf('carta') === -1) {
                          addPdf(url);
                        }
                      });
                    }
                  }
                  
                  // Extrair URLs de data-*
                  if (dataHref && (dataHref.indexOf('.pdf') !== -1 || dataHref.indexOf('/documents/') !== -1)) {
                    addPdf(dataHref);
                  }
                  
                  // Buscar link dentro do botão
                  const linkInBtn = btn.querySelector('a[href]');
                  if (linkInBtn) {
                    const href = (linkInBtn as any).href || linkInBtn.getAttribute('href') || '';
                    if (href && (href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1)) {
                      addPdf(href);
                    }
                  }
                }
                
                // ESTRATÉGIA 6: Buscar em elementos com classes relacionadas a PDF/documento
                const docElements = document.querySelectorAll(
                  '[class*="pdf"], [class*="document"], [class*="edital"], [class*="anexo"], ' +
                  '[id*="pdf"], [id*="document"], [id*="edital"], [id*="anexo"]'
                );
                for (let i = 0; i < docElements.length; i++) {
                  const el = docElements[i];
                  const linksInEl = el.querySelectorAll('a[href]');
                  for (let j = 0; j < linksInEl.length; j++) {
                    const link = linksInEl[j];
                    const href = (link as any).href || link.getAttribute('href') || '';
                    if (href && (href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1)) {
                      addPdf(href);
                    }
                  }
                }
                
                return foundPdfs;
              }, this.editaisUrl);
              
              if (pdfsInResultado.length > 0) {
                console.log(`    ✅ Encontrados ${pdfsInResultado.length} PDF(s) nesta página`);
                pdfsFromResultadoPages.push(...pdfsInResultado);
              } else {
                console.log(`    ⚠️ Nenhum PDF encontrado nesta página`);
              }
              
              // Voltar para página anterior
              await this.page!.goBack();
              await this.delay(2000);
            } catch (error: any) {
              console.log(`    ⚠️ Erro ao processar página resultado.cnpq.br: ${error.message}`);
            }
          }
          
          // Adicionar PDFs encontrados aos PDFs da listagem
          if (pdfsFromResultadoPages.length > 0) {
            directPdfLinksFromListagem.push(...pdfsFromResultadoPages);
            console.log(`  ✅ Total de ${pdfsFromResultadoPages.length} PDF(s) encontrado(s) nas páginas resultado.cnpq.br`);
          }
        }
        
        // IMPORTANTE: Manter os PDFs encontrados nas páginas resultado.cnpq.br
        // Eles serão combinados com os PDFs da página de detalhes depois
        const pdfsFromResultadoPagesBackup = [...pdfsFromResultadoPages];
        
        // IMPORTANTE: Inicializar otherLinks ANTES de usar (para armazenar PDFs encontrados na página de detalhes)
        let otherLinks: string[] = [];
        
        // IMPORTANTE: Buscar o botão "Chamada" também na página de listagem (antes de navegar para detalhes)
        // Isso garante que encontramos o PDF mesmo quando não navegamos para página de detalhes
        // CRÍTICO: Validar que o botão encontrado pertence ao edital específico
        if (edital.link && edital.link.includes('resultado.cnpq.br')) {
          console.log(`  🔍 Buscando botão "Chamada" na página de listagem para edital: ${edital.link.substring(0, 60)}...`);
          try {
            // Extrair o ID do link do edital para validação
            const editalLinkId = edital.link.split('/').pop() || '';
            
            // Buscar botão "Chamada" no card do edital atual
            const chamadaButtonPdfFromListagem = await this.page!.evaluate((editalLinkId, editalLink, baseUrl) => {
              // Buscar o card do edital que contém o link
              const allCards = document.querySelectorAll('.portlet-content, .portlet-body, [class*="chamada"], [class*="edital"], .content');
              for (let cardIdx = 0; cardIdx < allCards.length; cardIdx++) {
                const card = allCards[cardIdx];
                const cardLinks = card.querySelectorAll('a[href]');
                let hasEditalLink = false;
                
                // Verificar se este card contém o link do edital (usar ID completo para validação rigorosa)
                for (let linkIdx = 0; linkIdx < cardLinks.length; linkIdx++) {
                  const link = cardLinks[linkIdx];
                  const href = (link as any).href || link.getAttribute('href') || '';
                  // Validar que o link contém o ID completo do edital
                  if (href && editalLinkId && href.includes(editalLinkId)) {
                    hasEditalLink = true;
                    break;
                  }
                }
                
                if (hasEditalLink) {
                  // Buscar botão "Chamada" neste card E validar que o link do botão corresponde ao edital
                  const chamadaButtons = card.querySelectorAll('button, a.btn, .btn, [class*="button"], [class*="btn"], a, [role="button"]');
                  for (let btnIdx = 0; btnIdx < chamadaButtons.length; btnIdx++) {
                    const btn = chamadaButtons[btnIdx];
                    const btnText = (btn.textContent || '').toLowerCase().trim();
                    const btnHref = (btn as any).href || btn.getAttribute('href') || btn.getAttribute('data-href') || '';
                    
                    if (btnText === 'chamada' || 
                        (btnText.includes('chamada') && btnText.length < 30 && !btnText.includes('chamadas'))) {
                      if (btnHref && btnHref.indexOf('http') !== -1 && !btnHref.includes('javascript:')) {
                        try {
                          const fullUrl = btnHref.indexOf('http') === 0 ? btnHref : new URL(btnHref, baseUrl).href;
                          // CRÍTICO: Validar que o link do botão corresponde ao ID do edital
                          const buttonLinkId = fullUrl.split('/').pop() || '';
                          if (buttonLinkId === editalLinkId && 
                              !fullUrl.includes('/web/guest/chamadas') && 
                              !fullUrl.includes('/web/guest/apresentacao')) {
                            return fullUrl;
                          }
                        } catch (e) {}
                      }
                      
                      // Verificar link dentro do botão
                      const linkInBtn = btn.querySelector('a[href]');
                      if (linkInBtn) {
                        const linkHref = (linkInBtn as any).href || linkInBtn.getAttribute('href') || '';
                        if (linkHref && linkHref.indexOf('http') !== -1) {
                          try {
                            const fullUrl = linkHref.indexOf('http') === 0 ? linkHref : new URL(linkHref, baseUrl).href;
                            // CRÍTICO: Validar que o link do botão corresponde ao ID do edital
                            const buttonLinkId = fullUrl.split('/').pop() || '';
                            if (buttonLinkId === editalLinkId && 
                                !fullUrl.includes('/web/guest/chamadas')) {
                              return fullUrl;
                            }
                          } catch (e) {}
                        }
                      }
                    }
                  }
                }
              }
              return null;
            }, editalLinkId, edital.link, this.editaisUrl);
            
            if (chamadaButtonPdfFromListagem) {
              // Validação adicional: garantir que o link encontrado corresponde ao edital
              const foundLinkId = chamadaButtonPdfFromListagem.split('/').pop() || '';
              if (foundLinkId === editalLinkId) {
                console.log(`  ✅ Botão "Chamada" encontrado na listagem (validado): ${chamadaButtonPdfFromListagem.substring(0, 60)}...`);
                if (!otherLinks.includes(chamadaButtonPdfFromListagem)) {
                  otherLinks.push(chamadaButtonPdfFromListagem);
                  console.log(`  ✅ Link do botão "Chamada" adicionado à lista de downloads`);
                }
              } else {
                console.log(`  ⚠️ Botão "Chamada" encontrado mas não corresponde ao edital atual (ID esperado: ${editalLinkId}, encontrado: ${foundLinkId})`);
                console.log(`  ⚠️ Ignorando link: ${chamadaButtonPdfFromListagem.substring(0, 60)}...`);
              }
            } else {
              console.log(`  ℹ️ Botão "Chamada" não encontrado na listagem para este edital`);
            }
          } catch (e: any) {
            console.log(`  ⚠️ Erro ao buscar botão "Chamada" na listagem: ${e.message}`);
          }
        }
        
        // Tentar navegar para a página de detalhes se houver link (e não for resultado.cnpq.br)
        if (edital.link && !edital.link.includes('resultado.cnpq.br')) {
            console.log(`  🔍 Navegando para página de detalhes: ${edital.link.substring(0, 80)}...`);
            try {
              // Usar retry logic para navegar para página de detalhes
              await this.navigateWithRetry(edital.link, 2); // Menos tentativas para páginas de detalhes
              await this.delay(3000); // Aguardar carregamento completo
              
              // Tentar clicar em botões e links que possam revelar PDFs dinamicamente
              // IMPORTANTE: Manter sessão/cookies ao clicar
              try {
                console.log(`  🔘 Procurando botões/links para clicar...`);
                
                // Procurar e clicar em TODOS os botões/links relacionados a PDFs
                const clickResults = await this.page!.evaluate(() => {
                  const results: any[] = [];
                  
                  // Buscar todos os elementos clicáveis que possam revelar PDFs
                  const clickableElements = Array.from(document.querySelectorAll(
                    'button, a.btn, .btn, [class*="button"], [class*="btn"], ' +
                    'a[href*="pdf"], a[href*="/documents/"], ' +
                    '[onclick*="pdf"], [onclick*="download"], [onclick*="baixar"]'
                  ));
                  
                  for (const el of clickableElements) {
                    const text = (el.textContent || '').toLowerCase().trim();
                    const href = (el as any).href || el.getAttribute('href') || '';
                    const onclick = el.getAttribute('onclick') || '';
                    
                    // Verificar se é relacionado a PDFs
                    const isPdfRelated = text.indexOf('chamada') !== -1 || 
                                        text.indexOf('pdf') !== -1 || 
                                        text.indexOf('baixar') !== -1 ||
                                        text.indexOf('download') !== -1 ||
                                        text.indexOf('edital') !== -1 ||
                                        text.indexOf('anexo') !== -1 ||
                                        href.indexOf('.pdf') !== -1 ||
                                        href.indexOf('/documents/') !== -1 ||
                                        onclick.indexOf('pdf') !== -1 ||
                                        onclick.indexOf('download') !== -1;
                    
                    if (isPdfRelated) {
                      try {
                        // Tentar clicar usando diferentes métodos
                        if (el.tagName === 'A' && href) {
                          // Para links, apenas registrar (não clicar ainda)
                          results.push({ type: 'link', href: href, text: text.substring(0, 50) });
                        } else {
                          // Para botões, tentar clicar
                          (el as HTMLElement).click();
                          results.push({ type: 'button', text: text.substring(0, 50), clicked: true });
                        }
                      } catch (e) {
                        results.push({ type: 'error', text: text.substring(0, 50), error: String(e) });
                      }
                    }
                  }
                  
                  return results;
                });
                
                if (clickResults.length > 0) {
                  console.log(`  ✅ Encontrados ${clickResults.length} elemento(s) relacionado(s) a PDFs`);
                  await this.delay(3000); // Aguardar após clicar para conteúdo carregar
                }
              } catch (e: any) {
                console.log(`  ⚠️ Erro ao clicar em elementos: ${e.message}`);
              }
              
              // ESTRATÉGIA MELHORADA: Aguardar e expandir elementos antes de buscar
              await this.delay(2000);
              
              // Tentar expandir elementos colapsados/ocultos
              try {
                await this.page!.evaluate(() => {
                  const expandButtons = Array.from(document.querySelectorAll(
                    '[class*="expand"], [class*="collapse"], [class*="toggle"], ' +
                    '[aria-expanded="false"], .accordion-toggle, [data-toggle="collapse"]'
                  ));
                  expandButtons.forEach((btn: any) => {
                    try {
                      if (btn.click) btn.click();
                    } catch (e) {}
                  });
                });
                await this.delay(2000);
              } catch (e) {}
              
              // IMPORTANTE: Buscar primeiro o PDF do botão "Chamada" (PDF principal do edital)
              console.log(`  🔍 Buscando PDF do botão "Chamada"...`);
              const chamadaPdfUrl = await this.page!.evaluate((baseUrl) => {
                const chamadaButtons = Array.from(document.querySelectorAll(
                  'button, a.btn, .btn, [class*="button"], [class*="btn"], a, [role="button"]'
                ));
                
                for (const btn of chamadaButtons) {
                  const text = (btn.textContent || '').toLowerCase().trim();
                  const href = (btn as any).href || btn.getAttribute('href') || btn.getAttribute('data-href') || '';
                  
                  // Procurar botão com texto "Chamada" - ACEITAR QUALQUER href, não apenas PDFs diretos
                  if (text === 'chamada' || 
                      (text.includes('chamada') && text.length < 30 && !text.includes('chamadas'))) {
                    // IMPORTANTE: Aceitar qualquer href do botão "Chamada", mesmo sem .pdf ou /documents/
                    // O href pode levar a uma página que contém o PDF ou ser o próprio PDF
                    if (href && href.indexOf('http') !== -1 && !href.includes('javascript:')) {
                      try {
                        const fullUrl = href.indexOf('http') === 0 ? href : new URL(href, baseUrl).href;
                        // Se já é um PDF direto, retornar
                        if (fullUrl.indexOf('.pdf') !== -1 || fullUrl.indexOf('/documents/') !== -1) {
                          return fullUrl;
                        }
                        // Se não é PDF direto mas é um link válido, também retornar (será processado depois)
                        // Mas apenas se não for uma página de navegação genérica
                        if (!fullUrl.includes('/web/guest/chamadas') && 
                            !fullUrl.includes('/web/guest/apresentacao') &&
                            !fullUrl.includes('/web/guest/organograma')) {
                          return fullUrl;
                        }
                      } catch (e) {}
                    }
                    
                    // Verificar se tem link dentro do botão
                    const linkInBtn = btn.querySelector('a[href]');
                    if (linkInBtn) {
                      const linkHref = (linkInBtn as any).href || linkInBtn.getAttribute('href') || '';
                      if (linkHref && linkHref.indexOf('http') !== -1 && !linkHref.includes('javascript:')) {
                        try {
                          const fullUrl = linkHref.indexOf('http') === 0 ? linkHref : new URL(linkHref, baseUrl).href;
                          // Aceitar qualquer link válido do botão "Chamada"
                          if (!fullUrl.includes('/web/guest/chamadas') && 
                              !fullUrl.includes('/web/guest/apresentacao')) {
                            return fullUrl;
                          }
                        } catch (e) {}
                      }
                    }
                    
                    // Verificar atributos data-*
                    const dataHref = btn.getAttribute('data-href') || btn.getAttribute('data-url') || btn.getAttribute('data-pdf') || '';
                    if (dataHref && dataHref.indexOf('http') !== -1) {
                      try {
                        const fullUrl = dataHref.indexOf('http') === 0 ? dataHref : new URL(dataHref, baseUrl).href;
                        if (!fullUrl.includes('/web/guest/chamadas')) {
                          return fullUrl;
                        }
                      } catch (e) {}
                    }
                    
                    // Verificar onclick
                    const onclick = btn.getAttribute('onclick') || '';
                    if (onclick) {
                      // Buscar qualquer URL no onclick, não apenas PDFs
                      const urlMatch = onclick.match(/['"](https?:\/\/[^'"]+)['"]/) ||
                                     onclick.match(/['"]([^'"]*\.pdf[^'"]*)['"]/) || 
                                     onclick.match(/['"]([^'"]*\/documents\/[^'"]*)['"]/);
                      if (urlMatch && urlMatch[1]) {
                        try {
                          const fullUrl = urlMatch[1].indexOf('http') === 0 ? urlMatch[1] : new URL(urlMatch[1], baseUrl).href;
                          return fullUrl;
                        } catch (e) {}
                      }
                    }
                  }
                }
                
                return null;
              }, this.editaisUrl);
              
              if (chamadaPdfUrl) {
                console.log(`  ✅ Link do botão "Chamada" encontrado: ${chamadaPdfUrl.substring(0, 80)}...`);
                
                // IMPORTANTE: Adicionar SEMPRE o href do botão "Chamada" à lista
                // Mesmo que não tenha .pdf ou /documents/, pode ser um PDF sem extensão ou uma página com PDF
                if (!otherLinks.includes(chamadaPdfUrl)) {
                  otherLinks.unshift(chamadaPdfUrl);
                  console.log(`  ✅ Link do botão "Chamada" adicionado à lista de downloads`);
                }
              } else {
                console.log(`  ⚠️ Link do botão "Chamada" não encontrado`);
              }
              
              // Buscar PDFs com estratégia ULTRA AGRESSIVA - encontrar TODOS os PDFs possíveis
              console.log(`  🔍 Buscando PDFs na página de detalhes...`);
              const pdfsFromDetails = await this.page!.evaluate((baseUrl) => {
                var pdfLinks: string[] = [];
                var seenHrefs = new Set<string>();
                var debugInfo: any = {
                  totalLinks: 0,
                  pdfLinksFound: 0,
                  documentsLinksFound: 0,
                  filteredOut: 0,
                  allPotentialLinks: [] // Para debug
                };
                
                var genericUrls = [
                  '/web/guest/documentos-da-ciac',
                  '/web/guest/gestao-de-documentos',
                  '/web/guest/formularios-e-documentos',
                  '/web/guest/normas',
                  '/web/guest/legislacao',
                  '/web/guest/apresentacao',
                  '/web/guest/institucional',
                  'documentos-da-ciac',
                  'gestao-de-documentos',
                  'formularios-e-documentos',
                  'normas',
                  'legislacao',
                  'carta-ao-cidadao',
                  'carta-de-servicos'
                ];
                
                function isGenericLink(url) {
                  if (!url) return false;
                  var urlLower = String(url).toLowerCase();
                  for (var i = 0; i < genericUrls.length; i++) {
                    if (urlLower.indexOf(String(genericUrls[i]).toLowerCase()) !== -1) {
                      return true;
                    }
                  }
                  return false;
                }
                
                function normalizeUrl(url) {
                  try {
                    return url.split('#')[0].split('?')[0].toLowerCase();
                  } catch (e) {
                    return url.toLowerCase();
                  }
                }
                
                function addPdfLink(url, reason?) {
                  if (!url) return;
                  var normalized = normalizeUrl(url);
                  
                  // Filtrar apenas links genéricos conhecidos e "Carta ao Cidadão"
                  var linkText = '';
                  try {
                    var linkEl = document.querySelector('a[href="' + url + '"], a[href*="' + url.split('/').pop() + '"]');
                    if (linkEl) linkText = (linkEl.textContent || '').toLowerCase();
                  } catch (e) {}
                  
                  // NÃO filtrar resultado.cnpq.br - essas páginas podem conter PDFs
                  var shouldFilter = isGenericLink(url) || 
                                    linkText.indexOf('carta ao cidadão') !== -1 ||
                                    linkText.indexOf('carta de serviços') !== -1;
                  
                  if (!seenHrefs.has(normalized) && !shouldFilter) {
                    try {
                      var fullUrl = url.indexOf('http') === 0 ? url : new URL(url, baseUrl).href;
                      seenHrefs.add(normalized);
                      pdfLinks.push(fullUrl);
                      if (url.indexOf('.pdf') !== -1) debugInfo.pdfLinksFound++;
                      if (url.indexOf('/documents/') !== -1) debugInfo.documentsLinksFound++;
                      if (url.indexOf('resultado.cnpq.br') !== -1) debugInfo.documentsLinksFound++; // Contar como potencial PDF
                    } catch (e) {}
                  } else if (shouldFilter) {
                    debugInfo.filteredOut++;
                  }
                }
                
                // ESTRATÉGIA 0: Buscar TODOS os links da página (mais agressivo)
                // IMPORTANTE: Aceitar TODOS os links /documents/ mesmo sem .pdf no final
                var allPageLinks = document.querySelectorAll('a[href]');
                debugInfo.totalLinks = allPageLinks.length;
                
                for (var ap = 0; ap < allPageLinks.length; ap++) {
                  var pageLink = allPageLinks[ap];
                  var href = (pageLink as any).href || pageLink.getAttribute('href') || '';
                  var linkText = (pageLink.textContent || '').toLowerCase().trim();
                  var parentText = (pageLink.parentElement?.textContent || '').toLowerCase();
                  
                  // Aceitar TODOS os links /documents/ mesmo sem .pdf (será validado depois)
                  // Também aceitar links em botões ou com texto relacionado
                  var isPotentialPdf = href && (
                    href.indexOf('.pdf') !== -1 ||
                    href.indexOf('/documents/') !== -1 ||
                    (linkText.indexOf('pdf') !== -1 && href.indexOf('http') !== -1) ||
                    (linkText.indexOf('edital') !== -1 && href.indexOf('/documents/') !== -1) ||
                    (linkText.indexOf('anexo') !== -1 && href.indexOf('/documents/') !== -1) ||
                    (linkText.indexOf('chamada') !== -1 && href.indexOf('/documents/') !== -1) ||
                    (parentText.indexOf('pdf') !== -1 && href.indexOf('/documents/') !== -1) ||
                    (parentText.indexOf('edital') !== -1 && href.indexOf('/documents/') !== -1)
                  );
                  
                  if (isPotentialPdf) {
                    // Para debug: registrar todos os links potenciais
                    debugInfo.allPotentialLinks.push({
                      href: href.substring(0, 100),
                      text: linkText.substring(0, 50),
                      parent: parentText.substring(0, 50)
                    });
                    
                    // Aceitar TODOS os links /documents/ e .pdf exceto os genéricos conhecidos
                    if (linkText.indexOf('carta ao cidadão') === -1 &&
                        linkText.indexOf('carta de serviços') === -1 &&
                        parentText.indexOf('carta ao cidadão') === -1 &&
                        parentText.indexOf('carta de serviços') === -1) {
                      addPdfLink(href, 'all-page-links');
                    }
                  }
                }
                
                // ESTRATÉGIA 0.5: Buscar em TODOS os botões e extrair hrefs
                var allButtons = document.querySelectorAll('button, [role="button"], [class*="btn"], [class*="button"], a[class*="btn"]');
                for (var btnIdx = 0; btnIdx < allButtons.length; btnIdx++) {
                  var btn = allButtons[btnIdx];
                  var btnHref = (btn as any).href || btn.getAttribute('href') || '';
                  var btnText = (btn.textContent || '').toLowerCase();
                  var btnParentText = (btn.parentElement?.textContent || '').toLowerCase();
                  
                  // Aceitar links em botões que possam ser PDFs
                  if (btnHref && (
                    btnHref.indexOf('/documents/') !== -1 ||
                    btnHref.indexOf('.pdf') !== -1 ||
                    (btnText.indexOf('pdf') !== -1 && btnHref.indexOf('http') !== -1) ||
                    (btnText.indexOf('edital') !== -1 && btnHref.indexOf('/documents/') !== -1) ||
                    (btnText.indexOf('anexo') !== -1 && btnHref.indexOf('/documents/') !== -1) ||
                    (btnText.indexOf('chamada') !== -1 && btnHref.indexOf('/documents/') !== -1)
                  )) {
                    if (btnText.indexOf('carta ao cidadão') === -1 &&
                        btnParentText.indexOf('carta ao cidadão') === -1) {
                      addPdfLink(btnHref, 'buttons');
                    }
                  }
                  
                  // Buscar link dentro do botão
                  var linkInBtn = btn.querySelector('a[href]');
                  if (linkInBtn) {
                    var linkHref = (linkInBtn as any).href || linkInBtn.getAttribute('href') || '';
                    var linkText = (linkInBtn.textContent || '').toLowerCase();
                    if (linkHref && (
                      linkHref.indexOf('/documents/') !== -1 ||
                      linkHref.indexOf('.pdf') !== -1 ||
                      (linkText.indexOf('pdf') !== -1) ||
                      (linkText.indexOf('edital') !== -1 && linkHref.indexOf('/documents/') !== -1)
                    )) {
                      if (linkText.indexOf('carta ao cidadão') === -1) {
                        addPdfLink(linkHref, 'links-in-buttons');
                      }
                    }
                  }
                }
                
                // ESTRATÉGIA 1: Buscar em elementos .content (prioridade alta)
                var contentElements = document.querySelectorAll('.content, [class*="content"], [class*="document"], [class*="edital"]');
                for (var c = 0; c < contentElements.length; c++) {
                  var contentEl = contentElements[c];
                  var contentLinks = contentEl.querySelectorAll('a[href]');
                  for (var cl = 0; cl < contentLinks.length; cl++) {
                    var link = contentLinks[cl];
                    var href = (link as any).href || link.getAttribute('href') || '';
                    var linkText = (link.textContent || '').toLowerCase().trim();
                    var parentText = (link.parentElement?.textContent || '').toLowerCase();
                    
                    if ((href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1) &&
                        linkText.indexOf('carta ao cidadão') === -1 &&
                        linkText.indexOf('carta de serviços') === -1 &&
                        parentText.indexOf('carta ao cidadão') === -1 &&
                        parentText.indexOf('carta de serviços') === -1) {
                      addPdfLink(href);
                    }
                  }
                  
                  // ESTRATÉGIA 1.5: Buscar em TODOS os botões - aceitar qualquer link /documents/
                  var contentButtons = contentEl.querySelectorAll('button, [role="button"], [class*="btn"], [class*="button"], a[class*="btn"]');
                  for (var cb = 0; cb < contentButtons.length; cb++) {
                    var btn = contentButtons[cb];
                    var btnText = (btn.textContent || '').toLowerCase();
                    var btnHref = (btn as any).href || btn.getAttribute('href') || btn.getAttribute('data-href') || '';
                    
                    // Aceitar links /documents/ mesmo sem texto específico
                    if (btnHref && (
                      btnHref.indexOf('/documents/') !== -1 ||
                      btnHref.indexOf('.pdf') !== -1 ||
                      (btnText.indexOf('chamada') !== -1 && btnHref.indexOf('http') !== -1) ||
                      (btnText.indexOf('pdf') !== -1) ||
                      (btnText.indexOf('edital') !== -1) ||
                      (btnText.indexOf('anexo') !== -1)
                    )) {
                      if (btnText.indexOf('carta ao cidadão') === -1) {
                        addPdfLink(btnHref, 'content-buttons');
                      }
                    }
                    
                    // Buscar TODOS os links dentro do botão, não apenas o primeiro
                    var linksInBtn = btn.querySelectorAll('a[href]');
                    for (var libIdx = 0; libIdx < linksInBtn.length; libIdx++) {
                      var linkInBtn = linksInBtn[libIdx];
                      var linkHref = (linkInBtn as any).href || linkInBtn.getAttribute('href') || '';
                      var linkText = (linkInBtn.textContent || '').toLowerCase();
                      
                      // Aceitar qualquer link /documents/ ou .pdf
                      if (linkHref && (
                        linkHref.indexOf('/documents/') !== -1 ||
                        linkHref.indexOf('.pdf') !== -1 ||
                        (linkText.indexOf('pdf') !== -1 && linkHref.indexOf('http') !== -1) ||
                        (linkText.indexOf('edital') !== -1 && linkHref.indexOf('/documents/') !== -1)
                      )) {
                        if (linkText.indexOf('carta ao cidadão') === -1) {
                          addPdfLink(linkHref, 'links-in-buttons');
                        }
                      }
                    }
                  }
                }
                
                // ESTRATÉGIA 2: Buscar em TODAS as listas (li) - podem ter múltiplos PDFs
                // IMPORTANTE: Buscar TODOS os links dentro de cada li, não apenas o primeiro
                var listItems = document.querySelectorAll('li, [class*="list"], [class*="item"], ul li, ol li');
                for (var li = 0; li < listItems.length; li++) {
                  var liEl = listItems[li];
                  var liText = (liEl.textContent || '').toLowerCase();
                  // Buscar TODOS os links dentro do li, não apenas o primeiro
                  var linksInLi = liEl.querySelectorAll('a[href]');
                  
                  for (var liLinkIdx = 0; liLinkIdx < linksInLi.length; liLinkIdx++) {
                    var linkInLi = linksInLi[liLinkIdx];
                    var href = (linkInLi as any).href || linkInLi.getAttribute('href') || '';
                    var linkText = (linkInLi.textContent || '').toLowerCase();
                    
                    // Aceitar links relacionados a PDFs/edital/anexo (mais permissivo)
                    if (href && (
                      href.indexOf('.pdf') !== -1 ||
                      href.indexOf('/documents/') !== -1 ||
                      (liText.indexOf('pdf') !== -1) ||
                      (liText.indexOf('edital') !== -1) ||
                      (liText.indexOf('anexo') !== -1) ||
                      (liText.indexOf('chamada') !== -1) ||
                      (liText.indexOf('documento') !== -1) ||
                      (liText.indexOf('faq') !== -1) ||
                      (linkText.indexOf('pdf') !== -1) ||
                      (linkText.indexOf('edital') !== -1) ||
                      (linkText.indexOf('anexo') !== -1) ||
                      (linkText.indexOf('download') !== -1) ||
                      (linkText.indexOf('baixar') !== -1)
                    )) {
                      if (linkText.indexOf('carta ao cidadão') === -1 &&
                          linkText.indexOf('carta de serviços') === -1 &&
                          liText.indexOf('carta ao cidadão') === -1) {
                        addPdfLink(href, 'list-items');
                      }
                    }
                  }
                }
                
                // ESTRATÉGIA 3: Buscar TODOS os links /documents/
                var allDocLinks = document.querySelectorAll('a[href*="/documents/"]');
                for (var d = 0; d < allDocLinks.length; d++) {
                  var docLink = allDocLinks[d];
                  var href = (docLink as any).href || docLink.getAttribute('href') || '';
                  var linkText = (docLink.textContent || '').toLowerCase().trim();
                  var parentText = (docLink.parentElement?.textContent || '').toLowerCase();
                  
                  if (href && href.indexOf('/documents/') !== -1 &&
                      linkText.indexOf('carta ao cidadão') === -1 &&
                      linkText.indexOf('carta de serviços') === -1 &&
                      parentText.indexOf('carta ao cidadão') === -1 &&
                      parentText.indexOf('carta de serviços') === -1) {
                    addPdfLink(href);
                  }
                }
                
                // ESTRATÉGIA 4: Buscar links .pdf diretamente
                var pdfLinks = document.querySelectorAll('a[href*=".pdf"], a[href*=".PDF"]');
                for (var p = 0; p < pdfLinks.length; p++) {
                  var pdfLink = pdfLinks[p];
                  var href = (pdfLink as any).href || pdfLink.getAttribute('href') || '';
                  if (href) {
                    var linkText = (pdfLink.textContent || '').toLowerCase();
                    if (linkText.indexOf('carta ao cidadão') === -1 &&
                        linkText.indexOf('carta de serviços') === -1) {
                      addPdfLink(href);
                    }
                  }
                }
                
                // ESTRATÉGIA 5: Buscar em atributos data-*
                var dataElements = document.querySelectorAll('[data-href], [data-url], [data-pdf], [data-document], [data-link]');
                for (var de = 0; de < dataElements.length; de++) {
                  var dataEl = dataElements[de];
                  var dataHref = dataEl.getAttribute('data-href') || 
                                dataEl.getAttribute('data-url') || 
                                dataEl.getAttribute('data-pdf') ||
                                dataEl.getAttribute('data-document') ||
                                dataEl.getAttribute('data-link') || '';
                  if (dataHref && (dataHref.indexOf('.pdf') !== -1 || dataHref.indexOf('/documents/') !== -1)) {
                    addPdfLink(dataHref);
                  }
                }
                
                // ESTRATÉGIA 6: Buscar em iframes e embeds
                var iframes = document.querySelectorAll('iframe[src], embed[src], object[data]');
                for (var ifr = 0; ifr < iframes.length; ifr++) {
                  var iframe = iframes[ifr];
                  var src = (iframe as any).src || (iframe as any).data || '';
                  if (src && (src.indexOf('.pdf') !== -1 || src.indexOf('/documents/') !== -1)) {
                    addPdfLink(src);
                  }
                }
                
                // ESTRATÉGIA 7: Buscar em tabelas
                var tables = document.querySelectorAll('table');
                for (var t = 0; t < tables.length; t++) {
                  var table = tables[t];
                  var tableLinks = table.querySelectorAll('a[href]');
                  for (var tl = 0; tl < tableLinks.length; tl++) {
                    var tableLink = tableLinks[tl];
                    var href = (tableLink as any).href || tableLink.getAttribute('href') || '';
                    if (href && (href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1)) {
                      var linkText = (tableLink.textContent || '').toLowerCase();
                      if (linkText.indexOf('carta ao cidadão') === -1) {
                        addPdfLink(href);
                      }
                    }
                  }
                }
                
                // ESTRATÉGIA 8: Buscar em elementos com ícones de download
                var downloadElements = document.querySelectorAll(
                  '[class*="download"], [class*="pdf"], [class*="document"], ' +
                  '[aria-label*="pdf"], [aria-label*="download"], [title*="pdf"], [title*="download"]'
                );
                for (var dl = 0; dl < downloadElements.length; dl++) {
                  var dlEl = downloadElements[dl];
                  var dlLink = dlEl.querySelector('a[href]') || dlEl;
                  var href = (dlLink as any).href || dlLink.getAttribute('href') || '';
                  if (href && (href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1)) {
                    addPdfLink(href);
                  }
                }
                
                return { pdfLinks: pdfLinks, debug: debugInfo };
              }, this.editaisUrl);
              
              // Verificar se o retorno está no formato correto e tratar erros
              let pdfLinksArray: string[] = [];
              try {
                if (Array.isArray(pdfsFromDetails)) {
                  pdfLinksArray = pdfsFromDetails;
                } else if (pdfsFromDetails && typeof pdfsFromDetails === 'object') {
                  pdfLinksArray = Array.isArray(pdfsFromDetails.pdfLinks) 
                    ? pdfsFromDetails.pdfLinks 
                    : [];
                } else {
                  console.log(`  ⚠️ Formato inesperado de retorno: ${typeof pdfsFromDetails}`);
                  pdfLinksArray = [];
                }
              } catch (error: any) {
                console.log(`  ⚠️ Erro ao processar PDFs encontrados: ${error.message}`);
                pdfLinksArray = [];
              }
              
              // Garantir que pdfLinksArray é sempre um array
              if (!Array.isArray(pdfLinksArray)) {
                pdfLinksArray = [];
              }
              
              // Separar links resultado.cnpq.br dos outros
              const resultadoLinks = Array.isArray(pdfLinksArray) 
                ? pdfLinksArray.filter((url: string) => url && typeof url === 'string' && url.includes('resultado.cnpq.br'))
                : [];
              // IMPORTANTE: Usar otherLinks já inicializado acima, não redeclarar
              const newOtherLinks = Array.isArray(pdfLinksArray)
                ? pdfLinksArray.filter((url: string) => url && typeof url === 'string' && !url.includes('resultado.cnpq.br'))
                : [];
              // Adicionar aos otherLinks existentes
              otherLinks.push(...newOtherLinks);
              
              // IMPORTANTE: Validar links /documents/ que não têm .pdf navegando até eles
              const documentsLinksToValidate = otherLinks.filter((url: string) => 
                url.includes('/documents/') && !url.includes('.pdf')
              );
              
              if (documentsLinksToValidate.length > 0) {
                console.log(`  🔍 Validando ${documentsLinksToValidate.length} link(s) /documents/ sem .pdf...`);
                
                const validatedPdfs: string[] = [];
                for (const docUrl of documentsLinksToValidate) {
                  try {
                    console.log(`    🔗 Validando: ${docUrl.substring(0, 80)}...`);
                    await this.navigateWithRetry(docUrl, 1);
                    await this.delay(2000);
                    
                    // Verificar se a página retornou um PDF
                    const isPdf = await this.page!.evaluate(() => {
                      // Verificar Content-Type da resposta
                      const contentType = document.contentType || '';
                      if (contentType.includes('pdf')) return true;
                      
                      // Verificar se há embed/iframe de PDF
                      const pdfEmbed = document.querySelector('embed[type="application/pdf"], iframe[src*=".pdf"]');
                      if (pdfEmbed) return true;
                      
                      // Verificar se a URL atual mudou para um PDF
                      if (window.location.href.indexOf('.pdf') !== -1) return true;
                      
                      return false;
                    });
                    
                    if (isPdf) {
                      validatedPdfs.push(docUrl);
                      console.log(`    ✅ Confirmado como PDF: ${docUrl.substring(0, 80)}...`);
                    } else {
                      // Tentar buscar PDFs dentro desta página
                      const pdfsInPage = await this.page!.evaluate((baseUrl) => {
                        const found: string[] = [];
                        const links = document.querySelectorAll('a[href*=".pdf"], a[href*="/documents/"]');
                        for (let i = 0; i < links.length; i++) {
                          const href = (links[i] as any).href || links[i].getAttribute('href') || '';
                          if (href && (href.indexOf('.pdf') !== -1 || href.indexOf('/documents/') !== -1)) {
                            const text = (links[i].textContent || '').toLowerCase();
                            if (text.indexOf('carta ao cidadão') === -1) {
                              try {
                                const fullUrl = href.indexOf('http') === 0 ? href : new URL(href, baseUrl).href;
                                found.push(fullUrl);
                              } catch (e) {}
                            }
                          }
                        }
                        return found;
                      }, this.editaisUrl);
                      
                      if (pdfsInPage.length > 0) {
                        validatedPdfs.push(...pdfsInPage);
                        console.log(`    ✅ Encontrados ${pdfsInPage.length} PDF(s) dentro desta página`);
                      }
                    }
                    
                    await this.page!.goBack();
                    await this.delay(2000);
                  } catch (error: any) {
                    console.log(`    ⚠️ Erro ao validar link: ${error.message}`);
                  }
                }
                
                // Adicionar PDFs validados aos outros links
                if (validatedPdfs.length > 0) {
                  otherLinks.push(...validatedPdfs);
                  console.log(`  ✅ ${validatedPdfs.length} link(s) /documents/ validado(s) como PDF(s)`);
                }
              }
              
              if (resultadoLinks.length > 0) {
                console.log(`  🔍 Encontrados ${resultadoLinks.length} link(s) resultado.cnpq.br - buscando TODOS os links dentro deles...`);
                
                // IMPORTANTE: Filtrar apenas links resultado.cnpq.br que sejam específicos deste edital
                // Links resultado.cnpq.br devem estar relacionados ao link do edital atual
                const editalLinkId = edital.link ? edital.link.split('/').pop() || '' : '';
                const filteredResultadoLinks = resultadoLinks.filter(url => {
                  // Se temos um link do edital, verificar se o resultado.cnpq.br está relacionado
                  if (editalLinkId && url.includes(editalLinkId)) {
                    return true;
                  }
                  // Se não temos link do edital, aceitar apenas se o URL não for um padrão genérico conhecido
                  // O link 9306271143696267 parece ser específico de um edital, então vamos validar melhor
                  const urlId = url.split('/').pop() || '';
                  // Aceitar apenas se o ID do URL não for um padrão genérico ou se estiver na lista de links do edital
                  return urlId.length > 5; // IDs válidos geralmente têm mais de 5 caracteres
                });
                
                console.log(`  🔍 Após filtro: ${filteredResultadoLinks.length} link(s) resultado.cnpq.br específicos deste edital`);
                
                // Coletar TODOS os links encontrados (incluindo outros resultado.cnpq.br e documentos)
                const allFoundLinks: string[] = [];
                const visitedUrls = new Set<string>();
                
                // Função recursiva para seguir links resultado.cnpq.br
                const followResultadoLinks = async (url: string, depth: number = 0): Promise<void> => {
                  if (depth > 2 || visitedUrls.has(url)) return; // Limitar profundidade e evitar loops
                  visitedUrls.add(url);
                  
                  try {
                    console.log(`    📄 [Profundidade ${depth}] Navegando para: ${url.substring(0, 80)}...`);
                    // Para resultado.cnpq.br, usar mais tentativas e timeout maior
                    await this.navigateWithRetry(url, 3, 'load');
                    await this.delay(5000); // Aguardar mais tempo para JavaScript carregar
                    
                    // Buscar TODOS os links dentro desta página (mais abrangente)
                    const pageLinks = await this.page!.evaluate((baseUrl) => {
                      const found: { url: string; type: string; text: string }[] = [];
                      const seen = new Set<string>();
                      
                      // Função auxiliar para classificar e adicionar link
                      const addLink = (href: string, text: string, parentText: string = '') => {
                        if (!href || seen.has(href)) return;
                        seen.add(href);
                        
                        try {
                          const fullUrl = href.indexOf('http') === 0 ? href : new URL(href, baseUrl).href;
                          const combinedText = (text + ' ' + parentText).toLowerCase();
                          
                          // Classificar o tipo de link
                          let type = 'other';
                          if (fullUrl.includes('resultado.cnpq.br')) {
                            type = 'resultado';
                          } else if (fullUrl.includes('.pdf') || fullUrl.includes('/documents/')) {
                            type = 'pdf';
                          } else if (
                            // Links com texto relacionado a documentos/editais
                            combinedText.includes('anexo') || 
                            combinedText.includes('edital') || 
                            combinedText.includes('chamada') || 
                            combinedText.includes('documento') ||
                            combinedText.includes('pdf') || 
                            combinedText.includes('download') ||
                            combinedText.includes('baixar') ||
                            combinedText.includes('formulário') ||
                            combinedText.includes('orientações') ||
                            combinedText.includes('proposta') ||
                            // Ou links que parecem ser documentos (não são páginas HTML)
                            (fullUrl.includes('/documents/') || fullUrl.includes('/Media/') || fullUrl.includes('/Editais/'))
                          ) {
                            type = 'document';
                          }
                          
                          // Filtrar apenas links relevantes (excluir cartas genéricas)
                          if (type !== 'other' && 
                              combinedText.indexOf('carta ao cidadão') === -1 &&
                              combinedText.indexOf('carta de serviços') === -1 &&
                              !fullUrl.includes('#') && // Excluir âncoras
                              fullUrl.indexOf('http') === 0) { // Apenas URLs absolutas
                            found.push({ url: fullUrl, type, text: text.substring(0, 80) });
                          }
                        } catch (e) {}
                      };
                      
                      // ESTRATÉGIA 1: Buscar TODOS os links <a href>
                      const allLinks = document.querySelectorAll('a[href]');
                      for (let i = 0; i < allLinks.length; i++) {
                        const link = allLinks[i];
                        const href = (link as any).href || link.getAttribute('href') || '';
                        const text = (link.textContent || '').trim();
                        const parentText = (link.parentElement?.textContent || '').trim();
                        addLink(href, text, parentText);
                      }
                      
                      // ESTRATÉGIA 2: Buscar em botões e elementos clicáveis
                      const buttons = document.querySelectorAll('button, [role="button"], [class*="btn"], a[class*="btn"]');
                      for (let i = 0; i < buttons.length; i++) {
                        const btn = buttons[i];
                        const btnHref = (btn as any).href || btn.getAttribute('href') || btn.getAttribute('data-href') || '';
                        const btnText = (btn.textContent || '').trim();
                        const btnParentText = (btn.parentElement?.textContent || '').trim();
                        
                        if (btnHref) {
                          addLink(btnHref, btnText, btnParentText);
                        }
                        
                        // Buscar links dentro do botão
                        const linkInBtn = btn.querySelector('a[href]');
                        if (linkInBtn) {
                          const linkHref = (linkInBtn as any).href || linkInBtn.getAttribute('href') || '';
                          const linkText = (linkInBtn.textContent || '').trim();
                          addLink(linkHref, linkText, btnText);
                        }
                      }
                      
                      // ESTRATÉGIA 3: Buscar em listas (li) - especialmente para anexos
                      const listItems = document.querySelectorAll('li, [class*="list-item"]');
                      for (let i = 0; i < listItems.length; i++) {
                        const li = listItems[i];
                        const liText = (li.textContent || '').toLowerCase();
                        const linksInLi = li.querySelectorAll('a[href]');
                        
                        for (let j = 0; j < linksInLi.length; j++) {
                          const linkInLi = linksInLi[j];
                          const href = (linkInLi as any).href || linkInLi.getAttribute('href') || '';
                          const text = (linkInLi.textContent || '').trim();
                          
                          // Se o li menciona anexo, faq, documento, etc., coletar o link
                          if (liText.includes('anexo') || liText.includes('faq') || 
                              liText.includes('pdf') || liText.includes('documento') ||
                              liText.includes('edital') || liText.includes('chamada') ||
                              liText.includes('download') || liText.includes('baixar') ||
                              liText.includes('formulário') || liText.includes('orientações')) {
                            addLink(href, text, liText);
                          }
                        }
                      }
                      
                      // ESTRATÉGIA 4: Buscar em atributos data-*
                      const dataElements = document.querySelectorAll('[data-href], [data-url], [data-pdf], [data-document], [data-link]');
                      for (let i = 0; i < dataElements.length; i++) {
                        const el = dataElements[i];
                        const dataHref = el.getAttribute('data-href') || 
                                        el.getAttribute('data-url') || 
                                        el.getAttribute('data-pdf') ||
                                        el.getAttribute('data-document') ||
                                        el.getAttribute('data-link') || '';
                        const text = (el.textContent || '').trim();
                        if (dataHref) {
                          addLink(dataHref, text);
                        }
                      }
                      
                      return found;
                    }, this.editaisUrl);
                    
                    // Processar links encontrados
                    const newResultadoLinks: string[] = [];
                    const newPdfLinks: string[] = [];
                    const newDocumentLinks: string[] = [];
                    
                    for (const linkInfo of pageLinks) {
                      if (linkInfo.type === 'resultado' && !visitedUrls.has(linkInfo.url)) {
                        // IMPORTANTE: Validar que o link resultado.cnpq.br seja específico deste edital
                        const urlId = linkInfo.url.split('/').pop() || '';
                        // Aceitar apenas se o ID for válido (mais de 5 caracteres, geralmente numérico)
                        // E se estiver relacionado ao link do edital atual
                        const isValidResultadoLink = urlId.length > 5 && /^\d+$/.test(urlId);
                        const isRelatedToEdital = editalLinkId ? linkInfo.url.includes(editalLinkId) : true;
                        
                        if (isValidResultadoLink && isRelatedToEdital) {
                          newResultadoLinks.push(linkInfo.url);
                          console.log(`      🔗 Encontrado link resultado.cnpq.br: ${linkInfo.url.substring(0, 80)}... (${linkInfo.text})`);
                        } else {
                          console.log(`      ⚠️ Link resultado.cnpq.br ignorado (não específico deste edital): ${linkInfo.url.substring(0, 80)}...`);
                        }
                      } else if (linkInfo.type === 'pdf') {
                        newPdfLinks.push(linkInfo.url);
                        console.log(`      📎 Encontrado PDF: ${linkInfo.url.substring(0, 80)}... (${linkInfo.text})`);
                      } else if (linkInfo.type === 'document') {
                        newDocumentLinks.push(linkInfo.url);
                        console.log(`      📄 Encontrado documento: ${linkInfo.url.substring(0, 80)}... (${linkInfo.text})`);
                      }
                    }
                    
                    // Adicionar PDFs e documentos encontrados
                    allFoundLinks.push(...newPdfLinks, ...newDocumentLinks);
                    
                    // Seguir recursivamente outros links resultado.cnpq.br encontrados
                    for (const newResultadoUrl of newResultadoLinks) {
                      await followResultadoLinks(newResultadoUrl, depth + 1);
                    }
                    
                    // Voltar para a página anterior
                    await this.page!.goBack();
                    await this.delay(2000);
                  } catch (error: any) {
                    console.log(`    ⚠️ Erro ao processar ${url}: ${error.message}`);
                    try {
                      await this.page!.goBack();
                      await this.delay(2000);
                    } catch {}
                  }
                };
                
                // Processar cada link resultado.cnpq.br encontrado (apenas os filtrados)
                for (const resultadoUrl of filteredResultadoLinks) {
                  await followResultadoLinks(resultadoUrl, 0);
                }
                
                // Adicionar todos os links encontrados aos PDFs do edital
                if (allFoundLinks.length > 0) {
                  console.log(`  ✅ Total de ${allFoundLinks.length} link(s) encontrado(s) dentro das páginas resultado.cnpq.br`);
                  otherLinks.push(...allFoundLinks);
                }
              }
              
              // Combinar TODOS os PDFs encontrados:
              // - PDFs da listagem original
              // - PDFs encontrados nas páginas resultado.cnpq.br (se houver)
              // - PDFs encontrados na página de detalhes
              // CRÍTICO: Filtrar links resultado.cnpq.br para garantir que pertencem ao edital específico
              const editalLinkId = edital.link ? edital.link.split('/').pop() || '' : '';
              
              const allPdfUrls = [...new Set([
                ...pdfsFromListagem,
                ...pdfsFromResultadoPagesBackup,
                ...otherLinks
              ])].filter((url: string) => {
                // Se é um link resultado.cnpq.br, validar que pertence ao edital
                if (url.includes('resultado.cnpq.br')) {
                  const urlId = url.split('/').pop() || '';
                  
                  // Se temos um link do edital que também é resultado.cnpq.br, validar que o ID corresponde exatamente
                  if (editalLinkId && edital.link && edital.link.includes('resultado.cnpq.br')) {
                    // Validação rigorosa: o ID deve corresponder exatamente OU estar na lista de links relacionados
                    const isValid = urlId === editalLinkId;
                    if (!isValid) {
                      console.log(`  ⚠️ Filtrando link resultado.cnpq.br que não pertence ao edital: ${url.substring(0, 80)}... (ID esperado: ${editalLinkId}, encontrado: ${urlId})`);
                    }
                    return isValid;
                  }
                  
                  // Se o link do edital não é resultado.cnpq.br, aceitar apenas se o link estiver na lista de links relacionados
                  // (por exemplo, anexos que foram encontrados na página de detalhes)
                  if (editalLinkId && edital.link && !edital.link.includes('resultado.cnpq.br')) {
                    // Aceitar apenas se o link foi encontrado na página de detalhes (otherLinks)
                    // Não aceitar links genéricos da listagem
                    const isFromDetails = otherLinks.includes(url);
                    if (!isFromDetails) {
                      console.log(`  ⚠️ Filtrando link resultado.cnpq.br genérico da listagem: ${url.substring(0, 80)}...`);
                    }
                    return isFromDetails;
                  }
                  
                  // Se não temos link do edital válido, não aceitar links resultado.cnpq.br genéricos
                  console.log(`  ⚠️ Filtrando link resultado.cnpq.br (sem link do edital válido): ${url.substring(0, 80)}...`);
                  return false;
                }
                // Aceitar outros tipos de links (PDFs diretos, etc.)
                return true;
              });
              
              if (allPdfUrls.length > 0) {
                console.log(`  ✅ Total de PDFs encontrados (após filtro): ${allPdfUrls.length}`);
                console.log(`     - Da listagem: ${pdfsFromListagem.length}`);
                if (pdfsFromResultadoPagesBackup.length > 0) {
                  console.log(`     - Das páginas resultado.cnpq.br: ${pdfsFromResultadoPagesBackup.length}`);
                }
                console.log(`     - Da página de detalhes: ${otherLinks.length}`);
                if (pdfsFromDetails?.debug) {
                  console.log(`     - Debug: ${pdfsFromDetails.debug.totalLinks} links totais, ` +
                             `${pdfsFromDetails.debug.pdfLinksFound} .pdf, ` +
                             `${pdfsFromDetails.debug.documentsLinksFound} /documents/, ` +
                             `${pdfsFromDetails.debug.filteredOut} filtrados`);
                }
                edital.pdfUrls = allPdfUrls;
              } else {
                console.log(`  ⚠️ Nenhum PDF encontrado na página de detalhes`);
                if (pdfsFromDetails?.debug) {
                  console.log(`     - Debug: ${pdfsFromDetails.debug.totalLinks} links totais analisados, ` +
                             `${pdfsFromDetails.debug.pdfLinksFound} .pdf encontrados, ` +
                             `${pdfsFromDetails.debug.documentsLinksFound} /documents/ encontrados, ` +
                             `${pdfsFromDetails.debug.filteredOut} filtrados`);
                  
                  // Mostrar links potenciais encontrados mas filtrados
                  if (pdfsFromDetails.debug.allPotentialLinks && pdfsFromDetails.debug.allPotentialLinks.length > 0) {
                    console.log(`  🔍 DEBUG: ${pdfsFromDetails.debug.allPotentialLinks.length} links potenciais encontrados:`);
                    pdfsFromDetails.debug.allPotentialLinks.slice(0, 15).forEach((link: any, idx: number) => {
                      console.log(`     ${idx + 1}. ${link.href}`);
                      console.log(`        Texto: "${link.text}" | Parent: "${link.parent}"`);
                    });
                  }
                }
                
                // Debug detalhado: verificar estrutura da página
                const debugInfo = await this.page!.evaluate(() => {
                  var info: any = {};
                  
                  // Verificar se há elementos .content
                  var contentElements = document.querySelectorAll('.content');
                  info.contentElementsCount = contentElements.length;
                  
                  // Verificar botões com "chamada"
                  var buttons = document.querySelectorAll('button, a.btn, .btn, [class*="button"], [class*="btn"], a');
                  var chamadaButtons = [];
                  for (var i = 0; i < buttons.length; i++) {
                    var btn = buttons[i];
                    var btnText = (btn.textContent || '').toLowerCase().trim();
                    if (btnText.indexOf('chamada') !== -1) {
                      chamadaButtons.push({
                        text: btnText.substring(0, 50),
                        href: (btn as any).href || (btn.querySelector('a') as any)?.href || ''
                      });
                    }
                  }
                  info.chamadaButtons = chamadaButtons;
                  
                  // Verificar links com /documents/
                  var docLinks = [];
                  var allLinks = document.querySelectorAll('a[href]');
                  for (var j = 0; j < allLinks.length; j++) {
                    var link = allLinks[j];
                    var href = link.href;
                    if (href && href.indexOf('/documents/') !== -1) {
                      docLinks.push({
                        href: href.substring(0, 100),
                        text: (link.textContent || '').substring(0, 50)
                      });
                    }
                  }
                  info.docLinks = docLinks.slice(0, 5);
                  
                  // Verificar links com .pdf
                  var pdfLinks = [];
                  for (var k = 0; k < allLinks.length; k++) {
                    var link2 = allLinks[k];
                    var href2 = link2.href;
                    if (href2 && href2.indexOf('.pdf') !== -1) {
                      pdfLinks.push({
                        href: href2.substring(0, 100),
                        text: (link2.textContent || '').substring(0, 50)
                      });
                    }
                  }
                  info.pdfLinks = pdfLinks.slice(0, 5);
                  
                  // Verificar listas li
                  var listItems = document.querySelectorAll('li');
                  var liWithLinks = [];
                  for (var l = 0; l < Math.min(listItems.length, 20); l++) {
                    var li = listItems[l];
                    var liText = (li.textContent || '').toLowerCase();
                    var linkInLi = li.querySelector('a[href]');
                    if (linkInLi && (liText.indexOf('anexo') !== -1 || liText.indexOf('faq') !== -1 || 
                        liText.indexOf('pdf') !== -1 || liText.indexOf('documento') !== -1)) {
                      liWithLinks.push({
                        text: liText.substring(0, 80),
                        href: (linkInLi as any).href?.substring(0, 100) || ''
                      });
                    }
                  }
                  info.liWithLinks = liWithLinks.slice(0, 5);
                  
                  return info;
                });
                
                console.log(`  🔍 Debug - Elementos .content: ${debugInfo.contentElementsCount}`);
                console.log(`  🔍 Debug - Botões "chamada": ${debugInfo.chamadaButtons.length}`);
                if (debugInfo.chamadaButtons.length > 0) {
                  console.log(`    ${JSON.stringify(debugInfo.chamadaButtons[0])}`);
                }
                console.log(`  🔍 Debug - Links /documents/: ${debugInfo.docLinks.length}`);
                if (debugInfo.docLinks.length > 0) {
                  console.log(`    ${JSON.stringify(debugInfo.docLinks[0])}`);
                }
                console.log(`  🔍 Debug - Links .pdf: ${debugInfo.pdfLinks.length}`);
                if (debugInfo.pdfLinks.length > 0) {
                  console.log(`    ${JSON.stringify(debugInfo.pdfLinks[0])}`);
                }
                console.log(`  🔍 Debug - Listas li com links: ${debugInfo.liWithLinks.length}`);
                if (debugInfo.liWithLinks.length > 0) {
                  console.log(`    ${JSON.stringify(debugInfo.liWithLinks[0])}`);
                }
              }
              
              // Voltar para a página de listagem
              await this.page!.goBack();
              await this.delay(3000);
            } catch (error: any) {
              console.error(`  ❌ Erro ao navegar: ${error.message}`);
              // Tentar voltar mesmo em caso de erro
              try {
                await this.page!.goBack();
                await this.delay(2000);
              } catch {}
            }
          } else {
            console.log(`  ⚠️ Sem link válido para navegar (link: ${edital.link ? edital.link.substring(0, 50) : 'não encontrado'})`);
            
            // IMPORTANTE: Se não navegamos para página de detalhes, garantir que pdfUrls inclua TODOS os PDFs encontrados
            // Incluindo: PDFs da listagem, PDFs de resultado.cnpq.br, e PDFs do botão "Chamada" (em otherLinks)
            if (!edital.pdfUrls || edital.pdfUrls.length === 0) {
              const allFoundPdfs = [...new Set([
                ...pdfsFromListagem,
                ...pdfsFromResultadoPagesBackup,
                ...otherLinks
              ])];
              edital.pdfUrls = allFoundPdfs;
              console.log(`  ✅ Atualizado pdfUrls com ${edital.pdfUrls.length} PDF(s) encontrado(s)`);
              console.log(`     - Da listagem: ${pdfsFromListagem.length}`);
              if (pdfsFromResultadoPagesBackup.length > 0) {
                console.log(`     - Das páginas resultado.cnpq.br: ${pdfsFromResultadoPagesBackup.length}`);
              }
              console.log(`     - Do botão "Chamada" e outros: ${otherLinks.length}`);
            }
          }
        
        // IMPORTANTE: Garantir que pdfUrls está atualizado antes de baixar
        // Combinar TODOS os PDFs encontrados (listagem, resultado.cnpq.br, botão "Chamada")
        if (!edital.pdfUrls || edital.pdfUrls.length === 0) {
          const allFoundPdfs = [...new Set([
            ...pdfsFromListagem,
            ...pdfsFromResultadoPagesBackup,
            ...otherLinks
          ])];
          edital.pdfUrls = allFoundPdfs;
          console.log(`  ✅ pdfUrls inicializado com ${edital.pdfUrls.length} PDF(s)`);
        } else {
          // Mesmo se já tem pdfUrls, garantir que inclui o link do botão "Chamada" se estiver em otherLinks
          // CRÍTICO: Aplicar filtro também aqui para evitar links resultado.cnpq.br genéricos
          const editalLinkIdForUpdate = edital.link ? edital.link.split('/').pop() || '' : '';
          const currentUrls = Array.isArray(edital.pdfUrls) ? edital.pdfUrls : [];
          const missingFromOtherLinks = otherLinks.filter(url => {
            if (!currentUrls.includes(url)) {
              // Se é um link resultado.cnpq.br, validar que pertence ao edital
              if (url.includes('resultado.cnpq.br')) {
                const urlId = url.split('/').pop() || '';
                if (editalLinkIdForUpdate && edital.link && edital.link.includes('resultado.cnpq.br')) {
                  return urlId === editalLinkIdForUpdate;
                }
                // Se o link do edital não é resultado.cnpq.br, não aceitar links resultado.cnpq.br genéricos
                return false;
              }
              return true; // Aceitar outros tipos de links
            }
            return false;
          });
          if (missingFromOtherLinks.length > 0) {
            edital.pdfUrls = [...new Set([...currentUrls, ...missingFromOtherLinks])];
            console.log(`  ✅ Adicionados ${missingFromOtherLinks.length} PDF(s) do botão "Chamada" a pdfUrls`);
          }
        }
        
        // Baixar PDFs se houver (seguindo EXATAMENTE a mesma estratégia do FAPES)
        // Incluir TODOS os PDFs do edital (incluindo anexos e PDF do botão "Chamada")
        // IMPORTANTE: NÃO filtrar links resultado.cnpq.br aqui - eles podem ser PDFs do botão "Chamada"
        // Aceitar TODOS os links em pdfUrls, mesmo sem .pdf ou /documents/ (podem ser PDFs sem extensão)
        const pdfsToDownload = Array.isArray(edital.pdfUrls) 
          ? edital.pdfUrls.filter((url: any) => 
              url && typeof url === 'string'
            )
          : [];
        
        console.log(`  📋 Total de URLs para tentar baixar: ${pdfsToDownload.length}`);
        if (pdfsToDownload.length > 0) {
          console.log(`  📋 Primeiros 5 URLs: ${pdfsToDownload.slice(0, 5).map((u: string) => u.substring(0, 60)).join(', ')}...`);
        } else {
          console.log(`  ⚠️ Nenhuma URL para baixar! pdfUrls tem ${Array.isArray(edital.pdfUrls) ? edital.pdfUrls.length : 0} item(s)`);
          if (Array.isArray(edital.pdfUrls) && edital.pdfUrls.length > 0) {
            console.log(`  🔍 URLs em pdfUrls: ${edital.pdfUrls.map((u: any) => typeof u === 'string' ? u.substring(0, 60) : String(u)).join(', ')}...`);
          }
        }
        
        if (pdfsToDownload.length > 0) {
          // IMPORTANTE: Remover URLs duplicadas antes de baixar
          // Usar normalização apenas para detectar duplicatas, mas manter URLs originais para download
          const urlMap = new Map<string, string>(); // normalized -> original
          
          for (const url of pdfsToDownload) {
            if (!url || typeof url !== 'string') continue;
            
            // Normalizar URL para comparação (remover fragmentos, manter query params)
            let normalized: string;
            try {
              const urlObj = new URL(url);
              // Normalizar: origin + pathname (sem query params e hash para detectar duplicatas)
              normalized = `${urlObj.origin}${urlObj.pathname}`.toLowerCase();
            } catch {
              normalized = url.toLowerCase();
            }
            
            // Se já temos uma URL com mesmo pathname, manter a primeira (ou a mais completa)
            if (!urlMap.has(normalized) || url.length > (urlMap.get(normalized) || '').length) {
              urlMap.set(normalized, url);
            }
          }
          
          const uniquePdfsToDownload = Array.from(urlMap.values());
          
          console.log(`  📥 Baixando ${uniquePdfsToDownload.length} PDF(s) únicos (de ${pdfsToDownload.length} URLs encontradas)...`);
          const pdfPaths: string[] = [];
          const successfullyDownloadedUrls: string[] = []; // URLs que foram baixadas com sucesso
          const downloadedUrls = new Set<string>(); // Rastrear URLs já baixadas nesta execução (normalizadas)
          
          for (let pdfIdx = 0; pdfIdx < uniquePdfsToDownload.length; pdfIdx++) {
            const pdfUrl = uniquePdfsToDownload[pdfIdx];
            
            // Normalizar para verificar duplicatas (mesma lógica de cima)
            let normalizedUrl: string;
            try {
              const urlObj = new URL(pdfUrl);
              normalizedUrl = `${urlObj.origin}${urlObj.pathname}`.toLowerCase();
            } catch {
              normalizedUrl = pdfUrl.toLowerCase();
            }
            
            // Verificar se já baixamos esta URL nesta execução
            if (downloadedUrls.has(normalizedUrl)) {
              console.log(`    ⏭️ URL já processada nesta execução, pulando: ${pdfUrl.substring(0, 60)}...`);
              continue;
            }
            downloadedUrls.add(normalizedUrl);
            console.log(`    📄 PDF ${pdfIdx + 1}/${uniquePdfsToDownload.length}: ${pdfUrl.substring(0, 80)}...`);
            
            try {
              // Validar URL
              let urlPath: string;
              try {
                urlPath = new URL(pdfUrl).pathname;
              } catch {
                console.log(`    ⚠️ URL inválida, pulando: ${pdfUrl.substring(0, 50)}...`);
                continue;
              }
              
              // IMPORTANTE: Manter sessão/cookies ao baixar PDFs
              // Tentar navegar para o link do PDF primeiro para manter sessão
              let fileData: any;
              
              try {
                // Estratégia 1: Tentar navegar para o PDF e capturar o conteúdo
                console.log(`    🔗 Navegando para PDF para manter sessão...`);
                await this.page!.goto(pdfUrl, { 
                  waitUntil: 'networkidle0', 
                  timeout: 30000 
                });
                await this.delay(2000); // Aguardar carregamento
                
                // Capturar o conteúdo da página (que deve ser o PDF)
                fileData = await this.page!.evaluate(() => {
                  // Tentar encontrar o PDF na página
                  const pdfEmbed = document.querySelector('embed[type="application/pdf"], iframe[src*=".pdf"], object[data*=".pdf"]');
                  if (pdfEmbed) {
                    const src = (pdfEmbed as any).src || (pdfEmbed as any).data || '';
                    return { foundEmbed: true, src: src };
                  }
                  return { foundEmbed: false };
                });
                
                // Se encontrou embed, usar fetch para baixar
                if (fileData.foundEmbed && fileData.src) {
                  fileData = await this.page!.evaluate(async (url) => {
                    const response = await fetch(url, {
                      credentials: 'include',
                      headers: {
                        'Accept': 'application/pdf,application/octet-stream,*/*',
                        'Referer': window.location.href, // Manter referer
                      }
                    });
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const contentType = response.headers.get('content-type') || '';
                    const arrayBuffer = await response.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    
                    const isPdf = uint8Array.length >= 4 && 
                                  uint8Array[0] === 0x25 && 
                                  uint8Array[1] === 0x50 && 
                                  uint8Array[2] === 0x44 && 
                                  uint8Array[3] === 0x46;
                    
                    return {
                      data: Array.from(uint8Array),
                      contentType: contentType,
                      isPdf: isPdf,
                      size: uint8Array.length
                    };
                  }, fileData.src);
                } else {
                  // Estratégia 2: Usar fetch diretamente (mantém cookies da sessão atual)
                  fileData = await this.page!.evaluate(async (url) => {
                    const response = await fetch(url, {
                      credentials: 'include',
                      headers: {
                        'Accept': 'application/pdf,application/octet-stream,*/*',
                        'Referer': window.location.href, // Manter referer
                      }
                    });
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const contentType = response.headers.get('content-type') || '';
                    const arrayBuffer = await response.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    
                    const isPdf = uint8Array.length >= 4 && 
                                  uint8Array[0] === 0x25 && 
                                  uint8Array[1] === 0x50 && 
                                  uint8Array[2] === 0x44 && 
                                  uint8Array[3] === 0x46;
                    
                    return {
                      data: Array.from(uint8Array),
                      contentType: contentType,
                      isPdf: isPdf,
                      size: uint8Array.length
                    };
                  }, pdfUrl);
                }
              } catch (navError: any) {
                // Se navegação falhar, tentar fetch direto (ainda mantém cookies)
                console.log(`    ⚠️ Navegação falhou, tentando fetch direto: ${navError.message}`);
                fileData = await this.page!.evaluate(async (url) => {
                  const response = await fetch(url, {
                    credentials: 'include',
                    headers: {
                      'Accept': 'application/pdf,application/octet-stream,*/*',
                      'Referer': window.location.href,
                    }
                  });
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                  }
                  
                  const contentType = response.headers.get('content-type') || '';
                  const arrayBuffer = await response.arrayBuffer();
                  const uint8Array = new Uint8Array(arrayBuffer);
                  
                  const isPdf = uint8Array.length >= 4 && 
                                uint8Array[0] === 0x25 && 
                                uint8Array[1] === 0x50 && 
                                uint8Array[2] === 0x44 && 
                                uint8Array[3] === 0x46;
                  
                  return {
                    data: Array.from(uint8Array),
                    contentType: contentType,
                    isPdf: isPdf,
                    size: uint8Array.length
                  };
                }, pdfUrl);
              }
              
              // Validar se é realmente um PDF
              // IMPORTANTE: Links /documents/ podem não ter Content-Type correto, validar pelo magic number
              if (!fileData.isPdf && !fileData.contentType.includes('pdf') && !fileData.contentType.includes('octet-stream')) {
                console.log(`    ⚠️ Arquivo não é PDF (tipo: ${fileData.contentType}), pulando...`);
                continue;
              }
              
              // Se o magic number indica PDF, aceitar mesmo sem Content-Type correto
              if (!fileData.isPdf && fileData.contentType.includes('octet-stream')) {
                console.log(`    ⚠️ Content-Type genérico, mas validando magic number...`);
                // Já validado pelo magic number no evaluate, então aceitar
              }
              
              // Criar diretório de output se não existir
              if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
              }
              
              // Gerar nome do arquivo (decodificar URL) - seguindo padrão FAPES
              let fileName = decodeURIComponent(path.basename(urlPath));
              
              // Remover extensão .download se existir
              fileName = fileName.replace(/\.download$/i, '');
              
              // Se não tem extensão ou não é .pdf, adicionar .pdf
              if (!fileName.includes('.') || !fileName.toLowerCase().endsWith('.pdf')) {
                // Remover extensão incorreta se houver (exceto .pdf)
                fileName = fileName.replace(/\.[^.]+$/, '');
                fileName = `${fileName}.pdf`;
              }
              
              // Garantir que termina com .pdf (não .pdf.download ou similar)
              if (fileName.toLowerCase().endsWith('.pdf.download') || 
                  fileName.toLowerCase().endsWith('.pdf.crdownload')) {
                fileName = fileName.replace(/\.(download|crdownload)$/i, '');
              }
              
              // Sanitizar nome do arquivo (manter apenas caracteres seguros)
              fileName = fileName
                .replace(/[^a-zA-Z0-9._-]/g, '_')
                .replace(/_{2,}/g, '_')
                .replace(/\.pdf\.pdf$/i, '.pdf') // Remover .pdf duplicado
                .substring(0, 200); // Limitar tamanho
              
              // Garantir que sempre termina com .pdf
              if (!fileName.toLowerCase().endsWith('.pdf')) {
                fileName = `${fileName}.pdf`;
              }
              
              // Criar caminho completo seguindo padrão FAPES (com timestamp e índice)
              const timestamp = Date.now();
              const safeNumero = (edital.numero || `edital-${i + 1}`).replace(/[^a-zA-Z0-9]/g, '_');
              
              // Usar nome do arquivo processado (já tem .pdf garantido)
              // Se o nome do arquivo for muito curto ou inválido, usar padrão
              let finalFileName = fileName;
              if (!finalFileName || finalFileName === '.pdf' || finalFileName.length < 5) {
                finalFileName = `${this.name}_${safeNumero}_${pdfIdx + 1}_${timestamp}.pdf`;
              } else {
                // Garantir que não tenha extensões duplicadas ou .download
                finalFileName = finalFileName
                  .replace(/\.(download|crdownload)$/i, '') // Remover .download ou .crdownload
                  .replace(/\.pdf\.pdf$/i, '.pdf') // Remover .pdf duplicado
                  .replace(/\.pdf\.download$/i, '.pdf') // Remover .pdf.download
                  .replace(/\.pdf\.crdownload$/i, '.pdf'); // Remover .pdf.crdownload
                
                // Adicionar timestamp para evitar conflitos, mas manter nome original
                const nameWithoutExt = finalFileName.replace(/\.pdf$/i, '');
                finalFileName = `${nameWithoutExt}_${timestamp}.pdf`;
              }
              
              // Garantir que sempre termina com .pdf (não .download)
              if (!finalFileName.toLowerCase().endsWith('.pdf')) {
                finalFileName = `${finalFileName.replace(/\.(download|crdownload)$/i, '')}.pdf`;
              }
              
              const pdfPath = path.join(this.outputDir, finalFileName);
              
              // Limpar qualquer arquivo .download ou .crdownload com mesmo nome base
              const baseNameWithoutExt = finalFileName.replace(/\.pdf$/i, '');
              const downloadFiles = [
                path.join(this.outputDir, `${baseNameWithoutExt}.download`),
                path.join(this.outputDir, `${baseNameWithoutExt}.crdownload`),
                path.join(this.outputDir, `${baseNameWithoutExt}.pdf.download`),
                path.join(this.outputDir, `${baseNameWithoutExt}.pdf.crdownload`)
              ];
              
              downloadFiles.forEach(downloadFile => {
                if (fs.existsSync(downloadFile)) {
                  try {
                    fs.unlinkSync(downloadFile);
                    console.log(`    🗑️ Removido arquivo .download: ${path.basename(downloadFile)}`);
                  } catch (e) {
                    // Ignorar erros ao remover
                  }
                }
              });
              
              // Verificar se já existe (evitar duplicatas)
              // IMPORTANTE: Verificar por nome de arquivo E por conteúdo (hash) para detectar PDFs duplicados
              let fileExists = false;
              let existingPdfPath = pdfPath;
              
              if (fs.existsSync(pdfPath)) {
                const existingFile = fs.readFileSync(pdfPath);
                const isPdf = existingFile.length >= 4 && 
                              existingFile[0] === 0x25 && 
                              existingFile[1] === 0x50 && 
                              existingFile[2] === 0x44 && 
                              existingFile[3] === 0x46;
                if (isPdf && existingFile.length === fileData.size) {
                  console.log(`    📄 PDF já existe: ${path.basename(pdfPath)}`);
                  pdfPaths.push(pdfPath);
                  successfullyDownloadedUrls.push(pdfUrl); // URL corresponde a este PDF existente
                  fileExists = true;
                } else {
                  fs.unlinkSync(pdfPath);
                }
              }
              
              // IMPORTANTE: Verificar se há outro arquivo com o mesmo conteúdo (hash)
              // Isso detecta PDFs duplicados mesmo com nomes diferentes
              if (!fileExists && fileData.size > 0) {
                try {
                  const crypto = await import('crypto');
                  const newFileHash = crypto.createHash('md5').update(Buffer.from(fileData.data)).digest('hex');
                  
                  // Verificar todos os PDFs existentes no diretório
                  const existingPdfs = fs.readdirSync(this.outputDir).filter(f => f.endsWith('.pdf'));
                  for (const existingPdf of existingPdfs) {
                    const existingPdfFullPath = path.join(this.outputDir, existingPdf);
                    try {
                      const existingPdfContent = fs.readFileSync(existingPdfFullPath);
                      const existingPdfHash = crypto.createHash('md5').update(existingPdfContent).digest('hex');
                      
                      if (existingPdfHash === newFileHash) {
                        console.log(`    📄 PDF duplicado encontrado (mesmo conteúdo): ${existingPdf} (usando existente)`);
                        pdfPaths.push(existingPdfFullPath);
                        successfullyDownloadedUrls.push(pdfUrl); // URL corresponde a este PDF duplicado
                        fileExists = true;
                        break;
                      }
                    } catch (e) {
                      // Ignorar erros ao ler arquivo existente
                    }
                  }
                } catch (e) {
                  // Se não conseguir calcular hash, continuar normalmente
                }
              }
              
              if (!fileExists) {
                // Salvar arquivo
                fs.writeFileSync(pdfPath, Buffer.from(fileData.data));
                pdfPaths.push(pdfPath);
                successfullyDownloadedUrls.push(pdfUrl); // URL foi baixada com sucesso
                console.log(`    ✅ PDF ${pdfIdx + 1}/${uniquePdfsToDownload.length} baixado: ${path.basename(pdfPath)} (${(fileData.size / 1024).toFixed(2)} KB)`);
              }
              
              // Pequeno delay entre downloads
              await this.delay(500);
            } catch (error: any) {
              console.warn(`    ⚠️ Erro ao baixar PDF ${pdfIdx + 1}: ${error.message}`);
              // Não adicionar URL à lista de sucesso se houve erro
            }
          }
          
          // IMPORTANTE: Manter pdfUrls original, mas garantir que inclui todas as URLs baixadas
          // Não remover URLs que não foram baixadas nesta execução (podem ser de execuções anteriores)
          // Apenas adicionar novas URLs que foram baixadas com sucesso
          const originalUrls = Array.isArray(edital.pdfUrls) ? edital.pdfUrls : [];
          const allUrlsRaw = [...new Set([...originalUrls, ...successfullyDownloadedUrls])];
          
          // CRÍTICO: Filtrar links resultado.cnpq.br para garantir que pertencem ao edital específico
          const editalLinkIdForFinal = edital.link ? edital.link.split('/').pop() || '' : '';
          const allUrls = allUrlsRaw.filter((url: string) => {
            if (url.includes('resultado.cnpq.br')) {
              const urlId = url.split('/').pop() || '';
              if (editalLinkIdForFinal && edital.link && edital.link.includes('resultado.cnpq.br')) {
                const isValid = urlId === editalLinkIdForFinal;
                if (!isValid) {
                  console.log(`  ⚠️ Filtrando link resultado.cnpq.br após download: ${url.substring(0, 80)}... (ID esperado: ${editalLinkIdForFinal}, encontrado: ${urlId})`);
                }
                return isValid;
              }
              // Se o link do edital não é resultado.cnpq.br, não aceitar links resultado.cnpq.br genéricos
              console.log(`  ⚠️ Filtrando link resultado.cnpq.br genérico após download: ${url.substring(0, 80)}...`);
              return false;
            }
            return true; // Aceitar outros tipos de links
          });
          
          if (allUrls.length > 0) {
            edital.pdfUrls = allUrls;
            console.log(`  ✅ pdfUrls mantido/atualizado: ${edital.pdfUrls.length} URL(s) total (${successfullyDownloadedUrls.length} nova(s) baixada(s), ${pdfPaths.length} PDF(s) em pdfPaths)`);
          } else {
            edital.pdfUrls = [];
          }
          
          // Atualizar pdfPaths - GARANTIR que seja sempre um array
          edital.pdfPaths = pdfPaths;
          
          if (pdfPaths.length > 0) {
            console.log(`  ✅ ${pdfPaths.length} PDF(s) baixado(s) com sucesso`);
          } else {
            console.log(`  ⚠️ Nenhum PDF foi baixado (verifique os links)`);
          }
        } else {
          // Garantir que pdfPaths seja um array vazio se não houver PDFs
          edital.pdfPaths = [];
        }
        
        allEditais.push(edital);
      }
      
      console.log(`\n✅ Total de editais processados: ${allEditais.length}`);
      
      return allEditais;
    } catch (error) {
      console.error('❌ Erro durante o scraping:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

