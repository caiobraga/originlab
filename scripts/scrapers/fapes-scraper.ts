import { Scraper, Edital } from '../types';
import { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export class FapesScraper implements Scraper {
  readonly name = 'fapes';
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly editaisUrl = 'https://fapes.es.gov.br/Editais/Abertos';
  private readonly outputDir = path.join(process.cwd(), 'scripts', 'output', 'pdfs');

  private async init() {
    if (this.browser) return;

    const puppeteer = await import('puppeteer');
    const headless =
      String(process.env.PUPPETEER_HEADLESS ?? "1").trim() === "0" ||
      String(process.env.PUPPETEER_HEADLESS ?? "1").trim().toLowerCase() === "false"
        ? false
        : true;
    this.browser = await puppeteer.default.launch({
      headless, // Em servidor (AWS) precisa ser headless
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null, // Usar tamanho de tela completo
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async scrape(): Promise<Edital[]> {
    await this.init();

    try {
      console.log(`📍 Acessando: ${this.editaisUrl}`);
      await this.page!.goto(this.editaisUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.delay(3000);
      
      // Encontrar todos os painéis primeiro (sem expandir ainda)
      const panelTitles = await this.page!.$$('.panel-title, [class*="panel-title"], [data-toggle="collapse"], a[href*="#collapse"]');
      console.log(`🔍 Encontrados ${panelTitles.length} painéis para processar`);
      
      // Processar cada painel individualmente (um por vez, pois são accordions)
      const allEditais: Edital[] = [];
      
      for (let i = 0; i < panelTitles.length; i++) {
        console.log(`\n📄 Processando painel ${i + 1}/${panelTitles.length}...`);
        
        try {
          // Clicar no painel para expandir
          await panelTitles[i].scrollIntoView();
          await this.delay(300);
          await panelTitles[i].click({ delay: 100 });
          console.log(`  ✅ Painel ${i + 1} clicado`);
          
          // Aguardar o painel expandir
          await this.delay(1500);
          
          // Extrair informações deste painel específico
          const editalData = await this.page!.evaluate((baseUrl, panelIndex) => {
            const edital: Partial<Edital> = {};
            const debug: string[] = [];
            
            // Encontrar o painel atual que está expandido
            const expandedPanels = document.querySelectorAll('.collapse.show, .collapse.in, [class*="collapse"][class*="show"], [class*="collapse"][class*="in"]');
            const currentPanel = expandedPanels[panelIndex] || expandedPanels[expandedPanels.length - 1];
            
            if (!currentPanel) {
              debug.push(`  ⚠️ Painel ${panelIndex} não encontrado após expansão`);
              return { edital: null, debug };
            }
            
            // Encontrar o painel pai que contém o título
            let panelContainer: Element | null = currentPanel;
            let depth = 0;
            while (panelContainer && depth < 10) {
              const hasTitle = panelContainer.querySelector('.panel-title, [class*="panel-title"], h3, h4, h5');
              if (hasTitle) {
                break;
              }
              panelContainer = panelContainer.parentElement;
              depth++;
            }
            
            if (!panelContainer) {
              panelContainer = currentPanel.parentElement || currentPanel;
            }
            
            // Extrair título
            const titleElement = panelContainer.querySelector('.panel-title, [class*="panel-title"], h3, h4, h5, strong, b');
            let panelTitle = '';
            if (titleElement) {
              panelTitle = titleElement.textContent?.trim() || '';
            }
            panelTitle = panelTitle.replace(/\s+/g, ' ').trim();
            
            // Extrair número do edital
            let numero = '';
            const numeroMatch = panelTitle.match(/N[º°°]?\s*(\d+\/\d+)/i) || 
                              panelTitle.match(/(\d+\/\d+)/);
            if (numeroMatch) {
              numero = numeroMatch[1];
            }
            
            // Coletar TODOS os PDFs do painel expandido
            const pdfUrls: string[] = [];
            const pdfLinksArray: HTMLAnchorElement[] = [];
            const seenHrefs = new Set<string>();
            
            // Estratégia 1: Procurar dentro do elemento collapse expandido
            const links = currentPanel.querySelectorAll('a');
            links.forEach(link => {
              const anchor = link as HTMLAnchorElement;
              const href = anchor.href || anchor.getAttribute('href') || '';
              
              // Verificar se é um link de PDF
              if (href && (
                href.includes('.pdf') || 
                href.includes('/Media/') || 
                href.includes('/Editais/') ||
                href.toLowerCase().includes('download') ||
                href.toLowerCase().includes('baixar')
              )) {
                // Normalizar href (remover fragmentos e query params para comparação)
                const normalizedHref = href.split('#')[0].split('?')[0];
                
                if (!seenHrefs.has(normalizedHref) && !pdfLinksArray.includes(anchor)) {
                  seenHrefs.add(normalizedHref);
                  pdfLinksArray.push(anchor);
                }
              }
            });
            
            // Estratégia 2: Procurar especificamente por links com .pdf na tabela
            const panelTable = currentPanel.querySelector('table');
            if (panelTable) {
              const tableLinks = panelTable.querySelectorAll('a');
              tableLinks.forEach(link => {
                const anchor = link as HTMLAnchorElement;
                const href = anchor.href || anchor.getAttribute('href') || '';
                
                if (href && (
                  href.includes('.pdf') || 
                  href.includes('/Media/') || 
                  href.includes('/Editais/')
                )) {
                  const normalizedHref = href.split('#')[0].split('?')[0];
                  
                  if (!seenHrefs.has(normalizedHref) && !pdfLinksArray.includes(anchor)) {
                    seenHrefs.add(normalizedHref);
                    pdfLinksArray.push(anchor);
                  }
                }
              });
            }
            
            debug.push(`  Encontrados ${pdfLinksArray.length} link(s) de PDF no painel expandido`);
            
            // Processar cada link
            pdfLinksArray.forEach((pdfLink) => {
              if (!pdfLink || !pdfLink.href) return;
              
              let linkHref = pdfLink.href;
              if (linkHref.startsWith('/')) {
                linkHref = baseUrl + linkHref;
              } else if (!linkHref.startsWith('http')) {
                linkHref = baseUrl + '/' + linkHref;
              }
              
              // Filtrar anexos (incluir na lista mas marcar)
              const linkText = pdfLink.textContent?.trim() || '';
              const linkTextLower = linkText.toLowerCase();
              const isAnexo = linkTextLower.startsWith('anexo') || 
                             /^anexo\s+[ivx]+/i.test(linkTextLower) ||
                             (linkTextLower.includes('formulário') && linkTextLower.includes('anexo')) ||
                             (linkTextLower.includes('formulario') && linkTextLower.includes('anexo'));
              
              // IMPORTANTE: Normalizar URL para comparação (remover fragmentos e query params)
              // Isso evita duplicatas quando a mesma URL aparece com query params diferentes
              let normalizedUrl = linkHref;
              try {
                const urlObj = new URL(linkHref);
                normalizedUrl = `${urlObj.origin}${urlObj.pathname}`;
              } catch {
                normalizedUrl = linkHref.split('#')[0].split('?')[0];
              }
              
              // Verificar se já temos esta URL (normalizada) na lista
              const alreadyAdded = pdfUrls.some(existingUrl => {
                try {
                  const existingUrlObj = new URL(existingUrl);
                  const existingNormalized = `${existingUrlObj.origin}${existingUrlObj.pathname}`;
                  return existingNormalized === normalizedUrl;
                } catch {
                  return existingUrl.split('#')[0].split('?')[0] === normalizedUrl;
                }
              });
              
              // Incluir todos os PDFs, mesmo anexos, mas evitar duplicatas
              if (!alreadyAdded) {
                pdfUrls.push(linkHref);
              }
            });
            
            // Extrair descrição
            let descricao = '';
            const table = currentPanel.querySelector('table');
            if (table) {
              const rows = table.querySelectorAll('tbody tr, tr');
              rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                cells.forEach((cell) => {
                  const text = cell.textContent?.trim() || '';
                  if (text.length > 30 && text.length < 500 && 
                      !text.includes('pdf') && 
                      !text.toLowerCase().includes('baixar') &&
                      !text.toLowerCase().includes('download') &&
                      !text.match(/^\d{2}\/\d{2}\/\d{4}$/) &&
                      !text.match(/^\d+\s*(kB|MB|GB)$/i) &&
                      text !== panelTitle) {
                    if (!descricao || descricao.length < text.length) {
                      descricao = text;
                    }
                  }
                });
              });
            }
            
            // Extrair data
            let dataEncerramento = '';
            const dateMatches = currentPanel.textContent?.match(/(\d{2}\/\d{2}\/\d{4})/g);
            if (dateMatches && dateMatches.length > 0) {
              dataEncerramento = dateMatches[dateMatches.length - 1];
            }
            
            // Validar título
            if (!panelTitle || panelTitle.length < 5) {
              if (pdfLinksArray.length > 0) {
                const firstLink = pdfLinksArray[0];
                const firstLinkText = firstLink.textContent?.trim() || '';
                if (firstLinkText.length > 10 && !firstLinkText.toLowerCase().includes('baixar')) {
                  panelTitle = firstLinkText;
                }
              }
              
              if (!panelTitle || panelTitle.length < 5) {
                if (numero) {
                  panelTitle = `Edital FAPES Nº ${numero}`;
                } else {
                  return { edital: null, debug };
                }
              }
            }
            
            // Verificar se é anexo
            const tituloLower = panelTitle.toLowerCase().trim();
            const isAnexo = tituloLower.startsWith('anexo') || 
                           /^anexo\s+[ivx]+/i.test(tituloLower) ||
                           (tituloLower.includes('formulário') && tituloLower.includes('anexo')) ||
                           (tituloLower.includes('formulario') && tituloLower.includes('anexo'));
            
            if (isAnexo || pdfUrls.length === 0) {
              return { edital: null, debug };
            }
            
            // Encontrar link principal
            let linkPrincipal = pdfUrls[0];
            for (const url of pdfUrls) {
              const urlLower = url.toLowerCase();
              if (!urlLower.includes('anexo') && !urlLower.includes('formulario') && !urlLower.includes('formulário')) {
                linkPrincipal = url;
                break;
              }
            }
            
            edital.numero = numero || undefined;
            edital.titulo = panelTitle;
            edital.descricao = descricao || undefined;
            edital.dataEncerramento = dataEncerramento || undefined;
            edital.status = 'Ativo';
            edital.orgao = 'FAPES';
            edital.fonte = 'fapes';
            edital.link = linkPrincipal;
            edital.pdfUrl = linkPrincipal;
            edital.pdfUrls = pdfUrls;
            edital.pdfPaths = [];
            
            return { edital, debug };
          }, 'https://fapes.es.gov.br', i);
          
          if (editalData.edital) {
            // Baixar PDFs e salvar localmente
            const edital = editalData.edital;
            if (edital.pdfUrls && edital.pdfUrls.length > 0) {
              // IMPORTANTE: Remover URLs duplicadas antes de baixar
              // Usar normalização apenas para detectar duplicatas, mas manter URLs originais para download
              const urlMap = new Map<string, string>(); // normalized -> original
              
              for (const url of edital.pdfUrls) {
                if (!url || typeof url !== 'string') continue;
                
                // Normalizar URL para comparação (remover fragmentos, manter query params)
                let normalized: string;
                try {
                  const urlObj = new URL(url);
                  normalized = `${urlObj.origin}${urlObj.pathname}`.toLowerCase();
                } catch {
                  normalized = url.toLowerCase().split('#')[0].split('?')[0];
                }
                
                // Se já temos uma URL com mesmo pathname, manter a primeira (ou a mais completa)
                if (!urlMap.has(normalized) || url.length > (urlMap.get(normalized) || '').length) {
                  urlMap.set(normalized, url);
                }
              }
              
              const uniquePdfsToDownload = Array.from(urlMap.values());
              
              console.log(`  📥 Baixando ${uniquePdfsToDownload.length} PDF(s) únicos (de ${edital.pdfUrls.length} URLs encontradas)...`);
              const pdfPaths: string[] = [];
              const successfullyDownloadedUrls: string[] = []; // URLs que foram baixadas com sucesso
              const downloadedUrls = new Set<string>(); // Rastrear URLs já baixadas nesta execução (normalizadas)
              
              for (let pdfIdx = 0; pdfIdx < uniquePdfsToDownload.length; pdfIdx++) {
                const pdfUrl = uniquePdfsToDownload[pdfIdx];
                
                // Normalizar para verificar duplicatas
                let normalizedUrl: string;
                try {
                  const urlObj = new URL(pdfUrl);
                  normalizedUrl = `${urlObj.origin}${urlObj.pathname}`.toLowerCase();
                } catch {
                  normalizedUrl = pdfUrl.toLowerCase().split('#')[0].split('?')[0];
                }
                
                // Verificar se já baixamos esta URL nesta execução
                if (downloadedUrls.has(normalizedUrl)) {
                  console.log(`    ⏭️ URL já processada nesta execução, pulando: ${pdfUrl.substring(0, 60)}...`);
                  continue;
                }
                downloadedUrls.add(normalizedUrl);
                
                try {
                  // Validar URL
                  let urlPath: string;
                  try {
                    urlPath = new URL(pdfUrl).pathname;
                  } catch {
                    // Se não for URL válida, pular
                    console.log(`    ⚠️ URL inválida, pulando: ${pdfUrl.substring(0, 50)}...`);
                    continue;
                  }
                  
                  // Incluir TODOS os PDFs do edital (incluindo anexos)
                  // Os anexos fazem parte do edital e devem ser baixados
                  
                  // Baixar arquivo usando Puppeteer (mantém cookies/sessão)
                  const fileData = await this.page!.evaluate(async (url) => {
                    const response = await fetch(url, {
                      credentials: 'include',
                      headers: {
                        'Accept': 'application/pdf,application/octet-stream,*/*',
                      }
                    });
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    
                    const contentType = response.headers.get('content-type') || '';
                    const arrayBuffer = await response.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    
                    // Verificar magic number do PDF
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
                  
                  // Validar se é realmente um PDF
                  if (!fileData.isPdf && !fileData.contentType.includes('pdf')) {
                    console.log(`    ⚠️ Arquivo não é PDF (tipo: ${fileData.contentType}), pulando...`);
                    continue;
                  }
                  
                  // Criar diretório de output se não existir
                  if (!fs.existsSync(this.outputDir)) {
                    fs.mkdirSync(this.outputDir, { recursive: true });
                  }
                  
                  // Gerar nome do arquivo (decodificar URL)
                  let fileName = decodeURIComponent(path.basename(urlPath));
                  
                  // Se não tem extensão ou não é .pdf, adicionar .pdf
                  if (!fileName.includes('.') || !fileName.toLowerCase().endsWith('.pdf')) {
                    // Remover extensão incorreta se houver
                    fileName = fileName.replace(/\.[^.]+$/, '');
                    fileName = `${fileName}.pdf`;
                  }
                  
                  // Sanitizar nome do arquivo (manter apenas caracteres seguros)
                  fileName = fileName
                    .replace(/[^a-zA-Z0-9._-]/g, '_')
                    .replace(/_{2,}/g, '_')
                    .substring(0, 200); // Limitar tamanho
                  
                  // Criar caminho completo (sem subdiretórios, tudo no diretório pdfs)
                  const timestamp = Date.now();
                  const safeNumero = (edital.numero || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
                  const pdfPath = path.join(this.outputDir, `${this.name}_${safeNumero}_${pdfIdx + 1}_${timestamp}.pdf`);
                  
                  // Garantir que o diretório do arquivo existe (caso tenha subdiretórios no nome)
                  const pdfDir = path.dirname(pdfPath);
                  if (!fs.existsSync(pdfDir)) {
                    fs.mkdirSync(pdfDir, { recursive: true });
                  }
                  
                  // IMPORTANTE: Verificar se já existe PDF com mesmo conteúdo (hash) antes de salvar
                  let fileExists = false;
                  if (fileData.size > 0) {
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
                            successfullyDownloadedUrls.push(pdfUrl);
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
                  
                  // Verificar se arquivo já existe pelo nome (mesmo edital, mesmo índice)
                  if (!fileExists && fs.existsSync(pdfPath)) {
                    const existingFile = fs.readFileSync(pdfPath);
                    const isPdf = existingFile.length >= 4 && 
                                  existingFile[0] === 0x25 && 
                                  existingFile[1] === 0x50 && 
                                  existingFile[2] === 0x44 && 
                                  existingFile[3] === 0x46;
                    if (isPdf && existingFile.length === fileData.size) {
                      console.log(`    📄 PDF já existe: ${path.basename(pdfPath)}`);
                      pdfPaths.push(pdfPath);
                      successfullyDownloadedUrls.push(pdfUrl);
                      fileExists = true;
                    } else {
                      fs.unlinkSync(pdfPath);
                    }
                  }
                  
                  if (!fileExists) {
                    // Salvar arquivo
                    fs.writeFileSync(pdfPath, Buffer.from(fileData.data));
                    pdfPaths.push(pdfPath);
                    successfullyDownloadedUrls.push(pdfUrl);
                    console.log(`    ✅ PDF ${pdfIdx + 1}/${uniquePdfsToDownload.length} baixado: ${fileName} (${(fileData.size / 1024).toFixed(2)} KB)`);
                  }
                  
                  // Pequeno delay entre downloads
                  await this.delay(500);
                } catch (error) {
                  console.warn(`    ⚠️ Erro ao baixar PDF ${pdfIdx + 1}: ${error}`);
                  // Não adicionar URL à lista de sucesso se houve erro
                }
              }
              
              // IMPORTANTE: Manter pdfUrls original, mas garantir que inclui todas as URLs baixadas
              // Não remover URLs que não foram baixadas nesta execução (podem ser de execuções anteriores)
              // Apenas adicionar novas URLs que foram baixadas com sucesso
              const originalUrls = Array.isArray(edital.pdfUrls) ? edital.pdfUrls : [];
              const allUrls = [...new Set([...originalUrls, ...successfullyDownloadedUrls])];
              
              if (allUrls.length > 0) {
                edital.pdfUrls = allUrls;
                console.log(`  ✅ pdfUrls mantido/atualizado: ${edital.pdfUrls.length} URL(s) total (${successfullyDownloadedUrls.length} nova(s) baixada(s), ${pdfPaths.length} PDF(s) em pdfPaths)`);
              } else {
                edital.pdfUrls = [];
              }
              
              edital.pdfPaths = pdfPaths;
            }
            
            allEditais.push(edital as Edital);
            console.log(`  ✅ Edital extraído: ${edital.titulo?.substring(0, 60)}... (${edital.pdfUrls?.length || 0} PDFs)`);
          } else {
            if (editalData.debug && editalData.debug.length > 0) {
              editalData.debug.forEach(msg => console.log(`  ${msg}`));
            }
          }
          
        } catch (error) {
          console.log(`  ⚠️ Erro ao processar painel ${i + 1}: ${error}`);
        }
      }
      
      console.log(`\n✅ Total de ${allEditais.length} edital(is) extraído(s)`);
      
      // Manter navegador aberto por mais tempo para visualização (apenas em modo não-headless)
      if (this.browser && !this.browser.process()?.killed) {
        console.log('⏳ Mantendo navegador aberto por 10 segundos para visualização...');
        await this.delay(10000);
      }
      
      return allEditais;
    } catch (error) {
      console.error('Erro ao fazer scraping:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
