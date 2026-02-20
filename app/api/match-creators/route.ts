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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  if (!brandId) {
    return NextResponse.json({ error: "missing brandId" }, { status: 400 });
  }
  const rankingDirectives = parseRankingDirectives(body?.rankingDirectives);

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);
  if (!brand) {
    return NextResponse.json({ error: "brand not found" }, { status: 404 });
  }

  const creators = await q<any>(`select * from creators limit 500`);
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
          platforms: c.platforms ?? [],
          audience_types: c.audience_types ?? [],
          content_style: c.content_style,
          products_sold: c.products_sold ?? [],
          estimated_engagement: c.estimated_engagement,
          metrics: c.metrics ?? {},
        } as any
      );

      return { creator: c, score, reasons, breakdown };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

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

  return NextResponse.json({
    brandId,
    rankingDirectives,
    ranked: ranked.map((r) => ({
      creator: r.creator,
      score: r.score,
      reasons: r.reasons,
      breakdown: r.breakdown,
    })),
  });
}
