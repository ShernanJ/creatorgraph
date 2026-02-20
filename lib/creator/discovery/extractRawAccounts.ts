/* eslint-disable @typescript-eslint/no-explicit-any */
import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import { extractDiscoverySignalsFromRawAccount } from "./extractSignals";
import type { DiscoveryPlatform } from "./types";

type RawAccountRow = {
  id: string;
  discovery_run_id: string;
  source_url: string;
  title: string | null;
  snippet: string | null;
  platform: string | null;
  raw: unknown;
};

type PersistedExtractionRow = {
  id: string;
  raw_account_id: string;
  discovery_run_id: string;
  platform: string | null;
  extractor_version: string;
  stan_url: string | null;
  stan_slug: string | null;
  all_stan_urls: unknown;
  follower_count_estimate: number | null;
  platform_profile_url: string | null;
  platform_handle: string | null;
  instagram_profile_url: string | null;
  instagram_handle: string | null;
  extraction_confidence: string | number;
  evidence: unknown;
  created_at: string;
  updated_at: string;
};

export type DiscoveryExtractionInput = {
  discoveryRunId?: string;
  platform?: DiscoveryPlatform;
  rawAccountIds?: string[];
  extractorVersion?: string;
  limit?: number;
  previewLimit?: number;
  dryRun?: boolean;
};

export type DiscoveryExtractionSampleInput = {
  platform?: DiscoveryPlatform;
  sourceUrl: string;
  title?: string;
  snippet?: string;
  raw?: unknown;
  rawAccountId?: string;
  discoveryRunId?: string;
};

export type DiscoveryExtractionStats = {
  selected: number;
  processed: number;
  persisted: number;
  withStanSlug: number;
  withFollowerCount: number;
  withPlatformProfile: number;
  withInstagramProfile: number;
  failed: number;
};

export type DiscoveryExtractionRun = {
  discoveryRunId: string | null;
  extractorVersion: string;
  dryRun: boolean;
  stats: DiscoveryExtractionStats;
  preview: Array<{
    rawAccountId: string;
    platform: DiscoveryPlatform;
    sourceUrl: string;
    stanUrl: string | null;
    stanSlug: string | null;
    allStanUrls: string[];
    followerCountEstimate: number | null;
    platformProfileUrl: string | null;
    platformHandle: string | null;
    instagramProfileUrl: string | null;
    instagramHandle: string | null;
    confidence: number;
    signals: string[];
    evidence: Record<string, unknown>;
  }>;
};

export type DiscoverySampleExtractionRun = {
  count: number;
  items: DiscoveryExtractionRun["preview"];
};

export type DiscoveryExtractionList = {
  count: number;
  rows: PersistedExtractionRow[];
};

