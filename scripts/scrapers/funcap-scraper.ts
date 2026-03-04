import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://montenegro.funcap.ce.gov.br/sugba";
const LIST_URL = `${BASE}/editais/`;

/** Linha que parece título de edital (cabeçalho de bloco), não link para PDF */
const TITLE_LIKE = /^(EDITAL|Edital|CHAMADA|Chamada|PROGRAMA|Programa|BOLSA\s+DE\s+PRODUTIVIDADE).{10,}/i;
/** Títulos que são subdocumentos (errata, adendo, resultado, anexo, formulário, termo de compromisso) — não criam edital sozinhos */
const SUBDOC_TITLE = /^\s*[-–]?\s*(ERRATA|ADENDO|RESULTADO\s+(DO\s+JULGAMENTO|DO\s+EDITAL|PRELIMINAR|DEFINITIVO|FINAL|DA\s+CONFIRMAÇÃO|DA\s+ANÁLISE)|ANEXO|FORMUL[ÁA]RIO\s+DE\s+SUBMISS[ÃA]O|TERMO\s+DE\s+COMPROMISSO)/i;
/** Referência a edital pai no texto (ex.: "Adendo 01 - Edital Nº 06/2019") */
const PARENT_EDITAL_REF = /(?:Edital|EDITAL)\s*N[º°]?\s*(\d+)\s*\/\s*(\d{4})/i;

