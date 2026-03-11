/**
 * Scraper da Central de Editais da Prosas (https://prosas.com.br/editais).
 * A listagem é carregada via JavaScript; usa Puppeteer para renderizar e extrair.
 *
 * Env:
 *   PROSAS_HEADLESS=true (default) | false
 *   PROSAS_TIMEOUT_MS=30000
 *   PROSAS_MAX_PAGES=10  (paginação)
 */
import { Scraper, Edital } from "../types";
import type { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = "https://prosas.com.br";
const EDITAIS_URL = `${BASE_URL}/editais`;

export class ProsasScraper implements Scraper {
  readonly name = "prosas";
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "prosas");
  private readonly headless =
    String(process.env.PROSAS_HEADLESS ?? "true").toLowerCase() !== "false";
  private readonly timeoutMs = Number(process.env.PROSAS_TIMEOUT_MS || "30000") || 30000;
  private readonly maxPages = Number(process.env.PROSAS_MAX_PAGES || "10") || 10;

  private async init(): Promise<Page> {
    if (this.page) return this.page;

    const puppeteer = await import("puppeteer");
    this.browser = await puppeteer.default.launch({
      headless: this.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,720",
      ],
      defaultViewport: { width: 1280, height: 720 },
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await this.page.setExtraHTTPHeaders({
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    });

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this.apiPayloads = [];
    const onResponse = async (res: any) => {
      const url = res?.url?.() || "";
      if (
        !url.includes("editais") &&
        !url.includes("opportunities") &&
        !url.includes("api") &&
        !url.includes("oportunidade")
      )
        return;
      try {
        const contentType = res.headers()["content-type"] || "";
        if (!contentType.includes("json")) return;
        const body = await res.json().catch(() => null);
        if (!body || typeof body !== "object") return;
        const arr =
          Array.isArray(body)
            ? body
            : body.data ?? body.items ?? body.editais ?? body.results ?? [];
        if (Array.isArray(arr) && arr.length > 0) this.apiPayloads.push({ data: arr });
      } catch {
        // ignore
      }
    };
    this.page.on("response", onResponse);

    return this.page;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Respostas JSON capturadas durante a navegação (preenchido pelo listener). */
  private apiPayloads: { data: any[] }[] = [];

  /** Tenta capturar resposta de API (fetch/XHR) que pareça lista de editais. Deve ser chamado após navegação. */
  private parseCapturedApiEditais(): Edital[] {
    const editais: Edital[] = [];
    for (const r of this.apiPayloads) {
      const data = r?.data || [];
      for (const item of data) {
        const ed = this.normalizeApiItem(item);
        if (ed) editais.push(ed);
      }
    }
    return editais;
  }

  private normalizeApiItem(item: any): Edital | null {
    if (!item || typeof item !== "object") return null;
    const title =
      item.title ??
      item.titulo ??
      item.name ??
      item.nome ??
      item.opportunity_title;
    if (!title || typeof title !== "string") return null;

    const link =
      item.url ??
      item.link ??
      item.slug != null
        ? `${BASE_URL}/editais/${item.slug}`
        : item.id != null
          ? `${BASE_URL}/edital/${item.id}`
          : undefined;

    const numero =
      item.numero ?? item.number ?? item.edital_number ?? item.reference;
    const descricao =
      item.description ?? item.descricao ?? item.resumo ?? item.summary;
    const dataPublicacao =
      item.data_publicacao ??
      item.published_at ??
      item.created_at ??
      item.dataPublicacao;
    const dataEncerramento =
      item.data_encerramento ??
      item.deadline ??
      item.ends_at ??
      item.dataEncerramento;
    const valor = item.valor ?? item.value ?? item.budget ?? item.recurso;
    const pdfUrl = item.pdf_url ?? item.pdf ?? item.document_url;
    const pdfUrls = Array.isArray(item.pdf_urls)
      ? item.pdf_urls
      : pdfUrl
        ? [pdfUrl]
        : undefined;

    return {
      numero: typeof numero === "string" ? numero : String(numero ?? "").trim() || undefined,
      titulo: String(title).trim(),
      descricao: typeof descricao === "string" ? descricao.trim() : undefined,
      dataPublicacao: dataPublicacao != null ? String(dataPublicacao).slice(0, 50) : undefined,
      dataEncerramento:
        dataEncerramento != null ? String(dataEncerramento).slice(0, 50) : undefined,
      valor: typeof valor === "string" ? valor : valor != null ? String(valor) : undefined,
      fonte: this.name,
      link: typeof link === "string" ? link.trim() : undefined,
      pdfUrls: pdfUrls?.filter((u): u is string => typeof u === "string"),
      processadoEm: new Date().toISOString(),
    };
  }

  /** Extrai editais do DOM (cards, links, tabela). */
  private async extractFromDom(page: Page): Promise<Edital[]> {
    const editais: Edital[] = [];

    const raw = await page.evaluate((baseUrl) => {
      const out: { titulo?: string; link?: string; descricao?: string; numero?: string }[] = [];

      const linkSelector =
        'a[href*="/edital"], a[href*="/editais/"], [data-testid*="edital"], [class*="edital-card"], [class*="opportunity"]';
      const links = document.querySelectorAll(linkSelector);

      links.forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        if (!href || !href.includes("prosas") || href === baseUrl + "/editais") return;

        const titulo =
          (a as HTMLElement).textContent?.trim() ||
          (a.querySelector("h2, h3, h4, .title, [class*='title']") as HTMLElement)?.textContent?.trim();
        if (!titulo || titulo.length < 5) return;

        const numeroMatch = titulo.match(/(?:edital|chamada|n[º°]?)\s*(\d+(?:\/\d+)?)/i) ||
          titulo.match(/(\d{2,4}\/\d{2,4})/);
        out.push({
          titulo: titulo.slice(0, 400),
          link: href,
          numero: numeroMatch ? numeroMatch[1] : undefined,
        });
      });

      if (out.length === 0) {
        const cards = document.querySelectorAll(
          "[class*='card'], [class*='item'], [class*='row'] a[href*='edital']"
        );
        cards.forEach((el) => {
          const a = el.tagName === "A" ? el : el.querySelector("a");
          if (!a) return;
          const href = (a as HTMLAnchorElement).href;
          if (!href || !href.includes("prosas")) return;
          const titulo = (el as HTMLElement).textContent?.trim()?.slice(0, 400);
          if (!titulo || titulo.length < 5) return;
          out.push({ titulo, link: href });
        });
      }

      return out;
    }, BASE_URL);

    for (const r of raw || []) {
      if (!r.titulo || !r.link) continue;
      editais.push({
        numero: r.numero,
        titulo: r.titulo,
        link: r.link,
        fonte: this.name,
        processadoEm: new Date().toISOString(),
      });
    }

    return editais;
  }

  async scrape(): Promise<Edital[]> {
    const page = await this.init();

    const editais: Edital[] = [];

    try {
      await page.goto(EDITAIS_URL, {
        waitUntil: "networkidle2",
        timeout: this.timeoutMs,
      });
      await this.delay(2000);

      const fromApi = this.parseCapturedApiEditais();
      if (fromApi.length > 0) editais.push(...fromApi);

      const fromDom = await this.extractFromDom(page);
      const seen = new Set(editais.map((e) => e.link || e.titulo));
      for (const e of fromDom) {
        const key = e.link || e.titulo;
        if (key && !seen.has(key)) {
          seen.add(key);
          editais.push(e);
        }
      }

      let pageNum = 2;
      while (editais.length > 0 && pageNum <= this.maxPages) {
        const nextSelector =
          'a[href*="page="], button[aria-label*="próxim"], [class*="pagination"] a, a.next';
        const clicked = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          (el as HTMLElement).click();
          return true;
        }, nextSelector);

        if (!clicked) break;
        await this.delay(1500);

        const more = await this.extractFromDom(page);
        for (const e of more) {
          const key = e.link || e.titulo;
          if (key && !seen.has(key)) {
            seen.add(key);
            editais.push(e);
          }
        }
        pageNum++;
      }
    } catch (err) {
      console.warn("Prosas scrape error:", (err as Error).message);
    }

    return editais;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
