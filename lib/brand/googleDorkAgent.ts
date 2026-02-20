/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from "playwright";

type DorkQuery = {
  label: string;
  query: string;
};

type DorkPage = {
  url: string;
  title: string;
  text: string;
  sourceQuery: string;
};

type DorkSnippet = {
  url: string;
  title: string;
  snippet: string;
  sourceQuery: string;
  engine: "google" | "duckduckgo";
};

export type GoogleDorkAgentResult = {
  ok: boolean;
  used: "google_dork_agent";
  bundle: string;
  queriesTried: string[];
  pagesFound: number;
  snippetCount: number;
  diagnostics: string[];
};

function stripWww(host: string) {
  return host.replace(/^www\./i, "").toLowerCase();
}

function normalizeHost(url: string) {
  try {
    return stripWww(new URL(url).hostname);
  } catch {
    return stripWww(url);
  }
}

function sameHost(a: string, b: string) {
  try {
    return stripWww(new URL(a).hostname) === stripWww(new URL(b).hostname);
  } catch {
    return false;
  }
}

function cleanText(input: string, cap = 3500) {
  return String(input ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, cap);
}

function buildDorkQueries(host: string, brandName?: string | null): DorkQuery[] {
  const brand = String(brandName ?? "").trim();
  const q: DorkQuery[] = [
    { label: "about", query: `site:${host} "about"` },
    { label: "products", query: `site:${host} "products" OR "shop"` },
    { label: "company", query: `site:${host} "company" OR "mission"` },
    { label: "press", query: `site:${host} "press" OR "news"` },
    { label: "careers", query: `site:${host} "careers" OR "team"` },
  ];

  if (brand) {
    q.unshift({
      label: "brand-overview",
      query: `site:${host} "${brand}"`,
    });
  }

  return q;
}

function normalizeGoogleResultHref(href: string): string | null {
  const raw = String(href ?? "").trim();
  if (!raw) return null;

  // common google redirect form: /url?q=<target>&...
  if (raw.startsWith("/url?")) {
    const params = new URLSearchParams(raw.slice(raw.indexOf("?") + 1));
    const q = params.get("q");
    if (!q) return null;
    return q;
  }

  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function isLikelyGoogleHost(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith(".google.com") ||
      host === "google.com" ||
      host.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

function isPageLikeUrl(url: string) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    if (/\.(pdf|jpg|jpeg|png|webp|svg|gif|zip|mp4|mov)$/.test(p)) return false;
    return /^https?:$/.test(u.protocol);
  } catch {
    return false;
  }
}

async function maybeAcceptGoogleConsent(page: any) {
  await page
    .evaluate(() => {
      const labels = [
        "accept all",
        "i agree",
        "accept",
        "agree",
        "got it",
      ];
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const btn of buttons) {
        const t = (btn.textContent || "").trim().toLowerCase();
        if (labels.some((x) => t.includes(x))) {
          (btn as HTMLButtonElement).click();
          return;
        }
      }
    })
    .catch(() => {});
}

