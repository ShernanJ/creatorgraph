// app/api/match-creators/route.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import { scoreMatch } from "@/lib/match";

function asStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {}
  }
  return [];
}

function asObject(v: any): Record<string, unknown> {
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
  for (const raw of values) {
    const value = String(raw ?? "").trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseRankingDirectives(raw: any) {
  if (!raw || typeof raw !== "object") {
    return {
      priorityNiches: [] as string[],
      priorityTopics: [] as string[],
      preferredPlatforms: [] as string[],
    };
  }
  return {
    priorityNiches: uniqStrings(asStringArray(raw.priorityNiches)),
    priorityTopics: uniqStrings(asStringArray(raw.priorityTopics)),
    preferredPlatforms: uniqStrings(asStringArray(raw.preferredPlatforms)),
  };
}

type MatchCreatorSourceScope = "auto" | "stan_pipeline" | "all";

type CreatorPoolSelection = {
  creators: any[];
  sourceTable: "creators" | "synthetic_creators";
  sourceScope: MatchCreatorSourceScope;
  persistedMatches: boolean;
};

const CREATOR_SELECT_WITH_STAN_IMAGE = `
  select
    c.*,
    coalesce(
      nullif(c.metrics->'import_meta'->>'stan_header_image_url', ''),
      csp.header_image_url
    ) as profile_photo_url
  from creators c
  left join creator_stan_profiles csp on csp.creator_identity_id = c.creator_identity_id
`;

async function selectCreatorPool(limit: number, sourceScope: MatchCreatorSourceScope): Promise<CreatorPoolSelection> {
  const sourceScoped = sourceScope === "stan_pipeline";
  const allCreators = sourceScope === "all";

  if (sourceScoped) {
    const scoped = await q<any>(
      `${CREATOR_SELECT_WITH_STAN_IMAGE}
       where c.source = 'stan_pipeline'
       order by c.imported_at desc nulls last, c.created_at desc nulls last, c.id asc
       limit $1`,
      [limit]
    );
    return {
      creators: scoped,
      sourceTable: "creators",
      sourceScope,
      persistedMatches: true,
    };
  }

  if (allCreators) {
    const all = await q<any>(
      `${CREATOR_SELECT_WITH_STAN_IMAGE}
       order by c.imported_at desc nulls last, c.created_at desc nulls last, c.id asc
       limit $1`,
      [limit]
    );
    if (all.length) {
      return {
        creators: all,
        sourceTable: "creators",
        sourceScope,
        persistedMatches: true,
      };
    }
  } else {
    // auto mode: prefer imported pipeline creators, then identity-backed creators, then all creators.
    const pipeline = await q<any>(
      `${CREATOR_SELECT_WITH_STAN_IMAGE}
       where c.source = 'stan_pipeline'
       order by c.imported_at desc nulls last, c.created_at desc nulls last, c.id asc
       limit $1`,
      [limit]
    );
    if (pipeline.length) {
      return {
        creators: pipeline,
        sourceTable: "creators",
        sourceScope,
        persistedMatches: true,
      };
    }

    const identityBacked = await q<any>(
      `${CREATOR_SELECT_WITH_STAN_IMAGE}
       where c.creator_identity_id is not null
       order by c.imported_at desc nulls last, c.created_at desc nulls last, c.id asc
       limit $1`,
      [limit]
    );
    if (identityBacked.length) {
      return {
        creators: identityBacked,
        sourceTable: "creators",
        sourceScope,
        persistedMatches: true,
      };
    }

    const all = await q<any>(
      `${CREATOR_SELECT_WITH_STAN_IMAGE}
       order by c.imported_at desc nulls last, c.created_at desc nulls last, c.id asc
       limit $1`,
      [limit]
    );
    if (all.length) {
      return {
        creators: all,
        sourceTable: "creators",
        sourceScope,
        persistedMatches: true,
      };
    }
  }

  const synthetic = await q<any>(`select * from synthetic_creators limit $1`, [limit]);
  return {
    creators: synthetic,
    sourceTable: "synthetic_creators",
    sourceScope,
    persistedMatches: false,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const limit = typeof body?.limit === "number" && body.limit > 0 ? Math.min(500, body.limit) : 500;
  const sourceScopeRaw = String(body?.creatorSource ?? "auto").trim().toLowerCase();
  const sourceScope: MatchCreatorSourceScope =
    sourceScopeRaw === "stan_pipeline" || sourceScopeRaw === "all" ? sourceScopeRaw : "auto";
  if (!brandId) {
    return NextResponse.json({ error: "missing brandId" }, { status: 400 });
  }
  const rankingDirectives = parseRankingDirectives(body?.rankingDirectives);

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);
  if (!brand) {
    return NextResponse.json({ error: "brand not found" }, { status: 404 });
  }

  const pool = await selectCreatorPool(limit, sourceScope);
  const creators = pool.creators;
  const sourceTable = pool.sourceTable;
  const persistedMatches = pool.persistedMatches;

  const mergedPreferredPlatforms = uniqStrings([
    ...asStringArray(brand.preferred_platforms),
    ...rankingDirectives.preferredPlatforms,
  ]);
  const brandGoals = asStringArray(brand.goals);
  const brandCampaignAngles = asStringArray(brand.campaign_angles);
  const brandMatchTopics = asStringArray(brand.match_topics);
  const brandAudiences = asStringArray(brand.target_audience);

  const ranked = creators
    .map((c) => {
      const { score, reasons, breakdown } = scoreMatch(
        {
          category: brand.category,
          target_audience: brandAudiences,
          goals: brandGoals,
          preferred_platforms: mergedPreferredPlatforms,
          campaign_angles: brandCampaignAngles,
          match_topics: brandMatchTopics,
          priority_niches: rankingDirectives.priorityNiches,
          priority_topics: rankingDirectives.priorityTopics,
        } as any,
        {
          id: c.id,
          niche: c.niche,
          platforms: asStringArray(c.platforms),
          audience_types: asStringArray(c.audience_types),
          content_style: c.content_style,
          products_sold: asStringArray(c.products_sold),
          estimated_engagement: c.estimated_engagement,
          metrics: asObject(c.metrics),
        } as any
      );

      return { creator: c, score, reasons, breakdown };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (persistedMatches) {
    for (const r of ranked) {
      await q(
        `insert into matches (id, brand_id, creator_id, score, reasons)
         values ($1,$2,$3,$4,$5::jsonb)
         on conflict (brand_id, creator_id) do update set
           score = excluded.score,
           reasons = excluded.reasons`,
        [
          `mt_${nanoid(10)}`,
          brandId,
          r.creator.id,
          r.score,
          JSON.stringify({ reasons: r.reasons, breakdown: r.breakdown }),
        ]
      );
    }
  }

  return NextResponse.json({
    brandId,
    rankingDirectives,
    sourceTable,
    creatorSource: sourceScope,
    creatorPoolCount: creators.length,
    persistedMatches,
    ranked: ranked.map((r) => ({
      creator: r.creator,
      score: r.score,
      reasons: r.reasons,
      breakdown: r.breakdown,
    })),
  });
}
