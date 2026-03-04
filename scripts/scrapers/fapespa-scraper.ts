import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://www.fapespa.pa.gov.br";
const LIST_URL = `${BASE}/category/editais/`;

export class FapespaScraper implements Scraper {
  readonly name = "fapespa";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapespa");

  private readonly downloadPdfs =
    String(process.env.FAPESPA_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPESPA_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

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

  /** Fetch com retry em caso de timeout/abort ou falha de rede. */
  private async fetchTextWithRetry(
    url: string,
    opts: { timeoutMs?: number; retries?: number; delayMs?: number } = {}
  ): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? 90000;
    const retries = opts.retries ?? 2;
    const delayMs = opts.delayMs ?? 2000;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.fetchText(url, timeoutMs);
      } catch (e) {
        lastErr = e as Error;
        const isAbort = /aborted|timeout/i.test(String(lastErr?.message));
        if (attempt < retries && (isAbort || (lastErr as Error).message?.includes("fetch"))) {
          await this.delay(delayMs);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr ?? new Error("fetch failed");
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

  /** Lista: main article, cada um com link (h2 a) e data (time). */
  private extractListItems(html: string, pageUrl: string): { url: string; titulo: string; dataPublicacao?: string }[] {
    const $ = cheerio.load(html);
    const items: { url: string; titulo: string; dataPublicacao?: string }[] = [];
    const seen = new Set<string>();

    $("main article").each((_, el) => {
      const $art = $(el);
      const a = $art.find("h2 a").first();
      const href = a.attr("href");
      const titulo = a.text().trim().replace(/\s+/g, " ");
      if (!href || !titulo) return;
      const url = this.absoluteUrl(href);
      if (!url || !url.includes("fapespa.pa.gov.br")) return;
      if (seen.has(url)) return;
      seen.add(url);

      let dataPublicacao: string | undefined;
      const timeText = $art.find("time").first().text().trim();
      const dm = timeText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dm) {
        dataPublicacao = this.ddmmyyyyToIso(`${dm[1]}/${dm[2]}/${dm[3]}`);
      } else {
        const meses: Record<string, string> = { jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06", jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12" };
        const mmm = timeText.match(/(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(\d{4})/i);
        if (mmm) {
          const mes = meses[mmm[2].toLowerCase().slice(0, 3)] || "01";
          dataPublicacao = `${mmm[3]}-${mes}-${mmm[1].padStart(2, "0")}`;
        }
      }
      items.push({ url, titulo, dataPublicacao });
    });

    return items;
  }

  /** Extrai de uma página (post ou chamada): título, data, descrição, PDFs e links para outras páginas internas (chamada). */
  private extractDetail(html: string): {
    titulo: string;
    dataPublicacao?: string;
    descricao?: string;
    pdfUrls: string[];
    internalLinks: string[];
  } {
    const $ = cheerio.load(html);
    const $art = $("article").first();
    const $scope = $art.length ? $art : $("main").first();
    const scope = $scope.length ? $scope : $.root();

    const titulo =
      scope.find("h1").first().text().trim().replace(/\s+/g, " ") ||
      $("h1").first().text().trim().replace(/\s+/g, " ") ||
      "Edital FAPESPA";

    let dataPublicacao: string | undefined;
    const timeText = scope.find("time").first().text().trim();
    const dm = timeText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dm) dataPublicacao = this.ddmmyyyyToIso(`${dm[1]}/${dm[2]}/${dm[3]}`);

    const descricao = scope.find("p").first().text().trim().replace(/\s+/g, " ") || undefined;

    const pdfUrls: string[] = [];
    const internalLinks: string[] = [];
    scope.find("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = this.absoluteUrl(href);
      if (!abs || !abs.includes("fapespa.pa.gov.br")) return;
      if (abs.includes("wp-content/uploads") && (abs.toLowerCase().includes(".pdf") || abs.endsWith(".pdf"))) {
        if (!pdfUrls.includes(abs)) pdfUrls.push(abs);
        return;
      }
      if (abs.toLowerCase().endsWith(".pdf")) {
        if (!pdfUrls.includes(abs)) pdfUrls.push(abs);
        return;
      }
      if (abs.includes("/category/") || abs.includes("/author/") || abs === BASE || abs === BASE + "/") return;
      if (/\/\d{4}\/\d{2}\/\d{2}\//.test(abs) && !internalLinks.includes(abs)) {
        internalLinks.push(abs);
      }
    });

    return { titulo, dataPublicacao, descricao, pdfUrls, internalLinks };
  }

