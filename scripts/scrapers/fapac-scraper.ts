import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://fapac.ac.gov.br";
const LIST_URL = `${BASE}/98-2/`;

/** Considera "link principal" do edital se o texto começa com EDITAL Nº, CHAMADA PÚBLICA, PROCESSO SELETIVO, etc. */
const MAIN_EDITAL_RE =
  /^(EDITAL\s+(CHAMADA\s+)?(N[º°]?\s*)?\d+\/\d+|EDITAL\s+DE\s+CHAMAMENTO|EDITAL\s+\d{4}\s*–|EDITAL\s+INOV|EDITAL\s+CHAMADA\s+P[UÚ]BLICA|CHAMADA\s+P[UÚ]BLICA\s+(DO\s+)?PPSUS|CHAMADA\s+P[UÚ]BLICA\s+PARA|PROCESSO\s+SELETIVO|EDITAL\s+003\/\d{4})/i;

export class FapacScraper implements Scraper {
  readonly name = "fapac";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapac");

  private readonly downloadPdfs =
    String(process.env.FAPAC_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPAC_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

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

  private isPdfLink(href: string): boolean {
    const h = (href || "").toLowerCase();
    return (h.includes("wp-content/uploads") || h.includes(".pdf")) && h.includes(".pdf");
  }

  private extractNumero(titulo: string): string {
    const m = titulo.match(/N[º°]?\s*(\d+\/\d+)|(\d{3})\/(\d{4})/i);
    if (m && m[1]) return m[1];
    if (m && m[2]) return `${m[2]}/${m[3]}`;
    const m2 = titulo.match(/(\d{1,4})\/(\d{4})/);
    if (m2) return `${m2[1]}/${m2[2]}`;
    return "";
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

  private async fetchText(url: string, timeoutMs = 90000): Promise<string> {
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

  private extractEditaisFromHtml(html: string, pageUrl: string): Edital[] {
    const $ = cheerio.load(html);
    const pdfLinks: { href: string; text: string }[] = [];
    $('a[href*="wp-content/uploads"], a[href*=".pdf"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href || !this.isPdfLink(href)) return;
      const abs = this.absoluteUrl(href);
      if (!abs) return;
      const text = $(el).text().trim().replace(/\s+/g, " ");
      pdfLinks.push({ href: abs, text });
    });

    let current: Partial<Edital> & { pdfUrls: string[] } | null = null;
    const editais: Edital[] = [];

    for (const { href, text } of pdfLinks) {
      if (MAIN_EDITAL_RE.test(text) && text.length > 15) {
        if (current && (current.pdfUrls?.length ?? 0) > 0) {
          editais.push({
            numero: current.numero ?? "",
            titulo: current.titulo ?? "",
            link: current.link ?? pageUrl,
            orgao: "FAPAC",
            fonte: "fapac",
            pais: "Brasil",
            estado: "AC",
            pdfUrl: current.pdfUrls?.[0],
            pdfUrls: [...new Set(current.pdfUrls!)],
            processadoEm: new Date().toISOString(),
          });
        }
        const numero = this.extractNumero(text) || `FAPAC-${editais.length + 1}`;
        current = {
          numero,
          titulo: text,
          link: pageUrl,
          pdfUrls: [href],
        };
      } else {
        if (current) {
          if (!current.pdfUrls!.includes(href)) current.pdfUrls!.push(href);
        } else {
          current = {
            numero: this.extractNumero(text) || `FAPAC-${editais.length + 1}`,
            titulo: text,
            link: pageUrl,
            pdfUrls: [href],
          };
        }
      }
    }

    if (current && (current.pdfUrls?.length ?? 0) > 0) {
      editais.push({
        numero: current.numero ?? "",
        titulo: current.titulo ?? "",
        link: current.link ?? pageUrl,
        orgao: "FAPAC",
        fonte: "fapac",
        pais: "Brasil",
        estado: "AC",
        pdfUrl: current.pdfUrls?.[0],
        pdfUrls: [...new Set(current.pdfUrls!)],
        processadoEm: new Date().toISOString(),
      });
    }
    return editais;
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPAC_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPAC_MAX_ITEMS, 10) || 9999)
      : 9999;

    console.log(`📄 FAPAC: buscando lista em ${LIST_URL}`);
    const html = await this.fetchText(LIST_URL);
    const editais = this.extractEditaisFromHtml(html, LIST_URL).slice(0, maxItems);
    console.log(`📋 FAPAC: ${editais.length} edital(is) extraído(s) da página`);

    for (let i = 0; i < editais.length; i++) {
      const e = editais[i];
      const pdfUrls = (e.pdfUrls || []).filter(Boolean);
      const pdfPaths: string[] = [];
      if (this.downloadPdfs && pdfUrls.length > 0) {
        const prefix = `fapac_${(e.numero || String(i + 1)).replace(/\//g, "-")}`;
        for (let j = 0; j < pdfUrls.length; j++) {
          const dest = path.join(
            this.outputDir,
            this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`)
          );
          const ok = await this.downloadPdf(pdfUrls[j], dest);
          if (ok) pdfPaths.push(dest);
          await this.delay(150);
        }
        e.pdfPaths = pdfPaths;
        if (pdfPaths.length) (e as any).pdfPath = pdfPaths[0];
      }
      console.log(`  ✅ ${e.numero} – ${(e.titulo || "").slice(0, 50)}... (${pdfUrls.length} PDF(s))`);
    }

    console.log(`✅ FAPAC: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
