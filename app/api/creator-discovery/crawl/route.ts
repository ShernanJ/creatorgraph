import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { crawlCreatorSerpAgents, listCreatorSerpAgents } from "@/lib/creator/discovery/googleSerpAgents";
import { extractRawAccounts } from "@/lib/creator/discovery/extractRawAccounts";
import { ingestSerpResults } from "@/lib/creator/discovery/ingestSerpResults";
import { normalizeSerpResult } from "@/lib/creator/discovery/normalize";
import type { CreatorSerpEngine, RawSerpResultInput } from "@/lib/creator/discovery/types";

const AGENT_IDS = [
  "x_stan_creators",
  "instagram_stan_creators",
  "linkedin_stan_creators",
  "tiktok_stan_creators",
  "youtube_stan_creators",
] as const;

const PLATFORMS = ["x", "instagram", "linkedin", "tiktok", "youtube"] as const;
const SERP_ENGINES = ["auto", "google", "duckduckgo", "serpapi"] as const;

type CrawlPlatform = (typeof PLATFORMS)[number];
type CrawlAgentId = (typeof AGENT_IDS)[number];

const PLATFORM_TO_AGENT: Record<CrawlPlatform, CrawlAgentId> = {
  x: "x_stan_creators",
  instagram: "instagram_stan_creators",
  linkedin: "linkedin_stan_creators",
  tiktok: "tiktok_stan_creators",
  youtube: "youtube_stan_creators",
};

const bodySchema = z.object({
  agents: z.array(z.enum(AGENT_IDS)).min(1).optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1).optional(),
  maxResultsPerPlatform: z.number().int().positive().max(80).optional(),
  platformLimits: z
    .object({
      x: z.number().int().positive().max(80).optional(),
      instagram: z.number().int().positive().max(80).optional(),
      linkedin: z.number().int().positive().max(80).optional(),
      tiktok: z.number().int().positive().max(80).optional(),
      youtube: z.number().int().positive().max(80).optional(),
    })
    .optional(),
  maxResultsPerQuery: z.number().int().positive().max(30).optional(),
  maxResultsPerAgent: z.number().int().positive().max(80).optional(),
  googleNum: z.number().int().positive().max(50).optional(),
  engine: z.enum(SERP_ENGINES).optional(),
  browser: z.enum(["playwright", "patchright"]).optional(),
  queryDelayMsMin: z.number().int().nonnegative().max(120000).optional(),
  queryDelayMsMax: z.number().int().nonnegative().max(120000).optional(),
  relaxedMatching: z.boolean().optional(),
  persist: z.boolean().optional(),
  extractAfterPersist: z.boolean().optional(),
  extractorVersion: z.string().min(1).max(64).optional(),
  extractLimit: z.number().int().positive().max(20000).optional(),
  extractPreviewLimit: z.number().int().positive().max(500).optional(),
  discoveryRunId: z.string().min(3).optional(),
});

type GroupedRows = {
  query: string;
  rows: RawSerpResultInput[];
};

function clampPositiveInt(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values));
}

function defaultBrowser() {
  const raw = String(process.env.CREATOR_DISCOVERY_BROWSER ?? "").trim().toLowerCase();
  return raw === "patchright" ? "patchright" : "playwright";
}

function hasSerpApiKey() {
  return Boolean(
    String(
      process.env.SERP_API_KEY ?? process.env.SERPAPI_API_KEY ?? process.env.serp_api_key ?? ""
    ).trim()
  );
}

function defaultEngine(): CreatorSerpEngine {
  const raw = String(process.env.CREATOR_DISCOVERY_ENGINE ?? "").trim().toLowerCase();
  if (SERP_ENGINES.includes(raw as (typeof SERP_ENGINES)[number])) {
    return raw as CreatorSerpEngine;
  }
  return hasSerpApiKey() ? "serpapi" : "auto";
}

function groupByQuery(rows: Array<RawSerpResultInput & { query?: string }>): GroupedRows[] {
  const map = new Map<string, RawSerpResultInput[]>();
  for (const row of rows) {
    const query = String(row.query ?? "").trim();
    if (!query) continue;
    const existing = map.get(query) ?? [];
    existing.push(row);
    map.set(query, existing);
  }

  return Array.from(map.entries()).map(([query, grouped]) => ({
    query,
    rows: grouped,
  }));
}