function clampInt(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizePlatform(v: string | undefined): DiscoveryPlatform | null {
  const value = String(v ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "x") return "x";
  if (value === "instagram") return "instagram";
  if (value === "linkedin") return "linkedin";
  if (value === "tiktok") return "tiktok";
  if (value === "youtube") return "youtube";
  if (value === "unknown") return "unknown";
  return null;
}

function normalizeRawIds(rawIds: string[] | undefined, cap: number) {
  if (!Array.isArray(rawIds) || rawIds.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    const v = String(raw ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

function defaultStats(): DiscoveryExtractionStats {
  return {
    selected: 0,
    processed: 0,
    persisted: 0,
    withStanSlug: 0,
    withFollowerCount: 0,
    withPlatformProfile: 0,
    withInstagramProfile: 0,
    failed: 0,
  };
}

async function latestDiscoveryRunId() {
  const rows = await q<{ discovery_run_id: string }>(
    `select discovery_run_id
     from raw_accounts
     order by created_at desc
     limit 1`
  );
  return rows[0]?.discovery_run_id ?? null;
}

async function selectRawAccounts(args: {
  discoveryRunId: string | null;
  platform: DiscoveryPlatform | null;
  rawAccountIds: string[];
  limit: number;
}) {
  const where: string[] = [];
  const params: any[] = [];

  if (args.discoveryRunId) {
    params.push(args.discoveryRunId);
    where.push(`ra.discovery_run_id = $${params.length}`);
  }

  if (args.platform) {
    params.push(args.platform);
    where.push(`lower(coalesce(ra.platform, 'unknown')) = $${params.length}`);
  }

  if (args.rawAccountIds.length > 0) {
    params.push(args.rawAccountIds);
    where.push(`ra.id = any($${params.length}::text[])`);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  params.push(args.limit);

  return q<RawAccountRow>(
    `select
       ra.id,
       ra.discovery_run_id,
       ra.source_url,
       ra.title,
       ra.snippet,
       ra.platform,
       ra.raw
     from raw_accounts ra
     ${whereSql}
     order by ra.created_at desc
     limit $${params.length}`,
    params
  );
}

async function upsertExtraction(args: {
  extractorVersion: string;
  extraction: ReturnType<typeof extractDiscoverySignalsFromRawAccount>;
}) {
  await q(
    `insert into raw_account_extractions (
       id, raw_account_id, discovery_run_id, platform, extractor_version,
       stan_url, stan_slug, all_stan_urls, follower_count_estimate, platform_profile_url, platform_handle,
       instagram_profile_url, instagram_handle, extraction_confidence, evidence
     )
     values (
       $1,$2,$3,$4,$5,
       $6,$7,$8::jsonb,$9,$10,$11,
       $12,$13,$14,$15::jsonb
     )
     on conflict (raw_account_id, extractor_version) do update set
       discovery_run_id = excluded.discovery_run_id,
       platform = excluded.platform,
       stan_url = excluded.stan_url,
       stan_slug = excluded.stan_slug,
       all_stan_urls = excluded.all_stan_urls,
       follower_count_estimate = excluded.follower_count_estimate,
       platform_profile_url = excluded.platform_profile_url,
       platform_handle = excluded.platform_handle,
       instagram_profile_url = excluded.instagram_profile_url,
       instagram_handle = excluded.instagram_handle,
       extraction_confidence = excluded.extraction_confidence,
       evidence = excluded.evidence,
       updated_at = now()`,
    [
      `raex_${nanoid(10)}`,
      args.extraction.rawAccountId,
      args.extraction.discoveryRunId,
      args.extraction.platform,
      args.extractorVersion,
      args.extraction.stanUrl,
      args.extraction.stanSlug,
      JSON.stringify(args.extraction.allStanUrls ?? []),
      args.extraction.followerCountEstimate,
      args.extraction.platformProfileUrl,
      args.extraction.platformHandle,
      args.extraction.instagramProfileUrl,
      args.extraction.instagramHandle,
      args.extraction.confidence,
      JSON.stringify({
        ...args.extraction.evidence,
        signals: args.extraction.signals,
      }),
    ]
  );
}

export async function extractRawAccounts(
  input: DiscoveryExtractionInput = {}
): Promise<DiscoveryExtractionRun> {
  const extractorVersion = String(input.extractorVersion ?? "v1").trim() || "v1";
  const dryRun = input.dryRun !== false;
  const limit = clampInt(input.limit, 1, 20_000, 500);
  const previewLimit = clampInt(input.previewLimit, 1, 500, 40);
  const rawAccountIds = normalizeRawIds(input.rawAccountIds, 5000);
  const platform = normalizePlatform(input.platform ?? undefined);
  const resolvedRunId = input.discoveryRunId
    ? String(input.discoveryRunId).trim()
    : rawAccountIds.length > 0
      ? null
      : await latestDiscoveryRunId();

  const rows = await selectRawAccounts({
    discoveryRunId: resolvedRunId,
    platform,
    rawAccountIds,
    limit,
  });

  const stats = defaultStats();
  stats.selected = rows.length;
  const preview: DiscoveryExtractionRun["preview"] = [];

  for (const row of rows) {
    try {
      const extraction = extractDiscoverySignalsFromRawAccount(row);
      stats.processed += 1;
      if (extraction.stanSlug) stats.withStanSlug += 1;
      if (typeof extraction.followerCountEstimate === "number") stats.withFollowerCount += 1;
      if (extraction.platformProfileUrl) stats.withPlatformProfile += 1;
      if (extraction.instagramProfileUrl) stats.withInstagramProfile += 1;

      if (!dryRun) {
        await upsertExtraction({
          extractorVersion,
          extraction,
        });
        stats.persisted += 1;
      }

      if (preview.length < previewLimit) {
        preview.push({
          rawAccountId: extraction.rawAccountId,
          platform: extraction.platform,
          sourceUrl: extraction.sourceUrl,
          stanUrl: extraction.stanUrl,
          stanSlug: extraction.stanSlug,
          allStanUrls: extraction.allStanUrls,
          followerCountEstimate: extraction.followerCountEstimate,
          platformProfileUrl: extraction.platformProfileUrl,
          platformHandle: extraction.platformHandle,
          instagramProfileUrl: extraction.instagramProfileUrl,
          instagramHandle: extraction.instagramHandle,
          confidence: extraction.confidence,
          signals: extraction.signals,
          evidence: extraction.evidence,
        });
      }
    } catch {
      stats.failed += 1;
    }
  }

  return {
    discoveryRunId: resolvedRunId,
    extractorVersion,
    dryRun,
    stats,
    preview,
  };
}

export async function listPersistedRawAccountExtractions(input: {
  discoveryRunId?: string;
  platform?: DiscoveryPlatform;
  extractorVersion?: string;
  limit?: number;
}): Promise<DiscoveryExtractionList> {
  const discoveryRunId = String(input.discoveryRunId ?? "").trim();
  const platform = normalizePlatform(input.platform ?? undefined);
  const extractorVersion = String(input.extractorVersion ?? "").trim();
  const limit = clampInt(input.limit, 1, 5000, 100);

  const where: string[] = [];
  const params: any[] = [];

  if (discoveryRunId) {
    params.push(discoveryRunId);
    where.push(`discovery_run_id = $${params.length}`);
  }
  if (platform) {
    params.push(platform);
    where.push(`lower(coalesce(platform, 'unknown')) = $${params.length}`);
  }
  if (extractorVersion) {
    params.push(extractorVersion);
    where.push(`extractor_version = $${params.length}`);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  params.push(limit);

  const rows = await q<PersistedExtractionRow>(
    `select
       id,
       raw_account_id,
       discovery_run_id,
       platform,
       extractor_version,
       stan_url,
       stan_slug,
       all_stan_urls,
       follower_count_estimate,
       platform_profile_url,
       platform_handle,
       instagram_profile_url,
       instagram_handle,
       extraction_confidence,
       evidence,
       created_at::text,
       updated_at::text
     from raw_account_extractions
     ${whereSql}
     order by updated_at desc, created_at desc
     limit $${params.length}`,
    params
  );

  return {
    count: rows.length,
    rows,
  };
}

export function extractRawAccountSamples(
  samples: DiscoveryExtractionSampleInput[]
): DiscoverySampleExtractionRun {
  const out: DiscoveryExtractionRun["preview"] = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const row: RawAccountRow = {
      id: String(sample.rawAccountId ?? `sample_${i + 1}`),
      discovery_run_id: String(sample.discoveryRunId ?? "sample_run"),
      platform: sample.platform ?? "unknown",
      source_url: sample.sourceUrl,
      title: sample.title ?? null,
      snippet: sample.snippet ?? null,
      raw: sample.raw ?? {},
    };
    const extraction = extractDiscoverySignalsFromRawAccount(row);
    out.push({
      rawAccountId: extraction.rawAccountId,
      platform: extraction.platform,
      sourceUrl: extraction.sourceUrl,
      stanUrl: extraction.stanUrl,
      stanSlug: extraction.stanSlug,
      allStanUrls: extraction.allStanUrls,
      followerCountEstimate: extraction.followerCountEstimate,
      platformProfileUrl: extraction.platformProfileUrl,
      platformHandle: extraction.platformHandle,
      instagramProfileUrl: extraction.instagramProfileUrl,
      instagramHandle: extraction.instagramHandle,
      confidence: extraction.confidence,
      signals: extraction.signals,
      evidence: extraction.evidence,
    });
  }

  return {
    count: out.length,
    items: out,
  };
}
