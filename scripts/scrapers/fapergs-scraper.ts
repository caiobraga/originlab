import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://fapergs.rs.gov.br";
const LIST_URLS = [`${BASE}/abertos`, `${BASE}/encerrados`];
const MIN_YEAR = 2025;
const MAX_YEAR = 2026;

// Nota: A lista principal de "Editais Abertos" no site é carregada por JavaScript;
// o HTML estático contém apenas links da barra lateral (Avisos, Notícias). Este scraper
// extrai todos os links de edital presentes no HTML (ex.: aditivos, errata, programas).
// Para incluir a lista completa de editais abertos seria necessário usar Puppeteer/Playwright.

/** Considera link de edital se o path parece com página de edital (slug com números/ano). */
function isEditalListLink(href: string): boolean {
  const p = (href || "").trim().replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  if (!p || p === "/" || p.length < 10) return false;
  if (/^\/(abertos|encerrados|em-julgamento|chamadas-e-editais|inicial|fale-conosco|mapa-do-site|avisos|noticias|relatorio|resultados|selecao|upload)/i.test(p)) return false;
  if (/\/edital-fapergs-\d+-\d{4}-/.test(p)) return true;
  if (/\/edital-\d+-\d{4}-/.test(p)) return true;
  if (/\/programa-[a-z0-9-]+/.test(p) && !/\/avisos|\/noticias/.test(p)) return true;
  return false;
}

export class FapergsScraper implements Scraper {
  readonly name = "fapergs";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapergs");

  private readonly downloadPdfs =
    String(process.env.FAPERGS_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPERGS_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string): string {
    const h = String(href || "").trim();
    if (!h || h.startsWith("file:") || h.startsWith("#") || h.startsWith("javascript:")) return "";
    try {
      return new URL(h, BASE).toString();
    } catch {
      if (h.startsWith("/")) return `${BASE}${h}`;
      return `${BASE}/${h.replace(/^\//, "")}`;
    }
  }

  /** Extrai número/ano do título: "EDITAL FAPERGS 09/2025" ou "Edital 07/2025" */
  private extractNumero(titulo: string): string {
    const m = titulo.match(/edital\s+fapergs\s+(\d+)\s*\/\s*(\d{4})/i) || titulo.match(/edital\s+(\d+)\s*\/\s*(\d{4})/i);
    if (m) return `${m[1]}/${m[2]}`;
    const m2 = titulo.match(/(\d{1,4})\/(\d{4})/);
    if (m2) return `${m2[1]}/${m2[2]}`;
    return "";
  }

  private yearFromEdital(numero: string, titulo: string): number | null {
    const fromNum = numero.match(/\/(\d{4})$/);
    if (fromNum) return parseInt(fromNum[1], 10);
    const fromTitulo = titulo.match(/(\d{4})/);
    if (fromTitulo) return parseInt(fromTitulo[1], 10);
    return null;
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

  /**
   * Extrai links para páginas de edital a partir do HTML da listagem.
   * Coleta links de edital (edital-fapergs-XX-YYYY-... ou /edital-NN-YYYY-...) em todo o documento.
   */
  private extractEditalLinksFromList(html: string, _listUrl: string): { url: string; titulo: string }[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const items: { url: string; titulo: string }[] = [];

    const addLink = (el: cheerio.Element) => {
      const href = $(el).attr("href");
      if (!href) return;
      const full = this.absoluteUrl(href);
      if (!full || !full.includes("fapergs.rs.gov.br")) return;
      const pathname = full.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (!isEditalListLink(pathname)) return;
      const norm = full.split("?")[0].replace(/\/$/, "");
      if (seen.has(norm)) return;
      seen.add(norm);

      const titulo = $(el).text().trim().replace(/\s+/g, " ") || "Edital FAPERGS";
      if (titulo.length < 5) return;
      items.push({ url: full, titulo });
    };

    // Links no formato /edital-fapergs-NN-YYYY-slug (lista principal de editais)
    $('a[href*="edital-fapergs-"]').each((_, el) => addLink(el));
    // Links no formato /edital-NN-YYYY-slug
    $('a[href*="/edital-"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.includes("edital-fapergs-")) return; // já coletado
      addLink(el);
    });
    // Programa/chamadas (ex.: programa-horizon-europe)
    $('a[href*="programa-"]').each((_, el) => addLink(el));

    return items;
  }

