/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium as playwrightChromium } from "playwright";
import type {
  CreatorSerpAgentDefinition,
  CreatorSerpAgentId,
  CreatorSerpBrowser,
  CreatorSerpEngine,
  CreatorSerpAgentRun,
  CreatorSerpCrawlOutput,
  CreatorSerpCrawlResult,
} from "./types";

type SerpRow = {
  href: string;
  title: string;
  snippet: string;
  engine: "google" | "duckduckgo" | "serpapi";
  providerRaw?: unknown;
};

type AgentPlan = CreatorSerpAgentDefinition & {
  hostAllow: string[];
  requiredPathPrefix?: string;
  requiredAllTerms?: string[];
  requiredAnyTerms?: string[];
};

const CREATOR_SERP_AGENTS: AgentPlan[] = [
  {
    id: "x_stan_creators",
    label: "X creators with stan.store",
    platform: "x",
    queries: ['site:x.com "Website: stan.store/" "followers"'],
    hostAllow: ["x.com", "twitter.com"],
    requiredAllTerms: ["stan.store"],
  },
  {
    id: "instagram_stan_creators",
    label: "Instagram creators with stan.store",
    platform: "instagram",
    queries: ['site:instagram.com "https://stan.store/" " followers"'],
    hostAllow: ["instagram.com"],
    requiredAllTerms: ["stan.store"],
  },
  {
    id: "linkedin_stan_creators",
    label: "LinkedIn creators with stan.store",
    platform: "linkedin",
    queries: ['site:linkedin.com/in "stan.store/"'],
    hostAllow: ["linkedin.com"],
    requiredPathPrefix: "/in",
    requiredAllTerms: ["stan.store"],
  },
  {
    id: "tiktok_stan_creators",
    label: "TikTok + stan.store",
    platform: "tiktok",
    queries: ['site:tiktok.com "https://stan.store/"'],
    hostAllow: ["tiktok.com"],
    requiredAllTerms: ["stan.store"],
  },
  {
    id: "youtube_stan_creators",
    label: "YouTube + stan.store + subscribers",
    platform: "youtube",
    queries: ['site:youtube.com "stan.store/" "subscribers"'],
    hostAllow: ["youtube.com", "youtu.be"],
    requiredAllTerms: ["stan.store"],
  },
];

function cleanText(input: string, cap = 450) {
  return String(input ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, cap);
}

function normalizeGoogleResultHref(href: string): string | null {
  const raw = String(href ?? "").trim();
  if (!raw) return null;

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
    const path = u.pathname.toLowerCase();
    if (/\.(pdf|jpg|jpeg|png|webp|svg|gif|zip|mp4|mov)$/.test(path)) return false;
    return /^https?:$/.test(u.protocol);
  } catch {
    return false;
  }
}

function canonicalizeUrl(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    for (const key of Array.from(u.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid|si)$/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
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

function mergeSerpRows(...groups: SerpRow[][]) {
  const out: SerpRow[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const row of group) {
      const key = canonicalizeUrl(row.href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...row, href: key });
    }
  }
  return out;
}

function sleep(ms: number) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(minMs: number, maxMs: number) {
  const min = Math.max(0, Math.round(minMs));
  const max = Math.max(min, Math.round(maxMs));
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeBrowser(value: string | undefined): CreatorSerpBrowser {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "patchright") return "patchright";
  return "playwright";
}