async function getResultLinksForQuery(page: any, query: string, brandUrl: string) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=en`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(700);
  await maybeAcceptGoogleConsent(page);
  await page.waitForTimeout(350);

  const html = (await page.content().catch(() => "")).toLowerCase();
  const blocked =
    html.includes("detected unusual traffic") ||
    html.includes("our systems have detected unusual traffic") ||
    html.includes("sorry, but your computer or network may be sending automated queries") ||
    html.includes("captcha");

  const snippetRows: Array<{ href: string; title: string; snippet: string }> = await page
    .$$eval("div.g", (nodes: Element[]) =>
      nodes.map((node: Element) => {
        const anchor = node.querySelector("a[href]");
        const titleEl = node.querySelector("h3");
        const snippetEl =
          node.querySelector("div.VwiC3b") ||
          node.querySelector("span.aCOpRe") ||
          node.querySelector("div[data-sncf='1']");
        return {
          href: (anchor as HTMLAnchorElement | null)?.getAttribute("href") || "",
          title: (titleEl?.textContent || "").trim(),
          snippet: (snippetEl?.textContent || "").trim(),
        };
      })
    )
    .catch(() => []);

  const hrefs: string[] = await page.$$eval("a[href]", (nodes: Element[]) =>
    nodes.map((n: Element) => (n as HTMLAnchorElement).getAttribute("href") || "")
  );

  const out: string[] = [];
  for (const h of hrefs) {
    const candidate = normalizeGoogleResultHref(h);
    if (!candidate) continue;
    if (!isPageLikeUrl(candidate)) continue;
    if (isLikelyGoogleHost(candidate)) continue;
    if (!sameHost(candidate, brandUrl)) continue;

    // keep high-signal pages; skip junk/legal/auth
    const path = new URL(candidate).pathname.toLowerCase();
    if (/(privacy|terms|cookie|legal|login|signup|cart|checkout)/.test(path)) continue;
    out.push(candidate);
  }

  const snippets: DorkSnippet[] = [];
  for (const row of snippetRows) {
    const candidate = normalizeGoogleResultHref(row.href);
    if (!candidate) continue;
    if (!isPageLikeUrl(candidate)) continue;
    if (isLikelyGoogleHost(candidate)) continue;
    if (!sameHost(candidate, brandUrl)) continue;
    const title = cleanText(row.title, 220);
    const snippet = cleanText(row.snippet, 380);
    if (!title && !snippet) continue;
    snippets.push({
      url: candidate,
      title,
      snippet,
      sourceQuery: query,
      engine: "google",
    });
  }

  return {
    blocked,
    links: Array.from(new Set(out)).slice(0, 6),
    snippets,
  };
}

function normalizeDuckDuckGoResultHref(href: string): string | null {
  const raw = String(href ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/l/?")) {
    const params = new URLSearchParams(raw.slice(raw.indexOf("?") + 1));
    const uddg = params.get("uddg");
    if (uddg && /^https?:\/\//i.test(uddg)) return uddg;
  }
  return null;
}

async function getDuckDuckGoResultsForQuery(page: any, query: string, brandUrl: string) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(450);

  const rows: Array<{ href: string; title: string; snippet: string }> = await page
    .$$eval(".result", (nodes: Element[]) =>
      nodes.map((node: Element) => {
        const anchor =
          (node.querySelector("a.result__a") as HTMLAnchorElement | null) ||
          (node.querySelector("a[href]") as HTMLAnchorElement | null);
        const snippetEl = node.querySelector(".result__snippet");
        return {
          href: anchor?.getAttribute("href") || "",
          title: (anchor?.textContent || "").trim(),
          snippet: (snippetEl?.textContent || "").trim(),
        };
      })
    )
    .catch(() => []);

  const links: string[] = [];
  const snippets: DorkSnippet[] = [];
  for (const row of rows) {
    const candidate = normalizeDuckDuckGoResultHref(row.href);
    if (!candidate) continue;
    if (!isPageLikeUrl(candidate)) continue;
    if (!sameHost(candidate, brandUrl)) continue;
    const path = new URL(candidate).pathname.toLowerCase();
    if (/(privacy|terms|cookie|legal|login|signup|cart|checkout)/.test(path)) continue;
    links.push(candidate);

    const title = cleanText(row.title, 220);
    const snippet = cleanText(row.snippet, 380);
    if (title || snippet) {
      snippets.push({
        url: candidate,
        title,
        snippet,
        sourceQuery: query,
        engine: "duckduckgo",
      });
    }
  }

  return {
    links: Array.from(new Set(links)).slice(0, 6),
    snippets,
  };
}

async function extractPageText(page: any): Promise<{ title: string; text: string }> {
  const text = await page.evaluate(() => {
    const kill = (sel: string) => document.querySelectorAll(sel).forEach((n) => n.remove());
    kill("script");
    kill("style");
    kill("noscript");
    kill("svg");
    kill("header nav");
    kill("footer");

    const main = document.querySelector("main") || document.body;
    return main?.innerText || document.body?.innerText || "";
  });
  const title = await page.title().catch(() => "");
  return {
    title: cleanText(title, 200),
    text: cleanText(String(text || ""), 4200),
  };
}

function buildBundle(pages: DorkPage[], snippets: DorkSnippet[]) {
  const pageSections = pages.slice(0, 5).map(
    (p, i) =>
      `GOOGLE_DORK_PAGE ${i + 1}
