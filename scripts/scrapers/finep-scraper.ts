import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

type FinepListItem = {
  titulo: string;
  link: string;
  dataPublicacao?: string;
  prazoEnvio?: string;
  fonteRecurso?: string;
  publicoAlvo?: string;
  temas?: string;
};

type FinepDocumento = {
  dataPublicacao?: string;
  nome?: string;
  urlPdf?: string;
  urlAberto?: string;
};

export class FinepScraper implements Scraper {
  readonly name = "finep";
  private readonly baseUrl = "http://www.finep.gov.br";
  private readonly listUrl = `${this.baseUrl}/chamadas-publicas/chamadaspublicas?situacao=aberta`;
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "finep");

  // Default: baixar PDFs localmente (como o CNPq).
  // Para desligar: FINEP_DOWNLOAD_PDFS=0/false
  private readonly downloadPdfs = !(
    String(process.env.FINEP_DOWNLOAD_PDFS || "").trim() === "0" ||
    String(process.env.FINEP_DOWNLOAD_PDFS || "").trim().toLowerCase() === "false"
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

  private absoluteUrl(href: string): string {
    try {
      return new URL(href, this.baseUrl).toString();
    } catch {
      if (href.startsWith("/")) return `${this.baseUrl}${href}`;
      return href;
    }
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

  private async resolvePdfUrlIfNeeded(url: string, hintName?: string): Promise<string> {
    const input = String(url || "").trim();
    if (!input) return input;
    if (input.toLowerCase().includes(".pdf")) return input;

    // Tentativa 1: ver se é PDF mesmo sem extensão (range pequeno)
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 25000);
      const r = await fetch(input, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "application/pdf,application/octet-stream,text/html,*/*",
          Range: "bytes=0-2047",
        },
      });
      clearTimeout(t);
      if (r.ok) {
        const ct = String(r.headers.get("content-type") || "").toLowerCase();
        const buf = Buffer.from(await r.arrayBuffer());
        const isPdf = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
        if (isPdf || ct.includes("pdf")) return input;
      }
    } catch {
      // ignore and fallback to HTML parse
    }

    // Tentativa 2: HTML intermediário com link para PDF
    try {
      const html = await this.fetchText(input, 25000);
      const $ = cheerio.load(html);
      const candidates = $("a[href]")
        .toArray()
        .map((a) => {
          const href = String($(a).attr("href") || "").trim();
          const text = this.normalizeSpaces($(a).text());
          let abs = href;
          try {
            abs = new URL(href, input).toString();
          } catch {
            // keep as-is
          }
          return { href: abs, text };
        })
        .filter((c) => c.href && c.href.toLowerCase().includes(".pdf"));

      if (candidates.length === 0) return input;

      const hint = this.normalizeSpaces(hintName || "").toLowerCase();
      const wantsEdital = hint.includes("edital");

      const parseFileDate = (href: string): number => {
        const m = href.match(/(\d{2})[_-](\d{2})[_-](\d{4})/);
        if (!m) return 0;
        const dd = Number(m[1]);
        const mm = Number(m[2]);
        const yyyy = Number(m[3]);
        if (!dd || !mm || !yyyy) return 0;
        const d = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
        const ts = d.getTime();
        return Number.isFinite(ts) ? ts : 0;
      };

      const hintParts = hint.split(/\s+/g).filter((p) => p.length >= 4);

      const features = (c: { href: string; text: string }) => {
        const h = c.href.toLowerCase();
        const t = c.text.toLowerCase();
        const isEdital = h.includes("edital") || t.includes("edital");
        const isFaq = h.includes("perguntas") || h.includes("respostas") || t.includes("perguntas") || t.includes("respostas");
        const isResult = h.includes("resultado") || t.includes("resultado");
        let hintHits = 0;
        for (const p of hintParts) {
          if (h.includes(p) || t.includes(p)) hintHits++;
        }
        const date = parseFileDate(c.href);
        return { isEdital, isFaq, isResult, hintHits, date };
      };

      const better = (a: { href: string; text: string }, b: { href: string; text: string }) => {
        const fa = features(a);
        const fb = features(b);
        if (wantsEdital && fa.isEdital !== fb.isEdital) return fa.isEdital; // true wins
        if (wantsEdital && fa.isResult !== fb.isResult) return !fa.isResult; // evitar "resultado"
        if (wantsEdital && fa.isFaq !== fb.isFaq) return !fa.isFaq; // evitar FAQ quando pedimos edital
        if (fa.hintHits !== fb.hintHits) return fa.hintHits > fb.hintHits;
        if (fa.date !== fb.date) return fa.date > fb.date;
        return a.href.length > b.href.length;
      };

      let best = candidates[0];
      for (const c of candidates.slice(1)) {
        if (better(c, best)) best = c;
      }

      return best.href || input;
    } catch {
      return input;
    }
  }

  private async extractListPage(url: string): Promise<FinepListItem[]> {
    const html = await this.fetchText(url);
    const $ = cheerio.load(html);

    const out: FinepListItem[] = [];
    const anchors = $("h3 a[href*=\"/chamadas-publicas/chamadapublica/\"]").toArray();

    for (const a of anchors) {
      const $a = $(a);
      const href = String($a.attr("href") || "").trim();
      if (!href) continue;

      const link = this.absoluteUrl(href);
      const titulo = this.normalizeSpaces($a.text());
      if (!titulo) continue;

      // achar o "card" do item (sem englobar múltiplos h3)
      let $item = $a.closest("h3");
      if ($item.length) $item = $item.parent();
      if (!$item.length) $item = $a.parent();

      for (let i = 0; i < 10; i++) {
        const t = this.normalizeSpaces($item.text()).toLowerCase();
        const hasSignals =
          t.includes("data de publicação") ||
          t.includes("data de publicacao") ||
          t.includes("prazo para envio de propostas") ||
          t.includes("fonte de recurso");
        const h3Count = $item.find("h3").length;
        if (hasSignals && h3Count <= 1) break;
        const parent = $item.parent();
        if (!parent || !parent.length) break;
        $item = parent;
      }

      const rawText = this.normalizeSpaces($item.text());
      const dataPublicacao =
        (rawText.match(/Data\s+de\s+publica[cç][aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || undefined;
      const prazoEnvio =
        (rawText.match(/Prazo\s+para\s+envio\s+de\s+propostas\s+at[eé]\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] ||
        undefined;
      const fonteRecurso =
        (rawText.match(/Fonte\s+de\s+Recurso\s*:\s*([^]+?)Publico-alvo\s*:/i) || [])[1]
          ? this.normalizeSpaces((rawText.match(/Fonte\s+de\s+Recurso\s*:\s*([^]+?)Publico-alvo\s*:/i) || [])[1])
          : (rawText.match(/Fonte\s+de\s+Recurso\s*:\s*([^]+?)Tema\s*:/i) || [])[1]
            ? this.normalizeSpaces((rawText.match(/Fonte\s+de\s+Recurso\s*:\s*([^]+?)Tema\s*:/i) || [])[1])
            : undefined;
      const publicoAlvo =
        (rawText.match(/Publico-alvo\s*:\s*([^]+?)Tema\s*:/i) || [])[1]
          ? this.normalizeSpaces((rawText.match(/Publico-alvo\s*:\s*([^]+?)Tema\s*:/i) || [])[1])
          : (rawText.match(/Público-alvo\s*:\s*([^]+?)Tema\s*:/i) || [])[1]
            ? this.normalizeSpaces((rawText.match(/Público-alvo\s*:\s*([^]+?)Tema\s*:/i) || [])[1])
            : undefined;
      const temas =
        (rawText.match(/Tema\s*:\s*(.+)$/i) || [])[1] ? this.normalizeSpaces((rawText.match(/Tema\s*:\s*(.+)$/i) || [])[1]) : undefined;

      out.push({ titulo, link, dataPublicacao, prazoEnvio, fonteRecurso, publicoAlvo, temas });
    }

    const unique = new Map<string, FinepListItem>();
    for (const it of out) unique.set(it.link, it);
    return Array.from(unique.values());
  }

  private async scrapeDetail(link: string, listHint?: FinepListItem): Promise<Edital | null> {
    const html = await this.fetchText(link);
    const $ = cheerio.load(html);

    const bodyText = this.normalizeSpaces($("body").text());
    const titulo = listHint?.titulo || this.normalizeSpaces($("h1").first().text()) || "Chamada FINEP";

    const dataPublicacao =
      (bodyText.match(/Data\s+de\s+Publica[cç][aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || listHint?.dataPublicacao;
    const prazoEnvio =
      (bodyText.match(/Prazo\s+para\s+envio\s+de\s+propostas\s+at[eé]\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] ||
      listHint?.prazoEnvio;
    const fonteRecurso =
      (bodyText.match(/Fonte\s+de\s+Recurso\s*:\s*([^]+?)P[úu]blico-alvo\s*:/i) || [])[1]
        ? this.normalizeSpaces((bodyText.match(/Fonte\s+de\s+Recurso\s*:\s*([^]+?)P[úu]blico-alvo\s*:/i) || [])[1])
        : listHint?.fonteRecurso;
    const temas =
      (bodyText.match(/Tema\(s\)\s*:\s*([^]+?)Situac[aã]o\s*:/i) || [])[1]
        ? this.normalizeSpaces((bodyText.match(/Tema\(s\)\s*:\s*([^]+?)Situac[aã]o\s*:/i) || [])[1])
        : (bodyText.match(/Tema\s*:\s*([^]+?)Situac[aã]o\s*:/i) || [])[1]
          ? this.normalizeSpaces((bodyText.match(/Tema\s*:\s*([^]+?)Situac[aã]o\s*:/i) || [])[1])
          : listHint?.temas;
    const situacao =
      (bodyText.match(/Situac[aã]o\s*:\s*([A-Za-zÀ-ÿ]+)/i) || [])[1] ? this.normalizeSpaces((bodyText.match(/Situac[aã]o\s*:\s*([A-Za-zÀ-ÿ]+)/i) || [])[1]) : "Aberta";

    // Descrição (primeiro parágrafo "grande" sem ser bloco de manuais/vídeos)
    let descricao = "";
    const main = $("main").first().length ? $("main").first() : $("body");
    const paragraphs = main
      .find("p")
      .toArray()
      .map((p) => this.normalizeSpaces($(p).text()))
      .filter((p) => p.length >= 80)
      .filter((p) => {
        const l = p.toLowerCase();
        return !l.includes("manuais") && !l.includes("vídeos") && !l.includes("videos") && !l.includes("tutorial");
      });
    if (paragraphs.length > 0) {
      descricao = paragraphs[0];
    } else {
      const cut = bodyText.split(/Data\s+de\s+Publica[cç][aã]o\s*:/i)[0] || "";
      descricao = cut.length > 80 ? cut.slice(0, 2000).trim() : "";
    }

    // Documentos: tabela com "Nome do documento"
    const documentos: FinepDocumento[] = [];
    const $table = $("table")
      .toArray()
      .map((t) => $(t))
      .find(($t) => $t.text().toLowerCase().includes("nome do documento"));

    if ($table) {
      const $rows = $table.find("tbody tr").length ? $table.find("tbody tr") : $table.find("tr").slice(1);
      $rows.each((_, row) => {
        const $tds = $(row).find("td");
        if ($tds.length < 2) return;

        const dataDoc = this.normalizeSpaces($tds.eq(0).text()) || undefined;
        const nomeDoc = this.normalizeSpaces($tds.eq(1).text()) || undefined;
        const urlPdf = this.absoluteUrl(String($tds.eq(2).find("a").attr("href") || "").trim());
        const urlAberto = this.absoluteUrl(String($tds.eq(3).find("a").attr("href") || "").trim());

        const pdfOk = urlPdf && urlPdf !== this.baseUrl && !urlPdf.endsWith("/");
        const abertoOk = urlAberto && urlAberto !== this.baseUrl && !urlAberto.endsWith("/");

        if (!pdfOk && !abertoOk) return;

        documentos.push({
          dataPublicacao: dataDoc,
          nome: nomeDoc,
          urlPdf: pdfOk ? urlPdf : undefined,
          urlAberto: abertoOk ? urlAberto : undefined,
        });
      });
    }

    const numeroMatch = titulo.match(/N[º°o]\s*(\d{1,4}\/\d{4})/i) || titulo.match(/\b(\d{1,4}\/\d{4})\b/);
    let numero = numeroMatch?.[1];
    if (!numero) {
      try {
        const u = new URL(link);
        const m = u.pathname.match(/\/chamadapublica\/(\d+)/i);
        if (m && m[1]) {
          numero = `FINEP-${m[1]}`;
        }
      } catch {
        // ignore
      }
    }

    const pdfUrlsResolved: string[] = [];
    for (const d of documentos) {
      if (!d.urlPdf) continue;
      const resolved = await this.resolvePdfUrlIfNeeded(d.urlPdf, d.nome);
      d.urlPdf = resolved || d.urlPdf;
      if (d.urlPdf && !pdfUrlsResolved.includes(d.urlPdf)) {
        pdfUrlsResolved.push(d.urlPdf);
      }
      await this.delay(35);
    }

    const pdfPaths: string[] = [];
    if (this.downloadPdfs && pdfUrlsResolved.length > 0) {
      for (let i = 0; i < pdfUrlsResolved.length; i++) {
        const absUrl = pdfUrlsResolved[i];
        const safeIndex = String(i + 1).padStart(2, "0");
        const safeTitle = titulo.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "_").slice(0, 60);
        const fileName = `finep_${safeTitle}_${safeIndex}_${Date.now()}.pdf`;
        const dest = path.join(this.outputDir, fileName);
        const ok = await this.downloadPdfFromUrl(absUrl, dest);
        if (ok) pdfPaths.push(dest);
        await this.delay(150);
      }
    }

    const edital: Edital = {
      numero: numero || undefined,
      titulo,
      descricao: descricao || undefined,
      dataPublicacao,
      dataEncerramento: prazoEnvio,
      status: situacao || "Aberta",
      orgao: "FINEP",
      fonte: "finep",
      link,
      area: temas || listHint?.temas,
      pdfUrl: pdfUrlsResolved[0],
      pdfUrls: pdfUrlsResolved,
      pdfPaths,
      fonteRecurso: fonteRecurso || listHint?.fonteRecurso,
      publicoAlvo: listHint?.publicoAlvo,
      temas: temas || listHint?.temas,
      documentos,
      processadoEm: new Date().toISOString(),
    };

    return edital;
  }

  async scrape(): Promise<Edital[]> {
    await this.init();

    const editais: Edital[] = [];
    const seenLinks = new Set<string>();

    let start = 0;
    let pageCount = 0;
    const pageSize = Number(process.env.FINEP_PAGE_SIZE || "10") || 10;
    const maxPages = Number(process.env.FINEP_MAX_PAGES || "50") || 50;

    while (pageCount < maxPages) {
      const url = start === 0 ? this.listUrl : `${this.listUrl}&start=${start}`;
      console.log(`📄 FINEP: listando start=${start} (${url})`);
      const items = await this.extractListPage(url);
      if (!items || items.length === 0) break;

      console.log(`  🔎 Encontrados ${items.length} itens na listagem`);
      for (const item of items) {
        const href = this.absoluteUrl(item.link);
        if (seenLinks.has(href)) continue;
        seenLinks.add(href);

        try {
          console.log(`  ➜ Detalhe: ${item.titulo?.slice(0, 80)}…`);
          const edital = await this.scrapeDetail(href, item);
          if (edital) {
            editais.push(edital);
            console.log(`    ✅ OK (${edital.pdfUrls?.length || 0} pdf(s))`);
          }
        } catch (err) {
          console.warn(`    ⚠️ Erro no detalhe ${href}:`, (err as Error).message);
        }

        await this.delay(200);
      }

      start += pageSize;
      pageCount += 1;
    }

    console.log(`✅ FINEP: total de ${editais.length} chamada(s) extraída(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {
    // sem browser
  }
}