function clampPositiveInt(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function readSerpApiKey() {
  const key = String(
    process.env.SERP_API_KEY ?? process.env.SERPAPI_API_KEY ?? process.env.serp_api_key ?? ""
  ).trim();
  return key.length > 0 ? key : null;
}

async function resolveChromium(args: { browser: CreatorSerpBrowser }) {
  if (args.browser === "patchright") {
    try {
      // Runtime import avoids bundling patchright assets into Next server graph.
      const dynamicImport = new Function("m", "return import(m)") as (
        m: string
      ) => Promise<any>;
      const mod = await dynamicImport("patchright");
      if (mod?.chromium) return mod.chromium as any;
      throw new Error("patchright loaded but chromium is missing");
    } catch (err: any) {
      throw new Error(
        `patchright browser requested but unavailable: ${err?.message ?? String(err)}`
      );
    }
  }
  return playwrightChromium as any;
}

async function launchBrowserWithFallback(args: {
  requestedBrowser: CreatorSerpBrowser;
}) {
  if (args.requestedBrowser === "patchright") {
    try {
      const chromium = await resolveChromium({ browser: "patchright" });
      const browser = await chromium.launch({ headless: true });
      return {
        browser,
        browserName: "patchright" as CreatorSerpBrowser,
        warning: null as string | null,
      };
    } catch (err: any) {
      try {
        const browser = await playwrightChromium.launch({ headless: true });
        return {
          browser,
          browserName: "playwright" as CreatorSerpBrowser,
          warning: `patchright unavailable; fell back to playwright (${err?.message ?? String(err)})`,
        };
      } catch (fallbackErr: any) {
        throw new Error(
          `failed to launch patchright (${err?.message ?? String(err)}) and playwright (${fallbackErr?.message ?? String(fallbackErr)})`
        );
      }
    }
  }

  const browser = await playwrightChromium.launch({ headless: true });
  return {
    browser,
    browserName: "playwright" as CreatorSerpBrowser,
    warning: null as string | null,
  };
}

async function maybeAcceptGoogleConsent(page: any) {
  await page
    .evaluate(() => {
      const labels = ["accept all", "i agree", "accept", "agree", "got it"];
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const button of buttons) {
        const text = (button.textContent || "").trim().toLowerCase();
        if (labels.some((label) => text.includes(label))) {
          (button as HTMLButtonElement).click();
          return;
        }
      }
    })
    .catch(() => {});
}

async function runGoogleQuery(page: any, query: string, num: number) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=en`;
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

  const rows = await page
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
    .catch(() => [] as Array<{ href: string; title: string; snippet: string }>);

  const out: SerpRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const href = normalizeGoogleResultHref(row.href);
    if (!href) continue;
    if (!isPageLikeUrl(href)) continue;
    if (isLikelyGoogleHost(href)) continue;
    const normalized = canonicalizeUrl(href);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({
      href: normalized,
      title: cleanText(row.title, 220),
      snippet: cleanText(row.snippet, 420),
      engine: "google",
      providerRaw: row,
    });
  }

  return { blocked, rows: out };
}

async function runDuckDuckGoQuery(page: any, query: string) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(450);

  const rows = await page
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
    .catch(() => [] as Array<{ href: string; title: string; snippet: string }>);

  const out: SerpRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const href = normalizeDuckDuckGoResultHref(row.href);
    if (!href) continue;
    if (!isPageLikeUrl(href)) continue;
    const normalized = canonicalizeUrl(href);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({
      href: normalized,
      title: cleanText(row.title, 220),
      snippet: cleanText(row.snippet, 420),
      engine: "duckduckgo",
      providerRaw: row,
    });
  }

  return { rows: out };
}

async function runSerpApiQuery(args: {
  query: string;
  num: number;
  apiKey: string;
}) {
  const params = new URLSearchParams({
    engine: "google",
    q: args.query,
    num: String(args.num),
    api_key: args.apiKey,
    hl: "en",
    google_domain: "google.com",
  });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`serpapi request failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as any;
  const providerError = cleanText(String(payload?.error ?? ""), 220);
  if (providerError) {
    throw new Error(`serpapi error: ${providerError}`);
  }

  const organicResults = Array.isArray(payload?.organic_results)
    ? payload.organic_results
    : ([] as any[]);

  const out: SerpRow[] = [];
  const seen = new Set<string>();
  for (const row of organicResults) {
    const href = String(row?.link ?? row?.url ?? "").trim();
    if (!href) continue;
    if (!isPageLikeUrl(href)) continue;
    if (isLikelyGoogleHost(href)) continue;

    const normalized = canonicalizeUrl(href);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    out.push({
      href: normalized,
      title: cleanText(String(row?.title ?? ""), 220),
      snippet: cleanText(String(row?.snippet ?? ""), 420),
      engine: "serpapi",
      providerRaw: row,
    });
  }

  return { rows: out };
}

function urlMatchesAgent(plan: AgentPlan, url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();
    const hostAllowed = plan.hostAllow.some(
      (allow) => host === allow || host.endsWith(`.${allow}`)
    );
    if (!hostAllowed) return false;
    if (plan.requiredPathPrefix) {
      return path.startsWith(plan.requiredPathPrefix.toLowerCase());
    }
    return true;
  } catch {
    return false;
  }
}

