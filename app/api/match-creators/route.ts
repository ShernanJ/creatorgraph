// app/api/match-creators/route.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import { scoreMatch } from "@/lib/match";

export async function POST(req: Request) {
  const { brandId } = await req.json();

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);
  if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });

  const creators = await q<any>(`select * from creators limit 500`);

  const ranked = creators
    .map((c) => {
      const { score, reasons, breakdown } = scoreMatch(
        {
          category: brand.category,
          target_audience: brand.target_audience ?? [],
          goals: brand.goals ?? [],
          preferred_platforms: brand.preferred_platforms ?? [],
          campaign_angles: brand.campaign_angles ?? [], // ✅ added
        },
        {
          id: c.id,
          niche: c.niche,
          platforms: c.platforms ?? [],
          audience_types: c.audience_types ?? [],
          content_style: c.content_style,
          products_sold: c.products_sold ?? [],
          estimated_engagement: c.estimated_engagement,
          metrics: c.metrics ?? {}, // ✅ added (jsonb)
        } as any
      );

      return { creator: c, score, reasons, breakdown };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  // write matches
  for (const r of ranked) {
    await q(
      `insert into matches (id, brand_id, creator_id, score, reasons)
       values ($1,$2,$3,$4,$5::jsonb)
       on conflict do nothing`,
      [
        `mt_${nanoid(10)}`,
        brandId,
        r.creator.id,
        r.score,
        JSON.stringify({ reasons: r.reasons, breakdown: r.breakdown }), // ✅ store explainability
      ]
    );
  }

  return NextResponse.json({
    brandId,
    ranked: ranked.map((r) => ({
      creator: r.creator,
      score: r.score,
      reasons: r.reasons,
      breakdown: r.breakdown,
    })),
  });
}