QUERY: ${p.sourceQuery}
URL: ${p.url}
TITLE: ${p.title}
TEXT:
${p.text}`
  );

  const snippetSections = snippets.slice(0, 10).map(
    (s, i) =>
      `GOOGLE_DORK_SNIPPET ${i + 1}
ENGINE: ${s.engine}
QUERY: ${s.sourceQuery}
URL: ${s.url}
TITLE: ${s.title}
SNIPPET:
${s.snippet}`
  );

  const blocks = [...pageSections, ...snippetSections].filter(Boolean);
  if (!blocks.length) return "";
  return cleanText(blocks.join("\n\n---\n\n"), 13000);
}

export async function runGoogleDorkBrandAgent(args: {
  brandUrl: string;
  brandName?: string | null;
}): Promise<GoogleDorkAgentResult> {
  const host = normalizeHost(args.brandUrl);
  const queries = buildDorkQueries(host, args.brandName);
  const diagnostics: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; CreatorGraphGoogleDorkAgent/1.0; +https://example.com)",
  });
  const page = await context.newPage();

  const pagesByUrl = new Map<string, DorkPage>();
  const snippetsByKey = new Map<string, DorkSnippet>();

  try {
    for (const plan of queries) {
      let links: string[] = [];
      let snippets: DorkSnippet[] = [];
      let googleBlocked = false;
      try {
        const result = await getResultLinksForQuery(page, plan.query, args.brandUrl);
        if (result.blocked) {
          diagnostics.push(`google flagged automation while running query: ${plan.query}`);
          googleBlocked = true;
        }
        links = result.links;
        snippets = result.snippets;
      } catch (e: any) {
        diagnostics.push(`query failed (${plan.query}): ${e?.message ?? String(e)}`);
      }

      for (const s of snippets) {
        const key = `${s.engine}|${s.url}|${s.sourceQuery}`;
        if (!snippetsByKey.has(key)) snippetsByKey.set(key, s);
      }

      if (!links.length || googleBlocked) {
        try {
          const ddg = await getDuckDuckGoResultsForQuery(page, plan.query, args.brandUrl);
          if (ddg.links.length) {
            links = Array.from(new Set([...links, ...ddg.links])).slice(0, 6);
          }
          for (const s of ddg.snippets) {
            const key = `${s.engine}|${s.url}|${s.sourceQuery}`;
            if (!snippetsByKey.has(key)) snippetsByKey.set(key, s);
          }
          if (ddg.links.length || ddg.snippets.length) {
            diagnostics.push(`used duckduckgo html fallback for query: ${plan.query}`);
          }
        } catch (e: any) {
          diagnostics.push(`duckduckgo fallback failed (${plan.query}): ${e?.message ?? String(e)}`);
        }
      }

      if (!links.length && snippets.length === 0) {
        diagnostics.push(`no links/snippets from query: ${plan.query}`);
        continue;
      }

      for (const link of links.slice(0, 3)) {
        if (pagesByUrl.has(link)) continue;
        try {
          await page.goto(link, { waitUntil: "domcontentloaded", timeout: 25_000 });
          await page.waitForTimeout(450);
          const extracted = await extractPageText(page);
          if (extracted.text.length < 320) continue;

          pagesByUrl.set(link, {
            url: link,
            title: extracted.title || "",
            text: extracted.text,
            sourceQuery: plan.query,
          });
        } catch (e: any) {
          diagnostics.push(`page fetch failed (${link}): ${e?.message ?? String(e)}`);
        }
      }

      if (pagesByUrl.size >= 5) break;
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const pages = Array.from(pagesByUrl.values());
  const snippets = Array.from(snippetsByKey.values());
  const bundle = buildBundle(pages, snippets);

  return {
    ok: Boolean(bundle),
    used: "google_dork_agent",
    bundle,
    queriesTried: queries.map((q) => q.query),
    pagesFound: pages.length,
    snippetCount: snippets.length,
    diagnostics,
  };
}
