/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { q } from "@/lib/db";
import BrandChatExperience from "@/app/brand/BrandChatExperience";

function asArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {}
    if (v.includes(",")) return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export default async function BrandPage(props: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await props.params;

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);
  if (!brand) {
    return (
      <main className="min-h-screen w-full bg-[#2c2f3a] text-white">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(1100px_650px_at_50%_40%,rgba(110,120,255,0.12),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_100%,rgba(130,70,255,0.10),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)]" />
        </div>
        <section className="mx-auto max-w-2xl px-6 py-16">
          <p>brand not found</p>
        </section>
      </main>
    );
  }

  const [pageStats] = await q<{ c: number; latest: string | null }>(
    `select count(*)::int as c, max(fetched_at)::text as latest
     from brand_pages
     where brand_id=$1`,
    [brandId]
  );

  return (
    <BrandChatExperience
      brand={{
        id: brand.id,
        name: brand.name,
        website: brand.website,
        category: brand.category ?? null,
        budgetRange: brand.budget_range ?? null,
        targetAudience: asArray(brand.target_audience),
        goals: asArray(brand.goals),
        preferredPlatforms: asArray(brand.preferred_platforms),
        campaignAngles: asArray(brand.campaign_angles),
        matchTopics: asArray(brand.match_topics),
        rawSummary: brand.raw_summary ?? "",
      }}
      crawlSummary={{
        pageCount: pageStats?.c ?? 0,
        lastFetched: pageStats?.latest ?? null,
      }}
    />
  );
}
