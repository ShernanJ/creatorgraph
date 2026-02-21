/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/db";
import { extractCompatibilitySignals } from "@/lib/creator/import/extractCompatibilitySignals";

const bodySchema = z.object({
  creatorIdentityId: z.string().min(3).optional(),
  limit: z.number().int().positive().max(5000).optional(),
  force: z.boolean().optional(),
  requireStanProfile: z.boolean().optional(),
  minStanConfidence: z.number().min(0).max(1).optional(),
  dryRun: z.boolean().optional(),
});

type CandidateRow = {
  creator_identity_id: string;
  canonical_stan_slug: string | null;
  stan_url: string | null;
  header_image_url: string | null;
  bio_description: string | null;
  pricing_points: unknown;
  product_types: unknown;
  offers: unknown;
  outbound_socials: unknown;
  cta_style: string | null;
  extracted_confidence: number | null;
  platforms: unknown;
  handles: unknown;
  profile_urls: unknown;
  source_urls: unknown;
  account_titles: unknown;
  account_snippets: unknown;
  account_queries: unknown;
  social_platform_metrics: unknown;
  social_estimated_engagement: number | null;
  social_avg_confidence: number | null;
  already_imported: boolean;
};

type ImportStats = {
  selected: number;
  skippedMissingProfile: number;
  skippedLowConfidence: number;
  imported: number;
  updated: number;
};

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