export async function GET() {
  const agents = listCreatorSerpAgents();
  return NextResponse.json({
    agents,
    platforms: PLATFORMS,
    defaults: {
      maxResultsPerQuery: 10,
      maxResultsPerAgent: 20,
      maxResultsPerPlatform: null,
      googleNum: 20,
      engine: defaultEngine(),
      browser: defaultBrowser(),
      queryDelayMsMin: 3000,
      queryDelayMsMax: 8000,
      relaxedMatching: false,
      persist: false,
      extractAfterPersist: true,
      extractorVersion: "v1",
      extractLimit: 500,
      extractPreviewLimit: 40,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const resolvedEngine = input.engine ?? defaultEngine();
  const agentsRequested: CrawlAgentId[] = input.agents?.length
    ? uniq([...input.agents])
    : input.platforms?.length
      ? uniq(input.platforms.map((platform) => PLATFORM_TO_AGENT[platform]))
      : [...AGENT_IDS];

  const maxResultsPerPlatform = clampPositiveInt(
    input.maxResultsPerPlatform,
    1,
    80,
    0
  );

  const maxResultsPerAgentById: Partial<Record<CrawlAgentId, number>> = {};
  if (maxResultsPerPlatform > 0) {
    for (const agentId of agentsRequested) {
      maxResultsPerAgentById[agentId] = maxResultsPerPlatform;
    }
  }

  const platformLimits = input.platformLimits ?? {};
  for (const platform of PLATFORMS) {
    const v = platformLimits[platform];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const agentId = PLATFORM_TO_AGENT[platform];
    if (!agentsRequested.includes(agentId)) continue;
    maxResultsPerAgentById[agentId] = clampPositiveInt(v, 1, 80, 1);
  }

  let crawl;
  try {
    crawl = await crawlCreatorSerpAgents({
      agentIds: agentsRequested,
      maxResultsPerQuery: input.maxResultsPerQuery,
      maxResultsPerAgent: input.maxResultsPerAgent,
      maxResultsPerAgentById:
        Object.keys(maxResultsPerAgentById).length > 0 ? maxResultsPerAgentById : undefined,
      googleNum: input.googleNum,
      engine: resolvedEngine,
      browser: input.browser,
      queryDelayMsMin: input.queryDelayMsMin,
      queryDelayMsMax: input.queryDelayMsMax,
      relaxedMatching: input.relaxedMatching,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "creator crawl failed";
    return NextResponse.json(
      {
        error: "creator crawl failed",
        message,
        config: {
          agentsRequested,
          platformsRequested: input.platforms ?? null,
          browser: input.browser ?? defaultBrowser(),
          engine: resolvedEngine,
        },
      },
      { status: 500 }
    );
  }

  const rawResults = crawl.results.map((row) => ({
    query: row.query,
    title: row.title,
    snippet: row.snippet,
    url: row.url,
    position: row.position,
    raw: {
      ...(typeof row.raw === "object" && row.raw ? row.raw : {}),
      agentId: row.agentId,
      platform: row.platform,
    },
  }));

  const normalizedPreview = crawl.results.map((row) => {
    const normalized = normalizeSerpResult({
      title: row.title,
      snippet: row.snippet,
      url: row.url,
      position: row.position,
      raw: row.raw,
    });
    return {
      agentId: row.agentId,
      platform: row.platform,
      query: row.query,
      sourceUrl: row.url,
      normalized,
    };
  });

  let ingestSummary:
    | {
        discoveryRunId: string;
        inserted: number;
        report: unknown;
        groupedIngests: number;
      }
    | null = null;
  let extractionSummary:
    | {
        extractorVersion: string;
        stats: {
          selected: number;
          processed: number;
          persisted: number;
          withStanSlug: number;
          withFollowerCount: number;
          withPlatformProfile: number;
          withInstagramProfile: number;
          failed: number;
        };
        previewCount: number;
      }
    | null = null;

  if (input.persist === true && rawResults.length > 0) {
    const discoveryRunId = input.discoveryRunId ?? `dr_${nanoid(10)}`;
    const grouped = groupByQuery(rawResults);
    let inserted = 0;
    let lastReport: unknown = null;

    for (const group of grouped) {
      const out = await ingestSerpResults({
        discoveryRunId,
        query: group.query,
        results: group.rows,
      });
      inserted += out.inserted;
      lastReport = out.report;
    }

    ingestSummary = {
      discoveryRunId,
      inserted,
      report: lastReport,
      groupedIngests: grouped.length,
    };

    const shouldExtract = input.extractAfterPersist !== false;
    if (shouldExtract) {
      try {
        const extraction = await extractRawAccounts({
          discoveryRunId,
          dryRun: false,
          extractorVersion: input.extractorVersion ?? "v1",
          limit: input.extractLimit ?? 500,
          previewLimit: input.extractPreviewLimit ?? 40,
        });
        extractionSummary = {
          extractorVersion: extraction.extractorVersion,
          stats: extraction.stats,
          previewCount: extraction.preview.length,
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "post-ingest extraction failed";
        return NextResponse.json(
          {
            error: "creator extraction failed",
            message,
            ingest: ingestSummary,
            config: {
              discoveryRunId,
              extractorVersion: input.extractorVersion ?? "v1",
              extractLimit: input.extractLimit ?? 500,
              extractPreviewLimit: input.extractPreviewLimit ?? 40,
            },
          },
          { status: 500 }
        );
      }
    }
  }

  const uniqueUrls = new Set(crawl.results.map((r) => r.url)).size;
  const blockedQueries = crawl.agentsRun.reduce((sum, run) => sum + run.blockedQueries, 0);

  return NextResponse.json({
    ok: crawl.ok,
    config: {
      agentsRequested,
      platformsRequested: input.platforms ?? null,
      maxResultsPerQuery: input.maxResultsPerQuery ?? 10,
      maxResultsPerAgent: input.maxResultsPerAgent ?? 20,
      maxResultsPerPlatform: maxResultsPerPlatform > 0 ? maxResultsPerPlatform : null,
      agentResultCapsApplied:
        Object.keys(maxResultsPerAgentById).length > 0 ? maxResultsPerAgentById : null,
      googleNum: input.googleNum ?? 20,
      engine: resolvedEngine,
      browser: input.browser ?? defaultBrowser(),
      queryDelayMsMin: input.queryDelayMsMin ?? 3000,
      queryDelayMsMax: input.queryDelayMsMax ?? 8000,
      relaxedMatching: Boolean(input.relaxedMatching),
      persist: Boolean(input.persist),
      extractAfterPersist: input.extractAfterPersist !== false,
      extractorVersion: input.extractorVersion ?? "v1",
      extractLimit: input.extractLimit ?? 500,
      extractPreviewLimit: input.extractPreviewLimit ?? 40,
    },
    summary: {
      agentsRun: crawl.agentsRun.length,
      totalResults: crawl.results.length,
      uniqueUrls,
      blockedQueries,
    },
    agents: crawl.agentsRun,
    results: crawl.results,
    normalizedPreview,
    ingest: ingestSummary,
    extraction: extractionSummary,
  });
}