function textMatchesAgent(plan: AgentPlan, args: { url: string; title: string; snippet: string }) {
  const blob = `${args.url}\n${args.title}\n${args.snippet}`.toLowerCase();
  if (plan.requiredAllTerms?.length) {
    for (const term of plan.requiredAllTerms) {
      if (!blob.includes(term.toLowerCase())) return false;
    }
  }
  if (plan.requiredAnyTerms?.length) {
    if (!plan.requiredAnyTerms.some((term) => blob.includes(term.toLowerCase()))) {
      return false;
    }
  }
  return true;
}

export function listCreatorSerpAgents(): CreatorSerpAgentDefinition[] {
  return CREATOR_SERP_AGENTS.map((agent) => ({
    id: agent.id,
    label: agent.label,
    platform: agent.platform,
    queries: [...agent.queries],
  }));
}

function selectAgents(agentIds?: CreatorSerpAgentId[]) {
  if (!agentIds?.length) return CREATOR_SERP_AGENTS;
  const idSet = new Set(agentIds);
  return CREATOR_SERP_AGENTS.filter((agent) => idSet.has(agent.id));
}

function toRunSummary(args: {
  plan: AgentPlan;
  results: CreatorSerpCrawlResult[];
  blockedQueries: number;
  diagnostics: string[];
}): CreatorSerpAgentRun {
  return {
    id: args.plan.id,
    label: args.plan.label,
    platform: args.plan.platform,
    queries: args.plan.queries,
    resultsFound: args.results.length,
    uniqueUrls: new Set(args.results.map((r) => r.url)).size,
    blockedQueries: args.blockedQueries,
    diagnostics: args.diagnostics,
  };
}

