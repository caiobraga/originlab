import { Scraper, Edital } from "../types";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

type CaptaItem = {
  titulo: string;
  captaLink?: string;
  regiao?: string;
  inscricoesAte?: string; // dd/mm/yyyy
  editalLink?: string; // link “Edital:” (pode ser externo)
  descricao?: string;
};

export class CaptaScraper implements Scraper {
  readonly name = "capta";
  private readonly baseUrl = "https://capta.org.br";
  private readonly listUrl = `${this.baseUrl}/fontes-de-financiamento/oportunidades/`;
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "capta");

  // Default: baixar PDFs localmente (como o CNPq / Finep / Secti)
  // Para desligar: CAPTA_DOWNLOAD_PDFS=0/false
  private readonly downloadPdfs = !(
    String(process.env.CAPTA_DOWNLOAD_PDFS || "").trim() === "0" ||
    String(process.env.CAPTA_DOWNLOAD_PDFS || "").trim().toLowerCase() === "false"
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

  private slugify(s: string): string {
    const raw = this.normalizeSpaces(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return raw
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 90);
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

  private safeFileNameFromUrl(url: string, fallback: string): string {
    let name = fallback || "documento.pdf";
    try {
      const u = new URL(url);
      const base = decodeURIComponent(u.pathname.split("/").pop() || "");
      if (base) name = base;
    } catch {
      // ignore
    }

    name = name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_").trim();
    if (!name.toLowerCase().endsWith(".pdf")) name = `${name}.pdf`;
    if (name.length > 140) {
      const ext = path.extname(name) || ".pdf";
      const stem = name.slice(0, 140 - ext.length);
      name = `${stem}${ext}`;
    }
    return name || "edital.pdf";
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

  private async looksLikePdf(url: string): Promise<boolean> {
    const input = String(url || "").trim();
    if (!input) return false;
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
      if (!r.ok) return false;
      const ct = String(r.headers.get("content-type") || "").toLowerCase();
      const buf = Buffer.from(await r.arrayBuffer());
      const isPdf = buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
      return Boolean(isPdf || ct.includes("pdf"));
    } catch {
      return false;
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

  private async resolvePdfUrlIfNeeded(url: string, hintName?: string): Promise<string> {
    const input = String(url || "").trim();
    if (!input) return input;
    if (input.toLowerCase().includes(".pdf")) return input;

    // Tentativa 1: pode ser PDF mesmo sem .pdf
    if (await this.looksLikePdf(input)) return input;

    // Tentativa 2: página HTML intermediária -> buscar links .pdf
    try {
      const html = await this.fetchText(input, 25000);
      const $ = cheerio.load(html);
      const base = input;

      const candidates = $("a[href]")
        .toArray()
        .map((a) => {
          const href = String($(a).attr("href") || "").trim();
          const text = this.normalizeSpaces($(a).text());
          const abs = this.absoluteUrl(href, base);
          return { href: abs, text };
        })
        .filter((c) => c.href && !c.href.startsWith("javascript:") && !c.href.startsWith("#"));

      const pdfDirect = candidates.filter((c) => c.href.toLowerCase().includes(".pdf"));
      if (pdfDirect.length === 1) return pdfDirect[0].href;

      const hint = this.normalizeSpaces(hintName || "").toLowerCase();
      const wantsEdital = hint.includes("edital") || hint.length > 0;

      const score = (c: { href: string; text: string }) => {
        const h = c.href.toLowerCase();
        const t = c.text.toLowerCase();
        let s = 0;
        if (h.includes(".pdf")) s += 20;
        if (h.includes("edital") || t.includes("edital")) s += 10;
        if (t.includes("baixar") || h.includes("download")) s += 4;
        if (wantsEdital && (t.includes("resultado") || h.includes("resultado"))) s -= 6;
        if (wantsEdital && (t.includes("faq") || h.includes("faq") || t.includes("perguntas"))) s -= 4;
        // pequena preferência para urls mais longas (às vezes o arquivo completo)
        s += Math.min(3, Math.floor(c.href.length / 40));
        return s;
      };

      const ordered = candidates
        .slice()
        .sort((a, b) => score(b) - score(a))
        .slice(0, 10);

      for (const c of ordered) {
        if (c.href.toLowerCase().includes(".pdf")) return c.href;
        if (await this.looksLikePdf(c.href)) return c.href;
        await this.delay(80);
      }

      return input;
    } catch {
      return input;
    }
  }

  private extractItemsFromList(html: string): CaptaItem[] {
    const $ = cheerio.load(html);

    const root =
      $("article .entry-content").first().length ? $("article .entry-content").first() : $("main").first().length ? $("main").first() : $("body");

    const h3s = root.find("h3").toArray();
    const items: CaptaItem[] = [];

    for (let i = 0; i < h3s.length; i++) {
      const $h = $(h3s[i]);
      const titulo = this.normalizeSpaces($h.text());
      if (!titulo) continue;

      const captaLink = $h.find("a[href]").length ? this.absoluteUrl(String($h.find("a[href]").attr("href") || "").trim(), this.listUrl) : undefined;

      // pegar nós até o próximo h3
      const blockNodes: cheerio.Element[] = [];
      let $cur = $h.next();
      while ($cur.length && $cur[0].tagName !== "h3") {
        blockNodes.push($cur[0]);
        $cur = $cur.next();
      }
      const $block = $(blockNodes);

      const pickTextAfterStrong = (label: string): string | undefined => {
        const p = $block
          .filter((_, el) => el.tagName === "p")
          .toArray()
          .map((el) => $(el))
          .find(($p) => this.normalizeSpaces($p.find("strong").first().text()).toLowerCase() === label.toLowerCase());
        if (!p) return undefined;
        const txt = this.normalizeSpaces(p.text()).replace(new RegExp(`^${label}\\s*:?\\s*`, "i"), "");
        return txt || undefined;
      };

      const regiao = pickTextAfterStrong("Região") || pickTextAfterStrong("Regiao");
      const inscricoesAte =
        pickTextAfterStrong("Inscrições até") ||
        pickTextAfterStrong("Inscricoes ate") ||
        pickTextAfterStrong("Inscrições") ||
        pickTextAfterStrong("Inscrição até");

      // edital link normalmente está no parágrafo onde strong == "Edital:"
      let editalLink: string | undefined;
      const editalParagraph = $block
        .filter((_, el) => el.tagName === "p")
        .toArray()
        .map((el) => $(el))
        .find(($p) => this.normalizeSpaces($p.find("strong").first().text()).toLowerCase() === "edital:");

      if (editalParagraph) {
        const href = String(editalParagraph.find("a[href]").first().attr("href") || "").trim();
        if (href) editalLink = this.absoluteUrl(href, this.listUrl);
      }

      // descrição: juntar 1-2 parágrafos iniciais (ignorando os parágrafos de região/inscrições/edital)
      const descParts: string[] = [];
      $block
        .filter((_, el) => el.tagName === "p")
        .toArray()
        .forEach((el) => {
          const $p = $(el);
          const strong = this.normalizeSpaces($p.find("strong").first().text()).toLowerCase();
          if (strong === "região:" || strong === "regiao:" || strong.startsWith("inscri") || strong === "edital:") return;
          const t = this.normalizeSpaces($p.text());
          if (!t) return;
          descParts.push(t);
        });
      const descricao = this.normalizeSpaces(descParts.slice(0, 2).join(" ")).slice(0, 700) || undefined;

      items.push({ titulo, captaLink, regiao, inscricoesAte, editalLink, descricao });
    }

    return items;
  }

  private async findPdfUrlsForItem(item: CaptaItem): Promise<string[]> {
    const maxLinks = Number(process.env.CAPTA_MAX_LINKS_PER_ITEM || "3") || 3;
    const candidates = [item.editalLink, item.captaLink].filter((x): x is string => Boolean(x));

    const out: string[] = [];
    const seen = new Set<string>();

    const tryAdd = (u: string) => {
      const norm = String(u || "").trim();
      if (!norm) return;
      if (seen.has(norm)) return;
      seen.add(norm);
      out.push(norm);
    };

    for (const c of candidates.slice(0, maxLinks)) {
      const resolved = await this.resolvePdfUrlIfNeeded(c, item.titulo);
      if (resolved && resolved !== c && (await this.looksLikePdf(resolved))) {
        tryAdd(resolved);
      } else if (await this.looksLikePdf(c)) {
        tryAdd(c);
      } else {
        // se voltou html, tentar coletar links pdf do html
        try {
          const html = await this.fetchText(c, 25000);
          const $ = cheerio.load(html);
          const pdfs = $("a[href]")
            .toArray()
            .map((a) => this.absoluteUrl(String($(a).attr("href") || "").trim(), c))
            .filter((h) => h && h.toLowerCase().includes(".pdf"));
          for (const p of Array.from(new Set(pdfs)).slice(0, 4)) {
            tryAdd(p);
          }
        } catch {
          // ignore
        }
      }

      if (out.length >= 6) break;
      await this.delay(120);
    }

    // validar/dedup final
    const final: string[] = [];
    const seen2 = new Set<string>();
    for (const u of out) {
      if (seen2.has(u)) continue;
      seen2.add(u);
      if (await this.looksLikePdf(u)) final.push(u);
      await this.delay(60);
      if (final.length >= 8) break;
    }
    return final;
  }

  async scrape(): Promise<Edital[]> {
    await this.init();

    const html = await this.fetchText(this.listUrl);
    const items = this.extractItemsFromList(html);

    const limit = Number(process.env.CAPTA_MAX_ITEMS || "0") || 0;
    const toProcess = limit > 0 ? items.slice(0, limit) : items;

    console.log(`📄 CAPTA: encontrados ${items.length} item(ns) na listagem`);
    if (limit > 0) console.log(`  🔎 Limitando para ${toProcess.length} via CAPTA_MAX_ITEMS`);

    const editais: Edital[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      try {
        console.log(`  ➜ (${i + 1}/${toProcess.length}) ${item.titulo.slice(0, 80)}…`);
        const pdfUrls = await this.findPdfUrlsForItem(item);
        if (!pdfUrls || pdfUrls.length === 0) {
          console.log("    ⏭️  Sem PDF(s) resolvido(s)");
          continue;
        }

        const numero = `CAPTA-${this.slugify(item.titulo)}${item.inscricoesAte ? `-${this.slugify(item.inscricoesAte)}` : ""}`.slice(0, 140);
        const key = `capta:${numero}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const pdfPaths: string[] = [];
        if (this.downloadPdfs) {
          console.log(`    📥 Baixando ${pdfUrls.length} PDF(s)...`);
          for (let p = 0; p < pdfUrls.length; p++) {
            const u = pdfUrls[p];
            const safeTitle = this.slugify(item.titulo) || `item_${i + 1}`;
            const destName = this.safeFileNameFromUrl(u, `capta_${safeTitle}_${String(p + 1).padStart(2, "0")}.pdf`);
            const dest = path.join(this.outputDir, destName);
            const ok = await this.downloadPdfFromUrl(u, dest);
            if (ok) pdfPaths.push(dest);
            await this.delay(120);
          }
        }

        const edital: Edital = {
          numero,
          titulo: item.titulo,
          descricao: item.descricao,
          dataPublicacao: undefined,
          dataEncerramento: item.inscricoesAte,
          status: "Aberta",
          orgao: "CAPTA",
          fonte: "capta",
          link: item.captaLink || this.listUrl,
          area: item.regiao,
          pdfUrl: pdfUrls[0],
          pdfUrls,
          pdfPaths,
          documentos: pdfUrls.map((u) => ({ href: u })),
          processadoEm: new Date().toISOString(),
        };

        // Se "inscricoesAte" for dd/mm/yyyy, colocar em um campo extra parseado (útil depois)
        const ts = this.parsePtBrDateToTs(item.inscricoesAte);
        if (ts) (edital as any).inscricoes_ate_ts = ts;

        editais.push(edital);
        console.log(`    ✅ OK (${pdfUrls.length} pdf(s))`);
      } catch (e) {
        console.warn(`    ⚠️ Erro no item: ${(e as Error).message}`);
      }

      await this.delay(200);
    }

    console.log(`✅ CAPTA: total de ${editais.length} edital(is) com PDF(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {
    // sem browser
  }
}

