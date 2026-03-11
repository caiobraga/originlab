/**
 * Scraper de editais da Rota do Fomento (https://rotadofomento.org/editais/).
 * Extrai título, vigência, inscrições até, link. Filtra apenas 2025 e 2026 (env: EDITAL_MIN_YEAR, EDITAL_MAX_YEAR).
 *
 * Env:
 *   ROTA_TIMEOUT_MS=20000
 *   EDITAL_MIN_YEAR=2025  EDITAL_MAX_YEAR=2026
 */
import { Scraper, Edital } from "../types";
import { filterEditaisByYear } from "../filter-editais-by-year";
import * as cheerio from "cheerio";

const BASE_URL = "https://rotadofomento.org";
const EDITAIS_BASE = `${BASE_URL}/editais`;

export class RotadofomentoScraper implements Scraper {
  readonly name = "rotadofomento";

  private readonly timeoutMs =
    Number(process.env.ROTA_TIMEOUT_MS || "20000") || 20000;

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private absoluteUrl(href: string): string {
    const h = String(href || "").trim();
    if (!h) return h;
    try {
      return new URL(h, EDITAIS_BASE).toString();
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

  private extractEditaisFromPage(html: string): Edital[] {
    const $ = cheerio.load(html);
    const editais: Edital[] = [];

    const inscricoesRe = /Inscrições\s+até:\s*(\d{2}\/\d{2}\/\d{4})/i;
    const vigenciaRe = /Vigência:\s*(Encerrado|Aberto|Aberto\.?)/i;

    $("article, .edital-card, [class*='edital'], .post").each((_, block) => {
      const $block = $(block);
      const text = this.normalizeSpaces($block.text());

      const insMatch = text.match(inscricoesRe);
      const dataEncerramento = insMatch ? insMatch[1] : undefined;

      const vigMatch = text.match(vigenciaRe);
      const status = vigMatch ? vigMatch[1] : undefined;

      const $link = $block.find('a[href*="/editais/"]').filter(function () {
        const href = $(this).attr("href") || "";
        return href.includes("/editais/") && !href.endsWith("/editais/");
      }).first();
      const href = $link.attr("href");
      const link = href ? this.absoluteUrl(href) : undefined;

      let titulo =
        this.normalizeSpaces($block.find("h2, h3, .entry-title, [class*='title']").first().text()) ||
        this.normalizeSpaces($link.text());
      if (!titulo && link) {
        const slug = link.split("/editais/")[1]?.replace(/\/$/, "");
        titulo = slug ? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Edital";
      }
      if (!titulo) return;

      editais.push({
        titulo: titulo.slice(0, 400),
        dataEncerramento,
        status,
        link,
        orgao: "Rota do Fomento",
        fonte: this.name,
        processadoEm: new Date().toISOString(),
      });
    });

    if (editais.length === 0) {
      $("a[href*='/editais/']").each((_, a) => {
        const href = $(a).attr("href");
        if (!href || href === "/editais/" || href.endsWith("/editais")) return;
        const parent = $(a).closest("article, div[class], section");
        const text = this.normalizeSpaces(parent.length ? parent.text() : $(a).text());
        const insMatch = text.match(inscricoesRe);
        const vigMatch = text.match(vigenciaRe);
        const titulo = this.normalizeSpaces($(a).text()) || this.normalizeSpaces($(a).closest("div").find("h2, h3").first().text());
        if (!titulo || titulo.length < 5) return;
        editais.push({
          titulo: titulo.slice(0, 400),
          dataEncerramento: insMatch ? insMatch[1] : undefined,
          status: vigMatch ? vigMatch[1] : undefined,
          link: this.absoluteUrl(href),
          orgao: "Rota do Fomento",
          fonte: this.name,
          processadoEm: new Date().toISOString(),
        });
      });
    }

    if (editais.length === 0 && html) {
      const linkRe = /href=["'](https?:\/\/rotadofomento\.org\/editais\/[^"']+|\.\.?\/editais\/[^"']+)["']/gi;
      let linkMatch;
      while ((linkMatch = linkRe.exec(html)) !== null) {
        const rawHref = linkMatch[1];
        const link = rawHref.startsWith("http") ? rawHref : this.absoluteUrl(rawHref);
        const slug = link.split("/editais/")[1]?.replace(/\/$/, "");
        if (!slug || slug === "page") continue;
        const before = html.slice(Math.max(0, linkMatch.index - 800), linkMatch.index);
        const dateMatch = before.match(/(\d{2}\/\d{2}\/\d{4})/g);
        const dataEncerramento = dateMatch ? dateMatch[dateMatch.length - 1] : undefined;
        const titleFromSlug = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        editais.push({
          titulo: titleFromSlug.slice(0, 400),
          dataEncerramento,
          link,
          orgao: "Rota do Fomento",
          fonte: this.name,
          processadoEm: new Date().toISOString(),
        });
      }
    }

    return editais;
  }

  private getMaxPage(html: string): number {
    const $ = cheerio.load(html);
    let max = 1;
    $("a[href*='/editais/page/'], a[href*='page=']").each((_, a) => {
      const href = $(a).attr("href") || "";
      const m = href.match(/page\/(\d+)/) || href.match(/[?&]page=(\d+)/);
      if (m) {
        const p = parseInt(m[1], 10);
        if (p > max) max = p;
      }
    });
    return max;
  }

  async scrape(): Promise<Edital[]> {
    const allEditais: Edital[] = [];
    const seen = new Set<string>();

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = page === 1 ? `${EDITAIS_BASE}/` : `${EDITAIS_BASE}/page/${page}/`;
      try {
        await this.delay(300);
        const html = await this.fetchHtml(url);
        const editais = this.extractEditaisFromPage(html);

        for (const e of editais) {
          const key = (e.link || e.titulo || "").slice(0, 300);
          if (key && !seen.has(key)) {
            seen.add(key);
            allEditais.push(e);
          }
        }

            const maxPage = page === 1 ? this.getMaxPage(html) : 99;
        if (editais.length === 0 && page > 1) hasMore = false;
        else if (page >= maxPage || page >= 25) hasMore = false;
        else page++;
      } catch (err) {
        console.warn(`  ⚠️ Página ${page}: ${(err as Error).message}`);
        hasMore = false;
      }
    }

    return filterEditaisByYear(allEditais);
  }
}
