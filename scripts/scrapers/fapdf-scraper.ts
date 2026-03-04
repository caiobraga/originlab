import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.fap.df.gov.br";
const LIST_URL = `${BASE}/editais-fapdf-20261`;

/** Prefixo de links de documentos da FAPDF (editais e anexos) */
const DOC_PATH = "/documents/d/fap/";

export class FapdfScraper implements Scraper {
  readonly name = "fapdf";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapdf");

  private readonly downloadPdfs =
    String(process.env.FAPDF_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPDF_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

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
    const m = titulo.match(/EDITAL\s+(?:N[º°]?\s*)?(\d+)\s*\/\s*(\d{4})/i) || titulo.match(/(\d{1,4})\/(\d{4})/);
    if (m) return `${m[1]}/${m[2]}`;
    return "";
  }

  /** Considera documento de edital (PDF ou viewer) se path contém edital ou termina com -pdf */
  private isEditalDoc(href: string): boolean {
    const h = (href || "").toLowerCase();
    if (!h.includes(DOC_PATH)) return false;
    if (h.includes("planejamento") || h.includes("organograma") || h.includes("plano_dados") || h.includes("contatos-telefonicos")) return false;
    return h.includes("edital") || h.includes("-pdf") || h.endsWith("-pdf");
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
        headers: { Accept: "application/pdf,application/octet-stream,text/html,*/*" },
      });
      clearTimeout(t);
      if (!r.ok) return false;
      const contentType = (r.headers.get("content-type") || "").toLowerCase();
      const buf = Buffer.from(await r.arrayBuffer());
      const isPdf =
        contentType.includes("pdf") ||
        (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);
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
   * Extrai editais da página única: conteúdo em tabs já vem no HTML.
   * Coleta todos os links /documents/d/fap/... (editais e anexos) e agrupa por número extraído do path ou do texto do link.
   */
  private extractEditaisFromHtml(html: string): Edital[] {
    const $ = cheerio.load(html);
    const items: { titulo: string; numero: string; pdfUrl: string }[] = [];

    const $main = $("main main, #main-content, [role='main']").first();
    const $scope = $main.length ? $main : $.root();

    $scope.find(`a[href*="${DOC_PATH}"]`).each((_, el) => {
      const href = $(el).attr("href");
      if (!href || !this.isEditalDoc(href)) return;
      const abs = this.absoluteUrl(href);
      if (!abs) return;
      const linkText = $(el).text().trim().replace(/\s+/g, " ");
      const numeroFromPath = href.match(/edital[-_]n?[-_]?(\d+)[-_](\d{4})/i) || href.match(/(\d{1,2})[-_]2026/);
      const numero = numeroFromPath ? `${numeroFromPath[1]}/${numeroFromPath[2] || "2026"}` : this.extractNumero(linkText);
      const titulo =
        linkText.length > 20 && /EDITAL\s+\d+\/\d{4}/i.test(linkText)
          ? linkText
          : numero
            ? `EDITAL ${numero} - FAPDF`
            : "Edital FAPDF";
      items.push({ titulo, numero: numero || "", pdfUrl: abs });
    });

    const byNumero = new Map<string, { titulo: string; pdfUrls: string[] }>();
    for (const it of items) {
      const key = it.numero || it.pdfUrl;
      const existing = byNumero.get(key);
      if (existing) {
        if (!existing.pdfUrls.includes(it.pdfUrl)) existing.pdfUrls.push(it.pdfUrl);
        if (it.titulo.length > (existing.titulo?.length ?? 0) && /EDITAL\s+\d+\/\d{4}/i.test(it.titulo)) {
          existing.titulo = it.titulo;
        }
      } else {
        byNumero.set(key, { titulo: it.titulo, pdfUrls: [it.pdfUrl] });
      }
    }

    const editais: Edital[] = [];
    let idx = 0;
    for (const [numeroKey, v] of byNumero) {
      if (!v.pdfUrls.length) continue;
      idx++;
      const numero = /^\d+\/\d+$/.test(String(numeroKey)) ? numeroKey : `FAPDF-${idx}`;
      const preferMain = v.pdfUrls.find((u) => /edital-n?-\d+-2026/i.test(u) && (u.includes("-pdf") || u.includes("edital")));
      editais.push({
        numero: String(numero),
        titulo: v.titulo.replace(/\s+/g, " ").trim(),
        link: LIST_URL,
        orgao: "FAPDF",
        fonte: "fapdf",
        pais: "Brasil",
        estado: "DF",
        pdfUrl: preferMain || v.pdfUrls[0],
        pdfUrls: v.pdfUrls,
        processadoEm: new Date().toISOString(),
      });
    }
    return editais;
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPDF_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPDF_MAX_ITEMS, 10) || 9999)
      : 9999;

    console.log(`📄 FAPDF: buscando lista em ${LIST_URL}`);
    const html = await this.fetchText(LIST_URL);
    const editais = this.extractEditaisFromHtml(html).slice(0, maxItems);
    console.log(`📋 FAPDF: ${editais.length} edital(is) extraído(s) da página`);

    for (let i = 0; i < editais.length; i++) {
      const e = editais[i];
      const pdfUrls = (e.pdfUrls || []).filter(Boolean);
      const pdfPaths: string[] = [];
      if (this.downloadPdfs && pdfUrls.length > 0) {
        const prefix = `fapdf_${(e.numero || String(i + 1)).replace(/\//g, "-")}`;
        for (let j = 0; j < pdfUrls.length; j++) {
          const dest = path.join(
            this.outputDir,
            this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`)
          );
          const ok = await this.downloadPdf(pdfUrls[j], dest);
          if (ok) pdfPaths.push(dest);
          await this.delay(150);
        }
        e.pdfPaths = pdfPaths.length ? pdfPaths : undefined;
      }
      console.log(`  ✅ ${e.numero} – ${(e.titulo || "").slice(0, 45)}... (${pdfUrls.length} doc(s))`);
    }

    console.log(`✅ FAPDF: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
