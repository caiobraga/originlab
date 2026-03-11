/**
 * Scraper da Plataforma Inovação para a Indústria (Portal da Indústria - SENAI/SESI).
 * https://www.portaldaindustria.com.br/canais/plataforma-inovacao-para-industria/
 *
 * Extrai categorias da página inicial e, em cada categoria, as chamadas (lançamento, inscrições, título, link/PDF).
 *
 * Env:
 *   PLATAFORMA_MAX_CATEGORIAS=N  (limite de categorias a visitar; default todas)
 *   PLATAFORMA_TIMEOUT_MS=20000
 */
import { Scraper, Edital } from "../types";
import { filterEditaisByYear } from "../filter-editais-by-year";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.portaldaindustria.com.br";
const PLATAFORMA_BASE = `${BASE_URL}/canais/plataforma-inovacao-para-industria`;

export class PlataformaInovacaoScraper implements Scraper {
  readonly name = "plataforma-inovacao-industria";

  private readonly timeoutMs =
    Number(process.env.PLATAFORMA_TIMEOUT_MS || "20000") || 20000;
  private readonly maxCategorias =
    Number(process.env.PLATAFORMA_MAX_CATEGORIAS || "0") || 0; // 0 = todas

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string): string {
    const h = String(href || "").trim();
    if (!h) return h;
    try {
      return new URL(h, PLATAFORMA_BASE).toString();
    } catch {
      if (h.startsWith("/")) return `${BASE_URL}${h}`;
      return h;
    }
  }

  private normalizeSpaces(s: string): string {
    return String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  private async fetchHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.text();
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  /** Extrai links de categorias da página inicial. */
  private async getCategoryLinks(): Promise<{ title: string; url: string }[]> {
    const html = await this.fetchHtml(PLATAFORMA_BASE);
    const $ = cheerio.load(html);
    const list: { title: string; url: string }[] = [];
    const seen = new Set<string>();

    $(`a[href*="/canais/plataforma-inovacao-para-industria/categoria/"]`).each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const url = this.absoluteUrl(href);
      if (seen.has(url)) return;
      seen.add(url);

      const title =
        this.normalizeSpaces($(el).text()) ||
        url.split("/categoria/")[1]?.replace(/\/$/, "").replace(/-/g, " ") ||
        "Categoria";
      if (title.length < 2) return;
      list.push({ title, url });
    });

    return list;
  }

  /**
   * Em uma página de categoria, extrai blocos "Lançamento:" / "Inscrições:" e associa título e link.
   * O HTML costuma ter blocos com datas seguidas de título e link (Acesse Aqui / Download do regulamento).
   */
  private extractChamadasFromCategoryPage(
    html: string,
    categoryUrl: string,
    categoryName: string
  ): Edital[] {
    const $ = cheerio.load(html);
    const editais: Edital[] = [];

    const dateBlock = /Lançamento:\s*(\d{2}\/\d{2}\/\d{4})/i;
    const inscricoesBlock = /Inscrições:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i;

    const $body = $("main, .content, #content, [class*='content'], body");
    const text = $body.text();
    const nodes: { type: "date" | "inscricoes"; match: RegExpMatchArray; index: number }[] = [];
    let m: RegExpMatchArray | null;
    const re1 = new RegExp(dateBlock.source, "gi");
    while ((m = re1.exec(text)) !== null) nodes.push({ type: "date", match: m, index: m.index });
    const re2 = new RegExp(inscricoesBlock.source, "gi");
    while ((m = re2.exec(text)) !== null)
      nodes.push({ type: "inscricoes", match: m, index: m.index });

    const pdfAndExternalLinks: { url: string; text: string }[] = [];
    $body.find("a[href]").each((_, a) => {
      const href = $(a).attr("href");
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) return;
      const url = this.absoluteUrl(href);
      const linkText = this.normalizeSpaces($(a).text());
      if (url.toLowerCase().includes(".pdf") || (href.startsWith("http") && !href.includes("portaldaindustria")))
        pdfAndExternalLinks.push({ url, text: linkText });
    });

    const sortedNodes = nodes.sort((a, b) => a.index - b.index);
    let lastLancamento = "";
    let lastInscricoesEnd = "";
    let titleAccum: string[] = [];

    for (let i = 0; i < sortedNodes.length; i++) {
      const n = sortedNodes[i];
      if (n.type === "date") {
        lastLancamento = n.match[1] || "";
      } else if (n.type === "inscricoes") {
        lastInscricoesEnd = n.match[2] || n.match[1] || "";
        const sliceStart = n.index;
        const sliceEnd = i + 1 < sortedNodes.length ? sortedNodes[i + 1].index : text.length;
        const block = text.slice(sliceStart, sliceEnd);
        const lines = block.split(/\n/).map((l) => this.normalizeSpaces(l)).filter(Boolean);
        const titleLine = lines.find(
          (l) =>
            l.length > 15 &&
            !/^Lançamento:/.test(l) &&
            !/^Inscrições:/.test(l) &&
            !/^Selecionar empresas/.test(l) &&
            !/^A CP01/.test(l) &&
            !/^O Edital/.test(l) &&
            !/^O edital/.test(l) &&
            !/^Chamada /.test(l) &&
            !/^EDITAL /.test(l)
        );
        const titulo =
          titleLine ||
          lines[2] ||
          lines[1] ||
          `${categoryName} - Chamada`;
        const tituloClean = titulo.slice(0, 400);

        const linkForThis =
          pdfAndExternalLinks.find((l) => l.url && (l.text.length > 2 || l.url.includes(".pdf")))?.url ||
          categoryUrl;
        editais.push({
          numero: undefined,
          titulo: tituloClean,
          descricao: undefined,
          dataPublicacao: lastLancamento || undefined,
          dataEncerramento: lastInscricoesEnd || undefined,
          orgao: categoryName,
          fonte: this.name,
          link: linkForThis,
          pdfUrls: pdfAndExternalLinks.filter((x) => x.url.toLowerCase().includes(".pdf")).map((x) => x.url),
          processadoEm: new Date().toISOString(),
        });
      }
    }

    if (editais.length === 0) {
      const regulamentoLink = $(
        `a[href*='.pdf'][href*='plataforma_inovacao'], a[href*='.pdf']:contains('Regulamento')`
      ).first().attr("href");
      const regUrl = regulamentoLink ? this.absoluteUrl(regulamentoLink) : categoryUrl;
      editais.push({
        titulo: categoryName,
        link: categoryUrl,
        orgao: categoryName,
        fonte: this.name,
        pdfUrls: regulamentoLink ? [this.absoluteUrl(regulamentoLink)] : undefined,
        processadoEm: new Date().toISOString(),
      });
    }

    return editais;
  }

  async scrape(): Promise<Edital[]> {
    const allEditais: Edital[] = [];
    const seenTitulo = new Set<string>();

    const categories = await this.getCategoryLinks();
    const toVisit =
      this.maxCategorias > 0 ? categories.slice(0, this.maxCategorias) : categories;

    for (let i = 0; i < toVisit.length; i++) {
      const cat = toVisit[i];
      try {
        await this.delay(400);
        const html = await this.fetchHtml(cat.url);
        const editais = this.extractChamadasFromCategoryPage(
          html,
          cat.url,
          cat.title
        );
        for (const e of editais) {
          const key = (e.titulo || "").slice(0, 200);
          if (key && !seenTitulo.has(key)) {
            seenTitulo.add(key);
            allEditais.push(e);
          }
        }
      } catch (err) {
        console.warn(`  ⚠️ Categoria ${cat.title}: ${(err as Error).message}`);
      }
    }

    const edicoesUrl = `${PLATAFORMA_BASE}/edicoes/`;
    try {
      await this.delay(400);
      const html = await this.fetchHtml(edicoesUrl);
      const $ = cheerio.load(html);
      const pdfs: string[] = [];
      $(`a[href*='.pdf']`).each((_, a) => {
        const href = $(a).attr("href");
        if (href) pdfs.push(this.absoluteUrl(href));
      });
      if (pdfs.length > 0) {
        const key = "Regulamentos Gerais - Edições";
        if (!seenTitulo.has(key)) {
          seenTitulo.add(key);
          allEditais.push({
            titulo: "Plataforma Inovação - Regulamentos Gerais (edições)",
            link: edicoesUrl,
            orgao: "SENAI/SESI",
            fonte: this.name,
            pdfUrls: pdfs,
            processadoEm: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Edições: ${(err as Error).message}`);
    }

    return filterEditaisByYear(allEditais);
  }
}