function titleCaseFromHandle(handle: string) {
  const cleaned = handle.replace(/^@+/, "").replace(/[_\-.]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function displayNameForCandidate(row: CandidateRow) {
  const handles = asStringArray(row.handles);
  const fromHandle = handles.find(Boolean);
  if (fromHandle) return titleCaseFromHandle(fromHandle);

  const stanSlug = String(row.canonical_stan_slug ?? "").trim();
  if (stanSlug) return titleCaseFromHandle(stanSlug);

  return `Creator ${row.creator_identity_id.replace(/^ci_/, "").slice(0, 8)}`;
}

function gatherSampleLinks(row: CandidateRow) {
  const links = uniqStrings([
    row.stan_url ?? "",
    ...asStringArray(row.profile_urls),
    ...asStringArray(row.source_urls),
    ...asStringArray(row.outbound_socials),
  ]);
  return links.slice(0, 24);
}

function creatorIdForIdentity(identityId: string) {
  return `cr_real_${identityId.replace(/^ci_/, "")}`;
}

async function fetchCandidates(input: z.infer<typeof bodySchema>): Promise<CandidateRow[]> {
  const params: any[] = [];
  const where: string[] = [];

  if (input.creatorIdentityId) {
    params.push(input.creatorIdentityId);
    where.push(`ci.id = $${params.length}`);
  }

  if (input.requireStanProfile !== false) {
    where.push(`csp.creator_identity_id is not null`);
  }

  const minConfidence = input.minStanConfidence ?? 0.35;
  where.push(`coalesce(csp.extracted_confidence, 0) >= ${Number(minConfidence.toFixed(2))}`);

  if (!input.force) {
    where.push(`not exists (select 1 from creators c where c.creator_identity_id = ci.id)`);
  }

  params.push(input.limit ?? 250);
  const limitRef = `$${params.length}`;

  const sql = `
    with account_agg as (
      select
        cia.creator_identity_id,
        jsonb_agg(distinct cia.platform) filter (where cia.platform is not null) as platforms,
        jsonb_agg(distinct cia.handle) filter (where cia.handle is not null) as handles,
        jsonb_agg(distinct cia.normalized_profile_url) filter (where cia.normalized_profile_url is not null) as profile_urls,
        jsonb_agg(distinct cia.source_url) filter (where cia.source_url is not null) as source_urls,
        jsonb_agg(distinct ra.title) filter (where ra.title is not null) as account_titles,
        jsonb_agg(distinct ra.snippet) filter (where ra.snippet is not null) as account_snippets,
        jsonb_agg(distinct ra.query) filter (where ra.query is not null) as account_queries
      from creator_identity_accounts cia
      join raw_accounts ra on ra.id = cia.raw_account_id
      group by cia.creator_identity_id
    ),
    social_agg as (
      select
        csp.creator_identity_id,
        jsonb_object_agg(
          csp.platform,
          jsonb_strip_nulls(
            jsonb_build_object(
              'followers', csp.followers_estimate,
              'avg_views', csp.avg_views_estimate,
              'engagement_rate', csp.engagement_rate_estimate,
              'confidence', csp.extraction_confidence,
              'sample_size', csp.sample_size,
              'source', csp.source
            )
          )
        ) filter (where csp.platform is not null and csp.platform <> 'unknown') as platform_metrics,
        avg(csp.engagement_rate_estimate) filter (where csp.engagement_rate_estimate is not null) as estimated_engagement,
        avg(csp.extraction_confidence) filter (where csp.extraction_confidence is not null) as avg_confidence
      from creator_social_profiles csp
      group by csp.creator_identity_id
    )
    select
      ci.id as creator_identity_id,
      ci.canonical_stan_slug,
      csp.stan_url,
      csp.header_image_url,
      csp.bio_description,
      csp.pricing_points,
      csp.product_types,
      csp.offers,
      csp.outbound_socials,
      csp.cta_style,
      csp.extracted_confidence,
      aa.platforms,
      aa.handles,
      aa.profile_urls,
      aa.source_urls,
      aa.account_titles,
      aa.account_snippets,
      aa.account_queries,
      sa.platform_metrics as social_platform_metrics,
      sa.estimated_engagement as social_estimated_engagement,
      sa.avg_confidence as social_avg_confidence,
      exists(select 1 from creators c where c.creator_identity_id = ci.id) as already_imported
    from creator_identities ci
    left join creator_stan_profiles csp on csp.creator_identity_id = ci.id
    left join account_agg aa on aa.creator_identity_id = ci.id
    left join social_agg sa on sa.creator_identity_id = ci.id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by coalesce(csp.updated_at, csp.enriched_at, ci.updated_at, ci.created_at) desc
    limit ${limitRef}
  `;

  return q<CandidateRow>(sql, params);
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
  const rows = await fetchCandidates(input);

  const stats: ImportStats = {
    selected: rows.length,
    skippedMissingProfile: 0,
    skippedLowConfidence: 0,
    imported: 0,
    updated: 0,
  };

  const results: Array<{
    creatorIdentityId: string;
    creatorId: string;
    status: "imported" | "updated" | "skipped";
    reason?: string;
    niche?: string;
    name?: string;
    signals?: {
      confidence: number;
      nicheConfidence: number;
      buyingIntentScore: number;
      primaryPlatform: string | null;
      topTopics: string[];
      intentSignals: string[];
    };
  }> = [];

  for (const row of rows) {
    if (!row.stan_url && input.requireStanProfile !== false) {
      stats.skippedMissingProfile += 1;
      results.push({
        creatorIdentityId: row.creator_identity_id,
        creatorId: creatorIdForIdentity(row.creator_identity_id),
        status: "skipped",
        reason: "missing stan profile",
      });
      continue;
    }

    const name = displayNameForCandidate(row);
    const signals = extractCompatibilitySignals({
      canonicalStanSlug: row.canonical_stan_slug,
      bioDescription: row.bio_description,
      offers: asStringArray(row.offers),
      pricingPoints: asStringArray(row.pricing_points),
      productTypes: asStringArray(row.product_types),
      outboundSocials: asStringArray(row.outbound_socials),
      ctaStyle: row.cta_style,
      accountTitles: asStringArray(row.account_titles),
      accountSnippets: asStringArray(row.account_snippets),
      accountQueries: asStringArray(row.account_queries),
      accountPlatforms: asStringArray(row.platforms),
      profileUrls: asStringArray(row.profile_urls),
      sourceUrls: asStringArray(row.source_urls),
      socialPlatformMetrics: asObject(row.social_platform_metrics),
      socialEstimatedEngagement: row.social_estimated_engagement,
      stanConfidence: row.extracted_confidence,
      socialConfidence: row.social_avg_confidence,
    });

    const products = signals.productsSold;
    const platforms = signals.platforms;
    const sampleLinks = gatherSampleLinks(row);
    const contentStyle = signals.contentStyle;
    const creatorId = creatorIdForIdentity(row.creator_identity_id);
    const nowIso = new Date().toISOString();
    const socialAvgConfidence =
      typeof row.social_avg_confidence === "number" && Number.isFinite(row.social_avg_confidence)
        ? Number(row.social_avg_confidence.toFixed(4))
        : null;
    const estimatedEngagement =
      typeof signals.estimatedEngagement === "number" && Number.isFinite(signals.estimatedEngagement)
        ? signals.estimatedEngagement
        : null;

    const metrics = {
      top_topics: signals.topTopics,
      platform_metrics: signals.platformMetrics,
      compatibility_signals: {
        niche_confidence: signals.nicheConfidence,
        buying_intent_score: signals.buyingIntentScore,
        selling_style: signals.sellingStyle,
        intent_signals: signals.intentSignals,
        match_topics: signals.topTopics,
        audience_signals: signals.audienceTypes,
        primary_platform: signals.primaryPlatform,
        confidence: signals.confidence,
        evidence: signals.evidence,
      },
      social_performance: {
        avg_confidence: socialAvgConfidence,
        platforms: Object.keys(signals.platformMetrics).length,
        primary_platform: signals.primaryPlatform,
      },
      import_meta: {
        source: "stan_pipeline",
        creator_identity_id: row.creator_identity_id,
        canonical_stan_slug: row.canonical_stan_slug,
        stan_header_image_url: row.header_image_url ?? null,
        extracted_confidence: row.extracted_confidence ?? null,
        social_avg_confidence: socialAvgConfidence,
        compatibility_confidence: signals.confidence,
        imported_at: nowIso,
      },
    };

    if (!input.dryRun) {
      await q(
        `insert into creators (
          id, creator_identity_id, source, imported_at,
          name, niche, platforms, audience_types, content_style,
          products_sold, sample_links, estimated_engagement, metrics
        )
        values (
          $1,$2,'stan_pipeline',now(),
          $3,$4,$5::jsonb,$6::jsonb,$7,
          $8::jsonb,$9::jsonb,$10,$11::jsonb
        )
        on conflict (id) do update set
          creator_identity_id = excluded.creator_identity_id,
          source = excluded.source,
          imported_at = now(),
          name = excluded.name,
          niche = excluded.niche,
          platforms = excluded.platforms,
          audience_types = excluded.audience_types,
          content_style = excluded.content_style,
          products_sold = excluded.products_sold,
          sample_links = excluded.sample_links,
          estimated_engagement = excluded.estimated_engagement,
          metrics = excluded.metrics`,
        [
          creatorId,
          row.creator_identity_id,
          name,
          signals.niche,
          JSON.stringify(platforms),
          JSON.stringify(signals.audienceTypes),
          contentStyle,
          JSON.stringify(products),
          JSON.stringify(sampleLinks),
          estimatedEngagement,
          JSON.stringify(metrics),
        ]
      );
    }

    if (row.already_imported) {
      stats.updated += 1;
      results.push({
        creatorIdentityId: row.creator_identity_id,
        creatorId,
        status: "updated",
        name,
        niche: signals.niche,
        signals: {
          confidence: signals.confidence,
          nicheConfidence: signals.nicheConfidence,
          buyingIntentScore: signals.buyingIntentScore,
          primaryPlatform: signals.primaryPlatform,
          topTopics: signals.topTopics.slice(0, 6),
          intentSignals: signals.intentSignals,
        },
      });
    } else {
      stats.imported += 1;
      results.push({
        creatorIdentityId: row.creator_identity_id,
        creatorId,
        status: "imported",
        name,
        niche: signals.niche,
        signals: {
          confidence: signals.confidence,
          nicheConfidence: signals.nicheConfidence,
          buyingIntentScore: signals.buyingIntentScore,
          primaryPlatform: signals.primaryPlatform,
          topTopics: signals.topTopics.slice(0, 6),
          intentSignals: signals.intentSignals,
        },
      });
    }
  }

  return NextResponse.json({
    dryRun: Boolean(input.dryRun),
    filters: {
      creatorIdentityId: input.creatorIdentityId ?? null,
      force: Boolean(input.force),
      requireStanProfile: input.requireStanProfile !== false,
      minStanConfidence: input.minStanConfidence ?? 0.35,
      limit: input.limit ?? 250,
    },
    stats,
    results,
  });
}
