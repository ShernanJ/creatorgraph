/* eslint-disable @typescript-eslint/no-explicit-any */
import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import type { SocialEnrichInput, SocialEnrichResult, SocialEnrichStats } from "./types";

type CandidateIdentityRow = {
  id: string;
  outbound_socials: unknown;
  has_existing_social: boolean;
};

type AccountPlatformRow = {
  platform: string | null;
  followers_estimate: number | null;
  signal_count: number;
};

type CreatorRow = {
  id: string;
  platforms: unknown;
  metrics: unknown;
};

type SocialPlatformSignal = {
  platform: string;
  followersEstimate: number | null;
  avgViewsEstimate: number | null;
  engagementRateEstimate: number;
  sampleSize: number;
  dataQuality: string;
  source: string;
  confidence: number;
  evidence: Record<string, unknown>;
};

const VIEW_RATE_PRIOR: Record<string, number> = {
  instagram: 0.11,
  tiktok: 0.23,
  youtube: 0.18,
  x: 0.07,
  linkedin: 0.09,
  unknown: 0.1,
};

const ENGAGEMENT_PRIOR: Record<string, number> = {
  instagram: 0.032,
  tiktok: 0.053,
  youtube: 0.041,
  x: 0.017,
  linkedin: 0.024,
  unknown: 0.03,
};

function initStats(): SocialEnrichStats {
  return {
    selected: 0,
    processed: 0,
    enriched: 0,
    updated: 0,
    skippedNoSignals: 0,
    skippedLowFollowers: 0,
    failed: 0,
  };
}

function clamp(x: number, min = 0, max = 1) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toInt(value: unknown): number {
  const n = toFiniteNumber(value);
  return n === null ? 0 : Math.max(0, Math.round(n));
}

function normalizePlatform(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("insta")) return "instagram";
  if (v.includes("tiktok") || v === "tt") return "tiktok";
  if (v.includes("youtube") || v.includes("youtu") || v === "yt") return "youtube";
  if (v === "x" || v.includes("x.com") || v.includes("twitter")) return "x";
  if (v.includes("linkedin") || v === "in") return "linkedin";
  if (v === "unknown") return "unknown";
  return null;
}

function platformFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return normalizePlatform(host);
  } catch {
    return null;
  }
}

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {}
    return [v];
  }
  return [];
}

function asObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {}
  }
  return {};
}

function numericPrior(map: Record<string, number>, platform: string) {
  return map[platform] ?? map.unknown;
}

function dataQualityLabel(args: {
  followersEstimate: number | null;
  signalCount: number;
  outboundLinked: boolean;
}) {
  if (args.followersEstimate && args.signalCount >= 2) return "estimated_multi_signal";
  if (args.followersEstimate) return "estimated_single_signal";
  if (args.outboundLinked) return "platform_presence_only";
  return "sparse";
}

function buildSocialSignal(args: {
  platform: string;
  followersEstimate: number | null;
  signalCount: number;
  outboundLinked: boolean;
}): SocialPlatformSignal {
  const platform = args.platform;
  const viewRate = numericPrior(VIEW_RATE_PRIOR, platform);
  const erBase = numericPrior(ENGAGEMENT_PRIOR, platform);

  const hasFollowers = typeof args.followersEstimate === "number" && args.followersEstimate > 0;
  const signalCount = Math.max(0, Math.round(args.signalCount));
  const sampleSize = Math.max(signalCount, args.outboundLinked ? 1 : 0);

  let avgViewsEstimate: number | null = null;
  if (hasFollowers) {
    const signalMultiplier = Math.min(1.3, 0.9 + signalCount * 0.08);
    avgViewsEstimate = Math.max(
      1,
      Math.round((args.followersEstimate as number) * viewRate * signalMultiplier)
    );
  }

  const engagementRateEstimate = clamp(
    erBase +
      Math.min(0.02, Math.max(0, signalCount - 1) * 0.003) +
      (args.outboundLinked ? 0.002 : 0),
    0.008,
    0.2
  );

  let confidence = 0.24;
  if (platform !== "unknown") confidence += 0.1;
  if (hasFollowers) confidence += 0.34;
  if (signalCount >= 2) confidence += 0.14;
  if (signalCount >= 4) confidence += 0.06;
  if (args.outboundLinked) confidence += 0.12;
  if (avgViewsEstimate) confidence += 0.1;
  confidence = clamp(Number(confidence.toFixed(3)), 0.2, 0.95);

  return {
    platform,
    followersEstimate: hasFollowers ? Math.round(args.followersEstimate as number) : null,
    avgViewsEstimate,
    engagementRateEstimate: Number(engagementRateEstimate.toFixed(4)),
    sampleSize,
    dataQuality: dataQualityLabel(args),
    source: "identity_graph_estimate",
    confidence,
    evidence: {
      signal_count: signalCount,
      outbound_linked: args.outboundLinked,
      prior_view_rate: viewRate,
      prior_engagement_rate: erBase,
    },
  };
}

