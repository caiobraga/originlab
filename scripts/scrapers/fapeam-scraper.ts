import { Scraper, Edital } from "../types";
import type { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.fapeam.am.gov.br";
const LIST_URL = `${BASE}/editais/?aba=editais-abertos`;

/** URLs de detalhe: /editais/slug/ (slug com hífens e números) */
const DETAIL_PATH_RE = /^\/editais\/[^/]+\/?$/;

export class FapeamScraper implements Scraper {
  readonly name = "fapeam";
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapeam");

  private readonly downloadPdfs =
    String(process.env.FAPEAM_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPEAM_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private async initBrowser() {
    if (this.browser) return;
    const puppeteer = await import("puppeteer");
    this.browser = await puppeteer.default.launch({
      headless: process.env.FAPEAM_HEADLESS !== "0",
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
      return `${BASE}/${h}`;
    }
  }

  private extractNumero(titulo: string): string {
    const m = titulo.match(/N[º°°.]?\s*(\d+)\s*\/\s*(\d{4})/i);
    if (m) return `${m[1]}/${m[2]}`;
    const m2 = titulo.match(/(\d{1,4})\/(\d{4})/);
    if (m2) return `${m2[1]}/${m2[2]}`;
    return "";
  }

  /** Parse "DD/MM/YYYY até DD/MM/YYYY" ou "DD/MM/YYYY" */
  private parseVigencia(text: string): { dataPublicacao?: string; dataEncerramento?: string } {
    const out: { dataPublicacao?: string; dataEncerramento?: string } = {};
    const ate = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+até\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ate) {
      out.dataPublicacao = `${ate[3]}-${ate[2].padStart(2, "0")}-${ate[1].padStart(2, "0")}`;
      out.dataEncerramento = `${ate[6]}-${ate[5].padStart(2, "0")}-${ate[4].padStart(2, "0")}`;
      return out;
    }
    const single = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (single) out.dataPublicacao = `${single[3]}-${single[2].padStart(2, "0")}-${single[1].padStart(2, "0")}`;
    return out;
  }

  private safeFileNameFromUrl(url: string, prefix: string): string {
    let name = "edital.pdf";
    try {
      const u = new URL(url);
      name = decodeURIComponent(u.pathname.split("/").pop() || name);
    } catch {
      // ignore
    }
    name = name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_").trim();
    if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
    if (name.length > 100) name = name.slice(0, 96) + ".pdf";
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

  /** Lista extraída via Puppeteer (conteúdo da aba Vigentes é carregado por JS) */
  private async fetchListItems(): Promise<{ url: string; titulo: string; vigenciaText: string }[]> {
    await this.initBrowser();
    await this.page!.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 45000 });
    await this.delay(2500);

    const items = await this.page!.evaluate((base: string, pathRe: string) => {
      const re = new RegExp(pathRe);
      const result: { url: string; titulo: string; vigenciaText: string }[] = [];
      const seen = new Set<string>();

      document.querySelectorAll<HTMLAnchorElement>('a[href*="/editais/"]').forEach((a) => {
        const href = a.href || a.getAttribute("href") || "";
        if (!href) return;
        try {
          const u = new URL(href, base);
          const pathname = u.pathname.replace(/\/$/, "");
          if (!re.test(pathname + "/")) return;
          if (pathname === "/editais" || pathname.includes("?")) return;
          const full = u.toString().replace(/\/$/, "") + "/";
          if (seen.has(full)) return;
          seen.add(full);

          let titulo = a.textContent?.trim().replace(/\s+/g, " ") || "";
          let vigenciaText = "";
          let parent: Element | null = a;
          for (let i = 0; i < 10 && parent; i++) {
            const li = parent.closest("li");
            if (li) {
              if (!titulo || titulo.length < 10) {
                const h2 = li.querySelector("h2");
                if (h2) titulo = h2.textContent?.trim().replace(/\s+/g, " ") || titulo;
              }
              const time = li.querySelector("time");
              if (time) vigenciaText = time.textContent?.trim() || "";
              if (!vigenciaText) {
                const strong = li.querySelector("strong");
                if (strong?.textContent?.trim() === "Vigência:") {
                  vigenciaText = (strong.parentElement?.textContent || "").replace(/Vigência:\s*/i, "").trim();
                }
              }
              break;
            }
            parent = parent.parentElement;
          }
          if (!titulo || titulo.length < 5) titulo = href.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "Edital";
          result.push({ url: full, titulo, vigenciaText });
        } catch {
          // ignore
        }
      });

      return result;
    }, BASE, DETAIL_PATH_RE.source);

    return items;
  }

  /** Na página de detalhe: título (h2) e links para PDF. Prioriza "Download do edital PDF"; senão, PDFs do main. */
  private extractDetail(html: string): { titulo: string; pdfUrls: string[] } {
    const $ = cheerio.load(html);
    const $main = $("main, article, .entry-content, .post-content, #content").first();
    const $scope = $main.length ? $main : $.root();

    let titulo =
      $scope.find("h2").first().text().trim().replace(/\s+/g, " ") ||
      $("h2").first().text().trim().replace(/\s+/g, " ");

    const primary: string[] = [];
    const others: string[] = [];
    $scope.find('a[href*=".pdf"], a[href*="wp-content/uploads"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href || !href.toLowerCase().includes(".pdf")) return;
      const abs = this.absoluteUrl(href);
      if (!abs) return;
      const text = $(el).text().trim().toLowerCase();
      if (text.includes("download") && (text.includes("edital") || text.includes("pdf"))) {
        if (!primary.includes(abs)) primary.push(abs);
      } else if (!others.includes(abs) && !primary.includes(abs)) {
        others.push(abs);
      }
    });
    const pdfUrls = primary.length > 0 ? primary : others;

    return { titulo: titulo || "Edital", pdfUrls };
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPEAM_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPEAM_MAX_ITEMS, 10) || 9999)
      : 9999;

    console.log(`📄 FAPEAM: buscando lista em ${LIST_URL} (Puppeteer)`);
    const listItems = (await this.fetchListItems()).slice(0, maxItems);
    console.log(`📋 FAPEAM: ${listItems.length} edital(is) na listagem`);

    const editais: Edital[] = [];
    for (let i = 0; i < listItems.length; i++) {
      const { url, titulo: listTitulo, vigenciaText } = listItems[i];
      console.log(`  [${i + 1}/${listItems.length}] ${listTitulo.slice(0, 50)}...`);

      const detailHtml = await this.fetchText(url);
      const { titulo, pdfUrls } = this.extractDetail(detailHtml);
      const tituloFinal = titulo.length > 3 ? titulo : listTitulo;
      const vigencia = this.parseVigencia(vigenciaText);

      const numero = this.extractNumero(tituloFinal) || `FAPEAM-${i + 1}`;
      const pdfPaths: string[] = [];

      if (this.downloadPdfs && pdfUrls.length > 0) {
        const prefix = `fapeam_${numero.replace(/\//g, "-")}`;
        for (let j = 0; j < pdfUrls.length; j++) {
          const dest = path.join(
            this.outputDir,
            this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`)
          );
          const ok = await this.downloadPdf(pdfUrls[j], dest);
          if (ok) pdfPaths.push(dest);
          await this.delay(200);
        }
      }

      editais.push({
        numero,
        titulo: tituloFinal,
        link: url,
        orgao: "FAPEAM",
        fonte: "fapeam",
        pais: "Brasil",
        estado: "AM",
        dataPublicacao: vigencia.dataPublicacao,
        dataEncerramento: vigencia.dataEncerramento,
        pdfUrl: pdfUrls[0],
        pdfUrls,
        pdfPaths: pdfPaths.length ? pdfPaths : undefined,
        processadoEm: new Date().toISOString(),
      });
      console.log(`    ✅ ${pdfUrls.length} PDF(s)`);
      await this.delay(400);
    }

    console.log(`✅ FAPEAM: ${editais.length} edital(is) processado(s)`);
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
