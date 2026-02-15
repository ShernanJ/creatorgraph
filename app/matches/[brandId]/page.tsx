/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { q } from "@/lib/db";

async function computeMatchesIfNeeded(brandId: string) {
  const existing = await q<{ c: number }>(
    `select count(*)::int as c from matches where brand_id=$1`,
    [brandId]
  );

  if ((existing?.[0]?.c ?? 0) > 0) return;

  const base =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  await fetch(`${base}/api/match-creators`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId }),
    cache: "no-store",
  });
}

export default async function MatchesPage(props: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await props.params;

  await computeMatchesIfNeeded(brandId);

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);

  const matches = await q<any>(
    `select m.score, m.reasons, c.*
     from matches m
     join creators c on c.id = m.creator_id
     where m.brand_id=$1
     order by m.score desc
     limit 12`,
    [brandId]
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">creator matches</h1>
        <p className="text-white/70">{brand?.name ?? brandId}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {matches.map((m: any) => (
          <div
            key={m.id}
            className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{m.name}</p>
                <p className="text-white/60 text-sm">
                  {m.niche} • {(m.platforms ?? []).join(", ")}
                </p>
              </div>
              <div className="text-sm rounded-lg bg-white/10 px-2 py-1">
                {(Number(m.score) * 100).toFixed(0)}%
              </div>
            </div>

            <p className="text-sm text-white/70">
              {(m.reasons ?? []).join(" • ") || "—"}
            </p>

            <div className="flex gap-3 flex-wrap">
              <Link
                href={`/creator/${m.id}?brandId=${brandId}`}
                className="inline-flex rounded-xl bg-white text-black px-3 py-2 font-medium"
              >
                generate outreach →
              </Link>

              <a
                href={(m.sample_links ?? [])[0] || "#"}
                className="inline-flex rounded-xl bg-white/10 text-white px-3 py-2 font-medium ring-1 ring-white/15"
              >
                view creator →
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6">
        <Link
          href={`/creator-dashboard?brandId=${brandId}`}
          className="text-white/70 underline underline-offset-4"
        >
          view creator-side opportunity feed →
        </Link>
      </div>
    </main>
  );
}