  /**
   * Na página do edital: título (h1) e seção "Arquivos anexos" com lista de PDFs.
   */
  private extractDetail(html: string, pageUrl: string): { titulo: string; pdfUrls: string[] } {
    const $ = cheerio.load(html);
    const titulo =
      $("article h1").first().text().trim().replace(/\s+/g, " ") ||
      $("h1").first().text().trim().replace(/\s+/g, " ");

    const pdfUrls: string[] = [];
    $('a[href*=".pdf"], a[href*="/upload/arquivos/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const lower = href.toLowerCase();
      if (!lower.includes(".pdf") && !lower.includes("/upload/arquivos/")) return;
      const abs = this.absoluteUrl(href);
      if (abs && !pdfUrls.includes(abs)) pdfUrls.push(abs);
    });

    return { titulo: titulo || "Edital FAPERGS", pdfUrls };
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPERGS_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPERGS_MAX_ITEMS, 10) || 9999)
      : 9999;

    const concurrency = Math.min(5, Math.max(1, parseInt(process.env.FAPERGS_CONCURRENCY || "3", 10)));

    const allLinks: { url: string; titulo: string }[] = [];
    const seenUrls = new Set<string>();

    for (const listUrl of LIST_URLS) {
      console.log(`📄 FAPERGS: buscando lista em ${listUrl}`);
      try {
        const html = await this.fetchText(listUrl);
        const links = this.extractEditalLinksFromList(html, listUrl);
        for (const l of links) {
          const norm = l.url.split("?")[0].replace(/\/$/, "");
          if (!seenUrls.has(norm)) {
            seenUrls.add(norm);
            allLinks.push(l);
          }
        }
        await this.delay(200);
      } catch (e) {
        console.warn(`⚠️ FAPERGS: erro ao buscar ${listUrl}: ${(e as Error).message}`);
      }
    }

    console.log(`📋 FAPERGS: ${allLinks.length} link(s) de edital`);

    const editais: Edital[] = [];

    const processOne = async (i: number): Promise<Edital | null> => {
      const { url, titulo: listTitulo } = allLinks[i];
      try {
        const detailHtml = await this.fetchText(url);
        const { titulo, pdfUrls } = this.extractDetail(detailHtml, url);
        const tituloFinal = titulo.length > 3 ? titulo : listTitulo;

        const numero = this.extractNumero(tituloFinal) || `FAPERGS-${i + 1}`;
        const year = this.yearFromEdital(numero, tituloFinal);
        if (year !== null && (year < MIN_YEAR || year > MAX_YEAR)) {
          console.log(`  [${i + 1}/${allLinks.length}] ${tituloFinal.slice(0, 45)}... → ano ${year} fora de ${MIN_YEAR}-${MAX_YEAR}, ignorando`);
          return null;
        }

        if (pdfUrls.length === 0) {
          console.log(`  [${i + 1}/${allLinks.length}] ${tituloFinal.slice(0, 45)}... → sem PDFs, ignorando`);
          return null;
        }

        const edital: Edital = {
          numero,
          titulo: tituloFinal,
          link: url,
          orgao: "FAPERGS",
          fonte: "fapergs",
          pais: "Brasil",
          estado: "RS",
          pdfUrl: pdfUrls[0],
          pdfUrls,
          processadoEm: new Date().toISOString(),
        };

        if (this.downloadPdfs && pdfUrls.length > 0) {
          const prefix = `fapergs_${(numero || String(i + 1)).replace(/\//g, "-")}`;
          const paths: string[] = [];
          for (let j = 0; j < pdfUrls.length; j++) {
            const dest = path.join(
              this.outputDir,
              this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`)
            );
            const ok = await this.downloadPdf(pdfUrls[j], dest);
            if (ok) paths.push(dest);
            await this.delay(80);
          }
          if (paths.length) edital.pdfPaths = paths;
        }

        console.log(`  [${i + 1}/${allLinks.length}] ${tituloFinal.slice(0, 50)}... ✅ ${pdfUrls.length} PDF(s)`);
        return edital;
      } catch (e) {
        console.warn(`  [${i + 1}/${allLinks.length}] Erro ao processar ${url}: ${(e as Error).message}`);
        return null;
      }
    };

    const runBatch = async (start: number) => {
      const batch = [];
      for (let k = 0; k < concurrency && start + k < allLinks.length; k++) {
        batch.push(processOne(start + k));
      }
      return Promise.all(batch);
    };

    for (let start = 0; start < allLinks.length && editais.length < maxItems; start += concurrency) {
      const results = await runBatch(start);
      for (const r of results) {
        if (r) editais.push(r);
        if (editais.length >= maxItems) break;
      }
      await this.delay(150);
    }

    console.log(`✅ FAPERGS: ${editais.length} edital(is) extraído(s) (${MIN_YEAR}-${MAX_YEAR})`);

    return editais;
  }

  async cleanup(): Promise<void> {}
}
