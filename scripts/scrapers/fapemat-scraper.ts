import { Scraper, Edital } from "../types";
import type { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.fapemat.mt.gov.br";
const LIST_URL = `${BASE}/pt/editais_1?categoryId=73983336`;

/**
 * A listagem e as páginas de detalhe do FAPEMAT (Liferay) são renderizadas por JavaScript.
 * Use FAPEMAT_USE_PUPPETEER=1 para extrair lista e detalhes via navegador headless.
 * Alternativa: FAPEMAT_EDITAL_URLS=url1,url2 quando a lista vem vazia (detales ainda precisam de Puppeteer para PDFs).
 */

/** URLs que são PDF direto: /documents/.../arquivo.pdf/uuid ou termina em .pdf */
const DIRECT_PDF_RE = /\.pdf(\?|#|$|\/)/i;
const DOCUMENTS_PDF_RE = /\/documents\/\d+\/\d+\/[^/]+\.pdf\/[a-f0-9-]+/i;

export class FapematScraper implements Scraper {
  readonly name = "fapemat";
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapemat");

  private get usePuppeteer(): boolean {
    return String(process.env.FAPEMAT_USE_PUPPETEER || "").trim() === "1";
  }

  private readonly downloadPdfs =
    String(process.env.FAPEMAT_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPEMAT_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private async initBrowser(): Promise<void> {
    if (this.browser) return;
    const puppeteer = await import("puppeteer");
    this.browser = await puppeteer.default.launch({
      headless: process.env.FAPEMAT_HEADLESS !== "0",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser!.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string): string {
    const h = String(href || "").trim();
    if (!h || h.startsWith("file:")) return "";
    try {
      return new URL(h, BASE).toString();
    } catch {
      if (h.startsWith("/")) return `${BASE}${h}`;
      return `${BASE}/${h.replace(/^\//, "")}`;
    }
  }

  private extractNumero(titulo: string): string {
    const t = (titulo || "").replace(/\s+/g, " ").trim();
    const m =
      t.match(/n[º°]?\s*(\d+)\s*\/\s*(\d{4})/i) ||
      t.match(/n[º°]?\s*(\d{1,4})\s*-\s*(\d{4})/i) ||
      t.match(/(\d{1,4})\s*\/\s*(\d{4})/);
    if (m) return `${m[1]}/${m[2]}`;
    return "";
  }

  private ddmmyyyyToIso(s: string): string | undefined {
    const m = (s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return undefined;
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  private safeFileNameFromUrl(url: string, prefix: string): string {
    let name = "documento.pdf";
    try {
      const u = new URL(url);
      name = decodeURIComponent(u.pathname.split("/").pop() || name);
    } catch {
      // ignore
    }
    name = name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_").trim();
    if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
    if (name.length > 110) name = name.slice(0, 106) + ".pdf";
    return `${prefix}_${name}`;
  }

  private async fetchText(url: string, timeoutMs = 60000): Promise<string> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.text();
    } finally {
      clearTimeout(t);
    }
  }

  private async downloadPdf(url: string, destPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(destPath)) return true;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 45000);
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "application/pdf,application/octet-stream,*/*" },
      });
      clearTimeout(t);
      if (!r.ok) return false;
      const buf = Buffer.from(await r.arrayBuffer());
      const isPdf =
        buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
      if (!isPdf) return false;
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(destPath, buf);
      return true;
    } catch {
      return false;
    }
  }

  /** Lista via Puppeteer (conteúdo Liferay é carregado por JS). */
  private async fetchListWithPuppeteer(): Promise<{ url: string; titulo: string }[]> {
    await this.initBrowser();
    await this.page!.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 45000 });
    await this.delay(3000);

    const items = await this.page!.evaluate((base: string) => {
      const result: { url: string; titulo: string }[] = [];
      const seen = new Set<string>();
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/pt/w/"], a[href*="/w/"]').forEach((a) => {
        const href = a.href || a.getAttribute("href") || "";
        if (!href || !href.includes("fapemat.mt.gov.br") || !href.includes("/w/")) return;
        const url = href.split("?")[0].replace(/\/$/, "");
        if (seen.has(url)) return;
        seen.add(url);
        const titulo = a.textContent?.trim().replace(/\s+/g, " ") || "Edital FAPEMAT";
        result.push({ url, titulo });
      });
      return result;
    }, BASE);
    return items;
  }

  /** HTML da página de detalhe via Puppeteer. */
  private async fetchDetailHtmlWithPuppeteer(url: string): Promise<string> {
    await this.initBrowser();
    await this.page!.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await this.delay(2000);
    return await this.page!.content();
  }

  /**
   * Extrai da lista de editais (editais_1) os links para páginas de detalhe (/pt/w/...).
   * O conteúdo pode estar em main ou em portlets; aceita href com /w/ ou /pt/w/.
   */
  private extractListItems(html: string): { url: string; titulo: string }[] {
    const $ = cheerio.load(html);
    const items: { url: string; titulo: string }[] = [];
    const seen = new Set<string>();

    const addLink = (el: cheerio.Element) => {
      const href = $(el).attr("href");
      const titulo = $(el).text().trim().replace(/\s+/g, " ");
      if (!href || titulo.length < 10) return;
      const url = this.absoluteUrl(href);
      if (!url || !url.includes("fapemat.mt.gov.br")) return;
      if (!url.includes("/w/")) return;
      if (seen.has(url)) return;
      seen.add(url);
      items.push({ url, titulo });
    };

    $("main a[href*='/pt/w/']").each((_, el) => addLink(el));
    if (items.length === 0) {
      $("a[href*='/pt/w/']").each((_, el) => addLink(el));
    }
    if (items.length === 0) {
      $("a[href*='/w/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href || !href.includes("fapemat")) return;
        addLink(el);
      });
    }

    return items;
  }

  /**
   * Extrai da página de detalhe: título (h3), data (DD/MM/YYYY), descrição e todos os links para PDFs.
   * - PDFs diretos: .../arquivo.pdf/uuid ou href terminando em .pdf
   * - Documentos do Liferay: /documents/d/fapemat/... são incluídos como pdfUrl (página do documento; download pode ser resolvido depois)
   */
  private extractDetail(html: string, pageUrl: string): {
    titulo: string;
    dataPublicacao?: string;
    descricao?: string;
    pdfUrls: string[];
  } {
    const $ = cheerio.load(html);
    const titulo =
      $("main h3").first().text().trim().replace(/\s+/g, " ") ||
      $("main h2").first().text().trim().replace(/\s+/g, " ") ||
      "Edital FAPEMAT";

    let dataPublicacao: string | undefined;
    const mainText = $("main").text();
    const dateMatch = mainText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
      dataPublicacao = this.ddmmyyyyToIso(`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`);
    }

    const descricao = $("main p").first().text().trim().replace(/\s+/g, " ") || undefined;

    const pdfUrls: string[] = [];
    $("main a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = this.absoluteUrl(href);
      if (!abs || !abs.includes("fapemat.mt.gov.br")) return;
      // Ignora links externos (ex.: programacentelha.com.br)
      if (abs.includes("programacentelha.com.br") || abs.includes("portal.mt.gov.br")) return;
      // PDF direto: termina em .pdf ou padrão /documents/.../file.pdf/uuid
      if (DIRECT_PDF_RE.test(abs) || DOCUMENTS_PDF_RE.test(abs)) {
        if (!pdfUrls.includes(abs)) pdfUrls.push(abs);
        return;
      }
      // Documento Liferay (página do documento): /documents/d/fapemat/...
      if (abs.includes("/documents/d/") && abs.includes("fapemat")) {
        if (!pdfUrls.includes(abs)) pdfUrls.push(abs);
      }
    });

    return { titulo, dataPublicacao, descricao, pdfUrls };
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPEMAT_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPEMAT_MAX_ITEMS, 10) || 9999)
      : 9999;

    let listItems: { url: string; titulo: string }[] = [];

    if (this.usePuppeteer) {
      console.log(`📄 FAPEMAT: buscando lista em ${LIST_URL} (Puppeteer)`);
      try {
        listItems = await this.fetchListWithPuppeteer();
      } catch (e) {
        console.error("❌ FAPEMAT: erro ao buscar lista:", (e as Error).message);
        return [];
      }
    } else {
      console.log(`📄 FAPEMAT: buscando lista em ${LIST_URL}`);
      let listHtml: string;
      try {
        listHtml = await this.fetchText(LIST_URL);
        listItems = this.extractListItems(listHtml);
      } catch (e) {
        console.error("❌ FAPEMAT: erro ao buscar lista:", (e as Error).message);
        return [];
      }
      if (listItems.length === 0 && process.env.FAPEMAT_EDITAL_URLS) {
        const urls = process.env.FAPEMAT_EDITAL_URLS.split(",").map((u) => u.trim()).filter(Boolean);
        listItems = urls.map((url) => ({ url, titulo: "Edital FAPEMAT" }));
        console.log(`📋 FAPEMAT: usando ${listItems.length} URL(s) de FAPEMAT_EDITAL_URLS`);
      }
    }

    const targets = listItems.slice(0, maxItems);
    console.log(`📋 FAPEMAT: ${targets.length} edital(is) na lista`);

    const editais: Edital[] = [];
    for (let i = 0; i < targets.length; i++) {
      const { url, titulo: listTitulo } = targets[i];
      console.log(`  [${i + 1}/${targets.length}] ${listTitulo.slice(0, 55)}...`);

      let detailHtml: string;
      try {
        if (this.usePuppeteer) {
          detailHtml = await this.fetchDetailHtmlWithPuppeteer(url);
        } else {
          detailHtml = await this.fetchText(url);
        }
      } catch (e) {
        console.warn(`    ⚠️ Erro ao buscar detalhe: ${(e as Error).message}`);
        await this.delay(500);
        continue;
      }

      const detail = this.extractDetail(detailHtml, url);
      const tituloFinal = detail.titulo.length > 3 ? detail.titulo : listTitulo;
      const numero = this.extractNumero(tituloFinal) || `FAPEMAT-${i + 1}`;
      const pdfUrls = detail.pdfUrls;

      const pdfPaths: string[] = [];
      if (this.downloadPdfs && pdfUrls.length > 0) {
        const prefix = `fapemat_${(numero || String(i + 1)).replace(/\//g, "-")}`;
        for (let j = 0; j < pdfUrls.length; j++) {
          const dest = path.join(
            this.outputDir,
            this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`)
          );
          const ok = await this.downloadPdf(pdfUrls[j], dest);
          if (ok) pdfPaths.push(dest);
          await this.delay(150);
        }
      }

      editais.push({
        numero,
        titulo: tituloFinal,
        descricao: detail.descricao,
        link: url,
        orgao: "FAPEMAT",
        fonte: "fapemat",
        pais: "Brasil",
        estado: "MT",
        dataPublicacao: detail.dataPublicacao,
        pdfUrl: pdfUrls[0],
        pdfUrls,
        pdfPaths: pdfPaths.length ? pdfPaths : undefined,
        processadoEm: new Date().toISOString(),
      });

      console.log(`    ✅ ${pdfUrls.length} PDF(s)/documento(s)`);
      await this.delay(350);
    }

    console.log(`✅ FAPEMAT: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
