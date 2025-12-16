import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import libre from 'libreoffice-convert';
import { promisify } from 'util';

const libreConvert = promisify(libre.convert);

interface Edital {
  numero?: string;
  titulo?: string;
  descricao?: string;
  dataPublicacao?: string;
  dataEncerramento?: string;
  status?: string;
  valor?: string;
  area?: string;
  pdfUrl?: string;
  pdfPath?: string;
  link?: string;
  [key: string]: any;
}

class SigfapesScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly loginUrl = 'https://www.sigfapes.es.gov.br/';
  private readonly baseUrl = 'https://www.sigfapes.es.gov.br';
  private readonly username = '06341631677';
  private readonly password = 'mariagb123';
  private readonly outputDir = path.join(process.cwd(), 'scripts', 'output');

  // Helper function para substituir waitForTimeout (removido no Puppeteer recente)
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Iniciando navegador...');
    this.browser = await puppeteer.launch({
      headless: false, // Mostra o navegador para debug
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1920, height: 1080 }
    });
    this.page = await this.browser.newPage();
    
    // Configurar handler para alertas/confirmações (aceitar automaticamente)
    this.page.on('dialog', async dialog => {
      console.log(`  ⚠️ Alerta/Confirmação detectado: ${dialog.message()}`);
      await dialog.accept(); // Aceitar automaticamente
    });
    
    // Criar diretório de output se não existir
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async login() {
    if (!this.page) throw new Error('Página não inicializada');

    console.log('🔐 Fazendo login...');
    console.log(`📍 Acessando: ${this.loginUrl}`);
    
    await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Aguardar página carregar completamente (o site menciona aguardar carregamento)
    await this.delay(3000);

    // Screenshot removido para simplificar

    // Aguardar campos de login aparecerem (múltiplos seletores possíveis)
    try {
      await this.page.waitForSelector('input[type="text"], input[type="password"], input[name*="login"], input[name*="usuario"], input[id*="login"], input[id*="usuario"], input[placeholder*="CPF"], input[placeholder*="Login"]', { timeout: 15000 });
    } catch (e) {
      console.log('⚠️ Campos de login não encontrados imediatamente, tentando continuar...');
      await this.delay(2000);
    }

    // Tentar encontrar e preencher campos de login
    // Baseado no site: "Login, CPF ou Nº de Login"
    const loginSelectors = [
      'input[name="login"]',
      'input[name="usuario"]',
      'input[name="cpf"]',
      'input[id="login"]',
      'input[id="usuario"]',
      'input[id="cpf"]',
      'input[type="text"]:not([type="password"])',
      'input[placeholder*="CPF"]',
      'input[placeholder*="Login"]',
      'input[placeholder*="CPF ou"]',
      'input:not([type="password"]):not([type="submit"]):not([type="button"])'
    ];

    let loginFilled = false;
    for (const selector of loginSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(this.username, { delay: 100 });
          loginFilled = true;
          console.log(`✅ Login preenchido usando seletor: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!loginFilled) {
      throw new Error('Não foi possível encontrar o campo de login');
    }

    // Encontrar e preencher campo de senha
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="senha"]',
      'input[name="password"]',
      'input[id="senha"]',
      'input[id="password"]'
    ];

    let passwordFilled = false;
    for (const selector of passwordSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(this.password, { delay: 100 });
          passwordFilled = true;
          console.log(`✅ Senha preenchida usando seletor: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!passwordFilled) {
      throw new Error('Não foi possível encontrar o campo de senha');
    }

    // Aguardar um pouco antes de clicar no botão
    await this.delay(1000);

    // Encontrar e clicar no botão de login
    // Baseado no site: botão "Entrar"
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'input[value*="Entrar"]',
      'input[value*="Login"]',
      'button:contains("Entrar")',
      'button:contains("Login")',
      'a:contains("Entrar")',
      '[onclick*="login"]',
      '[onclick*="entrar"]',
      '.btn-primary',
      '.btn-login',
      'button',
      'input[type="submit"]'
    ];

    let buttonClicked = false;
    for (const selector of buttonSelectors) {
      try {
        const button = await this.page.$(selector);
        if (button) {
          await button.click();
          buttonClicked = true;
          console.log(`✅ Botão de login clicado usando seletor: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!buttonClicked) {
      // Tentar pressionar Enter
      await this.page.keyboard.press('Enter');
      console.log('✅ Tentando login com Enter...');
    }

    // Aguardar navegação após login (o site menciona aguardar carregamento)
    console.log('⏳ Aguardando sistema carregar (conforme mensagem do site)...');
    await this.delay(5000);
    
    // Verificar se a URL mudou (login bem-sucedido)
    const currentUrl = this.page.url();
    console.log(`📍 URL atual após tentativa de login: ${currentUrl}`);
    
    if (currentUrl === this.loginUrl || currentUrl.includes('login')) {
      console.log('⚠️ Ainda na página de login, aguardando mais...');
      await this.delay(5000);
      
      // Verificar se há mensagens de erro
      const errorMessages = await this.page.evaluate(() => {
        const errorTexts = Array.from(document.querySelectorAll('*')).map(el => el.textContent || '').join(' ');
        return {
          hasError: errorTexts.toLowerCase().includes('erro') || 
                   errorTexts.toLowerCase().includes('inválido') ||
                   errorTexts.toLowerCase().includes('incorreto'),
          pageText: document.body.innerText.substring(0, 500)
        };
      });
      
      if (errorMessages.hasError) {
        console.log('❌ Possível erro no login detectado');
        console.log('📄 Texto da página:', errorMessages.pageText);
      }
    } else {
      console.log(`✅ Navegação detectada: ${currentUrl}`);
    }

    // Verificar se login foi bem-sucedido (aguardar elementos da página principal)
    await this.delay(3000);
    
    // Screenshot removido para simplificar

    // Verificar se estamos logados procurando por elementos comuns de dashboard
    const isLoggedIn = await this.page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      return !bodyText.includes('login') || 
             bodyText.includes('sair') || 
             bodyText.includes('logout') ||
             bodyText.includes('dashboard') ||
             bodyText.includes('menu');
    });
    
    if (isLoggedIn) {
      console.log('✅ Login bem-sucedido!');
    } else {
      console.log('⚠️ Não foi possível confirmar login.');
    }
  }

  async navigateToEditais() {
    if (!this.page) throw new Error('Página não inicializada');

    console.log('📋 Navegando para página de editais...');
    console.log(`📍 URL atual: ${this.page.url()}`);

    // Aguardar página carregar completamente
    await this.delay(3000);

    // Screenshot removido para simplificar

    // Estratégia 1: Procurar por links/menus relacionados a editais
    console.log('🔍 Estratégia 1: Procurando links de editais...');
    const links = await this.page.$$eval('a', (anchors) => 
      anchors.map((a, index) => ({
        index,
        text: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
        onclick: a.getAttribute('onclick') || '',
        id: a.getAttribute('id') || '',
        className: a.getAttribute('class') || '',
        visible: a.offsetParent !== null
      }))
    );

    console.log(`📊 Total de links encontrados: ${links.length}`);
    console.log('🔍 Links relevantes encontrados:');
    
    const relevantLinks = links.filter(link => {
      const text = link.text.toLowerCase();
      const href = link.href.toLowerCase();
      const onclick = link.onclick.toLowerCase();
      
      // Buscar por editais abertos especificamente
      const isEditalAberto = (text.includes('edital') && (text.includes('aberto') || text.includes('ativo') || text.includes('disponível'))) ||
                              (text.includes('editais') && (text.includes('aberto') || text.includes('ativo')));
      
      return isEditalAberto ||
             text.includes('edital') || 
             text.includes('chamada') ||
             text.includes('fomento') ||
             text.includes('financiamento') ||
             text.includes('concurso') ||
             href.includes('edital') ||
             href.includes('chamada') ||
             href.includes('aberto') ||
             onclick.includes('edital');
    });

    relevantLinks.slice(0, 10).forEach((link, i) => {
      console.log(`  ${i + 1}. "${link.text}" - ${link.href} (visível: ${link.visible})`);
    });

    // Tentar clicar no primeiro link relevante encontrado
    let found = false;
    for (const link of relevantLinks) {
      if (!link.visible) continue;
      
      try {
        const linkElements = await this.page.$$('a');
        if (linkElements[link.index]) {
          // Scroll até o elemento se necessário
          await linkElements[link.index].scrollIntoView();
          await this.delay(500);
          
          await linkElements[link.index].click();
          found = true;
          console.log(`✅ Clicado no link: "${link.text}"`);
          break;
        }
      } catch (e) {
        console.log(`⚠️ Erro ao clicar no link "${link.text}":`, e);
        // Tentar navegar diretamente pela URL
        if (link.href && !link.href.startsWith('javascript:') && link.href !== '#') {
          try {
            let fullUrl = link.href;
            if (!fullUrl.startsWith('http')) {
              const currentUrl = this.page.url();
              fullUrl = fullUrl.startsWith('/') 
                ? `${new URL(currentUrl).origin}${fullUrl}`
                : `${new URL(currentUrl).origin}/${fullUrl}`;
            }
            console.log(`🌐 Tentando navegar para: ${fullUrl}`);
            await this.page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            found = true;
            console.log(`✅ Navegado para: ${fullUrl}`);
            break;
          } catch (navError) {
            console.log(`⚠️ Erro ao navegar para ${link.href}:`, navError);
          }
        }
      }
    }

    // Estratégia 2: Se não encontrou, procurar por menus dropdown ou botões
    if (!found) {
      console.log('🔍 Estratégia 2: Procurando em menus e botões...');
      
      const buttons = await this.page.$$eval('button, [role="button"], .btn, [class*="button"]', (elements) =>
        elements.map((el, index) => ({
          index,
          text: el.textContent?.trim() || '',
          id: el.getAttribute('id') || '',
          className: el.getAttribute('class') || '',
          onclick: el.getAttribute('onclick') || ''
        }))
      );

      const relevantButtons = buttons.filter(btn => {
        const text = btn.text.toLowerCase();
        return text.includes('edital') || 
               text.includes('chamada') ||
               text.includes('fomento');
      });

      if (relevantButtons.length > 0) {
        console.log(`📋 Botões relevantes encontrados: ${relevantButtons.length}`);
        for (const btn of relevantButtons) {
          console.log(`  - "${btn.text}"`);
        }
      }
    }

    // Estratégia 3: Procurar por iframes que possam conter o conteúdo
    if (!found) {
      console.log('🔍 Estratégia 3: Verificando iframes...');
      const iframes = await this.page.$$('iframe');
      console.log(`📋 Iframes encontrados: ${iframes.length}`);
      
      if (iframes.length > 0) {
        try {
          const iframe = iframes[0];
          const frame = await iframe.contentFrame();
          if (frame) {
            console.log('✅ Iframe encontrado, procurando links dentro dele...');
            const iframeLinks = await frame.$$eval('a', (anchors) =>
              anchors.map(a => ({
                text: a.textContent?.trim() || '',
                href: a.getAttribute('href') || ''
              }))
            );
            
            const editalLinks = iframeLinks.filter(link => 
              link.text.toLowerCase().includes('edital') || 
              link.href.toLowerCase().includes('edital')
            );
            
            if (editalLinks.length > 0) {
              console.log(`✅ Encontrados ${editalLinks.length} links de editais no iframe`);
              // Tentar clicar no primeiro link do iframe
              const iframeLinkElements = await frame.$$('a');
              for (let i = 0; i < iframeLinkElements.length; i++) {
                const linkText = await iframeLinkElements[i].evaluate(el => el.textContent?.trim() || '');
                if (linkText.toLowerCase().includes('edital')) {
                  await iframeLinkElements[i].click();
                  found = true;
                  console.log(`✅ Clicado no link do iframe: "${linkText}"`);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.log('⚠️ Erro ao acessar iframe:', e);
        }
      }
    }

    // Aguardar navegação/carregamento
    await this.delay(3000);
    
    // Verificar se navegamos para uma nova página
    const newUrl = this.page.url();
    console.log(`📍 Nova URL após navegação: ${newUrl}`);
    
    // Screenshot removido para simplificar

    if (!found) {
      console.log('⚠️ Link de editais não encontrado automaticamente.');
      console.log('💡 Você pode precisar ajustar os seletores no código baseado na estrutura real do site');
    }
  }

  async navigateToEditaisList() {
    if (!this.page) throw new Error('Página não inicializada');

    console.log('🔍 Navegando para lista de editais...');
    
    // Tentar múltiplas estratégias para encontrar a lista de editais
    const strategies = [
      // Estratégia 1: Procurar por link "Editais Ativos" ou similar
      async () => {
        if (!this.page) return false;
        const links = await this.page.$$eval('a', (anchors) =>
          anchors.map((a, i) => ({
            index: i,
            text: a.textContent?.trim() || '',
            href: a.getAttribute('href') || ''
          }))
        );
        
        const activeLinks = links.filter(l => 
          l.text.toLowerCase().includes('ativo') && 
          (l.text.toLowerCase().includes('edital') || l.href.toLowerCase().includes('edital'))
        );
        
        if (activeLinks.length > 0 && this.page) {
          const linkElements = await this.page.$$('a');
          if (linkElements[activeLinks[0].index]) {
            await linkElements[activeLinks[0].index].click();
            await this.delay(2000);
            return true;
          }
        }
        return false;
      },
      
      // Estratégia 2: Procurar por tabs ou abas
      async () => {
        if (!this.page) return false;
        const tabs = await this.page.$$eval('[role="tab"], .tab, [class*="tab"]', (elements) =>
          elements.map((el, i) => ({
            index: i,
            text: el.textContent?.trim() || ''
          }))
        );
        
        const activeTab = tabs.find(t => 
          t.text.toLowerCase().includes('ativo') || 
          t.text.toLowerCase().includes('aberto')
        );
        
        if (activeTab && this.page) {
          const tabElements = await this.page.$$('[role="tab"], .tab, [class*="tab"]');
          if (tabElements[activeTab.index]) {
            await tabElements[activeTab.index].click();
            await this.delay(2000);
            return true;
          }
        }
        return false;
      },
      
      // Estratégia 3: Procurar por filtros ou dropdowns
      async () => {
        if (!this.page) return false;
        const selects = await this.page.$$('select');
        for (const select of selects) {
          const options = await select.$$eval('option', (opts) =>
            opts.map((opt, i) => ({
              index: i,
              text: opt.textContent?.trim() || '',
              value: opt.getAttribute('value') || ''
            }))
          );
          
          const activeOption = options.find(opt => 
            opt.text.toLowerCase().includes('ativo') || 
            opt.text.toLowerCase().includes('aberto')
          );
          
          if (activeOption) {
            await select.evaluate((sel, value) => {
              (sel as HTMLSelectElement).value = value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }, activeOption.value || activeOption.text);
            await this.delay(2000);
            return true;
          }
        }
        return false;
      }
    ];

    for (const strategy of strategies) {
      try {
        const success = await strategy();
        if (success) {
          console.log('✅ Navegação para lista de editais bem-sucedida');
          return;
        }
      } catch (e) {
        console.log(`⚠️ Estratégia falhou:`, e);
      }
    }
    
    console.log('ℹ️ Continuando na página atual para extrair editais...');
  }

  async extractEditaisFromList(): Promise<Edital[]> {
    if (!this.page) throw new Error('Página não inicializada');

    console.log('📋 Extraindo lista de editais da página atual...');
    
    // Extrair todos os links de editais da página
    const editalLinks = await this.page.evaluate(() => {
      const links: Array<{text: string, index: number, href: string, onclick: string}> = [];
      const allLinks = Array.from(document.querySelectorAll('a, [onclick], [role="link"], .clickable, tr[onclick], div[onclick]'));
      
      allLinks.forEach((link, index) => {
        const text = link.textContent?.trim() || '';
        const href = (link as HTMLElement).getAttribute('href') || '';
        const onclick = (link as HTMLElement).getAttribute('onclick') || '';
        
        // Verificar se é um link de edital
        if (text.toLowerCase().includes('edital') || 
            text.toLowerCase().includes('chamada') ||
            href.toLowerCase().includes('edital') ||
            onclick.toLowerCase().includes('edital')) {
          links.push({ text, index, href, onclick });
        }
      });
      
      return links;
    });

    console.log(`📊 Encontrados ${editalLinks.length} links de editais na página`);

    const editais: Edital[] = [];
    const allClickableElements = await this.page.$$('a, [onclick], [role="link"], .clickable, tr[onclick], div[onclick]');

    // Processar cada edital
    for (let i = 0; i < editalLinks.length; i++) {
      const editalLink = editalLinks[i];
      console.log(`\n📄 Processando edital ${i + 1}/${editalLinks.length}: ${editalLink.text.substring(0, 60)}...`);

      try {
        // Extrair informações básicas do texto do link
        const edital: Edital = {};
        
        // Extrair número do edital do texto
        const numeroMatch = editalLink.text.match(/(?:edital|nº|n°|n[o°])\s*(?:fapes\s*)?(?:n[o°]?\s*)?([0-9\/\-]+)/i);
        if (numeroMatch) {
          edital.numero = numeroMatch[1].trim();
        }

        // Extrair título (tudo após o número)
        const titleMatch = editalLink.text.match(/(?:edital|nº|n°).*?[-•]\s*(.+)/i);
        if (titleMatch) {
          edital.titulo = titleMatch[1].trim();
        } else {
          // Se não encontrou padrão, pegar texto após número
          const parts = editalLink.text.split(/\d{2,}\/\d{4}/);
          if (parts.length > 1) {
            edital.titulo = parts[parts.length - 1].trim().replace(/^[-•]\s*/, '');
          } else {
            edital.titulo = editalLink.text.substring(0, 200);
          }
        }

        // Extrair data de encerramento do texto
        const dateMatch = editalLink.text.match(/(?:até|prazo|encerra|até\s*)([0-9]{2}-[0-9]{2}-[0-9]{4})/i);
        if (dateMatch) {
          // Converter formato DD-MM-YYYY para DD/MM/YYYY
          edital.dataEncerramento = dateMatch[1].replace(/-/g, '/');
        }

        // Tentar clicar no link para obter mais informações
        if (editalLink.index < allClickableElements.length) {
          const currentUrl = this.page.url();
          
          try {
            const element = allClickableElements[editalLink.index];
            
            // Scroll até o elemento
            await element.scrollIntoView();
            await this.delay(500);
            
            // Clicar no link
            await element.click();
            await this.delay(3000); // Aguardar página carregar
            
            // Verificar se navegamos para uma nova página
            await this.delay(2000);
            const newUrl = this.page.url();
            
            if (newUrl !== currentUrl) {
              console.log(`  ✅ Navegado para página de detalhes: ${newUrl}`);
              
              // Extrair informações detalhadas da página
              const details = await this.page.evaluate(() => {
                const details: any = {};
                const bodyText = document.body.innerText;
                
                // Procurar por PDF
                const pdfLinks = Array.from(document.querySelectorAll('a')).find(a => 
                  a.href.includes('.pdf') || a.textContent?.toLowerCase().includes('pdf') || a.textContent?.toLowerCase().includes('baixar')
                );
                if (pdfLinks) {
                  details.pdfUrl = (pdfLinks as HTMLAnchorElement).href;
                }
                
                // Procurar por datas
                const datePattern = /([0-9]{2}\/[0-9]{2}\/[0-9]{4})/g;
                const dates = Array.from(bodyText.matchAll(datePattern)).map(m => m[1]);
                if (dates.length > 0) {
                  details.dataPublicacao = dates[0];
                  if (dates.length > 1) {
                    details.dataEncerramento = dates[dates.length - 1];
                  }
                }
                
                // Procurar por valor
                const valorMatch = bodyText.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)/i);
                if (valorMatch) {
                  details.valor = valorMatch[1];
                }
                
                // Descrição completa
                details.descricao = bodyText.substring(0, 2000);
                
                return details;
              });
              
              // Mesclar informações detalhadas
              if (details.pdfUrl) edital.pdfUrl = details.pdfUrl;
              if (details.dataPublicacao) edital.dataPublicacao = details.dataPublicacao;
              if (details.dataEncerramento) edital.dataEncerramento = details.dataEncerramento;
              if (details.valor) edital.valor = details.valor;
              if (details.descricao) edital.descricao = details.descricao;
              
              // Voltar para a lista
              await this.page.goBack();
              await this.delay(2000);
            } else {
              console.log(`  ℹ️ Link não navegou para nova página, usando informações do texto`);
            }
          } catch (clickError) {
            console.log(`  ⚠️ Erro ao clicar no link: ${clickError}`);
            // Continuar mesmo se não conseguir clicar
          }
        }

        // Marcar como ativo se tem data de encerramento futura
        edital.status = 'Ativo';
        edital.processadoEm = new Date().toISOString();
        
        // Adicionar à lista
        editais.push(edital);
        console.log(`  ✅ Edital extraído: ${edital.numero || 'N/A'} - ${edital.titulo?.substring(0, 50) || 'Sem título'}`);

      } catch (error) {
        console.error(`  ❌ Erro ao processar edital: ${error}`);
      }
    }

    return editais;
  }

  async extractEditais(): Promise<Edital[]> {
    if (!this.page) throw new Error('Página não inicializada');

    console.log('📥 Extraindo editais...');
    console.log(`📍 URL atual: ${this.page.url()}`);

    // Tentar navegar para a lista de editais ativos primeiro
    await this.navigateToEditaisList();

    // Aguardar conteúdo carregar
    await this.delay(3000);

    // Screenshot removido para simplificar

    // Extrair editais da lista
    const editaisFromList = await this.extractEditaisFromList();

    // Se não encontrou nada na lista, tentar extrair da página atual
    if (editaisFromList.length === 0) {
      console.log('⚠️ Nenhum edital encontrado na lista, tentando extrair da página atual...');
      
      // Tentar aguardar por elementos comuns de tabelas/listas
      try {
        await Promise.race([
          this.page.waitForSelector('table, .table, [class*="table"], .list, [class*="list"], .card, [class*="card"], tbody tr', { timeout: 5000 }),
          this.delay(2000)
        ]);
      } catch (e) {
        console.log('⚠️ Nenhum elemento de tabela/lista encontrado, continuando...');
      }

      // Extrair editais da página usando método antigo como fallback
      const editaisFromPage = await this.page.evaluate(() => {
        const results: Edital[] = [];
      
      // Tentar diferentes seletores comuns para tabelas/listas de editais
      const possibleSelectors = [
        'table tbody tr',
        '.edital-item',
        '.edital-card',
        '[class*="edital"]',
        '.list-item',
        '.card',
        'div[class*="item"]'
      ];

      let elements: Element[] = [];
      
      for (const selector of possibleSelectors) {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          elements = found;
          console.log(`Encontrados ${found.length} elementos com seletor: ${selector}`);
          break;
        }
      }

      // Se não encontrou elementos específicos, tentar pegar todos os elementos que possam ser editais
      if (elements.length === 0) {
        // Procurar por elementos que contenham texto relacionado a editais
        const allDivs = Array.from(document.querySelectorAll('div, tr, li'));
        elements = allDivs.filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('edital') || 
                 text.includes('nº') || 
                 text.includes('publicação') ||
                 text.includes('encerramento');
        });
      }

      elements.forEach((element, index) => {
        const text = element.textContent || '';
        const html = element.innerHTML;

        // Tentar extrair informações estruturadas
        const edital: Edital = {};

        // Procurar por número do edital (múltiplos padrões)
        const numeroPatterns = [
          /(?:edital|nº|n°|numero|número)[\s:]*([0-9\/\-]+)/i,
          /edital[\s]*n[º°]?[\s]*([0-9\/\-]+)/i,
          /([0-9]{2,}\/[0-9]{4})/i, // Formato comum: 18/2025
          /edital[\s]*([0-9]+)/i
        ];
        
        for (const pattern of numeroPatterns) {
          const match = text.match(pattern);
          if (match) {
            edital.numero = match[1].trim();
            break;
          }
        }

        // Procurar por título (múltiplas estratégias)
        const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.title', '.titulo', 'strong', 'b', 'td:first-child', 'th'];
        for (const selector of titleSelectors) {
          const titleElement = element.querySelector(selector);
          if (titleElement && titleElement.textContent?.trim()) {
            const titleText = titleElement.textContent.trim();
            // Ignorar se for apenas número ou data
            if (titleText.length > 5 && !titleText.match(/^[0-9\/\-\s]+$/)) {
              edital.titulo = titleText;
              break;
            }
          }
        }

        // Se não encontrou título, tentar pegar primeira linha significativa
        if (!edital.titulo) {
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10);
          if (lines.length > 0) {
            edital.titulo = lines[0].substring(0, 200);
          }
        }

        // Procurar por datas (múltiplos formatos)
        const dates: string[] = [];
        
        // Padrão 1: Data de publicação específica
        const pubMatch = text.match(/(?:publica[çc][ãa]o|publicado|publicado em|data de publica[çc][ãa]o)[\s:]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
        if (pubMatch && pubMatch[1] && !dates.includes(pubMatch[1])) {
          dates.push(pubMatch[1]);
        }
        
        // Padrão 2: Todas as datas no formato DD/MM/YYYY (com flag global)
        const datePattern = /([0-9]{2}\/[0-9]{2}\/[0-9]{4})/g;
        const allDateMatches = text.matchAll(datePattern);
        for (const match of allDateMatches) {
          if (match[1] && !dates.includes(match[1])) {
            dates.push(match[1]);
          }
        }
        
        if (dates.length > 0) {
          edital.dataPublicacao = dates[0];
          if (dates.length > 1) {
            edital.dataEncerramento = dates[1];
          }
        }

        // Procurar por data de encerramento específica
        const encPatterns = [
          /(?:encerramento|encerra|prazo|até|data limite|vencimento)[\s:]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i,
          /prazo[\s:]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i
        ];
        
        for (const pattern of encPatterns) {
          const match = text.match(pattern);
          if (match) {
            edital.dataEncerramento = match[1];
            break;
          }
        }

        // Procurar por link de PDF (múltiplas estratégias)
        const pdfSelectors = [
          'a[href*=".pdf"]',
          'a[href*="pdf"]',
          'a[onclick*="pdf"]',
          'a[href*="download"]',
          'a[title*="pdf"]',
          'a[title*="baixar"]'
        ];
        
        for (const selector of pdfSelectors) {
          const pdfLink = element.querySelector(selector);
          if (pdfLink) {
            let href = (pdfLink as HTMLAnchorElement).getAttribute('href') || '';
            const onclick = (pdfLink as HTMLAnchorElement).getAttribute('onclick') || '';
            
            // Se href é relativo ou vazio, tentar extrair do onclick
            if (!href || href === '#' || href.startsWith('javascript:')) {
              const onclickMatch = onclick.match(/(https?:\/\/[^\s"']+\.pdf)/i);
              if (onclickMatch) {
                href = onclickMatch[1];
              }
            }
            
            if (href && (href.includes('.pdf') || href.includes('download'))) {
              edital.pdfUrl = href;
              edital.link = href;
              break;
            }
          }
        }

        // Procurar por valor (múltiplos padrões)
        const valorPatterns = [
          /(?:valor|recurso|investimento|total)[\s:]*R\$\s*([0-9.,]+)/i,
          /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)/i,
          /([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})?)[\s]*reais?/i
        ];
        
        for (const pattern of valorPatterns) {
          const match = text.match(pattern);
          if (match) {
            edital.valor = match[1].replace(/\./g, '').replace(',', '.');
            break;
          }
        }

        // Extrair área/tema se disponível
        const areaPatterns = [
          /(?:área|tema|linha)[\s:]*([^0-9\n]{5,30})/i,
          /(?:foco|objetivo)[\s:]*([^0-9\n]{5,50})/i
        ];
        
        for (const pattern of areaPatterns) {
          const match = text.match(pattern);
          if (match && match[1].trim().length > 5) {
            edital.area = match[1].trim().substring(0, 100);
            break;
          }
        }

        // Se encontrou alguma informação relevante, adicionar
        if (edital.numero || edital.titulo || edital.pdfUrl || text.toLowerCase().includes('edital')) {
          edital.descricao = text.substring(0, 1000);
          edital.status = text.toLowerCase().includes('ativo') || 
                         text.toLowerCase().includes('aberto') || 
                         text.toLowerCase().includes('vigente') ? 'Ativo' : 'Desconhecido';
          
          // Adicionar índice se não tiver número
          if (!edital.numero) {
            edital.numero = `EDITAL-${index + 1}`;
          }
          
          results.push(edital);
        }
      });

        return results;
      });

      console.log(`✅ Extraídos ${editaisFromPage.length} editais da página`);
      return editaisFromPage;
    }

    console.log(`✅ Extraídos ${editaisFromList.length} editais da lista`);
    return editaisFromList;
  }

  async downloadPdfs(editais: Edital[]) {
    if (!this.page) throw new Error('Página não inicializada');

    console.log('\n📥 Baixando PDFs dos editais...');
    const pdfsDir = path.join(this.outputDir, 'pdfs');
    
    // Garantir que o diretório existe
    if (!fs.existsSync(pdfsDir)) {
      fs.mkdirSync(pdfsDir, { recursive: true });
    }

    // Carregar editais já processados para evitar downloads duplicados
    const jsonPath = path.join(this.outputDir, 'editais.json');
    let existingEditais: Edital[] = [];
    if (fs.existsSync(jsonPath)) {
      try {
        const existingData = fs.readFileSync(jsonPath, 'utf-8');
        existingEditais = JSON.parse(existingData);
        console.log(`📋 Carregados ${existingEditais.length} editais já processados`);
      } catch (e) {
        console.log('⚠️ Erro ao carregar editais existentes, continuando...');
      }
    }

    // Criar mapa de editais já processados (usando número como chave)
    const processedMap = new Map<string, Edital>();
    existingEditais.forEach(e => {
      if (e.numero) {
        processedMap.set(e.numero, e);
      }
    });

    // Função para verificar se é um anexo
    const isAnexo = (titulo: string): boolean => {
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
    };

    // Filtrar apenas editais com identificação e título válido (excluindo anexos)
    // IMPORTANTE: Sempre reprocessar para garantir que temos TODOS os PDFs
    const validEditais = editais.filter(e => {
      if (!e.numero && !e.titulo) return false;
      // Verificar se tem título válido
      const titulo = e.titulo?.trim() || '';
      if (!titulo || titulo.length <= 3 || titulo === 'Sem título' || titulo === 'N/A') {
        return false;
      }
      // Filtrar anexos (não são editais separados)
      if (isAnexo(titulo)) {
        return false;
      }
      // SEMPRE processar - não pular editais já processados
      // Isso garante que vamos buscar TODOS os PDFs disponíveis
      return true;
    });
    
    console.log(`📊 Processando ${validEditais.length} editais de ${editais.length} totais (reprocessando para garantir todos os PDFs)`);

    // Voltar para a lista de editais primeiro
    console.log('📍 Navegando para lista de editais...');
    await this.page.goto('https://www.sigfapes.es.gov.br/index.php?id=7&acao=1', { waitUntil: 'networkidle2' });
    await this.delay(3000);

    // Processar cada edital para baixar PDF
    for (let i = 0; i < validEditais.length; i++) {
      const edital = validEditais[i];
      
      console.log(`\n📄 Processando edital ${i + 1}/${validEditais.length}: ${edital.numero || 'N/A'} - ${edital.titulo?.substring(0, 50) || 'Sem título'}`);

      try {
        // Voltar para a lista a cada iteração para garantir que estamos na página correta
        await this.page.goto('https://www.sigfapes.es.gov.br/index.php?id=7&acao=1', { waitUntil: 'networkidle2' });
        await this.delay(2000);

        // Encontrar e clicar no link do edital para expandir (seguindo lógica do código antigo)
        const clicked = await this.page.evaluate((numero, titulo) => {
          const allLinks = Array.from(document.querySelectorAll('a'));
          
          for (const link of allLinks) {
            const text = link.textContent?.trim() || '';
            
            // Verificar se é o edital correto
            let isMatch = false;
            if (numero && text.includes(numero)) {
              isMatch = true;
            } else if (titulo && titulo.length > 10 && text.includes(titulo.substring(0, 20))) {
              isMatch = true;
            } else if (text.toLowerCase().includes('edital') && numero && text.includes(numero.replace('/', '/'))) {
              isMatch = true;
            }
            
            if (isMatch && (text.toLowerCase().includes('edital') || text.toLowerCase().includes('chamada'))) {
              // Clicar no link para expandir
              (link as HTMLAnchorElement).click();
              return { success: true };
            }
          }
          return { success: false };
        }, edital.numero || '', edital.titulo || '');

        if (!clicked.success) {
          console.log(`  ⚠️ Link não encontrado para este edital`);
          continue;
        }

        console.log(`  ✅ Link do edital clicado para expandir`);
        
        // Aguardar expansão
        await this.delay(2000);

        // Clicar no ícone "Information" para abrir o pop-up com iframe
        // Usando JavaScript direto porque o elemento tem onclick
        try {
          const infoClicked = await this.page.evaluate(() => {
            // Procurar por link com title="Informações" ou "Information"
            const infoLinks = Array.from(document.querySelectorAll('a[title*="Informação"], a[title*="Information"], a[onclick*="informacao_edital"]'));
            
            for (const link of infoLinks) {
              const onclick = (link as HTMLElement).getAttribute('onclick') || '';
              const title = (link as HTMLElement).getAttribute('title') || '';
              
              if (onclick.includes('informacao_edital') || title.toLowerCase().includes('informação') || title.toLowerCase().includes('information')) {
                // Executar o onclick diretamente
                try {
                  eval(onclick);
                  return { success: true, method: 'onclick' };
                } catch (e) {
                  // Tentar clicar diretamente
                  (link as HTMLElement).click();
                  return { success: true, method: 'click' };
                }
              }
            }
            return { success: false };
          });

          if (infoClicked.success) {
            console.log(`  ✅ Ícone Information acionado usando método: ${infoClicked.method}`);
            await this.delay(2000);
          } else {
            console.log(`  ⚠️ Ícone Information não encontrado`);
            continue;
          }
        } catch (infoError) {
          console.log(`  ⚠️ Erro ao acionar ícone Information: ${infoError}`);
          continue;
        }

        // Esperar o pop-up (iframe) carregar
        try {
          await this.page.waitForSelector('iframe', { timeout: 10000 });
          console.log(`  ✅ Iframe encontrado no pop-up`);
        } catch (iframeError) {
          console.log(`  ⚠️ Iframe não encontrado: ${iframeError}`);
          // Tentar fechar pop-up e continuar
          try {
            await this.page.click('a[title="Close window"]');
          } catch (e) {}
          continue;
        }

        const iframeElement = await this.page.$('iframe');
        if (!iframeElement) {
          console.log(`  ⚠️ Elemento iframe não encontrado`);
          continue;
        }

        const frame = await iframeElement.contentFrame();
        if (!frame) {
          console.log(`  ⚠️ Não foi possível acessar o conteúdo do iframe`);
          continue;
        }

        // Esperar o conteúdo do iframe carregar
        try {
          await frame.waitForSelector('a', { timeout: 10000 });
          console.log(`  ✅ Links encontrados no iframe`);
        } catch (e) {
          console.log(`  ⚠️ Links não encontrados no iframe após timeout, tentando mesmo assim...`);
        }

        // Extrair links de arquivos do iframe
        console.log(`  🔍 Procurando arquivos (PDFs, DOC, XLS, etc.) no iframe...`);
        
        let pdfLinks: Array<{description: string, url: string}> = [];
        
        try {
          // Busca COMPLETA: capturar TODOS os links com download_tipo_anexo.php
          // e também procurar em tabelas, listas e outras estruturas
          pdfLinks = await frame.evaluate(() => {
            const links: Array<{description: string, url: string}> = [];
            const allLinkElements = document.querySelectorAll('a');
            
            console.log(`Iframe: encontrados ${allLinkElements.length} links totais`);
            
            // DEBUG: Listar TODOS os links para entender a estrutura
            const allHrefs: string[] = [];
            allLinkElements.forEach(a => {
              const href = a.href || '';
              const text = a.textContent?.trim() || '';
              if (href) {
                allHrefs.push(`${text.substring(0, 50)} -> ${href.substring(0, 100)}`);
              }
            });
            console.log(`Iframe: TODOS os links encontrados (primeiros 20):`, allHrefs.slice(0, 20));
            
            // Função auxiliar para verificar se é um link de arquivo
            const isFileLink = (href: string, text: string, title: string, onclick: string): boolean => {
              const lowerHref = href.toLowerCase();
              const lowerText = text.toLowerCase();
              const lowerTitle = title.toLowerCase();
              const lowerOnclick = onclick.toLowerCase();
              
              // Padrões de URL de download
              const downloadPatterns = [
                'download_tipo_anexo.php',
                'download.php',
                'download_anexo.php',
                'baixar.php',
                'arquivo.php',
                'file.php',
                'anexo.php',
                '/download/',
                '/arquivos/',
                '/files/',
                '/anexos/'
              ];
              
              // Extensões de arquivo conhecidas
              const fileExtensions = [
                '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                '.zip', '.rar', '.7z', '.tar', '.gz',
                '.txt', '.rtf', '.odt', '.ods', '.odp',
                '.csv', '.xml', '.json'
              ];
              
              // Verificar padrões de download
              if (downloadPatterns.some(pattern => lowerHref.includes(pattern))) {
                return true;
              }
              
              // Verificar extensões de arquivo
              if (fileExtensions.some(ext => lowerHref.includes(ext))) {
                return true;
              }
              
              // Verificar texto/title que indica arquivo
              const fileKeywords = ['pdf', 'doc', 'xls', 'ppt', 'zip', 'rar', 'anexo', 'arquivo', 'download', 'baixar'];
              if (fileKeywords.some(keyword => 
                lowerText.includes(keyword) || 
                lowerTitle.includes(keyword) || 
                lowerOnclick.includes(keyword)
              )) {
                return true;
              }
              
              return false;
            };
            
            // Estratégia 1: Capturar TODOS os links que contêm download_tipo_anexo.php ou outros padrões de download
            allLinkElements.forEach(a => {
              const href = a.href || '';
              const text = a.textContent?.trim() || '';
              const title = a.getAttribute('title') || '';
              const onclick = a.getAttribute('onclick') || '';
              
              // Verificar se é um link de arquivo
              if (isFileLink(href, text, title, onclick)) {
                // DEBUG: Logar TODOS os links de arquivo encontrados
                console.log(`Iframe: LINK DE ARQUIVO encontrado:`);
                console.log(`  - href: ${href}`);
                console.log(`  - text: "${text}"`);
                console.log(`  - title: "${title}"`);
                console.log(`  - onclick: "${onclick}"`);
                
                // Usar texto, title, onclick ou gerar descrição baseada no file ID
                let description = text || title || onclick || '';
                if (!description || description.length < 3) {
                  const fileMatch = href.match(/file=(\d+)/);
                  if (fileMatch) {
                    description = `Arquivo file=${fileMatch[1]}`;
                  } else {
                    // Tentar extrair nome do arquivo da URL
                    const urlMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                    description = urlMatch ? urlMatch[1] : 'Arquivo do Edital';
                  }
                }
                
                // IMPORTANTE: Capturar TODOS os arquivos, SEM FILTROS
                console.log(`Iframe: encontrado arquivo - "${description}" - ${href}`);
                
                // Verificar se já existe (evitar duplicatas por URL)
                if (!links.some(l => l.url === href)) {
                  links.push({
                    description: description,
                    url: href
                  });
                }
              }
            });
            
            // Estratégia 2: Procurar links que podem ter URLs de download no onclick
            allLinkElements.forEach(a => {
              const onclick = a.getAttribute('onclick') || '';
              const href = a.href || '';
              const text = a.textContent?.trim() || '';
              const title = a.getAttribute('title') || '';
              
              // Se não tem href válido mas tem onclick com padrões de download
              if ((!href || href === '#' || href.startsWith('javascript:')) && onclick) {
                // Tentar extrair URLs de download do onclick
                const urlPatterns = [
                  /download_tipo_anexo\.php[^'")]*/,
                  /download\.php[^'")]*/,
                  /download_anexo\.php[^'")]*/,
                  /(https?:\/\/[^\s'")]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))/i,
                  /['"]([^'"]*\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))['"]/i
                ];
                
                for (const pattern of urlPatterns) {
                  const urlMatch = onclick.match(pattern);
                  if (urlMatch) {
                    let extractedUrl = urlMatch[0];
                    // Limpar aspas se necessário
                    if (extractedUrl.startsWith('"') || extractedUrl.startsWith("'")) {
                      extractedUrl = extractedUrl.slice(1, -1);
                    }
                    
                    let description = text || title || onclick || '';
                    if (!description || description.length < 3) {
                      const fileMatch = extractedUrl.match(/file=(\d+)/);
                      if (fileMatch) {
                        description = `Arquivo file=${fileMatch[1]}`;
                      } else {
                        const urlFileMatch = extractedUrl.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                        description = urlFileMatch ? urlFileMatch[1] : 'Arquivo do Edital';
                      }
                    }
                    
                    // Verificar se já existe
                    if (!links.some(l => l.url === extractedUrl || l.url.includes(extractedUrl) || extractedUrl.includes(l.url))) {
                      console.log(`Iframe: encontrado arquivo no onclick - "${description}" - ${extractedUrl}`);
                      links.push({
                        description: description,
                        url: extractedUrl
                      });
                    }
                    break; // Usar apenas o primeiro padrão que encontrar
                  }
                }
              }
            });
            
            // Estratégia 3: Procurar em tabelas, listas e outras estruturas que podem conter links
            const tables = document.querySelectorAll('table');
            console.log(`Iframe: encontradas ${tables.length} tabelas`);
            
            tables.forEach((table, tableIdx) => {
              const tableLinks = table.querySelectorAll('a');
              tableLinks.forEach(a => {
                const href = a.href || '';
                const text = a.textContent?.trim() || '';
                const title = a.getAttribute('title') || '';
                const onclick = a.getAttribute('onclick') || '';
                
                if (isFileLink(href, text, title, onclick)) {
                  let description = text || title || '';
                  if (!description || description.length < 3) {
                    const fileMatch = href.match(/file=(\d+)/);
                    if (fileMatch) {
                      description = `Arquivo file=${fileMatch[1]}`;
                    } else {
                      const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                      description = urlFileMatch ? urlFileMatch[1] : `Arquivo da tabela ${tableIdx + 1}`;
                    }
                  }
                  
                  if (!links.some(l => l.url === href)) {
                    console.log(`Iframe: encontrado arquivo na tabela ${tableIdx + 1} - "${description}" - ${href}`);
                    links.push({
                      description: description,
                      url: href
                    });
                  }
                }
              });
            });
            
            // Estratégia 4: Procurar em listas (ul, ol)
            const lists = document.querySelectorAll('ul, ol');
            console.log(`Iframe: encontradas ${lists.length} listas`);
            
            lists.forEach((list, listIdx) => {
              const listLinks = list.querySelectorAll('a');
              listLinks.forEach(a => {
                const href = a.href || '';
                const text = a.textContent?.trim() || '';
                const title = a.getAttribute('title') || '';
                const onclick = a.getAttribute('onclick') || '';
                
                if (isFileLink(href, text, title, onclick)) {
                  let description = text || title || '';
                  if (!description || description.length < 3) {
                    const fileMatch = href.match(/file=(\d+)/);
                    if (fileMatch) {
                      description = `Arquivo file=${fileMatch[1]}`;
                    } else {
                      const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                      description = urlFileMatch ? urlFileMatch[1] : `Arquivo da lista ${listIdx + 1}`;
                    }
                  }
                  
                  if (!links.some(l => l.url === href)) {
                    console.log(`Iframe: encontrado arquivo na lista ${listIdx + 1} - "${description}" - ${href}`);
                    links.push({
                      description: description,
                      url: href
                    });
                  }
                }
              });
            });
            
            // Estratégia 5: Procurar em divs com classes relacionadas a arquivos/anexos
            const fileDivs = document.querySelectorAll('[class*="file"], [class*="anexo"], [class*="document"], [id*="file"], [id*="anexo"]');
            console.log(`Iframe: encontradas ${fileDivs.length} divs de arquivos`);
            
            fileDivs.forEach((div, divIdx) => {
              const divLinks = div.querySelectorAll('a');
              divLinks.forEach(a => {
                const href = a.href || '';
                const text = a.textContent?.trim() || '';
                const title = a.getAttribute('title') || '';
                const onclick = a.getAttribute('onclick') || '';
                
                if (isFileLink(href, text, title, onclick)) {
                  let description = text || title || '';
                  if (!description || description.length < 3) {
                    const fileMatch = href.match(/file=(\d+)/);
                    if (fileMatch) {
                      description = `Arquivo file=${fileMatch[1]}`;
                    } else {
                      const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                      description = urlFileMatch ? urlFileMatch[1] : `Arquivo do div ${divIdx + 1}`;
                    }
                  }
                  
                  if (!links.some(l => l.url === href)) {
                    console.log(`Iframe: encontrado arquivo no div ${divIdx + 1} - "${description}" - ${href}`);
                    links.push({
                      description: description,
                      url: href
                    });
                  }
                }
              });
            });
            
            console.log(`Iframe: total de arquivos encontrados após busca completa: ${links.length}`);
            return links;
          });
          
          console.log(`  📊 Encontrados ${pdfLinks.length} arquivo(s) no iframe`);
        } catch (iframeError) {
          console.error(`  ❌ Erro ao extrair PDFs do iframe: ${iframeError}`);
          pdfLinks = [];
        }
        
        // Se não encontrou arquivos no iframe, tentar buscar na página principal também
        if (pdfLinks.length === 0) {
          console.log(`  ⚠️ Nenhum arquivo encontrado no iframe, buscando na página principal...`);
          const mainPagePdfs = await this.page.evaluate(() => {
            const links: Array<{description: string, url: string}> = [];
            const linkElements = document.querySelectorAll('a');
            
            // Função auxiliar para verificar se é um link de arquivo
            const isFileLink = (href: string, text: string, title: string, onclick: string): boolean => {
              const lowerHref = href.toLowerCase();
              const lowerText = text.toLowerCase();
              const lowerTitle = title.toLowerCase();
              const lowerOnclick = onclick.toLowerCase();
              
              const downloadPatterns = [
                'download_tipo_anexo.php', 'download.php', 'download_anexo.php',
                'baixar.php', 'arquivo.php', 'file.php', 'anexo.php',
                '/download/', '/arquivos/', '/files/', '/anexos/'
              ];
              
              const fileExtensions = [
                '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                '.zip', '.rar', '.7z', '.tar', '.gz', '.txt', '.rtf',
                '.odt', '.ods', '.odp', '.csv', '.xml', '.json'
              ];
              
              if (downloadPatterns.some(pattern => lowerHref.includes(pattern))) return true;
              if (fileExtensions.some(ext => lowerHref.includes(ext))) return true;
              
              const fileKeywords = ['pdf', 'doc', 'xls', 'ppt', 'zip', 'rar', 'anexo', 'arquivo', 'download', 'baixar'];
              if (fileKeywords.some(keyword => 
                lowerText.includes(keyword) || lowerTitle.includes(keyword) || lowerOnclick.includes(keyword)
              )) return true;
              
              return false;
            };
            
            linkElements.forEach(a => {
              const href = a.href || '';
              const text = a.textContent?.trim() || '';
              const title = a.getAttribute('title') || '';
              const onclick = a.getAttribute('onclick') || '';
              
              if (isFileLink(href, text, title, onclick)) {
                let description = text || title || '';
                if (!description) {
                  const fileMatch = href.match(/file=(\d+)/);
                  if (fileMatch) {
                    description = `Arquivo file=${fileMatch[1]}`;
                  } else {
                    const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                    description = urlFileMatch ? urlFileMatch[1] : 'Arquivo do Edital';
                  }
                }
                
                if (!links.some(l => l.url === href)) {
                  links.push({
                    description: description,
                    url: href
                  });
                }
              }
            });
            
            return links;
          });
          
          pdfLinks.push(...mainPagePdfs);
          console.log(`  📊 Encontrados ${mainPagePdfs.length} arquivo(s) na página principal`);
        }
        
        console.log(`  📊 Total de arquivos encontrados após crawl completo: ${pdfLinks.length}`);
        
        if (pdfLinks.length === 0) {
          console.log(`  ⚠️ Nenhum arquivo encontrado após busca completa`);
          // Fechar pop-up se estiver aberto (tentar múltiplos seletores)
          try {
            const closeSelectors = [
              'a[title="Close window"]',
              'a[title*="Close"]',
              'a[title*="Fechar"]',
              '.close',
              '[onclick*="close"]'
            ];
            
            for (const selector of closeSelectors) {
              try {
                const closeButton = await this.page.$(selector);
                if (closeButton) {
                  await closeButton.click();
                  await this.delay(500);
                  break;
                }
              } catch (e) {
                // Tentar próximo seletor
              }
            }
          } catch (e) {
            // Ignorar - pop-up pode não estar aberto
          }
          continue;
        }

        // Listar TODOS os arquivos encontrados com detalhes
        console.log(`  📋 Lista completa de arquivos encontrados:`);
        pdfLinks.forEach((pdf, idx) => {
          const isManual = pdf.description.toLowerCase().includes('oslo') || pdf.description.toLowerCase().includes('manual');
          const marker = isManual ? '📘' : '📄';
          console.log(`    ${marker} ${idx + 1}. "${pdf.description}"`);
          console.log(`       URL: ${pdf.url}`);
        });

        // Ordenar arquivos: priorizar edital sobre manual de oslo
        const sortedPdfLinks = [...pdfLinks].sort((a, b) => {
          const aDesc = a.description.toLowerCase();
          const bDesc = b.description.toLowerCase();
          
          // Priorizar edital sobre manual
          const aIsManual = aDesc.includes('oslo') || aDesc.includes('manual');
          const bIsManual = bDesc.includes('oslo') || bDesc.includes('manual');
          
          if (aIsManual && !bIsManual) return 1; // Manual depois
          if (!aIsManual && bIsManual) return -1; // Edital antes
          return 0; // Manter ordem original
        });
        
        // ANTES de baixar, vamos também buscar arquivos da área de "Criar Proposta"
        // e combinar com os já encontrados
        console.log(`  🔍 Buscando arquivos adicionais na área de "Criar Proposta"...`);
        
        // Fechar pop-up do iframe se estiver aberto antes de ir para área de proposta
        // Tentar múltiplos seletores possíveis para fechar o pop-up
        try {
          const closeSelectors = [
            'a[title="Close window"]',
            'a[title*="Close"]',
            'a[title*="Fechar"]',
            '.close',
            '[onclick*="close"]',
            'button[title*="Close"]'
          ];
          
          let closed = false;
          for (const selector of closeSelectors) {
            try {
              const closeButton = await this.page.$(selector);
              if (closeButton) {
                await closeButton.click();
                await this.delay(1000);
                closed = true;
                console.log(`  ✅ Pop-up fechado usando seletor: ${selector}`);
                break;
              }
            } catch (e) {
              // Tentar próximo seletor
            }
          }
          
          if (!closed) {
            // Tentar pressionar ESC como último recurso
            await this.page.keyboard.press('Escape');
            await this.delay(500);
          }
        } catch (e) {
          // Ignorar erro silenciosamente - pop-up pode não estar aberto
        }
        
        // Continuar para buscar na área de proposta (código abaixo)
        // Mas primeiro vamos baixar os arquivos já encontrados no iframe
        console.log(`  ✅ Processando ${sortedPdfLinks.length} arquivo(s) do iframe (ordenados: edital primeiro)`);

        // Baixar cada arquivo encontrado no iframe (usar lista ordenada)
        const editalPdfPaths: string[] = [];
        for (let pdfIdx = 0; pdfIdx < sortedPdfLinks.length; pdfIdx++) {
          const pdf = sortedPdfLinks[pdfIdx];
          
          try {
            // Resolver URL relativa se necessário
            let pdfUrl = pdf.url;
            
            // Se a URL não começa com http, precisa ser resolvida
            if (!pdfUrl.startsWith('http')) {
              // Tentar usar a URL base do iframe primeiro
              try {
                const iframeSrc = await this.page.$eval('iframe', (iframe: HTMLIFrameElement) => iframe.src);
                if (iframeSrc) {
                  const iframeBaseUrl = new URL(iframeSrc);
                  pdfUrl = new URL(pdfUrl, iframeBaseUrl.origin + iframeBaseUrl.pathname.substring(0, iframeBaseUrl.pathname.lastIndexOf('/'))).toString();
                } else {
                  // Fallback: usar URL da página principal
                  const baseUrl = new URL(this.page.url());
                  pdfUrl = new URL(pdfUrl, baseUrl.origin).toString();
                }
              } catch (e) {
                // Fallback: usar URL da página principal
                const baseUrl = new URL(this.page.url());
                pdfUrl = new URL(pdfUrl, baseUrl.origin).toString();
              }
            }
            
            console.log(`  🔗 URL resolvida: ${pdfUrl}`);
            
            console.log(`  📥 Baixando arquivo ${pdfIdx + 1}/${sortedPdfLinks.length}: ${pdf.description}`);
            console.log(`  🌐 URL: ${pdfUrl}`);
            
            // Usar fetch via evaluate para baixar o arquivo (evita ERR_ABORTED)
            // Executar no contexto da página principal (fetch funciona de qualquer contexto)
            const pdfData = await this.page.evaluate(async (url) => {
              try {
                console.log(`Fetch: tentando baixar ${url}`);
                const response = await fetch(url, {
                  method: 'GET',
                  credentials: 'include', // Incluir cookies de sessão
                  headers: {
                    'Accept': 'application/pdf,application/octet-stream,*/*',
                  }
                });
                
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                // Verificar content-type
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('pdf') && !contentType.includes('octet-stream') && !url.includes('.pdf')) {
                  console.warn(`⚠️ Content-Type suspeito: ${contentType}`);
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // Verificar magic number do PDF antes de retornar
                if (uint8Array.length >= 4) {
                  const isPdf = uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && 
                                uint8Array[2] === 0x44 && uint8Array[3] === 0x46;
                  if (!isPdf && !url.includes('download')) {
                    console.warn(`⚠️ Arquivo não parece ser PDF (magic: ${Array.from(uint8Array.slice(0, 4)).map(b => b.toString(16)).join(' ')})`);
                  }
                }
                
                // Converter para array de números para serializar via JSON
                // IMPORTANTE: Manter os valores como números (0-255), não strings
                return { data: Array.from(uint8Array) };
              } catch (error: any) {
                return { error: error.message };
              }
            }, pdfUrl);
            
            if ('error' in pdfData) {
              console.error(`  ❌ Erro ao baixar PDF: ${pdfData.error}`);
              continue;
            }
            
            // Converter array de bytes para Buffer
            // IMPORTANTE: Garantir que os valores são números válidos (0-255)
            const buffer = Buffer.from(pdfData.data.map((b: any) => typeof b === 'number' ? b & 0xFF : parseInt(b) & 0xFF));
            
            // Validar buffer antes de continuar
            if (!buffer || buffer.length === 0) {
              console.error(`  ❌ Buffer vazio ou inválido`);
              continue;
            }
            
            // Detectar tipo de arquivo pelo magic number e determinar extensão correta
            // IMPORTANTE: Verificar magic number PRIMEIRO, antes de qualquer outra coisa
            let fileExtension = '.pdf'; // Padrão
            let isDocx = false;
            let needsConversion = false;
            
            if (buffer.length >= 4) {
              // ZIP-based formats (Office documents): PK\x03\x04 - VERIFICAR PRIMEIRO
              // Pode ser DOCX, XLSX, PPTX, ODT, etc.
              if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                // Tentar determinar o tipo específico pela URL ou conteúdo
                if (pdfUrl.includes('.xlsx') || pdfUrl.toLowerCase().includes('excel') || pdfUrl.toLowerCase().includes('planilha')) {
                  fileExtension = '.xlsx';
                } else if (pdfUrl.includes('.pptx') || pdfUrl.toLowerCase().includes('powerpoint') || pdfUrl.toLowerCase().includes('apresentacao')) {
                  fileExtension = '.pptx';
                } else if (pdfUrl.includes('.odt')) {
                  fileExtension = '.odt';
                } else {
                  // Padrão: assumir DOCX
                  fileExtension = '.docx';
                  isDocx = true;
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
                needsConversion = true; // DOC pode ser convertido para PDF
              }
              // ZIP: 50 4B 03 04 (mas já tratado acima como Office)
              // RAR: 52 61 72 21
              else if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
                fileExtension = '.rar';
              }
              // 7Z: 37 7A BC AF 27 1C
              else if (buffer[0] === 0x37 && buffer[1] === 0x7A && buffer[2] === 0xBC && buffer[3] === 0xAF) {
                fileExtension = '.7z';
              }
              // Se não reconhecer pelo magic number, tentar pela URL
              else {
                const lowerUrl = pdfUrl.toLowerCase();
                if (lowerUrl.includes('.docx')) {
                  fileExtension = '.docx';
                  isDocx = true;
                  needsConversion = true;
                } else if (lowerUrl.includes('.doc')) {
                  fileExtension = '.doc';
                  needsConversion = true;
                } else if (lowerUrl.includes('.xlsx')) {
                  fileExtension = '.xlsx';
                } else if (lowerUrl.includes('.xls')) {
                  fileExtension = '.xls';
                } else if (lowerUrl.includes('.pptx')) {
                  fileExtension = '.pptx';
                } else if (lowerUrl.includes('.ppt')) {
                  fileExtension = '.ppt';
                } else if (lowerUrl.includes('.zip')) {
                  fileExtension = '.zip';
                } else if (lowerUrl.includes('.rar')) {
                  fileExtension = '.rar';
                } else if (lowerUrl.includes('.pdf')) {
                  fileExtension = '.pdf';
                }
              }
            }
            
            // IMPORTANTE: Aceitar QUALQUER arquivo baixado, independente do tipo
            // Garantir que fileExtension foi definido corretamente (re-verificar se necessário)
            if (buffer.length >= 4) {
              const magicHex = Array.from(buffer.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');
              // Se ainda está como .pdf mas é DOCX, corrigir
              if (fileExtension === '.pdf' && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                fileExtension = '.docx';
                isDocx = true;
                console.log(`  ⚠️ Corrigindo extensão: arquivo é DOCX mas estava como PDF`);
              }
              console.log(`  🔍 Magic number: ${magicHex} → Extensão: ${fileExtension}`);
            }
            
            // IMPORTANTE: Converter TODOS os DOCX para PDF
            let finalBuffer = buffer;
            let finalExtension = fileExtension;
            
            // Verificar se é DOCX pelo magic number ou pela extensão
            const isDocxFile = fileExtension === '.docx' || 
                              isDocx || 
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
                // Manter o arquivo original se a conversão falhar
              }
            }
            
            const safeNumero = (edital.numero || `edital_${i + 1}`).replace(/[\/\\:]/g, '_');
            const safeDescription = pdf.description.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
            const filename = sortedPdfLinks.length > 1 
              ? `edital_${safeNumero}_${safeDescription}_${Date.now()}${finalExtension}`
              : `edital_${safeNumero}_${Date.now()}${finalExtension}`;
            const filepath = path.join(pdfsDir, filename);
            
            // Garantir que o diretório existe
            if (!fs.existsSync(pdfsDir)) {
              fs.mkdirSync(pdfsDir, { recursive: true });
            }
            
            fs.writeFileSync(filepath, finalBuffer);
            editalPdfPaths.push(filepath);
            
            if (!edital.pdfPath) {
              edital.pdfPath = filepath;
              edital.pdfUrl = pdfUrl;
            }
            if (!edital.pdfPaths) {
              edital.pdfPaths = [];
            }
            if (!edital.pdfUrls) {
              edital.pdfUrls = [];
            }
            edital.pdfPaths.push(filepath);
            edital.pdfUrls.push(pdfUrl);
            
            console.log(`  ✅ Arquivo salvo: ${filename} (${(finalBuffer.length / 1024).toFixed(2)} KB, tipo: ${finalExtension})`);
          } catch (pdfError) {
            console.error(`  ❌ Erro ao baixar PDF: ${pdfError}`);
          }
          
          // Aguardar entre downloads
          await this.delay(1000);
        }

        // Fechar o pop-up após baixar todos os PDFs (tentar múltiplos seletores)
        try {
          const closeSelectors = [
            'a[title="Close window"]',
            'a[title*="Close"]',
            'a[title*="Fechar"]',
            '.close',
            '[onclick*="close"]',
            'button[title*="Close"]'
          ];
          
          let closed = false;
          for (const selector of closeSelectors) {
            try {
              const closeButton = await this.page.$(selector);
              if (closeButton) {
                await closeButton.click();
                await this.delay(500);
                closed = true;
                break;
              }
            } catch (e) {
              // Tentar próximo seletor
            }
          }
          
          if (!closed) {
            // Tentar pressionar ESC como último recurso
            await this.page.keyboard.press('Escape');
            await this.delay(500);
          }
        } catch (e) {
          // Ignorar erro silenciosamente - pop-up pode não estar aberto ou já fechado
        }

        // IMPORTANTE: Os PDFs do iframe já foram coletados acima em pdfLinks
        // Agora vamos também buscar na área de "Criar Proposta" e COMBINAR todos
        
        // Tentar entrar na página "Criar Proposta" para acessar área de arquivos com PDFs
        console.log(`  🔍 Acessando página "Criar Proposta" para buscar PDFs adicionais...`);
        console.log(`  📊 PDFs já encontrados no iframe: ${pdfLinks.length}`);
        try {
          // Primeiro, precisamos obter o ID do edital da lista
          await this.page.goto('https://www.sigfapes.es.gov.br/index.php?id=7&acao=1', { waitUntil: 'networkidle2' });
          await this.delay(2000);

          // Extrair ID do edital do link "Criar Proposta" que tem onclick="SubmeterProposta('1', '1016;604')"
          const editalInfo = await this.page.evaluate((numero, titulo) => {
            // Procurar por link "Criar Proposta" que tem SubmeterProposta no onclick
            const criarPropostaLinks = Array.from(document.querySelectorAll('a[onclick*="SubmeterProposta"], a[title*="Criar"], a[title*="Proposta"]'));
            
            for (const link of criarPropostaLinks) {
              const onclick = (link as HTMLElement).getAttribute('onclick') || '';
              const title = (link as HTMLElement).getAttribute('title') || '';
              
              // Verificar se é o link de criar proposta
              if (onclick.includes('SubmeterProposta') || title.toLowerCase().includes('criar proposta')) {
                // Extrair ID do onclick: SubmeterProposta('1', '1016;604')
                const match = onclick.match(/SubmeterProposta\([^,]+,\s*['"]([0-9;]+)['"]\)/);
                if (match) {
                  return { editalId: match[1], onclick: onclick };
                }
              }
            }
            
            // Método alternativo: procurar pelo número do edital na página
            const allLinks = Array.from(document.querySelectorAll('a, [onclick]'));
            for (const link of allLinks) {
              const text = link.textContent?.trim() || '';
              const onclick = (link as HTMLElement).getAttribute('onclick') || '';
              
              // Verificar se é o edital correto
              let isMatch = false;
              if (numero && text.includes(numero)) {
                isMatch = true;
              } else if (titulo && titulo.length > 10 && text.includes(titulo.substring(0, 20))) {
                isMatch = true;
              }
              
              if (isMatch && onclick.includes('SubmeterProposta')) {
                const match = onclick.match(/SubmeterProposta\([^,]+,\s*['"]([0-9;]+)['"]\)/);
                if (match) {
                  return { editalId: match[1], onclick: onclick };
                }
              }
            }
            
            return null;
          }, edital.numero || '', edital.titulo || '');
          
          const editalId = editalInfo?.editalId || null;

          if (!editalId) {
            console.log(`  ⚠️ ID do edital não encontrado, tentando executar SubmeterProposta diretamente...`);
            
            // Tentar executar SubmeterProposta diretamente
            const propostaExecutada = await this.page.evaluate((numero, titulo) => {
              // Procurar por qualquer link com SubmeterProposta
              const criarPropostaLinks = Array.from(document.querySelectorAll('a[onclick*="SubmeterProposta"]'));
              
              for (const link of criarPropostaLinks) {
                const onclick = (link as HTMLElement).getAttribute('onclick') || '';
                if (onclick.includes('SubmeterProposta')) {
                  try {
                    // Executar a função SubmeterProposta
                    eval(onclick);
                    return { success: true, onclick: onclick };
                  } catch (e) {
                    console.log('Erro ao executar onclick:', e);
                  }
                }
              }
              return { success: false };
            }, edital.numero || '', edital.titulo || '');

            if (propostaExecutada.success) {
              console.log(`  ✅ SubmeterProposta executado`);
              await this.delay(3000);
            } else {
              console.log(`  ⚠️ Não foi possível executar SubmeterProposta`);
              continue;
            }
          } else {
            console.log(`  📋 ID do edital encontrado: ${editalId}`);
            
            // Tentar executar SubmeterProposta diretamente primeiro
            const propostaExecutada = await this.page.evaluate((editalIdParam) => {
              // Procurar por link com SubmeterProposta que contenha o ID do edital
              const criarPropostaLinks = Array.from(document.querySelectorAll('a[onclick*="SubmeterProposta"]'));
              
              for (const link of criarPropostaLinks) {
                const onclick = (link as HTMLElement).getAttribute('onclick') || '';
                if (onclick.includes(editalIdParam)) {
                  try {
                    // Executar a função SubmeterProposta diretamente
                    eval(onclick);
                    return { success: true, method: 'eval' };
                  } catch (e) {
                    // Tentar clicar se eval falhar
                    try {
                      (link as HTMLElement).click();
                      return { success: true, method: 'click' };
                    } catch (clickError) {
                      return { success: false, error: clickError };
                    }
                  }
                }
              }
              return { success: false };
            }, editalId);

            if (propostaExecutada.success) {
              console.log(`  ✅ SubmeterProposta executado usando método: ${propostaExecutada.method}`);
              await this.delay(3000);
            } else {
              // Se não conseguiu executar, tentar navegar diretamente pela URL
              console.log(`  ⚠️ Não foi possível executar SubmeterProposta, tentando navegação direta...`);
              const criarPropostaUrl = `https://www.sigfapes.es.gov.br/index.php?id=7&acao=3&modo=1&edital=${editalId}`;
              console.log(`  🌐 Navegando para: ${criarPropostaUrl}`);
              
              await this.page.goto(criarPropostaUrl, { waitUntil: 'networkidle2', timeout: 30000 });
              await this.delay(3000);
              
              // Verificar se ainda estamos na página correta (alertas podem ter redirecionado)
              const currentUrl = this.page.url();
              console.log(`  📍 URL após navegação: ${currentUrl}`);
              
              // Se não estamos na página esperada, tentar novamente
              if (!currentUrl.includes('acao=3') && !currentUrl.includes('edital=')) {
                console.log(`  ⚠️ Não estamos na página de criar proposta, tentando novamente...`);
                await this.delay(2000);
                await this.page.goto(criarPropostaUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await this.delay(3000);
              }
            }

            // Screenshot removido para simplificar

            // Procurar por área de arquivos - BUSCA COMPLETA
            const propostaPdfs = await this.page.evaluate(() => {
              const pdfs: Array<{description: string, url: string}> = [];
              
              // Função auxiliar para verificar se é um link de arquivo
              const isFileLink = (href: string, text: string, title: string, onclick: string): boolean => {
                const lowerHref = href.toLowerCase();
                const lowerText = text.toLowerCase();
                const lowerTitle = title.toLowerCase();
                const lowerOnclick = onclick.toLowerCase();
                
                const downloadPatterns = [
                  'download_tipo_anexo.php', 'download.php', 'download_anexo.php',
                  'baixar.php', 'arquivo.php', 'file.php', 'anexo.php',
                  '/download/', '/arquivos/', '/files/', '/anexos/'
                ];
                
                const fileExtensions = [
                  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                  '.zip', '.rar', '.7z', '.tar', '.gz', '.txt', '.rtf',
                  '.odt', '.ods', '.odp', '.csv', '.xml', '.json'
                ];
                
                if (downloadPatterns.some(pattern => lowerHref.includes(pattern))) return true;
                if (fileExtensions.some(ext => lowerHref.includes(ext))) return true;
                
                const fileKeywords = ['pdf', 'doc', 'xls', 'ppt', 'zip', 'rar', 'anexo', 'arquivo', 'download', 'baixar'];
                if (fileKeywords.some(keyword => 
                  lowerText.includes(keyword) || lowerTitle.includes(keyword) || lowerOnclick.includes(keyword)
                )) return true;
                
                return false;
              };
              
              // Estratégia 1: Procurar em TODOS os links da página principal
              const allLinks = Array.from(document.querySelectorAll('a'));
              console.log(`Proposta: Total de links na página: ${allLinks.length}`);
              
              // DEBUG: Listar TODOS os links
              const allHrefs: string[] = [];
              allLinks.forEach(a => {
                const href = a.href || '';
                const text = a.textContent?.trim() || '';
                if (href) {
                  allHrefs.push(`${text.substring(0, 50)} -> ${href.substring(0, 100)}`);
                }
              });
              console.log(`Proposta: TODOS os links (primeiros 50):`, allHrefs.slice(0, 50));
              
              // Capturar TODOS os links de arquivo
              allLinks.forEach(a => {
                const href = a.href || '';
                const text = a.textContent?.trim() || '';
                const title = a.getAttribute('title') || '';
                const onclick = a.getAttribute('onclick') || '';
                
                if (isFileLink(href, text, title, onclick)) {
                  console.log(`Proposta: LINK DE ARQUIVO encontrado:`);
                  console.log(`  - href: ${href}`);
                  console.log(`  - text: "${text}"`);
                  console.log(`  - title: "${title}"`);
                  
                  let description = text || title || onclick || '';
                  if (!description) {
                    const fileMatch = href.match(/file=(\d+)/);
                    if (fileMatch) {
                      description = `Arquivo file=${fileMatch[1]}`;
                    } else {
                      const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                      description = urlFileMatch ? urlFileMatch[1] : 'Arquivo do Edital';
                    }
                  }
                  
                  if (!pdfs.some(p => p.url === href)) {
                    pdfs.push({
                      description: description,
                      url: href
                    });
                  }
                }
              });

              // Estratégia 2: Procurar em iframes da página de proposta
              const iframes = Array.from(document.querySelectorAll('iframe'));
              console.log(`Proposta: Iframes encontrados: ${iframes.length}`);
              
              iframes.forEach((iframe, idx) => {
                try {
                  const iframeDoc = (iframe as HTMLIFrameElement).contentDocument;
                  if (iframeDoc) {
                    const iframeLinks = iframeDoc.querySelectorAll('a');
                    console.log(`Proposta: Iframe ${idx + 1} tem ${iframeLinks.length} links`);
                    
                    iframeLinks.forEach(a => {
                      const href = a.href || '';
                      const text = a.textContent?.trim() || '';
                      const title = a.getAttribute('title') || '';
                      const onclick = a.getAttribute('onclick') || '';
                      
                      if (isFileLink(href, text, title, onclick)) {
                        if (!pdfs.some(p => p.url === href)) {
                          let description = text || title || '';
                          if (!description) {
                            const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                            description = urlFileMatch ? urlFileMatch[1] : `Arquivo do iframe ${idx + 1}`;
                          }
                          pdfs.push({
                            description: description,
                            url: href
                          });
                        }
                      }
                    });
                  }
                } catch (e) {
                  console.log(`Proposta: Não foi possível acessar iframe ${idx + 1} (CORS)`);
                }
              });

              // Estratégia 3: Procurar em tabelas
              const tables = Array.from(document.querySelectorAll('table'));
              console.log(`Proposta: Tabelas encontradas: ${tables.length}`);
              
              tables.forEach((table, tableIdx) => {
                const tableLinks = table.querySelectorAll('a');
                tableLinks.forEach(a => {
                  const href = a.href || '';
                  const text = a.textContent?.trim() || '';
                  const title = a.getAttribute('title') || '';
                  const onclick = a.getAttribute('onclick') || '';
                  
                  if (isFileLink(href, text, title, onclick)) {
                    if (!pdfs.some(p => p.url === href)) {
                      let description = text || title || '';
                      if (!description) {
                        const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                        description = urlFileMatch ? urlFileMatch[1] : `Arquivo da tabela ${tableIdx + 1}`;
                      }
                      pdfs.push({
                        description: description,
                        url: href
                      });
                    }
                  }
                });
              });

              // Estratégia 4: Procurar em divs com classes relacionadas a arquivos
              const fileDivs = Array.from(document.querySelectorAll('[class*="file"], [class*="anexo"], [class*="document"], [id*="file"], [id*="anexo"]'));
              console.log(`Proposta: Divs de arquivos encontradas: ${fileDivs.length}`);
              
              fileDivs.forEach((div, divIdx) => {
                const divLinks = div.querySelectorAll('a');
                divLinks.forEach(a => {
                  const href = a.href || '';
                  const text = a.textContent?.trim() || '';
                  const title = a.getAttribute('title') || '';
                  const onclick = a.getAttribute('onclick') || '';
                  
                  if (isFileLink(href, text, title, onclick)) {
                    if (!pdfs.some(p => p.url === href)) {
                      let description = text || title || '';
                      if (!description) {
                        const urlFileMatch = href.match(/([^\/]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))$/i);
                        description = urlFileMatch ? urlFileMatch[1] : `Arquivo do div ${divIdx + 1}`;
                      }
                      pdfs.push({
                        description: description,
                        url: href
                      });
                    }
                  }
                });
              });

              console.log(`Proposta: Total de PDFs encontrados após busca completa: ${pdfs.length}`);
              return pdfs;
            });

            console.log(`  📊 Encontrados ${propostaPdfs.length} arquivos na área de criar proposta`);
            
            // IMPORTANTE: Combinar arquivos da área de proposta com os do iframe
            // Adicionar arquivos da proposta à lista principal (evitando duplicatas)
            propostaPdfs.forEach(propostaPdf => {
              if (!pdfLinks.some(p => p.url === propostaPdf.url)) {
                pdfLinks.push(propostaPdf);
                console.log(`  ➕ Adicionado arquivo da proposta: "${propostaPdf.description}"`);
              }
            });
            
            console.log(`  📊 Total de arquivos após combinar todas as fontes: ${pdfLinks.length}`);
            
            // Criar lista de arquivos novos da proposta que ainda não foram baixados
            const novosPdfsProposta = propostaPdfs.filter(propostaPdf => {
              // Verificar se já foi baixado (está em editalPdfPaths)
              const jaBaixado = editalPdfPaths.some(path => {
                const fileName = path.split('/').pop() || '';
                return fileName.includes(propostaPdf.description.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30));
              });
              return !jaBaixado;
            });
            
            console.log(`  📊 Arquivos novos da proposta para baixar: ${novosPdfsProposta.length} de ${propostaPdfs.length}`);

            // Baixar apenas arquivos novos da área de proposta que ainda não foram baixados
            for (let pdfIdx = 0; pdfIdx < novosPdfsProposta.length; pdfIdx++) {
              const pdf = novosPdfsProposta[pdfIdx];
              
              try {
                let pdfUrl = pdf.url;
                if (!pdfUrl.startsWith('http')) {
                  const baseUrl = new URL(this.page.url());
                  pdfUrl = new URL(pdfUrl, baseUrl).toString();
                }
                
                console.log(`  📥 Baixando arquivo novo da proposta ${pdfIdx + 1}/${novosPdfsProposta.length}: ${pdf.description}`);
                console.log(`  🌐 URL: ${pdfUrl}`);
                
                // Usar fetch via evaluate para baixar o arquivo
                const pdfData = await this.page.evaluate(async (url) => {
                  try {
                    const response = await fetch(url, {
                      method: 'GET',
                      credentials: 'include', // Incluir cookies de sessão
                      headers: {
                        'Accept': 'application/pdf,application/octet-stream,*/*',
                      }
                    });
                    
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    // Verificar content-type
                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('pdf') && !contentType.includes('octet-stream') && !url.includes('.pdf')) {
                      console.warn(`⚠️ Content-Type suspeito: ${contentType}`);
                    }
                    
                    const arrayBuffer = await response.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    
                    // Verificar magic number do PDF
                    if (uint8Array.length >= 4) {
                      const isPdf = uint8Array[0] === 0x25 && uint8Array[1] === 0x50 && 
                                    uint8Array[2] === 0x44 && uint8Array[3] === 0x46;
                      if (!isPdf && !url.includes('download')) {
                        console.warn(`⚠️ Arquivo não parece ser PDF`);
                      }
                    }
                    
                    return { data: Array.from(uint8Array) };
                  } catch (error: any) {
                    return { error: error.message };
                  }
                }, pdfUrl);
                
                if ('error' in pdfData) {
                  console.error(`  ❌ Erro ao baixar arquivo: ${pdfData.error}`);
                  continue;
                }
                
                // Converter array de bytes para Buffer
                // IMPORTANTE: Garantir que os valores são números válidos (0-255)
                const buffer = Buffer.from(pdfData.data.map((b: any) => typeof b === 'number' ? b & 0xFF : parseInt(b) & 0xFF));
                
                // Validar buffer antes de continuar
                if (!buffer || buffer.length === 0) {
                  console.error(`  ❌ Buffer vazio ou inválido`);
                  continue;
                }
                
                // Detectar tipo de arquivo pelo magic number e determinar extensão correta
                // IMPORTANTE: Verificar magic number PRIMEIRO, antes de qualquer outra coisa
                let fileExtension = '.pdf'; // Padrão
                let needsConversion = false;
                
                if (buffer.length >= 4) {
                  // ZIP-based formats (Office documents): PK\x03\x04 - VERIFICAR PRIMEIRO
                  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                    const lowerUrl = pdfUrl.toLowerCase();
                    if (lowerUrl.includes('.xlsx') || lowerUrl.includes('excel') || lowerUrl.includes('planilha')) {
                      fileExtension = '.xlsx';
                    } else if (lowerUrl.includes('.pptx') || lowerUrl.includes('powerpoint') || lowerUrl.includes('apresentacao')) {
                      fileExtension = '.pptx';
                    } else {
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
                  // RAR: 52 61 72 21
                  else if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
                    fileExtension = '.rar';
                  }
                  // 7Z: 37 7A BC AF
                  else if (buffer[0] === 0x37 && buffer[1] === 0x7A && buffer[2] === 0xBC && buffer[3] === 0xAF) {
                    fileExtension = '.7z';
                  }
                  // Se não reconhecer, tentar pela URL
                  else {
                    const lowerUrl = pdfUrl.toLowerCase();
                    if (lowerUrl.includes('.docx')) {
                      fileExtension = '.docx';
                      needsConversion = true;
                    } else if (lowerUrl.includes('.doc')) {
                      fileExtension = '.doc';
                      needsConversion = true;
                    } else if (lowerUrl.includes('.xlsx')) {
                      fileExtension = '.xlsx';
                    } else if (lowerUrl.includes('.xls')) {
                      fileExtension = '.xls';
                    } else if (lowerUrl.includes('.pptx')) {
                      fileExtension = '.pptx';
                    } else if (lowerUrl.includes('.ppt')) {
                      fileExtension = '.ppt';
                    } else if (lowerUrl.includes('.zip')) {
                      fileExtension = '.zip';
                    } else if (lowerUrl.includes('.rar')) {
                      fileExtension = '.rar';
                    } else if (lowerUrl.includes('.pdf')) {
                      fileExtension = '.pdf';
                    }
                  }
                }
                
                // IMPORTANTE: Aceitar QUALQUER arquivo baixado, independente do tipo
                // Garantir que fileExtension foi definido corretamente
                if (!fileExtension || fileExtension === '.pdf') {
                  // Re-verificar se realmente é PDF
                  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
                    fileExtension = '.docx';
                    needsConversion = true;
                  }
                }
                
                // IMPORTANTE: Converter TODOS os DOCX para PDF
                // Verificar se é DOCX pelo magic number ou pela extensão
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
                    buffer = pdfBuffer;
                    fileExtension = '.pdf';
                    console.log(`  ✅ ${fileType} convertido para PDF (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);
                  } catch (convertError) {
                    console.error(`  ⚠️ Erro ao converter ${fileType} para PDF: ${convertError}`);
                    console.log(`  ℹ️ Mantendo arquivo como ${fileType}`);
                  }
                }
                
                const safeNumero = (edital.numero || `edital_${i + 1}`).replace(/[\/\\:]/g, '_');
                const safeDescription = pdf.description.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50);
                const filename = `edital_${safeNumero}_proposta_${safeDescription}_${Date.now()}${fileExtension}`;
                const filepath = path.join(pdfsDir, filename);
                
                // Log do tipo detectado para debug
                if (buffer.length >= 4) {
                  const magicHex = Array.from(buffer.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                  console.log(`  🔍 Magic number: ${magicHex} → Extensão: ${fileExtension}`);
                }
                
                // Garantir que o diretório existe
                if (!fs.existsSync(pdfsDir)) {
                  fs.mkdirSync(pdfsDir, { recursive: true });
                }
                
                fs.writeFileSync(filepath, buffer);
                console.log(`  ✅ Arquivo da proposta salvo: ${filename} (${(buffer.length / 1024).toFixed(2)} KB, tipo: ${fileExtension})`);
                console.log(`  📁 Caminho: ${filepath}`);
                
                // Adicionar à lista de PDFs do edital
                if (!editalPdfPaths.includes(filepath)) {
                  editalPdfPaths.push(filepath);
                }
                
                // Atualizar edital com informações do PDF
                if (!edital.pdfPath) {
                  edital.pdfPath = filepath;
                  edital.pdfUrl = pdfUrl;
                }
                if (!edital.pdfPaths) {
                  edital.pdfPaths = [];
                }
                if (!edital.pdfUrls) {
                  edital.pdfUrls = [];
                }
                edital.pdfPaths.push(filepath);
                edital.pdfUrls.push(pdfUrl);
              } catch (pdfError) {
                console.error(`  ❌ Erro ao baixar arquivo da proposta: ${pdfError}`);
              }
              
              // Não precisa voltar, já estamos na mesma página
              await this.delay(1000);
            }

            // Voltar para a lista após processar proposta
            await this.page.goto('https://www.sigfapes.es.gov.br/index.php?id=7&acao=1', { waitUntil: 'networkidle2' });
            await this.delay(2000);
          }
        } catch (propostaError) {
          console.log(`  ⚠️ Erro ao processar área de criar proposta: ${propostaError}`);
        }

      } catch (error) {
        console.error(`  ❌ Erro ao processar edital: ${error}`);
      }

      // Aguardar entre downloads
      await this.delay(2000);
    }

    console.log(`\n✅ Processo de download concluído!`);
    console.log(`📁 Arquivos salvos em: ${pdfsDir}`);
  }

  async saveResults(editais: Edital[]) {
    // Carregar editais existentes
    const outputPath = path.join(this.outputDir, 'editais.json');
    let allEditais: Edital[] = [];
    
    if (fs.existsSync(outputPath)) {
      try {
        const existingData = fs.readFileSync(outputPath, 'utf-8');
        allEditais = JSON.parse(existingData);
      } catch (e) {
        // Se não conseguir ler, começar do zero
        allEditais = [];
      }
    }

    // Criar mapa de editais existentes por número
    const editaisMap = new Map<string, Edital>();
    allEditais.forEach(e => {
      if (e.numero) {
        editaisMap.set(e.numero, e);
      }
    });

    // Atualizar ou adicionar novos editais
    editais.forEach(edital => {
      if (edital.numero) {
        const existing = editaisMap.get(edital.numero);
        if (existing) {
          // Atualizar edital existente mantendo PDFs anteriores
          const existingPdfs = existing.pdfUrls || [];
          const newPdfs = edital.pdfUrls || [];
          const allPdfs = [...new Set([...existingPdfs, ...newPdfs])]; // Remover duplicatas
          
          const existingPaths = existing.pdfPaths || [];
          const newPaths = edital.pdfPaths || [];
          const allPaths = [...new Set([...existingPaths, ...newPaths])];
          
          editaisMap.set(edital.numero, {
            ...existing,
            ...edital,
            pdfUrls: allPdfs,
            pdfPaths: allPaths,
            pdfPath: edital.pdfPath || existing.pdfPath,
            pdfUrl: edital.pdfUrl || existing.pdfUrl,
            processadoEm: edital.processadoEm || existing.processadoEm
          });
        } else {
          // Novo edital
          editaisMap.set(edital.numero, edital);
        }
      }
    });

    // Converter mapa de volta para array
    const updatedEditais = Array.from(editaisMap.values());
    
    // Salvar JSON atualizado
    fs.writeFileSync(outputPath, JSON.stringify(updatedEditais, null, 2), 'utf-8');
    console.log(`💾 ${updatedEditais.length} editais salvos em: ${outputPath}`);
  }

  async run() {
    try {
      await this.init();
      await this.login();
      await this.navigateToEditais();
      const editais = await this.extractEditais();
      await this.downloadPdfs(editais);
      await this.saveResults(editais);
      
      console.log('\n✅ Scraping concluído com sucesso!');
      console.log(`📊 Total de editais processados: ${editais.length}`);
      console.log(`📁 PDFs salvos em: ${path.join(this.outputDir, 'pdfs')}`);
      console.log(`📄 JSON salvo em: ${path.join(this.outputDir, 'editais.json')}`);
    } catch (error) {
      console.error('❌ Erro durante o scraping:', error);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

// Exportar a classe para uso em outros módulos
export { SigfapesScraper };

// Se executado diretamente, rodar o scraper
// Verificar se está sendo executado como script principal
const isMainModule = process.argv[1]?.includes('scrape-sigfapes.ts');

if (isMainModule) {
  const scraper = new SigfapesScraper();
  scraper.run().catch(console.error);
}