async function selectIdentities(input: SocialEnrichInput): Promise<CandidateIdentityRow[]> {
  if (input.creatorIdentityId) {
    return q<CandidateIdentityRow>(
      `select
         ci.id,
         csp.outbound_socials,
         exists(
           select 1
           from creator_social_profiles sx
           where sx.creator_identity_id = ci.id
         ) as has_existing_social
       from creator_identities ci
       left join creator_stan_profiles csp on csp.creator_identity_id = ci.id
       where ci.id = $1
       limit 1`,
      [input.creatorIdentityId]
    );
  }

  const force = input.force === true;
  return q<CandidateIdentityRow>(
    `select
       ci.id,
       csp.outbound_socials,
       exists(
         select 1
         from creator_social_profiles sx
         where sx.creator_identity_id = ci.id
       ) as has_existing_social
     from creator_identities ci
     left join creator_stan_profiles csp on csp.creator_identity_id = ci.id
     where (
       exists (
         select 1
         from creator_identity_accounts cia
         join raw_accounts ra on ra.id = cia.raw_account_id
         where cia.creator_identity_id = ci.id
       )
       or csp.outbound_socials is not null
     )
       and (${force ? "true" : "not exists (select 1 from creator_social_profiles sx where sx.creator_identity_id = ci.id)"})
     order by coalesce(csp.updated_at, csp.enriched_at, ci.updated_at, ci.created_at) desc
     limit $1`,
    [input.limit ?? 250]
  );
}

async function fetchAccountSignals(identityId: string): Promise<AccountPlatformRow[]> {
  return q<AccountPlatformRow>(
    `select
       lower(coalesce(cia.platform, 'unknown')) as platform,
       max(ra.follower_count_estimate)::int as followers_estimate,
       count(*)::int as signal_count
     from creator_identity_accounts cia
     join raw_accounts ra on ra.id = cia.raw_account_id
     where cia.creator_identity_id = $1
     group by lower(coalesce(cia.platform, 'unknown'))`,
    [identityId]
  );
}

async function upsertSignals(identityId: string, signals: SocialPlatformSignal[]) {
  for (const signal of signals) {
    await q(
      `insert into creator_social_profiles (
         id, creator_identity_id, platform, followers_estimate, avg_views_estimate,
         engagement_rate_estimate, sample_size, data_quality, source,
         extraction_confidence, evidence
       )
       values (
         $1,$2,$3,$4,$5,
         $6,$7,$8,$9,
         $10,$11::jsonb
       )
       on conflict (creator_identity_id, platform) do update set
         followers_estimate = excluded.followers_estimate,
         avg_views_estimate = excluded.avg_views_estimate,
         engagement_rate_estimate = excluded.engagement_rate_estimate,
         sample_size = excluded.sample_size,
         data_quality = excluded.data_quality,
         source = excluded.source,
         extraction_confidence = excluded.extraction_confidence,
         evidence = excluded.evidence,
         enriched_at = now(),
         updated_at = now()`,
      [
        `cspm_${nanoid(10)}`,
        identityId,
        signal.platform,
        signal.followersEstimate,
        signal.avgViewsEstimate,
        signal.engagementRateEstimate,
        signal.sampleSize,
        signal.dataQuality,
        signal.source,
        signal.confidence,
        JSON.stringify(signal.evidence),
      ]
    );
  }
}

function weightedEstimatedEngagement(signals: SocialPlatformSignal[]) {
  const entries = signals.filter((s) => s.engagementRateEstimate > 0);
  if (!entries.length) return null;

  let weighted = 0;
  let sumWeight = 0;
  for (const s of entries) {
    const followerWeight =
      typeof s.followersEstimate === "number" && s.followersEstimate > 0
        ? Math.log10(s.followersEstimate + 10)
        : 1;
    const w = Math.max(0.2, s.confidence) * followerWeight;
    weighted += s.engagementRateEstimate * w;
    sumWeight += w;
  }
  if (sumWeight <= 0) return null;
  return Number((weighted / sumWeight).toFixed(4));
}

function buildPlatformMetrics(signals: SocialPlatformSignal[]) {
  const out: Record<string, unknown> = {};
  for (const s of signals) {
    if (s.platform === "unknown") continue;
    out[s.platform] = {
      followers: s.followersEstimate ?? undefined,
      avg_views: s.avgViewsEstimate ?? undefined,
      engagement_rate: s.engagementRateEstimate,
      confidence: s.confidence,
      sample_size: s.sampleSize,
      source: s.source,
    };
  }
  return out;
}

