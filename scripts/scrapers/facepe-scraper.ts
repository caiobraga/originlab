import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.facepe.br";
const LIST_URL = `${BASE}/editais/todos/?c=aberto`;
const MIN_YEAR = 2025;
const MAX_YEAR = 2026;

const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", março: "03", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

export class FacepeScraper implements Scraper {
  readonly name = "facepe";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "facepe");

  private readonly downloadPdfs =
    String(process.env.FACEPE_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FACEPE_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string): string {
    const h = String(href || "").trim();
    if (!h || h.startsWith("file:") || h.startsWith("#")) return "";
    try {
      return new URL(h, BASE).toString();
    } catch {
      if (h.startsWith("/")) return `${BASE}${h}`;
      return `${BASE}/${h.replace(/^\//, "")}`;
    }
  }

  private extractNumero(titulo: string): string {
    const m = titulo.match(/^(\d{1,4})\/(\d{4})\s*-/);
    if (m) return `${m[1]}/${m[2]}`;
    const m2 = titulo.match(/n[º°]?\s*(\d+)\s*\/\s*(\d{4})/i) || titulo.match(/(\d{1,4})\/(\d{4})/);
    if (m2) return `${m2[1]}/${m2[2]}`;
    return "";
  }

  private yearFromNumero(numero: string): number | null {
    const m = numero.match(/\/(\d{4})$/);
    return m ? parseInt(m[1], 10) : null;
  }

  /** "11 de fevereiro de 2026" -> "2026-02-11" */
  private parsePublicationDate(s: string): string | undefined {
    const match = (s || "").trim().match(/Publicação:\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    if (!match) return undefined;
    const [, dia, mesNome, ano] = match;
    const key = (mesNome ?? "").toLowerCase().replace(/ç/g, "c").trim();
    const mes = MESES[key] ?? MESES[key.slice(0, 3)];
    if (!mes) return undefined;
    return `${ano}-${mes}-${dia.padStart(2, "0")}`;
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

  private extractItemsFromHtml(html: string): { titulo: string; pdfUrl: string; dataPublicacao?: string }[] {
    const $ = cheerio.load(html);
    const items: { titulo: string; pdfUrl: string; dataPublicacao?: string }[] = [];
    const seen = new Set<string>();

    $('a[href*=".pdf"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const fullUrl = this.absoluteUrl(href);
      const pdfUrl = fullUrl.split("?")[0];
      if (!pdfUrl.includes("facepe.br") || !pdfUrl.toLowerCase().includes(".pdf")) return;
      if (seen.has(pdfUrl)) return;
      seen.add(pdfUrl);

      const $link = $(el);
      let $container = $link.closest("div");
      for (let i = 0; i < 5 && $container.length; i++) {
        const hasH5 = $container.find("h5").length > 0;
        const hasPub = /Publicação:\s*\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/i.test($container.text());
        if (hasH5 || hasPub) break;
        $container = $container.parent();
      }
      if (!$container.length) $container = $.root();

      let titulo = "";
      $container.find("h5").first().each((_, h5) => {
        titulo = $(h5).text().trim().replace(/\s+/g, " ");
      });
      if (!titulo) titulo = $link.text().trim() || "Edital FACEPE";

      let dataPublicacao: string | undefined;
      const text = $container.text();
      const pubMatch = text.match(/Publicação:\s*(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
      if (pubMatch) dataPublicacao = this.parsePublicationDate(pubMatch[0]) ?? undefined;

      items.push({ titulo, pdfUrl, dataPublicacao });
    });

    return items;
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FACEPE_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FACEPE_MAX_ITEMS, 10) || 9999)
      : 9999;

    console.log(`📄 FACEPE: buscando ${LIST_URL}`);
    let html: string;
    try {
      html = await this.fetchText(LIST_URL);
    } catch (e) {
      console.warn(`⚠️ FACEPE: erro ao buscar lista: ${(e as Error).message}`);
      return [];
    }

    const allItems = this.extractItemsFromHtml(html);
    const byNumero = new Map<
      string,
      { titulo: string; pdfUrls: string[]; dataPublicacao?: string }
    >();

    for (const it of allItems) {
      const numero = this.extractNumero(it.titulo) || it.titulo.slice(0, 30);
      const year = this.yearFromNumero(numero) ?? (it.dataPublicacao ? parseInt(it.dataPublicacao.slice(0, 4), 10) : null);
      if (year !== null && (year < MIN_YEAR || year > MAX_YEAR)) continue;

      const existing = byNumero.get(numero);
      if (existing) {
        if (!existing.pdfUrls.includes(it.pdfUrl)) existing.pdfUrls.push(it.pdfUrl);
        if (it.dataPublicacao && !existing.dataPublicacao) existing.dataPublicacao = it.dataPublicacao;
      } else {
        byNumero.set(numero, {
          titulo: it.titulo,
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
      const numero = /^\d+\/\d+$/.test(numeroKey) ? numeroKey : `FACEPE-${idx}`;
      console.log(`  ✅ ${numero} – ${v.titulo.slice(0, 50)}... (${v.pdfUrls.length} PDF(s))`);
      editais.push({
        numero,
        titulo: v.titulo,
        link: LIST_URL,
        orgao: "FACEPE",
        fonte: "facepe",
        pais: "Brasil",
        estado: "PE",
        dataPublicacao: v.dataPublicacao,
        pdfUrl: v.pdfUrls[0],
        pdfUrls: v.pdfUrls,
        processadoEm: new Date().toISOString(),
      });
      if (editais.length >= maxItems) break;
    }

    console.log(`✅ FACEPE: ${editais.length} edital(is) (${MIN_YEAR}-${MAX_YEAR})`);

    if (this.downloadPdfs) {
      for (let i = 0; i < editais.length; i++) {
        const e = editais[i];
        const pdfUrls = (e.pdfUrls || []).filter(Boolean);
        const prefix = `facepe_${(e.numero || String(i + 1)).replace(/\//g, "-")}`;
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

    return editais;
  }

  async cleanup(): Promise<void> {}
}
