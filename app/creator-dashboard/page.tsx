/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { q } from "@/lib/db";

export default async function CreatorDashboard(props: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { brandId } = await props.searchParams;

  const rows = brandId
    ? await q<any>(
        `select m.status, m.score, m.reasons, b.name as brand_name, c.name as creator_name
         from matches m
         join brands b on b.id = m.brand_id
         join creators c on c.id = m.creator_id
         where m.brand_id=$1
         order by m.score desc
         limit 12`,
        [brandId]
      )
    : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <h1 className="text-3xl font-semibold">creator opportunities</h1>
      <p className="text-white/70">
        imagine this as a new tab inside stan: inbound brand opportunities,
        ranked + explained.
      </p>

      {!brandId ? (
        <p className="text-white/60">
          add{" "}
          <code className="bg-white/10 px-2 py-1 rounded">
            ?brandId=...
          </code>{" "}
          to view opportunities.
        </p>
      ) : null}

      <div className="space-y-3">
        {rows.map((r: any, i: number) => (
          <div
            key={i}
            className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold">{r.brand_name}</p>
              <p className="text-sm bg-white/10 rounded-lg px-2 py-1">
                {(Number(r.score) * 100).toFixed(0)}%
              </p>
            </div>
            <p className="text-sm text-white/60">
              for: {r.creator_name} • {(r.reasons ?? []).join(" • ")}
            </p>
            <p className="text-sm text-white/60 mt-2">status: {r.status}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