  /** De uma página de chamada/edital extrai só os PDFs (para seguir links do post). */
  private extractPdfsFromPage(html: string): string[] {
    const $ = cheerio.load(html);
    const pdfUrls: string[] = [];
    $("article a[href], main a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = this.absoluteUrl(href);
      if (!abs || !abs.includes("fapespa.pa.gov.br")) return;
      if ((abs.includes("wp-content/uploads") && abs.toLowerCase().includes(".pdf")) || abs.toLowerCase().endsWith(".pdf")) {
        if (!pdfUrls.includes(abs)) pdfUrls.push(abs);
      }
    });
    return pdfUrls;
  }

  private getListPageUrl(page: number): string {
    if (page <= 1) return LIST_URL;
    return `${LIST_URL}page/${page}/`;
  }

  async scrape(): Promise<Edital[]> {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const maxItems = process.env.FAPESPA_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPESPA_MAX_ITEMS, 10) || 9999)
      : 9999;
    const maxPages = process.env.FAPESPA_MAX_PAGES
      ? Math.max(1, parseInt(process.env.FAPESPA_MAX_PAGES, 10) || 10)
      : 10;
    const concurrency = Math.min(10, Math.max(1, parseInt(process.env.FAPESPA_CONCURRENCY || "3", 10) || 3));

    const listItems: { url: string; titulo: string; dataPublicacao?: string }[] = [];
    const seenUrls = new Set<string>();

    for (let page = 1; page <= maxPages; page++) {
      const pageUrl = this.getListPageUrl(page);
      console.log(`📄 FAPESPA: buscando lista em ${pageUrl}`);
      let html: string;
      try {
        html = await this.fetchText(pageUrl);
      } catch (e) {
        console.warn(`⚠️ FAPESPA: erro ao buscar ${pageUrl}: ${(e as Error).message}`);
        break;
      }
      const items = this.extractListItems(html, pageUrl);
      let added = 0;
      for (const it of items) {
        if (seenUrls.has(it.url)) continue;
        seenUrls.add(it.url);
        listItems.push(it);
        added++;
      }
      if (items.length === 0 || added === 0) break;
      if (listItems.length >= maxItems) break;
      await this.delay(150);
    }

    const targets = listItems.slice(0, maxItems);
    console.log(`📋 FAPESPA: ${targets.length} edital(is) na lista (concorrência: ${concurrency})\n`);

    const editais: Edital[] = [];
    const maxFollowLinks = 3;

    const processOne = async (i: number): Promise<Edital | null> => {
      const { url, titulo: listTitulo, dataPublicacao: listData } = targets[i];
      try {
        const detailHtml = await this.fetchTextWithRetry(url, { timeoutMs: 90000, retries: 2 });
        const detail = this.extractDetail(detailHtml);
        let pdfUrls = [...detail.pdfUrls];
        const tituloFinal = detail.titulo.length > 3 ? detail.titulo : listTitulo;
        const dataPublicacao = detail.dataPublicacao || listData;

        for (const followUrl of detail.internalLinks.slice(0, maxFollowLinks)) {
          try {
            const chamadaHtml = await this.fetchTextWithRetry(followUrl, { timeoutMs: 60000, retries: 1 });
            const more = this.extractPdfsFromPage(chamadaHtml);
            for (const u of more) if (!pdfUrls.includes(u)) pdfUrls.push(u);
            await this.delay(100);
          } catch {
            // ignore
          }
        }

        const numero = this.extractNumero(tituloFinal) || `FAPESPA-${i + 1}`;
        const pdfPaths: string[] = [];

        if (this.downloadPdfs && pdfUrls.length > 0) {
          const prefix = `fapespa_${(numero || String(i + 1)).replace(/\//g, "-")}`;
          for (let j = 0; j < pdfUrls.length; j++) {
            const dest = path.join(
              this.outputDir,
              this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`)
            );
            const ok = await this.downloadPdf(pdfUrls[j], dest);
            if (ok) pdfPaths.push(dest);
            await this.delay(80);
          }
        }

        if (pdfUrls.length === 0) {
          console.log(`  [${i + 1}/${targets.length}] ⏭️ ${tituloFinal.slice(0, 50)}... – sem PDFs, ignorado`);
          return null;
        }

        console.log(`  [${i + 1}/${targets.length}] ✅ ${tituloFinal.slice(0, 50)}... – ${pdfUrls.length} PDF(s)`);
        return {
          numero,
          titulo: tituloFinal,
          descricao: detail.descricao,
          link: url,
          orgao: "FAPESPA",
          fonte: "fapespa",
          pais: "Brasil",
          estado: "PA",
          dataPublicacao,
          pdfUrl: pdfUrls[0],
          pdfUrls,
          pdfPaths: pdfPaths.length ? pdfPaths : undefined,
          processadoEm: new Date().toISOString(),
        };
      } catch (e) {
        console.warn(`  [${i + 1}/${targets.length}] ⚠️ ${listTitulo.slice(0, 50)}... – ${(e as Error).message}`);
        return null;
      }
    };

    for (let start = 0; start < targets.length; start += concurrency) {
      const chunk = targets.slice(start, start + concurrency);
      const results = await Promise.all(
        chunk.map((_, j) => processOne(start + j))
      );
      for (const r of results) if (r) editais.push(r);
    }

    console.log(`\n✅ FAPESPA: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
