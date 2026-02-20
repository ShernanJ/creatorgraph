/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from "playwright";

type SitePage = {
  url: string;
  title: string;
  text: string;
};

export type PlaywrightSiteAgentResult = {
  ok: boolean;
  used: "playwright_site_agent";
  bundle: string;
  pagesFound: number;
  blockedByBotDetection: boolean;
  diagnostics: string[];
};

function normalizeUrl(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function stripWww(host: string) {
  return host.replace(/^www\./i, "").toLowerCase();
}

function sameHost(a: string, b: string) {
  try {
    return stripWww(new URL(a).hostname) === stripWww(new URL(b).hostname);
  } catch {
    return false;
  }
}

function cleanText(input: string, cap = 4200) {
  return String(input ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, cap);
}

function looksLikeBotChallenge(content: string) {
  const lower = content.toLowerCase();
  const markers = [
    "captcha",
    "verify you are human",
    "attention required",
    "cloudflare",
    "cf-chl",
    "/cdn-cgi/challenge-platform",
    "perimeterx",
    "bot protection",
    "access denied",
    "request blocked",
  ];
  return markers.filter((m) => lower.includes(m)).length >= 2;
}

async function extractPageText(page: any) {
  const text = await page.evaluate(() => {
    const kill = (sel: string) => document.querySelectorAll(sel).forEach((n) => n.remove());
    kill("script");
    kill("style");
    kill("noscript");
    kill("svg");
    const main = document.querySelector("main") || document.body;
    return main?.innerText || document.body?.innerText || "";
  });
  const title = await page.title().catch(() => "");
  return {
    title: cleanText(title, 220),
    text: cleanText(String(text || ""), 4300),
  };
}

async function discoverLinks(page: any, baseUrl: string) {
  const hrefs: string[] = await page.$$eval("a[href]", (nodes: Element[]) =>
    nodes.map((n: Element) => (n as HTMLAnchorElement).getAttribute("href") || "")
  );
  const allowHints = [
    "about",
    "company",
    "mission",
    "story",
    "products",
    "shop",
    "collections",
    "features",
    "solutions",
    "contact",
    "press",
    "news",
  ];
  const out: string[] = [];
  for (const href of hrefs) {
    try {
      const abs = new URL(href, baseUrl).toString();
      if (!sameHost(abs, baseUrl)) continue;
      const path = new URL(abs).pathname.toLowerCase();
      if (!path || path === "/") continue;
      if (/(privacy|terms|cookie|legal|login|signup|cart|checkout|account)/.test(path)) continue;
      if (!allowHints.some((h) => path.includes(h))) continue;
      out.push(abs);
    } catch {}
  }
  return Array.from(new Set(out)).slice(0, 6);
}

function buildBundle(pages: SitePage[]) {
  return cleanText(
    pages
      .slice(0, 5)
      .map(
        (p, i) =>
          `PLAYWRIGHT_SITE_PAGE ${i + 1}
URL: ${p.url}
TITLE: ${p.title}
TEXT:
${p.text}`
      )
      .join("\n\n---\n\n"),
    13000
  );
}

export async function runPlaywrightSiteAgent(args: {
  brandUrl: string;
}): Promise<PlaywrightSiteAgentResult> {
  const startUrl = normalizeUrl(args.brandUrl);
  const diagnostics: string[] = [];
  let blockedByBotDetection = false;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; CreatorGraphSiteAgent/1.0; +https://example.com)",
  });
  const page = await context.newPage();

  const pages: SitePage[] = [];
  const visited = new Set<string>();
  const queue: string[] = [startUrl];

  try {
    try {
      await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(900);
    } catch (e: any) {
      diagnostics.push(`homepage navigation failed: ${e?.message ?? String(e)}`);
    }

    const html = await page.content().catch(() => "");
    const currentText = await page
      .evaluate(() => document.body?.innerText || "")
      .catch(() => "");
    if (looksLikeBotChallenge(`${html}\n${currentText}`)) {
      blockedByBotDetection = true;
      diagnostics.push("detected anti-bot challenge on homepage");
    }

    const discovered = await discoverLinks(page, startUrl).catch((e: any) => {
      diagnostics.push(`link discovery failed: ${e?.message ?? String(e)}`);
      return [] as string[];
    });
    queue.push(...discovered);

    for (const url of queue.slice(0, 4)) {
      if (!url || visited.has(url)) continue;
      visited.add(url);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(500);
        const htmlForPage = await page.content().catch(() => "");
        if (looksLikeBotChallenge(htmlForPage)) {
          blockedByBotDetection = true;
          diagnostics.push(`anti-bot challenge on page: ${url}`);
          continue;
        }

        const extracted = await extractPageText(page);
        if (extracted.text.length < 320) continue;
        pages.push({
          url,
          title: extracted.title,
          text: extracted.text,
        });
      } catch (e: any) {
        diagnostics.push(`page crawl failed (${url}): ${e?.message ?? String(e)}`);
      }
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const bundle = pages.length ? buildBundle(pages) : "";
  return {
    ok: Boolean(bundle),
    used: "playwright_site_agent",
    bundle,
    pagesFound: pages.length,
    blockedByBotDetection,
    diagnostics,
  };
}
