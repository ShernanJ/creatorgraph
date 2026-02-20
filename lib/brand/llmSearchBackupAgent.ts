/* eslint-disable @typescript-eslint/no-explicit-any */
import { chromium } from "playwright";
import { groqText } from "@/lib/groq";

type SnippetRow = {
  query: string;
  url: string;
  title: string;
  snippet: string;
};

export type LlmSearchBackupAgentResult = {
  ok: boolean;
  used: "llm_search_backup_agent";
  bundle: string;
  queriesTried: string[];
  resultsCount: number;
  diagnostics: string[];
};

function cleanText(input: string, cap = 360) {
  return String(input ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, cap);
}

function cleanBundle(input: string, cap = 12000) {
  return String(input ?? "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, cap);
}

function extractJson(s: string) {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = String(value ?? "").trim();
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}

function normalizeDuckHref(href: string): string | null {
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

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  }
}

async function generateSearchQueries(args: {
  brandUrl: string;
  brandName?: string | null;
}) {
  const host = hostFromUrl(args.brandUrl);
  const brand = String(args.brandName ?? "").trim() || host;
  const fallback = uniqStrings([
    `${brand} brand overview`,
    `${brand} company mission values`,
    `${brand} products and target audience`,
    `${brand} wikipedia`,
    `${brand} press release`,
  ]).slice(0, 5);

  try {
    const prompt = `You are generating web search queries for a brand profiling pipeline.
Brand URL: ${args.brandUrl}
Brand name hint: ${brand}

Return STRICT JSON only:
{
  "queries": ["q1", "q2", "q3", "q4", "q5"]
}

Rules:
- focus on brand overview, products, audience, positioning, channels
- include at least one query that uses site:${host}
- include at least one broad query (not site-restricted)
- avoid local intent and shopping intent
- max 5 queries`;

    const raw = await groqText(prompt, {
      system: "Return only valid JSON. No markdown.",
      temperature: 0.1,
      maxCompletionTokens: 260,
    });
    const json = extractJson(raw);
    if (!json) return fallback;
    const parsed = JSON.parse(json) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) return fallback;
    const generated = uniqStrings(
      parsed.queries.map((q) => String(q ?? ""))
    ).slice(0, 5);
    if (!generated.length) return fallback;
    return generated;
  } catch {
    return fallback;
  }
}

async function searchDuckDuckGo(page: any, query: string) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
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

  const out: SnippetRow[] = [];
  for (const row of rows.slice(0, 8)) {
    const normalized = normalizeDuckHref(row.href);
    if (!normalized) continue;
    const title = cleanText(row.title, 220);
    const snippet = cleanText(row.snippet, 420);
    if (!title && !snippet) continue;
    out.push({
      query,
      url: normalized,
      title,
      snippet,
    });
  }
  return out.slice(0, 5);
}

function buildBundle(rows: SnippetRow[]) {
  const sections = rows.slice(0, 14).map(
    (r, i) =>
      `LLM_SEARCH_RESULT ${i + 1}
QUERY: ${r.query}
URL: ${r.url}
TITLE: ${r.title}
SNIPPET:
${r.snippet}`
  );
  return cleanBundle(sections.join("\n\n---\n\n"), 13000);
}

export async function runLlmSearchBackupAgent(args: {
  brandUrl: string;
  brandName?: string | null;
}): Promise<LlmSearchBackupAgentResult> {
  const diagnostics: string[] = [];
  const queries = await generateSearchQueries(args);
  const snippets: SnippetRow[] = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; CreatorGraphLlmSearchAgent/1.0; +https://example.com)",
  });
  const page = await context.newPage();

  try {
    for (const query of queries) {
      try {
        const rows = await searchDuckDuckGo(page, query);
        if (!rows.length) {
          diagnostics.push(`no snippets for query: ${query}`);
          continue;
        }
        snippets.push(...rows);
      } catch (e: any) {
        diagnostics.push(`query failed (${query}): ${e?.message ?? String(e)}`);
      }
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const bundle = snippets.length ? buildBundle(snippets) : "";
  return {
    ok: Boolean(bundle),
    used: "llm_search_backup_agent",
    bundle,
    queriesTried: queries,
    resultsCount: snippets.length,
    diagnostics,
  };
}
