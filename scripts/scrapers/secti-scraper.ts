import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

type SectiDoc = {
  href: string;
  name?: string;
  updatedAt?: string; // dd/mm/yyyy
};

export class SectiScraper implements Scraper {
  readonly name = "secti";
  private readonly baseUrl = "https://secti.es.gov.br";
  private readonly listPath = "/editais-abertos";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "secti");

  // Default: baixar PDFs localmente (como o CNPq / Finep).
  // Para desligar: SECTI_DOWNLOAD_PDFS=0/false
  private readonly downloadPdfs = !(
    String(process.env.SECTI_DOWNLOAD_PDFS || "").trim() === "0" ||
    String(process.env.SECTI_DOWNLOAD_PDFS || "").trim().toLowerCase() === "false"
  );

  private async init() {
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private normalizeSpaces(s: string): string {
    return String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  private cleanTitle(s: string): string {
    const t = this.normalizeSpaces(s);
    // remove ícones/indicadores de expandir/retrair no fim do texto
    return t.replace(/[+\-]\s*$/g, "").trim();
  }

  private absoluteUrl(href: string, pageUrl?: string): string {
    const h = String(href || "").trim();
    if (!h) return h;
    try {
      return new URL(h, pageUrl || this.baseUrl).toString();
    } catch {
      if (h.startsWith("/")) return `${this.baseUrl}${h}`;
      return h;
    }
  }

  private parsePtBrDateToTs(s?: string): number {
    const m = String(s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return 0;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (!dd || !mm || !yyyy) return 0;
    const d = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
    const ts = d.getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  private safeFileNameFromUrl(url: string): string {
    let name = "documento.pdf";
    try {
      const u = new URL(url);
      const base = decodeURIComponent(u.pathname.split("/").pop() || "");
      if (base) name = base;
    } catch {
      // ignore
    }

    name = name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_").trim();
    if (!name.toLowerCase().endsWith(".pdf")) name = `${name}.pdf`;
    if (name.length > 120) {
      const ext = path.extname(name) || ".pdf";
      const stem = name.slice(0, 120 - ext.length);
      name = `${stem}${ext}`;
    }
    return name;
  }

  private async fetchText(url: string, timeoutMs = 35000): Promise<string> {
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
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} ${r.statusText}${txt ? ` - ${txt.slice(0, 200)}` : ""}`);
      }
      return await r.text();
    } finally {
      clearTimeout(t);
    }
  }

  private async downloadPdfFromUrl(url: string, destPath: string): Promise<boolean> {
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

      const ct = String(r.headers.get("content-type") || "").toLowerCase();
      const buf = Buffer.from(await r.arrayBuffer());
      const isPdf = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
      if (!isPdf && !ct.includes("pdf")) return false;

      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(destPath, buf);
      return true;
    } catch {
      return false;
    }
  }

  private extractMaxPage($: cheerio.CheerioAPI, currentPage: number): number {
    let max = currentPage;
    $("a[href*='?page=']")
      .toArray()
      .forEach((a) => {
        const href = String($(a).attr("href") || "");
        const m = href.match(/[?&]page=(\d+)/i);
        if (m && m[1]) {
          const p = Number(m[1]);
          if (Number.isFinite(p) && p > max) max = p;
        }
      });
    return max;
  }

  private extractEditaisFromHtml(html: string, pageUrl: string, pageNum: number): Edital[] {
    const $ = cheerio.load(html);
    const editais: Edital[] = [];

    const anchors = $("a[href^=\"#collapse-\"]").toArray();
    for (const a of anchors) {
      const $a = $(a);
      const href = String($a.attr("href") || "").trim(); // #collapse-xxxxx
      if (!href.startsWith("#collapse-")) continue;

      const titulo = this.cleanTitle($a.text());
      if (!titulo) continue;

      const $panel = $(href);
      if (!$panel.length) continue;

      const docs: SectiDoc[] = [];
      $panel
        .find("a[href]")
        .toArray()
        .forEach((linkEl) => {
          const $link = $(linkEl);
          const rawHref = String($link.attr("href") || "").trim();
          if (!rawHref) return;
          if (!rawHref.toLowerCase().includes(".pdf")) return;

          const abs = this.absoluteUrl(rawHref, pageUrl);
          const name = this.normalizeSpaces($link.text()) || undefined;
          const $tr = $link.closest("tr");
          const updatedAt = this.normalizeSpaces($tr.find("td").eq(1).text()) || undefined; // coluna "Atualização"

          docs.push({ href: abs, name, updatedAt });
        });

      const pdfUrls = Array.from(new Set(docs.map((d) => d.href).filter(Boolean)));
      if (pdfUrls.length === 0) continue; // só queremos aqueles com PDFs

      const pickBestDoc = (): SectiDoc => {
        const candidates = docs.length ? docs : pdfUrls.map((u) => ({ href: u } as SectiDoc));
        const better = (x: SectiDoc, y: SectiDoc) => {
          const xName = this.normalizeSpaces(x.name || "");
          const yName = this.normalizeSpaces(y.name || "");
          const xIsEdital = /edital/i.test(xName) || /edital/i.test(x.href);
          const yIsEdital = /edital/i.test(yName) || /edital/i.test(y.href);
          if (xIsEdital !== yIsEdital) return xIsEdital;
          const xt = this.parsePtBrDateToTs(x.updatedAt);
          const yt = this.parsePtBrDateToTs(y.updatedAt);
          if (xt !== yt) return xt > yt;
          return x.href.length > y.href.length;
        };
        let best = candidates[0];
        for (const c of candidates.slice(1)) {
          if (better(c, best)) best = c;
        }
        return best;
      };

      const best = pickBestDoc();
      let numeroBase = "";
      try {
        const u = new URL(best.href);
        numeroBase = decodeURIComponent(u.pathname.split("/").pop() || "").replace(/\.pdf$/i, "");
      } catch {
        numeroBase = "";
      }
      numeroBase = this.normalizeSpaces(numeroBase).replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_().-]+/g, "_").replace(/_+/g, "_").trim();
      if (!numeroBase) {
        numeroBase = this.normalizeSpaces(titulo)
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]+/g, "_")
          .slice(0, 80);
      }

      const numero = `SECTI-${numeroBase}`.slice(0, 120);
      const dataPublicacao = best.updatedAt && /^\d{2}\/\d{2}\/\d{4}$/.test(best.updatedAt) ? best.updatedAt : undefined;
      const link = `${pageUrl}${href}`;

      editais.push({
        numero,
        titulo,
        descricao: undefined,
        dataPublicacao,
        dataEncerramento: undefined,
        status: "Aberta",
        orgao: "SECTI",
        fonte: "secti",
        link,
        pais: "Brasil",
        estado: "ES",
        page: pageNum,
        pdfUrl: pdfUrls[0],
        pdfUrls,
        pdfPaths: [],
        documentos: docs,
        processadoEm: new Date().toISOString(),
      });
    }

    return editais;
  }

  async scrape(): Promise<Edital[]> {
    await this.init();

    const editais: Edital[] = [];
    const seen = new Set<string>(); // fonte:numero

    const envMax = String(process.env.SECTI_MAX_PAGES || "").trim();
    const maxPagesFromEnv = envMax ? Math.max(1, Number(envMax) || 1) : null;

    let page = 1;
    let maxPage = maxPagesFromEnv ?? 1;

    while (page <= maxPage) {
      const pageUrl =
        page === 1 ? `${this.baseUrl}${this.listPath}` : `${this.baseUrl}${this.listPath}?page=${page}`;
      console.log(`📄 SECTI: página ${page}${maxPagesFromEnv ? `/${maxPagesFromEnv}` : ""} (${pageUrl})`);

      const html = await this.fetchText(pageUrl);
      const extracted = this.extractEditaisFromHtml(html, pageUrl, page);

      // se não tiver max env, tenta inferir o total por paginação
      if (page === 1 && maxPagesFromEnv == null) {
        const $ = cheerio.load(html);
        maxPage = this.extractMaxPage($, 1);
      }

      for (const e of extracted) {
        const key = `${e.fonte || "secti"}:${e.numero || e.titulo || ""}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);

        const pdfUrls = (e.pdfUrls || []).filter(Boolean);
        const pdfPaths: string[] = [];
        if (this.downloadPdfs && pdfUrls.length > 0) {
          console.log(`  📥 ${e.numero || e.titulo}: baixando ${pdfUrls.length} PDF(s)...`);
          for (let i = 0; i < pdfUrls.length; i++) {
            const u = pdfUrls[i];
            const fileName = this.safeFileNameFromUrl(u);
            const dest = path.join(this.outputDir, fileName);
            const ok = await this.downloadPdfFromUrl(u, dest);
            if (ok) pdfPaths.push(dest);
            await this.delay(120);
          }
        }

        e.pdfPaths = pdfPaths;
        if (pdfPaths.length > 0) e.pdfPath = pdfPaths[0];

        editais.push(e);
        console.log(`  ✅ OK (${pdfUrls.length} pdf(s))`);
      }

      page += 1;
      await this.delay(250);
    }

    console.log(`✅ SECTI: total de ${editais.length} edital(is) com PDF(s) extraído(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {
    // sem browser
  }
}