export async function crawlCreatorSerpAgents(input?: {
  agentIds?: CreatorSerpAgentId[];
  maxResultsPerQuery?: number;
  maxResultsPerAgent?: number;
  maxResultsPerAgentById?: Partial<Record<CreatorSerpAgentId, number>>;
  googleNum?: number;
  engine?: CreatorSerpEngine;
  queryDelayMsMin?: number;
  queryDelayMsMax?: number;
  browser?: CreatorSerpBrowser;
  relaxedMatching?: boolean;
}): Promise<CreatorSerpCrawlOutput> {
  const agents = selectAgents(input?.agentIds);
  if (!agents.length) {
    return { ok: false, agentsRun: [], results: [] };
  }

  const maxResultsPerQuery = clampPositiveInt(input?.maxResultsPerQuery, 1, 30, 10);
  const maxResultsPerAgent = clampPositiveInt(input?.maxResultsPerAgent, 1, 80, 20);
  const googleNum = clampPositiveInt(input?.googleNum, 10, 50, 20);
  const requestedEngine: CreatorSerpEngine = input?.engine ?? "auto";
  const relaxedMatching = Boolean(input?.relaxedMatching);
  const serpApiKey = readSerpApiKey();
  if (requestedEngine === "serpapi" && !serpApiKey) {
    throw new Error("SERP_API_KEY is required when engine=serpapi");
  }
  const engine: CreatorSerpEngine =
    requestedEngine === "auto" && serpApiKey ? "serpapi" : requestedEngine;
  const queryDelayMsMin = clampPositiveInt(input?.queryDelayMsMin, 0, 120_000, 3_000);
  const queryDelayMsMax = Math.max(
    queryDelayMsMin,
    clampPositiveInt(input?.queryDelayMsMax, 0, 120_000, 8_000)
  );
  const requestedBrowserName = normalizeBrowser(
    input?.browser ?? process.env.CREATOR_DISCOVERY_BROWSER
  );
  const requiresBrowser = engine !== "serpapi";
  let launchedWarning: string | null = null;
  let browserName: CreatorSerpBrowser | "none" = "none";
  let browser: any | null = null;
  let context: any | null = null;
  let page: any | null = null;

  if (requiresBrowser) {
    const launched = await launchBrowserWithFallback({
      requestedBrowser: requestedBrowserName,
    });
    browser = launched.browser;
    browserName = launched.browserName;
    launchedWarning = launched.warning;
    context = await browser.newContext({
      userAgent:
        `Mozilla/5.0 (compatible; CreatorGraphCreatorSerpAgent/1.0; requested=${requestedBrowserName}; browser=${browserName}; +https://example.com)`,
    });
    page = await context.newPage();
  }

  const allResults: CreatorSerpCrawlResult[] = [];
  const runs: CreatorSerpAgentRun[] = [];
  let queryOrdinal = 0;

  try {
    for (const plan of agents) {
      const diagnostics: string[] = [];
      const agentResults: CreatorSerpCrawlResult[] = [];
      const seenUrls = new Set<string>();
      let blockedQueries = 0;
      const perAgentOverride = input?.maxResultsPerAgentById?.[plan.id];
      const agentResultCap = clampPositiveInt(perAgentOverride, 1, 80, maxResultsPerAgent);
      diagnostics.push(
        `requestedBrowser=${requestedBrowserName} browser=${browserName} requestedEngine=${requestedEngine} engine=${engine} relaxedMatching=${relaxedMatching} agentResultCap=${agentResultCap}`
      );
      if (requestedEngine === "auto" && engine === "serpapi") {
        diagnostics.push("auto-selected serpapi because SERP_API_KEY is set");
      }
      if (launchedWarning) diagnostics.push(launchedWarning);

      for (const query of plan.queries) {
        if (agentResults.length >= agentResultCap) break;
        if (queryOrdinal > 0 && queryDelayMsMax > 0) {
          await sleep(randomBetween(queryDelayMsMin, queryDelayMsMax));
        }
        queryOrdinal += 1;

        let combinedRows: SerpRow[] = [];
        let googleBlocked = false;
        if (engine === "serpapi") {
          try {
            const queryResult = await runSerpApiQuery({
              query,
              num: googleNum,
              apiKey: serpApiKey as string,
            });
            combinedRows = mergeSerpRows(combinedRows, queryResult.rows);
          } catch (err: any) {
            diagnostics.push(`serpapi query failed (${query}): ${err?.message ?? String(err)}`);
          }
        } else {
          try {
            if (engine !== "duckduckgo") {
              if (!page) throw new Error("browser page unavailable");
              const queryResult = await runGoogleQuery(page, query, googleNum);
              combinedRows = mergeSerpRows(combinedRows, queryResult.rows);
              googleBlocked = queryResult.blocked;
              if (queryResult.blocked) {
                blockedQueries += 1;
                diagnostics.push(`google flagged automation for query: ${query}`);
              }
            }
          } catch (err: any) {
            diagnostics.push(`google query failed (${query}): ${err?.message ?? String(err)}`);
          }

          const shouldUseDdg =
            engine === "duckduckgo" ||
            (engine === "auto" && (googleBlocked || combinedRows.length === 0));

          if (shouldUseDdg) {
            try {
              if (!page) throw new Error("browser page unavailable");
              const ddg = await runDuckDuckGoQuery(page, query);
              if (ddg.rows.length > 0) {
                diagnostics.push(`used duckduckgo fallback for query: ${query}`);
              }
              combinedRows = mergeSerpRows(combinedRows, ddg.rows);
            } catch (err: any) {
              diagnostics.push(`duckduckgo query failed (${query}): ${err?.message ?? String(err)}`);
            }
          }
        }

        try {
          let queryCount = 0;
          diagnostics.push(`query rows before filtering (${query}): ${combinedRows.length}`);
          for (const row of combinedRows) {
            if (queryCount >= maxResultsPerQuery) break;
            if (agentResults.length >= agentResultCap) break;
            if (!urlMatchesAgent(plan, row.href)) continue;
            if (
              !relaxedMatching &&
              !textMatchesAgent(plan, { url: row.href, title: row.title, snippet: row.snippet })
            ) {
              continue;
            }

            const url = canonicalizeUrl(row.href);
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            queryCount += 1;

            agentResults.push({
              agentId: plan.id,
              platform: plan.platform,
              query,
              position: queryCount,
              title: row.title,
              snippet: row.snippet,
              url,
              raw: {
                engine: row.engine,
                agentId: plan.id,
                providerRaw: row.providerRaw ?? null,
              },
            });
          }

          if (!queryCount) {
            diagnostics.push(`no qualifying results for query: ${query}`);
          }
        } catch (err: any) {
          diagnostics.push(`query failed (${query}): ${err?.message ?? String(err)}`);
        }
      }

      runs.push(
        toRunSummary({
          plan,
          results: agentResults,
          blockedQueries,
          diagnostics,
        })
      );
      allResults.push(...agentResults);
    }
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  return {
    ok: allResults.length > 0,
    agentsRun: runs,
    results: allResults,
  };
}
