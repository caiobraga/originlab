import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://fapesq.rpp.br";
const LIST_URL = `${BASE}/editais/2026/editais-2025`;
const LIST_URL_2026 = `${BASE}/editais/2027/editais-2026`;
const MIN_YEAR = 2025;
const MAX_YEAR = 2026;

export class FapesqScraper implements Scraper {
  readonly name = "fapesq";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapesq");

  private readonly downloadPdfs =
    String(process.env.FAPESQ_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPESQ_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string, base: string): string {
    const h = String(href || "").trim();
    if (!h || h.startsWith("file:") || h.startsWith("javascript:")) return "";
    try {
      return new URL(h, base).toString();
    } catch {
      if (h.startsWith("/")) return `${BASE}${h}`;
      return `${BASE}/${h.replace(/^\//, "")}`;
    }
  }

  private extractNumero(titulo: string): string {
    const m = titulo.match(/N[º°]?\s*(\d+)\s*\/\s*(\d{4})/i) || titulo.match(/Edital\s*(\d+)\s*\/\s*(\d{4})/i);
    if (m) return `${m[1]}/${m[2]}`;
    const m2 = titulo.match(/(\d{1,4})\/(\d{4})/);
    if (m2) return `${m2[1]}/${m2[2]}`;
    return "";
  }

  private yearFromNumero(numero: string): number | null {
    const m = numero.match(/\/(\d{4})$/);
    return m ? parseInt(m[1], 10) : null;
  }

  private parseDate(s: string): string | undefined {
    const m = (s || "").trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return undefined;
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  private safeFileNameFromUrl(url: string, prefix: string): string {
    let name = "edital.pdf";
    try {
      const u = new URL(url);
      name = decodeURIComponent(u.pathname.split("/").pop() || name).replace(/\/view$/, "");
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
    const downloadUrl = url.replace(/\/view$/, "");
    try {
      if (fs.existsSync(destPath)) return true;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 45000);
      const r = await fetch(downloadUrl, {
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

  private extractItemsFromHtml(html: string, pageUrl: string): { titulo: string; pdfUrl: string; dataPublicacao?: string }[] {
    const $ = cheerio.load(html);
    const items: { titulo: string; pdfUrl: string; dataPublicacao?: string }[] = [];

    $("main article").each((_, el) => {
      const $art = $(el);
      const $link = $art.find("h2 a").first();
      const href = $link.attr("href");
      const titulo = $link.text().trim().replace(/\s+/g, " ");
      if (!href || !titulo) return;
      const pdfUrl = this.absoluteUrl(href, pageUrl);
      if (!pdfUrl || !pdfUrl.includes("fapesq.rpp.br") || !pdfUrl.includes(".pdf")) return;

      let dataPublicacao: string | undefined;
      const text = $art.text();
      const dm = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dm) dataPublicacao = this.parseDate(`${dm[1]}/${dm[2]}/${dm[3]}`);

      items.push({ titulo, pdfUrl, dataPublicacao });
    });

    return items;
  }

  private getListPageUrl(baseUrl: string, offset: number): string {
    if (offset <= 0) return baseUrl;
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}b_start:int=${offset}`;
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPESQ_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPESQ_MAX_ITEMS, 10) || 9999)
      : 9999;
    const pageSize = 20;

    const allItems: { titulo: string; pdfUrl: string; dataPublicacao?: string }[] = [];
    const listUrls = [LIST_URL];
    try {
      await this.fetchText(LIST_URL_2026);
      listUrls.push(LIST_URL_2026);
    } catch {
      // editais-2026 pode não existir ainda
    }

    for (const baseUrl of listUrls) {
      for (let offset = 0; offset < 800; offset += pageSize) {
        const pageUrl = this.getListPageUrl(baseUrl, offset);
        console.log(`📄 FAPESQ: buscando ${pageUrl}`);
        let html: string;
        try {
          html = await this.fetchText(pageUrl);
        } catch (e) {
          console.warn(`⚠️ FAPESQ: erro em ${pageUrl}: ${(e as Error).message}`);
          break;
        }
        const items = this.extractItemsFromHtml(html, pageUrl);
        if (items.length === 0) break;
        for (const it of items) allItems.push(it);
        if (items.length < pageSize) break;
        await this.delay(300);
      }
    }

    const byNumero = new Map<string, { titulo: string; pdfUrls: string[]; dataPublicacao?: string }>();
    for (const it of allItems) {
      const numero = this.extractNumero(it.titulo);
      const year = this.yearFromNumero(numero) ?? (it.dataPublicacao ? parseInt(it.dataPublicacao.slice(0, 4), 10) : null);
      if (year != null && (year < MIN_YEAR || year > MAX_YEAR)) continue;

      const key = numero || it.titulo.slice(0, 80);
      const existing = byNumero.get(key);
      if (existing) {
        if (!existing.pdfUrls.includes(it.pdfUrl)) existing.pdfUrls.push(it.pdfUrl);
        if (it.dataPublicacao && (!existing.dataPublicacao || it.dataPublicacao < existing.dataPublicacao)) {
          existing.dataPublicacao = it.dataPublicacao;
        }
      } else {
        byNumero.set(key, {
          titulo: it.titulo.replace(/^\s*-\s*/, "").trim(),
          pdfUrls: [it.pdfUrl],
          dataPublicacao: it.dataPublicacao,
        });
      }
    }

    const editais: Edital[] = [];
    let idx = 0;
    for (const [numeroKey, v] of byNumero) {
      if (!v.pdfUrls.length) continue;
      idx++;
      const numero = /^\d+\/\d+$/.test(numeroKey) ? numeroKey : `FAPESQ-${idx}`;
      console.log(`  ✅ ${numero} – ${v.titulo.slice(0, 50)}... (${v.pdfUrls.length} PDF(s))`);
      editais.push({
        numero,
        titulo: v.titulo,
        link: LIST_URL,
        orgao: "FAPESQ",
        fonte: "fapesq",
        pais: "Brasil",
        estado: "PB",
        dataPublicacao: v.dataPublicacao,
        pdfUrl: v.pdfUrls[0],
        pdfUrls: v.pdfUrls,
        processadoEm: new Date().toISOString(),
      });
      if (editais.length >= maxItems) break;
    }

    if (this.downloadPdfs) {
      for (let i = 0; i < editais.length; i++) {
        const e = editais[i];
        const pdfUrls = (e.pdfUrls || []).filter(Boolean);
        const prefix = `fapesq_${(e.numero || String(i + 1)).replace(/\//g, "-")}`;
        const paths: string[] = [];
        for (let j = 0; j < pdfUrls.length; j++) {
          const dest = path.join(this.outputDir, this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`));
          const ok = await this.downloadPdf(pdfUrls[j], dest);
          if (ok) paths.push(dest);
          await this.delay(150);
        }
        if (paths.length) e.pdfPaths = paths;
      }
    }

    console.log(`✅ FAPESQ: ${editais.length} edital(is) (${MIN_YEAR}-${MAX_YEAR})`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
