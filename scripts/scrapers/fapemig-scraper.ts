import { Scraper, Edital } from "../types";
import { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const BASE = "https://fapemig.br";
const LIST_URL = `${BASE}/oportunidades/chamadas-e-editais?status=aberta`;

/** Extrai URLs de PDF do payload Nuxt (JSON) da página de detalhe */
const PDF_URL_RE = /https:\/\/api\.site\.fapemig\.br\/wp-content\/uploads\/[^"\\s]+\.pdf/gi;

export class FapemigScraper implements Scraper {
  readonly name = "fapemig";
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly outputDir = path.join(process.cwd(), "scripts", "output", "pdfs", "fapemig");

  private readonly downloadPdfs =
    String(process.env.FAPEMIG_DOWNLOAD_PDFS || "").trim() !== "0" &&
    String(process.env.FAPEMIG_DOWNLOAD_PDFS || "").trim().toLowerCase() !== "false";

  private async init() {
    if (this.browser) return;
    const puppeteer = await import("puppeteer");
    this.browser = await puppeteer.default.launch({
      headless: process.env.FAPEMIG_HEADLESS !== "0",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser!.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Lista URLs das páginas de detalhe da listagem (via Puppeteer) */
  private async fetchDetailLinks(): Promise<{ href: string; titulo: string }[]> {
    await this.page!.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 45000 });
    await this.delay(2000);

    const maxItems = process.env.FAPEMIG_MAX_ITEMS
      ? Math.max(1, parseInt(process.env.FAPEMIG_MAX_ITEMS, 10) || 999)
      : 999;

    const items: { href: string; titulo: string }[] = [];
    let previousCount = 0;
    const maxLoadMore = 20;

    for (let loadMore = 0; loadMore < maxLoadMore; loadMore++) {
      const chunk = await this.page!.evaluate((base) => {
        const links: { href: string; titulo: string }[] = [];
        const anchors = document.querySelectorAll(
          'a[href*="/oportunidades/chamadas-e-editais/chamada-"]'
        );
        anchors.forEach((a) => {
          const href = (a as HTMLAnchorElement).href || (a as HTMLAnchorElement).getAttribute("href") || "";
          if (!href || !href.includes("/chamada-")) return;
          const full = href.startsWith("http") ? href : new URL(href, base).toString();
          // Título do card: subir até o container do card e pegar primeiro heading ou texto relevante (não o "Saiba Mais")
          let titulo = "";
          let el: Element | null = a;
          for (let i = 0; i < 8 && el; i++) {
            const heading = el.querySelector("h2, h3, h4, [class*='title'], [class*='titulo']");
            if (heading && heading !== a) {
              titulo = (heading as HTMLElement).textContent?.trim().replace(/\s+/g, " ").trim() || "";
              break;
            }
            const firstLink = el.querySelector('a[href*="/chamada-"]');
            const allText = Array.from(el.querySelectorAll("p, span, div"))
              .filter((n) => n.contains(a) || a.contains(n))
              .map((n) => (n as HTMLElement).textContent?.trim())
              .filter((t) => t && t.length > 10 && !/^Saiba Mais$/i.test(t));
            if (allText.length) titulo = allText[0]!.slice(0, 200);
            if (titulo) break;
            el = el.parentElement;
          }
          if (!titulo) titulo = (a as HTMLElement).textContent?.trim().replace(/\s+/g, " ").trim() || "";
          if (!titulo || /^Saiba Mais$/i.test(titulo)) {
            // Fallback: extrair do slug (ex: chamada-fapemig-01-2026-demanda-universal -> Demanda Universal 01/2026)
            const slug = full.split("/chamada-")[1]?.split("/")[0] || "";
            titulo = slug.replace(/-/g, " ").replace(/\b(\d+)\s+(\d{4})\b/, "Chamada $1/$2 ").trim();
            if (titulo.length < 3) titulo = full;
          }
          links.push({ href: full, titulo });
        });
        return links;
      }, BASE);

      const seen = new Set<string>();
      for (const it of chunk) {
        const norm = it.href.replace(/#.*$/, "").trim();
        if (!seen.has(norm)) {
          seen.add(norm);
          items.push({ href: norm, titulo: it.titulo });
        }
      }

      if (items.length >= maxItems) break;
      if (items.length === previousCount) break;
      previousCount = items.length;

      const clicked = await this.page!.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button, a")).find(
          (el) =>
            /carregar\s*mais|load\s*more/i.test((el as HTMLElement).textContent || "")
        );
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      });
      if (!clicked) break;
      await this.delay(1500);
    }

    return items.slice(0, maxItems);
  }

  /** Obtém URLs dos PDFs da chamada via payload Nuxt */
  private async getPdfUrlsFromDetail(detailPath: string): Promise<string[]> {
    let pathname = detailPath;
    if (detailPath.startsWith("http")) {
      try {
        pathname = new URL(detailPath).pathname;
      } catch {
        pathname = detailPath.replace(/^https?:\/\/[^/]+/, "");
      }
    }
    const payloadUrl = `${BASE}${pathname.replace(/\/?$/, "")}/_payload.json`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(payloadUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      clearTimeout(t);
      if (!res.ok) return [];
      const text = await res.text();
      const urls = text.match(PDF_URL_RE) || [];
      return [...new Set(urls)];
    } catch {
      clearTimeout(t);
      return [];
    }
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

  private async downloadPdf(url: string, destPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(destPath)) return true;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "application/pdf,application/octet-stream,*/*" },
      });
      clearTimeout(t);
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
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

  /** Extrai número da chamada do slug (ex: chamada-fapemig-01-2026 -> 01/2026; sede-003-2026 -> 003/2026) */
  private numeroFromSlug(href: string): string {
    const slug = href.split("/chamada-")[1]?.split("/")[0] || href;
    const m =
      slug.match(/chamada-fapemig-(\d+)-(\d+)/i) ||
      slug.match(/(\d{2,3})-(\d{4})/) ||
      href.match(/(\d+)\/(\d+)/);
    if (m) return `${m[1]}/${m[2]}`;
    return "";
  }

  async scrape(): Promise<Edital[]> {
    await this.init();
    if (this.downloadPdfs && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const links = await this.fetchDetailLinks();
    console.log(`📋 FAPEMIG: ${links.length} chamada(s) na listagem`);

    const editais: Edital[] = [];
    for (let i = 0; i < links.length; i++) {
      const { href, titulo } = links[i];
      const pathPart = href.replace(BASE, "").replace(/#.*$/, "").trim();
      console.log(`  [${i + 1}/${links.length}] ${titulo.slice(0, 50)}...`);

      const pdfUrls = await this.getPdfUrlsFromDetail(pathPart || href);
      if (pdfUrls.length === 0) {
        console.log(`    ⚠️ Nenhum PDF encontrado`);
        editais.push({
          numero: this.numeroFromSlug(href) || `FAPEMIG-${i + 1}`,
          titulo,
          link: href,
          orgao: "FAPEMIG",
          fonte: "fapemig",
          pais: "Brasil",
          estado: "MG",
          pdfUrls: [],
          processadoEm: new Date().toISOString(),
        });
        continue;
      }

      const pdfPaths: string[] = [];
      if (this.downloadPdfs) {
        const prefix = `fapemig_${(this.numeroFromSlug(href) || String(i + 1)).replace(/\//g, "-")}`;
        for (let j = 0; j < pdfUrls.length; j++) {
          const name = this.safeFileNameFromUrl(pdfUrls[j], `${prefix}_${j + 1}`);
          const dest = path.join(this.outputDir, name);
          const ok = await this.downloadPdf(pdfUrls[j], dest);
          if (ok) pdfPaths.push(dest);
          await this.delay(200);
        }
      }

      const numero = this.numeroFromSlug(href) || `FAPEMIG-${i + 1}`;
      editais.push({
        numero,
        titulo,
        link: href,
        orgao: "FAPEMIG",
        fonte: "fapemig",
        pais: "Brasil",
        estado: "MG",
        pdfUrl: pdfUrls[0],
        pdfUrls,
        pdfPaths: pdfPaths.length ? pdfPaths : undefined,
        processadoEm: new Date().toISOString(),
      });
      console.log(`    ✅ ${pdfUrls.length} PDF(s)`);
    }

    await this.cleanup();
    console.log(`✅ FAPEMIG: ${editais.length} edital(is) processado(s)`);
    return editais;
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close();
      } catch {
        // ignore
      }
      this.page = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
    }
  }
}
