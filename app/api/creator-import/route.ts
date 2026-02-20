/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/db";

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
  bio_description: string | null;
  product_types: unknown;
  offers: unknown;
  outbound_socials: unknown;
  cta_style: string | null;
  extracted_confidence: number | null;
  platforms: unknown;
  handles: unknown;
  profile_urls: unknown;
  source_urls: unknown;
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

function normalizePlatform(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("insta")) return "instagram";
  if (v.includes("tiktok") || v === "tt") return "tiktok";
  if (v.includes("youtube") || v.includes("youtu") || v === "yt") return "youtube";
  if (v === "x" || v.includes("x.com") || v.includes("twitter")) return "x";
  if (v.includes("linkedin") || v === "in") return "linkedin";
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

type NicheInference = {
  niche: string;
  topics: string[];
  audiences: string[];
};

const NICHE_RULES: Array<{ pattern: RegExp; result: NicheInference }> = [
  {
    pattern: /\b(fitness|gym|workout|nutrition|weight loss|wellness)\b/i,
    result: {
      niche: "fitness coaching",
      topics: ["gym routines", "fitness", "nutrition", "weight loss"],
      audiences: ["gym beginners", "wellness seekers"],
    },
  },
  {
    pattern: /\b(finance|invest|credit|debt|budget|money)\b/i,
    result: {
      niche: "personal finance",
      topics: ["budgeting", "saving", "investing", "credit"],
      audiences: ["young professionals", "students"],
    },
  },
  {
    pattern: /\b(skincare|beauty|makeup|fashion)\b/i,
    result: {
      niche: "beauty & skincare",
      topics: ["skincare", "beauty", "product reviews"],
      audiences: ["beauty shoppers", "women 18-34"],
    },
  },
  {
    pattern: /\b(ecommerce|shopify|ads|marketing|conversion)\b/i,
    result: {
      niche: "ecommerce & marketing",
      topics: ["growth marketing", "ecommerce", "creative testing"],
      audiences: ["store owners", "marketers"],
    },
  },
  {
    pattern: /\b(ai|automation|prompt|agent|productivity)\b/i,
    result: {
      niche: "ai productivity",
      topics: ["ai tools", "automation", "productivity"],
      audiences: ["founders", "operators"],
    },
  },
  {
    pattern: /\b(real estate|housing|mortgage|property)\b/i,
    result: {
      niche: "real estate investing",
      topics: ["real estate", "investing", "cash flow"],
      audiences: ["first time investors", "side hustlers"],
    },
  },
  {
    pattern: /\b(coach|coaching|consulting|mentorship)\b/i,
    result: {
      niche: "business coaching",
      topics: ["coaching", "offers", "positioning"],
      audiences: ["coaches", "solopreneurs"],
    },
  },
];

function inferNicheAndTopics(row: CandidateRow): NicheInference {
  const blob = [
    row.bio_description ?? "",
    ...asStringArray(row.product_types),
    ...asStringArray(row.offers),
    row.canonical_stan_slug ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const matched = NICHE_RULES.find((rule) => rule.pattern.test(blob));
  if (matched) return matched.result;

  return {
    niche: "creator monetization",
    topics: ["creator economy", "digital products", "audience growth"],
    audiences: ["content creators", "solopreneurs"],
  };
}

function inferProducts(row: CandidateRow) {
  const explicit = asStringArray(row.product_types);
  if (explicit.length) return uniqStrings(explicit).slice(0, 8);

  const offers = asStringArray(row.offers).join(" ").toLowerCase();
  const out: string[] = [];
  if (/\b(course|program)\b/.test(offers)) out.push("course");
  if (/\b(coaching|consult)\b/.test(offers)) out.push("coaching");
  if (/\b(template|notion)\b/.test(offers)) out.push("template");
  if (/\b(community|membership)\b/.test(offers)) out.push("membership");
  if (/\b(newsletter|substack)\b/.test(offers)) out.push("newsletter");
  if (/\b(ebook|guide|pdf)\b/.test(offers)) out.push("digital guide");
  return uniqStrings(out).slice(0, 8);
}

function inferContentStyle(row: CandidateRow) {
  const cta = String(row.cta_style ?? "").toLowerCase();
  if (cta === "consultative") return "consultative coaching-style content";
  if (cta === "transactional") return "direct response offer-led content";
  if (cta === "community") return "community and newsletter-led content";
  if (cta === "inbound_dm") return "personal brand and DM-led conversion content";
  return "educational creator content";
}

function gatherPlatforms(row: CandidateRow) {
  const fromAccounts = asStringArray(row.platforms)
    .map((x) => normalizePlatform(String(x)))
    .filter((x): x is string => Boolean(x));
  const fromLinks = asStringArray(row.outbound_socials)
    .map((x) => platformFromUrl(String(x)))
    .filter((x): x is string => Boolean(x));
  return uniqStrings([...fromAccounts, ...fromLinks]);
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
        jsonb_agg(distinct cia.source_url) filter (where cia.source_url is not null) as source_urls
      from creator_identity_accounts cia
      group by cia.creator_identity_id
    )
    select
      ci.id as creator_identity_id,
      ci.canonical_stan_slug,
      csp.stan_url,
      csp.bio_description,
      csp.product_types,
      csp.offers,
      csp.outbound_socials,
      csp.cta_style,
      csp.extracted_confidence,
      aa.platforms,
      aa.handles,
      aa.profile_urls,
      aa.source_urls,
      exists(select 1 from creators c where c.creator_identity_id = ci.id) as already_imported
    from creator_identities ci
    left join creator_stan_profiles csp on csp.creator_identity_id = ci.id
    left join account_agg aa on aa.creator_identity_id = ci.id
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
    const inferred = inferNicheAndTopics(row);
    const products = inferProducts(row);
    const platforms = gatherPlatforms(row);
    const sampleLinks = gatherSampleLinks(row);
    const contentStyle = inferContentStyle(row);
    const creatorId = creatorIdForIdentity(row.creator_identity_id);
    const nowIso = new Date().toISOString();

    const metrics = {
      top_topics: uniqStrings([...inferred.topics, ...products]).slice(0, 8),
      platform_metrics: {},
      import_meta: {
        source: "stan_pipeline",
        creator_identity_id: row.creator_identity_id,
        canonical_stan_slug: row.canonical_stan_slug,
        extracted_confidence: row.extracted_confidence ?? null,
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
          inferred.niche,
          JSON.stringify(platforms),
          JSON.stringify(inferred.audiences),
          contentStyle,
          JSON.stringify(products),
          JSON.stringify(sampleLinks),
          null,
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
        niche: inferred.niche,
      });
    } else {
      stats.imported += 1;
      results.push({
        creatorIdentityId: row.creator_identity_id,
        creatorId,
        status: "imported",
        name,
        niche: inferred.niche,
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