async function syncCreatorMetrics(identityId: string, signals: SocialPlatformSignal[]) {
  const rows = await q<CreatorRow>(
    `select id, platforms, metrics
     from creators
     where creator_identity_id = $1
     limit 1`,
    [identityId]
  );
  const creator = rows[0];
  if (!creator) return null;

  const currentMetrics = asObject(creator.metrics);
  const currentPlatformMetrics = asObject(currentMetrics.platform_metrics);
  const mergedPlatformMetrics = {
    ...currentPlatformMetrics,
    ...buildPlatformMetrics(signals),
  };
  const avgConfidence =
    signals.length > 0
      ? Number(
          (
            signals.reduce((sum, s) => sum + s.confidence, 0) /
            signals.length
          ).toFixed(4)
        )
      : null;

  const metrics = {
    ...currentMetrics,
    platform_metrics: mergedPlatformMetrics,
    social_performance: {
      source: "identity_graph_estimate",
      updated_at: new Date().toISOString(),
      platforms: signals.length,
      avg_confidence: avgConfidence,
    },
  };

  const existingPlatforms = asStringArray(creator.platforms)
    .map((x) => normalizePlatform(x))
    .filter(
      (x): x is NonNullable<ReturnType<typeof normalizePlatform>> =>
        x !== null && x !== "unknown"
    );
  const inferredPlatforms = signals
    .map((s) => s.platform)
    .filter((p) => p !== "unknown");
  const mergedPlatforms = uniqStrings([...existingPlatforms, ...inferredPlatforms]);

  await q(
    `update creators
     set platforms = $2::jsonb,
         estimated_engagement = $3,
         metrics = $4::jsonb
     where id = $1`,
    [
      creator.id,
      JSON.stringify(mergedPlatforms),
      weightedEstimatedEngagement(signals),
      JSON.stringify(metrics),
    ]
  );

  return creator.id;
}

export async function enrichSocialMetrics(input: SocialEnrichInput = {}): Promise<SocialEnrichResult> {
  const stats = initStats();
  const results: SocialEnrichResult["results"] = [];
  const identities = await selectIdentities(input);
  const minFollowerEstimate = Math.max(0, Math.round(input.minFollowerEstimate ?? 0));

  stats.selected = identities.length;

  for (const identity of identities) {
    stats.processed += 1;

    try {
      const accountRows = await fetchAccountSignals(identity.id);
      const accountMap = new Map<
        string,
        {
          followersEstimate: number | null;
          signalCount: number;
        }
      >();

      for (const row of accountRows) {
        const platform = normalizePlatform(String(row.platform ?? "")) ?? "unknown";
        const prev = accountMap.get(platform);
        const followers = toFiniteNumber(row.followers_estimate);
        const signalCount = toInt(row.signal_count);
        const nextFollowers =
          prev && typeof prev.followersEstimate === "number"
            ? Math.max(prev.followersEstimate, followers ?? 0)
            : followers;
        accountMap.set(platform, {
          followersEstimate: nextFollowers ?? null,
          signalCount: (prev?.signalCount ?? 0) + signalCount,
        });
      }

      const outboundPlatforms = new Set(
        asStringArray(identity.outbound_socials)
          .map((x) => platformFromUrl(x))
          .filter((x): x is string => Boolean(x))
      );
      const candidatePlatforms = uniqStrings([
        ...Array.from(accountMap.keys()),
        ...Array.from(outboundPlatforms.values()),
      ]);

      if (candidatePlatforms.length === 0) {
        stats.skippedNoSignals += 1;
        results.push({
          creatorIdentityId: identity.id,
          status: "skipped",
          reason: "no social account signals found",
        });
        continue;
      }

      let filteredLowFollowers = 0;
      const signals: SocialPlatformSignal[] = [];
      for (const platform of candidatePlatforms) {
        const account = accountMap.get(platform);
        const followersEstimate = account?.followersEstimate ?? null;
        const signalCount = account?.signalCount ?? 0;
        if (
          minFollowerEstimate > 0 &&
          typeof followersEstimate === "number" &&
          followersEstimate > 0 &&
          followersEstimate < minFollowerEstimate
        ) {
          filteredLowFollowers += 1;
          continue;
        }

        const outboundLinked = outboundPlatforms.has(platform);
        if (signalCount <= 0 && !outboundLinked) continue;

        signals.push(
          buildSocialSignal({
            platform,
            followersEstimate,
            signalCount,
            outboundLinked,
          })
        );
      }

      if (!signals.length) {
        stats.skippedLowFollowers += 1;
        results.push({
          creatorIdentityId: identity.id,
          status: "skipped",
          reason:
            filteredLowFollowers > 0
              ? "all signals filtered by minFollowerEstimate"
              : "insufficient social signals after filtering",
        });
        continue;
      }

      let syncedCreatorId: string | null = null;
      if (!input.dryRun) {
        await upsertSignals(identity.id, signals);
        syncedCreatorId = await syncCreatorMetrics(identity.id, signals);
      }

      const status = identity.has_existing_social ? "updated" : "enriched";
      if (status === "updated") stats.updated += 1;
      else stats.enriched += 1;

      results.push({
        creatorIdentityId: identity.id,
        status,
        platformCount: signals.length,
        syncedCreatorId,
      });
    } catch (err: any) {
      stats.failed += 1;
      results.push({
        creatorIdentityId: identity.id,
        status: "failed",
        reason: err?.message ?? "unknown error",
      });
    }
  }

  return {
    dryRun: Boolean(input.dryRun),
    filters: {
      creatorIdentityId: input.creatorIdentityId ?? null,
      force: Boolean(input.force),
      limit: input.limit ?? 250,
      minFollowerEstimate,
    },
    stats,
    results,
  };
}
