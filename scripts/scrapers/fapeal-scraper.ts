import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.fapeal.br";
const LIST_URL = `${BASE}/category/editais/`;

/** URL de post: /2025/12/slug ou /2026/01/slug */
const POST_PATH_RE = /^\/\d{4}\/\d{2}\/[^/]+\/?$/;

export class FapealScraper implements Scraper {
  readonly name = "fapeal";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapeal");

  private readonly downloadPdfs =
    String(process.env.FAPEAL_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPEAL_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

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
    const m = titulo.match(/N[º°°]?\s*(\d+\/\d+)|n[º°°]?\s*(\d+\/\d+)/i);
    if (m && (m[1] || m[2])) return m[1] || m[2]!;
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

  /** Extrai URLs dos posts da página de categoria (h2 + link "Saiba mais" -> /YYYY/MM/slug/) */
  private extractPostUrlsFromList(html: string): { url: string; titulo: string }[] {
    const $ = cheerio.load(html);
    const items: { url: string; titulo: string }[] = [];
    const seen = new Set<string>();

    $("h2, h3.entry-title").each((_, heading) => {
      const $h = $(heading);
      const titulo = $h.text().trim().replace(/\s+/g, " ");
      const href =
        $h.find('a[href*="fapeal.br/20"]').attr("href") ||
        $h.nextAll().find('a[href*="fapeal.br/20"]').first().attr("href");
      if (!href || !titulo) return;
      try {
        const u = new URL(href, BASE);
        if (u.origin !== new URL(BASE).origin) return;
        const pathname = u.pathname.replace(/\/$/, "");
        if (!POST_PATH_RE.test(pathname + "/")) return;
        const full = u.toString();
        if (seen.has(full)) return;
        seen.add(full);
        items.push({ url: full, titulo });
      } catch {
        // ignore
      }
    });

    if (items.length === 0) {
      $('a[href*="fapeal.br/20"]').each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        try {
          const u = new URL(href, BASE);
          const pathname = u.pathname.replace(/\/$/, "");
          if (!POST_PATH_RE.test(pathname + "/")) return;
          const full = u.toString();
          if (seen.has(full)) return;
          seen.add(full);
          const titulo =
            $(el).closest("article").find("h2, h3").first().text().trim() ||
            $(el).parent().prev("h2, h3").text().trim() ||
            $(el).text().trim();
          items.push({ url: full, titulo: titulo.replace(/\s+/g, " ").trim() || "Edital" });
        } catch {
          // ignore
        }
      });
    }

    return items;
  }

  /** Na página do post, extrai título (h1) e todos os links para PDF */
  private extractDetail(html: string, pageUrl: string): { titulo: string; pdfUrls: string[] } {
    const $ = cheerio.load(html);
    let titulo = $("article h1, .entry-content h1, main h1").first().text().trim().replace(/\s+/g, " ");
    if (!titulo) titulo = $("h1").first().text().trim().replace(/\s+/g, " ");

    const pdfUrls: string[] = [];
    $('a[href*=".pdf"], a[href*="wp-content/uploads"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href || !href.toLowerCase().includes(".pdf")) return;
      const abs = this.absoluteUrl(href);
      if (abs && !pdfUrls.includes(abs)) pdfUrls.push(abs);
    });

    return { titulo: titulo || "Edital", pdfUrls };
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPEAL_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPEAL_MAX_ITEMS, 10) || 9999)
      : 9999;

    console.log(`📄 FAPEAL: buscando lista em ${LIST_URL}`);
    const listHtml = await this.fetchText(LIST_URL);
    const posts = this.extractPostUrlsFromList(listHtml).slice(0, maxItems);
    console.log(`📋 FAPEAL: ${posts.length} post(s) encontrado(s)`);

    const editais: Edital[] = [];
    for (let i = 0; i < posts.length; i++) {
      const { url, titulo: listTitulo } = posts[i];
      console.log(`  [${i + 1}/${posts.length}] ${listTitulo.slice(0, 50)}...`);

      const detailHtml = await this.fetchText(url);
      const { titulo, pdfUrls } = this.extractDetail(detailHtml, url);
      const tituloFinal = titulo.length > 3 ? titulo : listTitulo;

      const numero = this.extractNumero(tituloFinal) || `FAPEAL-${i + 1}`;
      const pdfPaths: string[] = [];

      if (this.downloadPdfs && pdfUrls.length > 0) {
        const prefix = `fapeal_${numero.replace(/\//g, "-")}`;
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
        orgao: "FAPEAL",
        fonte: "fapeal",
        pais: "Brasil",
        estado: "AL",
        pdfUrl: pdfUrls[0],
        pdfUrls,
        pdfPaths: pdfPaths.length ? pdfPaths : undefined,
        processadoEm: new Date().toISOString(),
      });
      console.log(`    ✅ ${pdfUrls.length} PDF(s)`);
      await this.delay(400);
    }

    console.log(`✅ FAPEAL: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
