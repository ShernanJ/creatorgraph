import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import { normalizeSerpResult } from "./normalize";
import type { DiscoveryCoverageReport, DiscoveryIngestInput, DiscoveryPlatform } from "./types";

function emptyPlatformCounts(): Record<DiscoveryPlatform, number> {
  return { x: 0, instagram: 0, linkedin: 0, tiktok: 0, youtube: 0, unknown: 0 };
}

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

export async function ingestSerpResults(
  payload: DiscoveryIngestInput
): Promise<{ discoveryRunId: string; inserted: number; report: DiscoveryCoverageReport }> {
  const discoveryRunId = payload.discoveryRunId ?? `dr_${nanoid(10)}`;
  let inserted = 0;

  for (let i = 0; i < payload.results.length; i++) {
    const result = payload.results[i];
    const normalized = normalizeSerpResult(result);
    if (!normalized) continue;

    await q(
      `insert into raw_accounts (
         id, discovery_run_id, query, position, title, snippet, source_url,
         normalized_profile_url, platform, handle, stan_slug, follower_count_estimate, raw
       )
       values (
         $1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11,$12,$13::jsonb
       )
       on conflict (discovery_run_id, query, source_url) do update set
         position = excluded.position,
         title = excluded.title,
         snippet = excluded.snippet,
         normalized_profile_url = excluded.normalized_profile_url,
         platform = excluded.platform,
         handle = excluded.handle,
         stan_slug = excluded.stan_slug,
         follower_count_estimate = excluded.follower_count_estimate,
         raw = excluded.raw`,
      [
        `ra_${nanoid(10)}`,
        discoveryRunId,
        payload.query,
        result.position ?? i + 1,
        result.title ?? null,
        result.snippet ?? null,
        result.url,
        normalized.normalizedProfileUrl,
        normalized.platform,
        normalized.handle,
        normalized.stanSlug,
        normalized.followerCountEstimate,
        JSON.stringify(result.raw ?? result),
      ]
    );

    inserted += 1;
  }

  const rows = await q<{
    platform: DiscoveryPlatform | null;
    stan_slug: string | null;
  }>(
    `select platform, stan_slug
     from raw_accounts
     where discovery_run_id=$1`,
    [discoveryRunId]
  );

  const byPlatform = emptyPlatformCounts();
  let withStanSlug = 0;
  for (const row of rows) {
    const platform = (row.platform ?? "unknown") as DiscoveryPlatform;
    byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
    if (row.stan_slug) withStanSlug += 1;
  }

  return {
    discoveryRunId,
    inserted,
    report: {
      discoveryRunId,
      total: rows.length,
      withStanSlug,
      stanSlugCoveragePct: pct(withStanSlug, rows.length),
      byPlatform,
    },
  };
}
