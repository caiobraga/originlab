import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://fapitec.se.gov.br";
const LIST_URL = `${BASE}/editais-abertos/`;
const MIN_YEAR = 2025;
const MAX_YEAR = 2026;

export class FapitecScraper implements Scraper {
  readonly name = "fapitec";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapitec");

  private readonly downloadPdfs =
    String(process.env.FAPITEC_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPITEC_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

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

  /** Extrai número do título: "FAPITEC/SE Nº 03/2026" ou "Edital nº 21/2025" */
  private extractNumero(titulo: string): string {
    const m = titulo.match(/n[º°]\.?\s*(\d+)\s*\/\s*(\d{4})/i) || titulo.match(/(\d{1,4})\/(\d{4})/);
    if (m) return `${m[1]}/${m[2]}`;
    return "";
  }

  private yearFromNumero(numero: string): number | null {
    const m = numero.match(/\/(\d{4})$/);
    return m ? parseInt(m[1], 10) : null;
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
   * Lista: main article list li > h3 > a com href para /editais-abertos/edital-...
   */
  private extractEditalLinksFromList(html: string): { url: string; titulo: string }[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const items: { url: string; titulo: string }[] = [];

    $('main a[href*="editais-abertos/edital"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const full = this.absoluteUrl(href);
      if (!full || !full.includes("fapitec.se.gov.br") || !full.includes("/editais-abertos/")) return;
      const pathname = full.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (pathname === "/editais-abertos/" || pathname.length < 25) return;
      const norm = full.split("?")[0].replace(/\/$/, "");
      if (seen.has(norm)) return;
      seen.add(norm);

      const titulo = $(el).text().trim().replace(/\s+/g, " ") || "Edital FAPITEC";
      if (titulo.length < 10) return;
      items.push({ url: full, titulo });
    });

    return items;
  }

  /**
   * Página do edital: h1 como título e links para PDF (ex.: link "EDITAL" -> .pdf).
   */
  private extractDetail(html: string, _pageUrl: string): { titulo: string; pdfUrls: string[] } {
    const $ = cheerio.load(html);
    const titulo =
      $("article h1, main h1").first().text().trim().replace(/\s+/g, " ") ||
      $("h1").first().text().trim().replace(/\s+/g, " ");

    const pdfUrls: string[] = [];
    $('a[href*=".pdf"], a[href*="wp-content/uploads"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href || !href.toLowerCase().includes(".pdf")) return;
      const abs = this.absoluteUrl(href);
      if (abs && !pdfUrls.includes(abs)) pdfUrls.push(abs);
    });

    return { titulo: titulo || "Edital FAPITEC", pdfUrls };
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPITEC_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPITEC_MAX_ITEMS, 10) || 9999)
      : 9999;

    const concurrency = Math.min(5, Math.max(1, parseInt(process.env.FAPITEC_CONCURRENCY || "3", 10)));

    console.log(`📄 FAPITEC: buscando lista em ${LIST_URL}`);
    let listHtml: string;
    try {
      listHtml = await this.fetchText(LIST_URL);
    } catch (e) {
      console.warn(`⚠️ FAPITEC: erro ao buscar lista: ${(e as Error).message}`);
      return [];
    }

    const links = this.extractEditalLinksFromList(listHtml);
    console.log(`📋 FAPITEC: ${links.length} link(s) de edital`);

    const editais: Edital[] = [];

    const processOne = async (i: number): Promise<Edital | null> => {
      const { url, titulo: listTitulo } = links[i];
      try {
        const detailHtml = await this.fetchText(url);
        const { titulo, pdfUrls } = this.extractDetail(detailHtml, url);
        const tituloFinal = titulo.length > 3 ? titulo : listTitulo;

        const numero = this.extractNumero(tituloFinal) || `FAPITEC-${i + 1}`;
        const year = this.yearFromNumero(numero);
        if (year !== null && (year < MIN_YEAR || year > MAX_YEAR)) {
          console.log(`  [${i + 1}/${links.length}] ${tituloFinal.slice(0, 45)}... → ano ${year} fora de ${MIN_YEAR}-${MAX_YEAR}, ignorando`);
          return null;
        }

        if (pdfUrls.length === 0) {
          console.log(`  [${i + 1}/${links.length}] ${tituloFinal.slice(0, 45)}... → sem PDFs, ignorando`);
          return null;
        }

        const edital: Edital = {
          numero,
          titulo: tituloFinal,
          link: url,
          orgao: "FAPITEC/SE",
          fonte: "fapitec",
          pais: "Brasil",
          estado: "SE",
          pdfUrl: pdfUrls[0],
          pdfUrls,
          processadoEm: new Date().toISOString(),
        };

        if (this.downloadPdfs && pdfUrls.length > 0) {
          const prefix = `fapitec_${(numero || String(i + 1)).replace(/\//g, "-")}`;
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

        console.log(`  [${i + 1}/${links.length}] ${tituloFinal.slice(0, 50)}... ✅ ${pdfUrls.length} PDF(s)`);
        return edital;
      } catch (e) {
        console.warn(`  [${i + 1}/${links.length}] Erro ao processar ${url}: ${(e as Error).message}`);
        return null;
      }
    };

    const runBatch = async (start: number) => {
      const batch = [];
      for (let k = 0; k < concurrency && start + k < links.length; k++) {
        batch.push(processOne(start + k));
      }
      return Promise.all(batch);
    };

    for (let start = 0; start < links.length && editais.length < maxItems; start += concurrency) {
      const results = await runBatch(start);
      for (const r of results) {
        if (r) editais.push(r);
        if (editais.length >= maxItems) break;
      }
      await this.delay(150);
    }

    console.log(`✅ FAPITEC: ${editais.length} edital(is) extraído(s) (${MIN_YEAR}-${MAX_YEAR})`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
