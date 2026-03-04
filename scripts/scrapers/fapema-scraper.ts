import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.fapema.br";
const LIST_URL = `${BASE}/category/editais/editais-em-aberto/`;

const PDFJS_VIEWER_RE = /\/wp-content\/plugins\/pdfjs-viewer-shortcode\/pdfjs\/web\/viewer\.php\?file=([^&"']+)/i;

const DOC_EXT_RE = /\.(pdf|doc|docx|xls|xlsx)(\?|#|$)/i;

export class FapemaScraper implements Scraper {
  readonly name = "fapema";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapema");

  private readonly downloadPdfs =
    String(process.env.FAPEMA_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPEMA_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

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
      return `${BASE}/${h}`;
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

  private extractListItems(html: string, pageUrl: string): { url: string; titulo: string; dataPublicacao?: string }[] {
    const $ = cheerio.load(html);
    const items: { url: string; titulo: string; dataPublicacao?: string }[] = [];
    const seen = new Set<string>();

    $(".search-result").each((_, el) => {
      const $el = $(el);
      const a = $el.find("h3 a").first();
      const href = a.attr("href");
      const titulo = a.text().trim().replace(/\s+/g, " ");
      if (!href || !titulo) return;
      const url = this.absoluteUrl(href);
      if (!url || !url.startsWith(BASE)) return;
      if (seen.has(url)) return;
      seen.add(url);
      const dateText = $el.find(".search-result-date").first().text().trim();
      const dataPublicacao = this.ddmmyyyyToIso(dateText);
      items.push({ url, titulo, dataPublicacao });
    });

    if (items.length === 0) {
      // Fallback: usar headings
      $("main h3 a").each((_, el) => {
        const href = $(el).attr("href");
        const titulo = $(el).text().trim().replace(/\s+/g, " ");
        if (!href || !titulo) return;
        const url = this.absoluteUrl(href);
        if (!url || !url.startsWith(BASE)) return;
        if (seen.has(url)) return;
        seen.add(url);
        items.push({ url, titulo });
      });
    }

    if (items.length === 0) {
      console.warn(`⚠️ FAPEMA: nenhum item encontrado em ${pageUrl}`);
    }

    return items;
  }

  private extractDocsFromDetail(html: string): { titulo: string; pdfUrls: string[]; documentUrls: string[] } {
    const $ = cheerio.load(html);
    const titulo =
      $("main h1").first().text().trim().replace(/\s+/g, " ") ||
      $("h1").first().text().trim().replace(/\s+/g, " ") ||
      "Edital";

    const pdfUrls: string[] = [];
    const documentUrls: string[] = [];

    // PDFs diretos
    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = this.absoluteUrl(href);
      if (!abs) return;

      // Link para viewer.php?file=... -> extrair file
      const viewerMatch = abs.match(PDFJS_VIEWER_RE);
      if (viewerMatch?.[1]) {
        const fileUrl = decodeURIComponent(viewerMatch[1]);
        if (fileUrl.toLowerCase().includes(".pdf")) {
          if (!pdfUrls.includes(fileUrl)) pdfUrls.push(fileUrl);
        }
        return;
      }

      if (DOC_EXT_RE.test(abs)) {
        if (abs.toLowerCase().endsWith(".pdf")) {
          if (!pdfUrls.includes(abs)) pdfUrls.push(abs);
        } else {
          if (!documentUrls.includes(abs)) documentUrls.push(abs);
        }
      }
    });

    // iframes do PDFJS
    $("iframe[src*=\"viewer.php?file=\"]").each((_, el) => {
      const src = $(el).attr("src");
      if (!src) return;
      const abs = this.absoluteUrl(src);
      const viewerMatch = abs.match(PDFJS_VIEWER_RE);
      if (viewerMatch?.[1]) {
        const fileUrl = decodeURIComponent(viewerMatch[1]);
        if (fileUrl.toLowerCase().includes(".pdf") && !pdfUrls.includes(fileUrl)) pdfUrls.push(fileUrl);
      }
    });

    return { titulo, pdfUrls, documentUrls };
  }

  private getPageUrl(page: number): string {
    if (page <= 1) return LIST_URL;
    return new URL(`page/${page}/`, LIST_URL).toString();
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPEMA_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPEMA_MAX_ITEMS, 10) || 9999)
      : 9999;

    const maxPages = process.env.FAPEMA_MAX_PAGES
      ? Math.max(1, parseInt(process.env.FAPEMA_MAX_PAGES, 10) || 20)
      : 20;

    const listItems: { url: string; titulo: string; dataPublicacao?: string }[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= maxPages; page++) {
      const pageUrl = this.getPageUrl(page);
      console.log(`📄 FAPEMA: buscando lista em ${pageUrl}`);

      let html: string;
      try {
        html = await this.fetchText(pageUrl);
      } catch (error) {
        console.warn(`⚠️ FAPEMA: erro ao buscar ${pageUrl}: ${(error as Error).message}`);
        // Se deu 404 ou erro de rede, assumimos que não há mais páginas
        break;
      }

      const items = this.extractListItems(html, pageUrl);
      let added = 0;
      for (const it of items) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        listItems.push(it);
        added++;
      }
      if (items.length === 0 || added === 0) break;
      if (listItems.length >= maxItems) break;
      await this.delay(250);
    }

    const targets = listItems.slice(0, maxItems);
    console.log(`📋 FAPEMA: ${targets.length} edital(is) encontrado(s)`);

    const editais: Edital[] = [];
    for (let i = 0; i < targets.length; i++) {
      const { url, titulo: listTitulo, dataPublicacao } = targets[i];
      console.log(`  [${i + 1}/${targets.length}] ${listTitulo.slice(0, 55)}...`);

      const detailHtml = await this.fetchText(url);
      const detail = this.extractDocsFromDetail(detailHtml);
      const tituloFinal = detail.titulo.length > 3 ? detail.titulo : listTitulo;
      const numero = this.extractNumero(tituloFinal) || `FAPEMA-${i + 1}`;

      const pdfUrls = detail.pdfUrls;
      const pdfPaths: string[] = [];

      if (this.downloadPdfs && pdfUrls.length > 0) {
        const prefix = `fapema_${numero.replace(/\//g, "-")}`;
        for (let j = 0; j < pdfUrls.length; j++) {
          const dest = path.join(this.outputDir, this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`));
          const ok = await this.downloadPdf(pdfUrls[j], dest);
          if (ok) pdfPaths.push(dest);
          await this.delay(150);
        }
      }

      editais.push({
        numero,
        titulo: tituloFinal,
        link: url,
        orgao: "FAPEMA",
        fonte: "fapema",
        pais: "Brasil",
        estado: "MA",
        dataPublicacao,
        pdfUrl: pdfUrls[0],
        pdfUrls,
        pdfPaths: pdfPaths.length ? pdfPaths : undefined,
        documentUrls: detail.documentUrls.length ? detail.documentUrls : undefined,
        processadoEm: new Date().toISOString(),
      });

      console.log(`    ✅ ${pdfUrls.length} PDF(s)${detail.documentUrls.length ? ` + ${detail.documentUrls.length} doc(s)` : ""}`);
      await this.delay(350);
    }

    console.log(`✅ FAPEMA: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}

