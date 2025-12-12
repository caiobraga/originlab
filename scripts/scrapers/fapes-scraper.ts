import { Scraper, Edital } from '../types';
import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import libre from 'libreoffice-convert';
import { promisify } from 'util';

const libreConvert = promisify(libre.convert);

export class FapesScraper implements Scraper {
  readonly name = 'fapes';
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly baseUrl = 'https://fapes.es.gov.br';
  private readonly editaisUrl = 'https://fapes.es.gov.br/Editais/Abertos';
  private readonly outputDir = path.join(process.cwd(), 'scripts', 'output');
  private readonly pdfsDir = path.join(this.outputDir, 'pdfs');

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Iniciando navegador para FAPES...');
    this.browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1920, height: 1080 }
    });
    this.page = await this.browser.newPage();
    
    // Criar diretório de output se não existir
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    if (!fs.existsSync(this.pdfsDir)) {
      fs.mkdirSync(this.pdfsDir, { recursive: true });
    }
  }

  async scrape(): Promise<Edital[]> {
    await this.init();

    try {
      console.log(`📍 Acessando: ${this.editaisUrl}`);
      await this.page!.goto(this.editaisUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.delay(3000);

      // Extrair editais da página
      const editais = await this.page!.evaluate((baseUrl) => {
        const editais: Array<Partial<Edital>> = [];
        const seenUrls = new Set<string>();
        
        // Procurar por tabelas na página
        const tables = document.querySelectorAll('table');
        
        tables.forEach((table) => {
          const rows = table.querySelectorAll('tbody tr, tr');
          
          rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;

            // Coletar TODOS os links de PDF da linha primeiro
            const allPdfLinks: Array<{link: HTMLAnchorElement, text: string, href: string}> = [];
            const pdfLinks = row.querySelectorAll('a[href*=".pdf"], a[href*="/Media/"], a[href*="/Editais/"]') as NodeListOf<HTMLAnchorElement>;
            
            pdfLinks.forEach((pdfLink) => {
              if (!pdfLink || !pdfLink.href) return;
              
              let linkHref = pdfLink.href;
              if (linkHref.startsWith('/')) {
                linkHref = baseUrl + linkHref;
              } else if (!linkHref.startsWith('http')) {
                linkHref = baseUrl + '/' + linkHref;
              }

              // Verificar se já processamos esta URL
              if (seenUrls.has(linkHref)) return;
              seenUrls.add(linkHref);

              allPdfLinks.push({
                link: pdfLink,
                text: pdfLink.textContent?.trim() || '',
                href: linkHref
              });
            });

            // Se não há links, pular esta linha
            if (allPdfLinks.length === 0) return;

            // Encontrar o link principal (aquele que tem o título do edital, não apenas "Baixar")
            let linkPrincipal = allPdfLinks.find(l => {
              const text = l.text.toLowerCase();
              return text.length > 10 && 
                     !text.includes('baixar') && 
                     !text.includes('download') &&
                     (text.includes('edital') || text.includes('nº') || text.includes('numero'));
            });

            // Se não encontrou link principal, usar o primeiro que não seja apenas "Baixar"
            if (!linkPrincipal) {
              linkPrincipal = allPdfLinks.find(l => {
                const text = l.text.toLowerCase();
                return text.length > 5 && text !== 'baixar' && text !== 'download';
              });
            }

            // Se ainda não encontrou, usar o primeiro link
            if (!linkPrincipal) {
              linkPrincipal = allPdfLinks[0];
            }

            // Extrair informações do link principal
            const linkText = linkPrincipal.text;
            let linkHref = linkPrincipal.href;

            // Tentar extrair número do edital
            let numero = '';
            const numeroMatch = linkText.match(/N[º°°]?\s*(\d+\/\d+)/i) || 
                              linkText.match(/(\d+\/\d+)/) ||
                              linkHref.match(/(\d+\.\d+)/) ||
                              linkHref.match(/(\d+\/\d+)/);
            if (numeroMatch) {
              numero = numeroMatch[1].replace(/\./g, '/');
            }

            // Extrair título - procurar em todas as células por texto que pareça título
            let titulo = '';
            
            // Primeiro, tentar usar o texto do link principal (se não for apenas "Baixar")
            if (linkText.length > 10 && linkText.toLowerCase() !== 'baixar') {
              titulo = linkText;
            }

            // Se não encontrou, procurar em outras células
            if (!titulo || titulo.length < 5) {
              cells.forEach((cell) => {
                const cellLinks = cell.querySelectorAll('a');
                cellLinks.forEach((cellLink) => {
                  const cellText = cellLink.textContent?.trim() || '';
                  if (cellText.length > 10 && cellText.length < 200 && 
                      !cellText.toLowerCase().includes('baixar') &&
                      !cellText.toLowerCase().includes('download') &&
                      !cellText.toLowerCase().includes('pdf')) {
                    if (!titulo || titulo.length < cellText.length) {
                      titulo = cellText;
                    }
                  }
                });
                
                // Se não encontrou em links, pegar texto da célula
                if ((!titulo || titulo.length < 5) && cellLinks.length === 0) {
                  const cellText = cell.textContent?.trim() || '';
                  if (cellText.length > 10 && cellText.length < 200 &&
                      !cellText.toLowerCase().includes('baixar') &&
                      !cellText.toLowerCase().includes('download') &&
                      !cellText.toLowerCase().includes('pdf') &&
                      !cellText.match(/^\d{2}\/\d{2}\/\d{4}$/) && // Não é data
                      !cellText.match(/^\d+\s*(kB|MB|GB)$/i)) { // Não é tamanho
                    if (!titulo || titulo.length < cellText.length) {
                      titulo = cellText;
                    }
                  }
                }
              });
            }

            // Extrair descrição (pode estar em outra célula)
            let descricao = '';
            cells.forEach((cell) => {
              const text = cell.textContent?.trim() || '';
              if (text.length > 30 && text.length < 500 && 
                  !text.includes('pdf') && 
                  !text.toLowerCase().includes('baixar') &&
                  !text.toLowerCase().includes('download') &&
                  !text.match(/^\d{2}\/\d{2}\/\d{4}$/) &&
                  !text.match(/^\d+\s*(kB|MB|GB)$/i) &&
                  text !== titulo) {
                if (!descricao || descricao.length < text.length) {
                  descricao = text;
                }
              }
            });

            // Extrair data (procurar padrão de data)
            let dataEncerramento = '';
            cells.forEach((cell) => {
              const text = cell.textContent?.trim() || '';
              const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
              if (dateMatch) {
                dataEncerramento = dateMatch[1];
              }
            });

            // Se não encontrou título válido, tentar extrair do nome do arquivo ou número
            if (!titulo || titulo.length < 5 || titulo.toLowerCase() === 'baixar' || titulo.toLowerCase() === 'download') {
              // Tentar extrair do nome do arquivo do link principal
              const fileNameMatch = linkHref.match(/([^\/]+\.pdf)/i);
              if (fileNameMatch) {
                try {
                  let fileName = decodeURIComponent(fileNameMatch[1]).replace(/\.pdf$/i, '');
                  // Limpar caracteres especiais e normalizar
                  fileName = fileName.replace(/%20/g, ' ')
                                     .replace(/%C3%A7/g, 'ç')
                                     .replace(/%C3%A1/g, 'á')
                                     .replace(/%C3%A9/g, 'é')
                                     .replace(/%C3%AD/g, 'í')
                                     .replace(/%C3%B3/g, 'ó')
                                     .replace(/%C3%BA/g, 'ú')
                                     .replace(/%C3%A3/g, 'ã')
                                     .replace(/%C3%B5/g, 'õ')
                                     .replace(/%C3%81/g, 'Á')
                                     .replace(/%C3%89/g, 'É')
                                     .replace(/%C3%8D/g, 'Í')
                                     .replace(/%C3%93/g, 'Ó')
                                     .replace(/%C3%9A/g, 'Ú')
                                     .replace(/%C3%83/g, 'Ã')
                                     .replace(/%C3%95/g, 'Õ')
                                     .replace(/%C3%A0/g, 'à')
                                     .replace(/%C3%A8/g, 'è')
                                     .replace(/%C3%AC/g, 'ì')
                                     .replace(/%C3%B2/g, 'ò')
                                     .replace(/%C3%B9/g, 'ù')
                                     .replace(/%C2%BA/g, 'º')
                                     .replace(/%C2%AA/g, 'ª')
                                     .replace(/_/g, ' ')
                                     .replace(/\s+/g, ' ')
                                     .trim();
                  
                  // Remover prefixos comuns
                  fileName = fileName.replace(/^edital\s+fapes\s*/i, '')
                                    .replace(/^edital\s*/i, '');
                  
                  if (fileName.length > 10 && fileName.toLowerCase() !== 'baixar') {
                    titulo = fileName;
                  }
                } catch (e) {
                  // Se falhar ao decodificar, tentar usar o nome bruto
                  const rawFileName = fileNameMatch[1].replace(/\.pdf$/i, '').replace(/_/g, ' ');
                  if (rawFileName.length > 10) {
                    titulo = rawFileName;
                  }
                }
              }
              
              // Se ainda não tem título válido, usar número
              if (!titulo || titulo.length < 5 || titulo.toLowerCase() === 'baixar' || titulo.toLowerCase() === 'download') {
                if (numero) {
                  titulo = `Edital FAPES Nº ${numero}`;
                } else {
                  // Tentar extrair número do nome do arquivo
                  const numeroFromFile = linkHref.match(/(\d+\.\d+)/) || linkHref.match(/(\d+\/\d+)/);
                  if (numeroFromFile) {
                    numero = numeroFromFile[1].replace(/\./g, '/');
                    titulo = `Edital FAPES Nº ${numero}`;
                  }
                }
              }
            }

            // VALIDAÇÃO FINAL: Não criar edital se o título ainda for inválido
            const tituloLower = titulo.toLowerCase().trim();
            const titulosInvalidos = ['baixar', 'download', 'edital fapes'];
            const isTituloInvalido = !titulo || 
                titulo.length < 5 || 
                titulosInvalidos.includes(tituloLower) ||
                (tituloLower.startsWith('edital fapes nº') && !numero);
            
            if (isTituloInvalido) {
              // Pular esta linha - não temos informações suficientes para criar um edital válido
              // Não logar aqui pois seria muito verboso - apenas pular silenciosamente
              return;
            }

            // Coletar todas as URLs de PDF da linha (incluindo links "Baixar")
            const pdfUrls: string[] = [];
            allPdfLinks.forEach((pdfLink) => {
              pdfUrls.push(pdfLink.href);
            });

            // Criar um único edital com todos os PDFs
            editais.push({
              numero: numero || undefined,
              titulo: titulo,
              descricao: descricao || undefined,
              dataEncerramento: dataEncerramento || undefined,
              status: 'Ativo',
              orgao: 'FAPES',
              fonte: 'fapes',
              link: linkHref, // Link principal
              pdfUrl: linkHref, // Link principal (compatibilidade)
              pdfUrls: pdfUrls, // Todos os PDFs da linha
              pdfPaths: [], // Inicializar array vazio - será preenchido durante download
            });
          });
        });

        // Se não encontrou em tabelas, procurar em outros elementos
        if (editais.length === 0) {
          const allLinks = document.querySelectorAll('a[href*=".pdf"], a[href*="/Media/"], a[href*="/Editais/"]');
          
          allLinks.forEach((link) => {
            const anchor = link as HTMLAnchorElement;
            const href = anchor.href;
            const text = anchor.textContent?.trim() || '';
            
            // Pular links que são apenas "Baixar" ou "Download"
            if (text.toLowerCase() === 'baixar' || text.toLowerCase() === 'download') {
              return;
            }
            
            if (href.includes('.pdf') || href.includes('/Media/')) {
              let pdfUrl = href;
              if (pdfUrl.startsWith('/')) {
                pdfUrl = baseUrl + pdfUrl;
              } else if (!pdfUrl.startsWith('http')) {
                pdfUrl = baseUrl + '/' + pdfUrl;
              }

              // Extrair número do edital
              let numero = '';
              const numeroMatch = text.match(/N[º°]?\s*(\d+\/\d+)/i) || 
                                text.match(/(\d+\/\d+)/) ||
                                href.match(/(\d+\.\d+)/);
              if (numeroMatch) {
                numero = numeroMatch[1].replace(/\./g, '/');
              }

              // Tentar extrair título do nome do arquivo se o texto não for válido
              let titulo = text;
              if (!titulo || titulo.length < 5 || titulo.toLowerCase() === 'baixar') {
                const fileNameMatch = pdfUrl.match(/([^\/]+\.pdf)/i);
                if (fileNameMatch) {
                  titulo = decodeURIComponent(fileNameMatch[1]).replace(/\.pdf$/i, '');
                  titulo = titulo.replace(/%20/g, ' ').replace(/%C3%A7/g, 'ç').replace(/%C3%A1/g, 'á');
                }
                
                if (!titulo || titulo.length < 5) {
                  if (numero) {
                    titulo = `Edital FAPES Nº ${numero}`;
                  } else {
                    return; // Pular se não conseguimos encontrar título válido
                  }
                }
              }

              // Validação final
              const tituloLower = titulo.toLowerCase().trim();
              if (tituloLower === 'baixar' || tituloLower === 'download' || tituloLower === 'edital fapes') {
                return; // Pular links inválidos
              }

              editais.push({
                numero: numero || undefined,
                titulo: titulo,
                status: 'Ativo',
                orgao: 'FAPES',
                fonte: 'fapes',
                link: pdfUrl,
                pdfUrl: pdfUrl,
                pdfUrls: [pdfUrl],
                pdfPaths: [], // Inicializar array vazio - será preenchido durante download
              });
            }
          });
        }

        return editais;
      }, this.baseUrl);

      console.log(`📊 Encontrados ${editais.length} edital(is) na página`);

      // Baixar PDFs
      await this.downloadPdfs(editais);

      // Verificar se os PDFs foram baixados corretamente
      const editaisComPdfs = editais.filter(e => e.pdfPaths && e.pdfPaths.length > 0);
      console.log(`📁 Editais com PDFs baixados: ${editaisComPdfs.length}/${editais.length}`);

      // Adicionar timestamp de processamento
      const editaisProcessados = editais.map(edital => ({
        ...edital,
        processadoEm: new Date().toISOString(),
        // Garantir que pdfPaths está presente mesmo se vazio
        pdfPaths: edital.pdfPaths || [],
      }));

      return editaisProcessados;
    } catch (error) {
      console.error('❌ Erro ao fazer scraping do FAPES:', error);
      throw error;
    }
  }

  async downloadPdfs(editais: Edital[]) {
    if (!this.page) throw new Error('Página não inicializada');

    console.log(`\n📥 Iniciando download de arquivos para ${editais.length} edital(is)...`);

    for (let i = 0; i < editais.length; i++) {
      const edital = editais[i];
      
      // Coletar todas as URLs de PDF (usar pdfUrls se disponível, senão usar pdfUrl)
      const pdfUrlsToDownload: string[] = [];
      if (edital.pdfUrls && edital.pdfUrls.length > 0) {
        pdfUrlsToDownload.push(...edital.pdfUrls);
      } else if (edital.pdfUrl) {
        pdfUrlsToDownload.push(edital.pdfUrl);
      }

      if (pdfUrlsToDownload.length === 0) {
        console.log(`  ⚠️ Edital ${i + 1}/${editais.length} não tem URLs de PDF, pulando...`);
        continue;
      }

      console.log(`\n📄 Processando edital ${i + 1}/${editais.length}: ${edital.titulo || edital.numero || 'Sem título'}`);
      console.log(`  📎 Total de arquivos para baixar: ${pdfUrlsToDownload.length}`);

      // Inicializar arrays se não existirem
      if (!edital.pdfPaths) {
        edital.pdfPaths = [];
      }

      // Baixar cada PDF do edital
      for (let pdfIdx = 0; pdfIdx < pdfUrlsToDownload.length; pdfIdx++) {
        const pdfUrl = pdfUrlsToDownload[pdfIdx];

        try {
          console.log(`  📥 Baixando arquivo ${pdfIdx + 1}/${pdfUrlsToDownload.length}`);
          console.log(`  🌐 URL: ${pdfUrl}`);

          // Baixar arquivo usando fetch via evaluate
          const fileData = await this.page.evaluate(async (url) => {
            try {
              const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                  'Accept': 'application/pdf,application/octet-stream,*/*',
                }
              });
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              const arrayBuffer = await response.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              
              return { data: Array.from(uint8Array) };
            } catch (error: any) {
              return { error: error.message };
            }
          }, pdfUrl);

          if ('error' in fileData) {
            console.error(`  ❌ Erro ao baixar arquivo: ${fileData.error}`);
            continue;
          }

          // Converter array de bytes para Buffer
          const buffer = Buffer.from(fileData.data.map((b: any) => typeof b === 'number' ? b & 0xFF : parseInt(b) & 0xFF));

          if (!buffer || buffer.length === 0) {
            console.error(`  ❌ Buffer vazio ou inválido`);
            continue;
          }

          // Detectar tipo de arquivo pelo magic number
          let fileExtension = '.pdf';
          let needsConversion = false;

          if (buffer.length >= 4) {
            // ZIP-based formats (Office documents): PK\x03\x04
            if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
              const lowerUrl = pdfUrl.toLowerCase();
              if (lowerUrl.includes('.xlsx') || lowerUrl.includes('excel') || lowerUrl.includes('planilha')) {
                fileExtension = '.xlsx';
              } else if (lowerUrl.includes('.pptx') || lowerUrl.includes('powerpoint') || lowerUrl.includes('apresentacao')) {
                fileExtension = '.pptx';
              } else if (lowerUrl.includes('.odt')) {
                fileExtension = '.odt';
              } else {
                // Assumir DOCX
                fileExtension = '.docx';
                needsConversion = true;
              }
            }
            // PDF: %PDF
            else if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
              fileExtension = '.pdf';
            }
            // DOC antigo: D0 CF 11 E0
            else if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
              fileExtension = '.doc';
              needsConversion = true;
            }
            // Verificar pela URL
            else {
              const lowerUrl = pdfUrl.toLowerCase();
              if (lowerUrl.includes('.docx')) {
                fileExtension = '.docx';
                needsConversion = true;
              } else if (lowerUrl.includes('.doc')) {
                fileExtension = '.doc';
                needsConversion = true;
              } else if (lowerUrl.includes('.pdf')) {
                fileExtension = '.pdf';
              }
            }
          }

          // Converter DOCX/DOC para PDF se necessário
          let finalBuffer = buffer;
          let finalExtension = fileExtension;

          const isDocxFile = fileExtension === '.docx' || 
                            (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04 && 
                             !pdfUrl.toLowerCase().includes('.xlsx') && 
                             !pdfUrl.toLowerCase().includes('.pptx') && 
                             !pdfUrl.toLowerCase().includes('.odt'));

          if (isDocxFile || fileExtension === '.doc') {
            const fileType = isDocxFile ? 'DOCX' : 'DOC';
            console.log(`  🔄 Convertendo ${fileType} para PDF...`);
            try {
              const pdfBuffer = await libreConvert(buffer, '.pdf', undefined) as Buffer;
              finalBuffer = pdfBuffer;
              finalExtension = '.pdf';
              console.log(`  ✅ ${fileType} convertido para PDF (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);
            } catch (convertError) {
              console.error(`  ⚠️ Erro ao converter ${fileType} para PDF: ${convertError}`);
              console.log(`  ℹ️ Mantendo arquivo como ${fileType}`);
            }
          }

          // Gerar nome do arquivo (incluir índice se houver múltiplos arquivos)
          const safeNumero = (edital.numero || `edital_${i + 1}`).replace(/[\/\\:]/g, '_');
          const safeTitulo = (edital.titulo || 'edital').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 40);
          const fileSuffix = pdfUrlsToDownload.length > 1 ? `_${pdfIdx + 1}` : '';
          const filename = `fapes_${safeNumero}_${safeTitulo}${fileSuffix}_${Date.now()}${finalExtension}`;
          const filepath = path.join(this.pdfsDir, filename);

          // Salvar arquivo
          fs.writeFileSync(filepath, finalBuffer);
          
          // Garantir que pdfPaths existe antes de adicionar
          if (!edital.pdfPaths) {
            edital.pdfPaths = [];
          }
          
          // Adicionar caminho do arquivo ao edital
          edital.pdfPaths.push(filepath);
          
          // Definir pdfPath principal se ainda não foi definido
          if (!edital.pdfPath) {
            edital.pdfPath = filepath;
          }

          console.log(`  ✅ Arquivo salvo: ${filename} (${(finalBuffer.length / 1024).toFixed(2)} KB, tipo: ${finalExtension})`);
          console.log(`  📁 Caminho adicionado ao edital: ${filepath}`);

          // Aguardar entre downloads
          await this.delay(1000);
        } catch (error) {
          console.error(`  ❌ Erro ao baixar arquivo ${pdfIdx + 1}: ${error}`);
        }
      }
    }

    console.log(`\n✅ Download concluído!`);
    console.log(`📁 Arquivos salvos em: ${this.pdfsDir}`);
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

