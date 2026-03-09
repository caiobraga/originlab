import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "http://www.fapern.rn.gov.br";
const LIST_URL =
  "http://www.fapern.rn.gov.br/Conteudo.asp?TRAN=ITEM&TARG=15517&ACT=&PAGE=0&PARM=&LBL=Editais+Abertos";
const MIN_YEAR = 2025;
const MAX_YEAR = 2026;

export class FapernScraper implements Scraper {
  readonly name = "fapern";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapern");

  private readonly downloadPdfs =
    String(process.env.FAPERN_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPERN_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string, base = BASE): string {
    const h = String(href || "").trim();
    if (!h || h.startsWith("file:") || h.startsWith("#") || h.startsWith("javascript:")) return "";
    try {
      return new URL(h, base).toString();
    } catch {
      if (h.startsWith("/")) return `${base.replace(/\/$/, "")}${h}`;
      return `${base}/${h.replace(/^\//, "")}`;
    }
  }

  /** Extrai número do texto do link: "Edital nº 01/2026", "EDITAL N°25/2025" */
  private extractNumero(text: string): string {
    const m = text.match(/n[º°]?\s*(\d+)\s*\/\s*(\d{4})/i) || text.match(/(\d{1,4})\/(\d{4})/);
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
   * A página "Editais Abertos" da FAPERN é um único HTML com vários blocos:
   * cada bloco tem um título (strong) e vários links para PDF (adcon.rn.gov.br/ACERVO/FAPERN/...).
   * Agrupa por número do edital (XX/YYYY) e filtra apenas 2025 e 2026.
   */
  private extractEditaisFromHtml(html: string): Map<string, { titulo: string; pdfUrls: string[] }> {
    const $ = cheerio.load(html);
    const byNumero = new Map<string, { titulo: string; pdfUrls: string[] }>();

    $('a[href*=".pdf"], a[href*="ACERVO/FAPERN"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const fullUrl = this.absoluteUrl(href);
      if (!fullUrl || !fullUrl.toLowerCase().includes(".pdf")) return;

      const linkText = $(el).text().trim().replace(/\s+/g, " ");
      const numero = this.extractNumero(linkText);
      if (!numero) return;

      const year = this.yearFromNumero(numero);
      if (year === null || year < MIN_YEAR || year > MAX_YEAR) return;

      // Título do bloco: procurar strong em parágrafos anteriores ou no mesmo container
      let titulo = linkText;
      let $node = $(el).parent();
      for (let i = 0; i < 12 && $node.length; i++) {
        const $prev = $node.prevAll();
        for (let j = 0; j < 5; j++) {
          const p = $prev.eq(j);
          const t = p.find("strong").first().text().trim().replace(/\s+/g, " ");
          if (t && t.length > 15 && !/^\d+\/\d+$/.test(t) && !/^edital\s+n/i.test(t)) {
            titulo = t;
            break;
          }
        }
        if (titulo !== linkText) break;
        const hereStrong = $node.find("strong").first().text().trim().replace(/\s+/g, " ");
        if (hereStrong && hereStrong.length > 15) {
          titulo = hereStrong;
          break;
        }
        $node = $node.parent();
      }

      const existing = byNumero.get(numero);
      if (existing) {
        if (!existing.pdfUrls.includes(fullUrl)) existing.pdfUrls.push(fullUrl);
        if (titulo.length > existing.titulo.length) existing.titulo = titulo;
      } else {
        byNumero.set(numero, { titulo, pdfUrls: [fullUrl] });
      }
    });

    return byNumero;
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPERN_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPERN_MAX_ITEMS, 10) || 9999)
      : 9999;

    console.log(`📄 FAPERN: buscando ${LIST_URL}`);
    let html: string;
    const fetchList = async (retries = 2): Promise<string> => {
      for (let r = 0; r <= retries; r++) {
        try {
          return await this.fetchText(LIST_URL, 90000);
        } catch (e) {
          if (r < retries) await this.delay(2000);
          else throw e;
        }
      }
      throw new Error("fetch failed");
    };
    try {
      html = await fetchList();
    } catch (e) {
      console.warn(`⚠️ FAPERN: erro ao buscar lista: ${(e as Error).message}`);
      return [];
    }

    const byNumero = this.extractEditaisFromHtml(html);
    const editais: Edital[] = [];
    let idx = 0;

    for (const [numero, v] of byNumero) {
      if (!v.pdfUrls.length) continue;
      idx++;
      if (editais.length >= maxItems) break;

      const titulo = v.titulo.length > 15 ? v.titulo : `Edital FAPERN ${numero}`;
      const edital: Edital = {
        numero,
        titulo,
        link: LIST_URL,
        orgao: "FAPERN",
        fonte: "fapern",
        pais: "Brasil",
        estado: "RN",
        pdfUrl: v.pdfUrls[0],
        pdfUrls: v.pdfUrls,
        processadoEm: new Date().toISOString(),
      };

      if (this.downloadPdfs && v.pdfUrls.length > 0) {
        const prefix = `fapern_${numero.replace(/\//g, "-")}`;
        const paths: string[] = [];
        for (let j = 0; j < v.pdfUrls.length; j++) {
          const dest = path.join(
            this.outputDir,
            this.safeFileNameFromUrl(v.pdfUrls[j], `${prefix}_${j + 1}`)
          );
          const ok = await this.downloadPdf(v.pdfUrls[j], dest);
          if (ok) paths.push(dest);
          await this.delay(80);
        }
        if (paths.length) edital.pdfPaths = paths;
      }

      console.log(`  ✅ ${numero} – ${titulo.slice(0, 50)}... (${v.pdfUrls.length} PDF(s))`);
      editais.push(edital);
    }

    console.log(`✅ FAPERN: ${editais.length} edital(is) extraído(s) (${MIN_YEAR}-${MAX_YEAR})`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