export class FuncapScraper implements Scraper {
  readonly name = "funcap";
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "funcap");

  private readonly downloadPdfs =
    String(process.env.FUNCAP_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FUNCAP_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string): string {
    const h = String(href || "").trim();
    if (!h || h.startsWith("file:")) return "";
    try {
      return new URL(h, LIST_URL).toString();
    } catch {
      if (h.startsWith("/")) return `${BASE}${h}`;
      if (h.startsWith("../")) return new URL(h, LIST_URL).toString();
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

  /** Retorna número do edital pai quando o título é subdocumento (ex.: "Adendo 01 - Edital Nº 06/2019" → "06/2019"). */
  private extractParentEditalNumber(titulo: string): string {
    const m = titulo.match(PARENT_EDITAL_REF);
    return m ? `${m[1]}/${m[2]}` : "";
  }

  private isSubDocumentTitle(titulo: string): boolean {
    return SUBDOC_TITLE.test((titulo || "").trim());
  }

  /** DD/MM/YYYY -> YYYY-MM-DD */
  private parseDate(s: string): string | undefined {
    const m = (s || "").trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return undefined;
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
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
   * Extrai da página única: tabelas com blocos (título + linhas com link PDF e data).
   * Para cada a[href*="edital"][href*=".pdf"] encontra o título do bloco (linha anterior do mesmo table) e a data (td ao lado).
   */
  private extractEditaisFromHtml(html: string): Edital[] {
    const $ = cheerio.load(html);
    const items: { titulo: string; pdfUrl: string; dataPublicacao?: string }[] = [];

    $('a[href*="edital"][href*=".pdf"]').each((_, el) => {
      const href = $(el).attr("href");
      if (!href || !href.toLowerCase().endsWith(".pdf")) return;
      const abs = this.absoluteUrl(href);
      if (!abs) return;

      const $link = $(el);
      const $row = $link.closest("tr");
      if (!$row.length) return;

      let dataStr: string | undefined;
      $row.find("td").each((_, td) => {
        const t = $(td).text().trim();
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) dataStr = t;
      });
      const dataPublicacao = dataStr ? this.parseDate(dataStr) : undefined;

      const isTitleRow = ($tr: cheerio.Cheerio<cheerio.Element>) => {
        if ($tr.find('a[href*=".pdf"]').length) return false;
        const text = $tr.text().trim().replace(/\s+/g, " ");
        if (text.length < 25) return false;
        if (/^Edital\s+Publicação$/i.test(text) || /^Resultado\s+Publicação$/i.test(text)) return false;
        if (SUBDOC_TITLE.test(text)) return false;
        return (
          TITLE_LIKE.test(text) ||
          (/\d{1,4}\/\d{4}/.test(text) && /EDITAL|CHAMADA|BPI|PROGRAMA|PPSUS/i.test(text))
        );
      };
      let titulo = "";
      let $table = $row.closest("table");
      while ($table.length) {
        const titleRows: string[] = [];
        $table.find("tr").each((_, tr) => {
          if (isTitleRow($(tr))) titleRows.push($(tr).text().trim().replace(/\s+/g, " "));
        });
        if (titleRows.length === 1) {
          titulo = titleRows[0];
          break;
        }
        $table = $table.parent().closest("table");
      }
      if (!titulo || titulo.length < 10) titulo = $link.text().trim().replace(/\s+/g, " ") || "Edital FUNCAP";
      items.push({ titulo, pdfUrl: abs, dataPublicacao });
    });

    const byNumero = new Map<string, { titulo: string; pdfUrls: string[]; dataPublicacao?: string }>();
    const preferMainTitle = /^EDITAL\s+N[º°]?\s*\d+\/\d+|^Edital\s+N[º°]?\s*\d+\/\d+|^PROGRAMA\s+DE\s+BOLSAS|^CHAMADA\s+\d+\/\d+|BOLSA\s+DE\s+PRODUTIVIDADE.*\d+\/\d+/i;
    /** Quando um subdoc (anexo/errata) não tem número nem referência a edital pai, anexamos ao último edital principal (ordem do documento). */
    let lastMainKey: string | null = null;
    for (const it of items) {
      const isSubDoc = this.isSubDocumentTitle(it.titulo);
      const parentNum = isSubDoc ? this.extractParentEditalNumber(it.titulo) : "";
      const extractedNum = this.extractNumero(it.titulo);
      let key = (parentNum || extractedNum).trim();
      if (isSubDoc && !key && lastMainKey) {
        key = lastMainKey;
      }
      if (isSubDoc && !key) {
        continue;
      }
      if (!key) key = it.titulo.slice(0, 60).trim();
      if (!key) continue;
      const existing = byNumero.get(key);
      if (existing) {
        if (!existing.pdfUrls.includes(it.pdfUrl)) existing.pdfUrls.push(it.pdfUrl);
        if (it.dataPublicacao && (!existing.dataPublicacao || it.dataPublicacao < existing.dataPublicacao)) {
          existing.dataPublicacao = it.dataPublicacao;
        }
        if (!isSubDoc && preferMainTitle.test(it.titulo) && it.titulo.length > (existing.titulo?.length ?? 0)) {
          existing.titulo = it.titulo.replace(/^\s*-\s*/, "").trim();
        }
        if (!isSubDoc) lastMainKey = key;
      } else {
        const displayTitulo = isSubDoc
          ? `Edital FUNCAP ${key}`
          : it.titulo.replace(/^\s*-\s*/, "").trim();
        byNumero.set(key, {
          titulo: displayTitulo,
          pdfUrls: [it.pdfUrl],
          dataPublicacao: it.dataPublicacao,
        });
        if (!isSubDoc) lastMainKey = key;
      }
    }

    const editais: Edital[] = [];
    let idx = 0;
    const anoLimite = 2023; // ao encontrar edital de 2023 ou mais antigo, interromper
    for (const [numeroKey, v] of byNumero) {
      if (!v.pdfUrls.length) continue;
      const yearFromNum = numeroKey.match(/\/(\d{4})$/)?.[1];
      const year = yearFromNum
        ? parseInt(yearFromNum, 10)
        : v.dataPublicacao
          ? parseInt(String(v.dataPublicacao).slice(0, 4), 10)
          : NaN;
      if (!Number.isNaN(year) && year <= anoLimite) {
        break; // interromper o scrape ao começar a ver editais de 2023
      }
      idx++;
      const numero = /^\d+\/\d+$/.test(numeroKey) ? numeroKey : `FUNCAP-${idx}`;
      const tituloFinal =
        this.isSubDocumentTitle(v.titulo) ? `Edital FUNCAP ${numero}` : v.titulo.replace(/^\s*-\s*/, "").trim();
      editais.push({
        numero,
        titulo: tituloFinal,
        link: LIST_URL,
        orgao: "FUNCAP",
        fonte: "funcap",
        pais: "Brasil",
        estado: "CE",
        dataPublicacao: v.dataPublicacao,
        pdfUrl: v.pdfUrls[0],
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

    const maxItems = process.env.FUNCAP_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FUNCAP_MAX_ITEMS, 10) || 9999)
      : 9999;

    console.log(`📄 FUNCAP: buscando lista em ${LIST_URL}`);
    const html = await this.fetchText(LIST_URL);
    const editais = this.extractEditaisFromHtml(html).slice(0, maxItems);
    console.log(`📋 FUNCAP: ${editais.length} edital(is) extraído(s) da página`);

    for (let i = 0; i < editais.length; i++) {
      const e = editais[i];
      const pdfUrls = (e.pdfUrls || []).filter(Boolean);
      const pdfPaths: string[] = [];
      if (this.downloadPdfs && pdfUrls.length > 0) {
        const prefix = `funcap_${(e.numero || String(i + 1)).replace(/\//g, "-")}`;
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
      console.log(`  ✅ ${e.numero} – ${(e.titulo || "").slice(0, 45)}... (${pdfUrls.length} PDF(s))`);
    }

    console.log(`✅ FUNCAP: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {}
}
