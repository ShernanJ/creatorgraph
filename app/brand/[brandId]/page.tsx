/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { q } from "@/lib/db";

export default async function BrandPage(props: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await props.params;

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);

  if (!brand) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p>brand not found</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{brand.name}</h1>
        <p className="text-white/70">{brand.website}</p>
      </div>

      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 space-y-4">
        <h2 className="text-lg font-semibold">auto-built brand profile</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="category" value={brand.category ?? "—"} />
          <Field label="budget" value={brand.budget_range ?? "—"} />
          <Field
            label="preferred platforms"
            value={(brand.preferred_platforms ?? []).join(", ") || "—"}
          />
          <Field label="goals" value={(brand.goals ?? []).join(", ") || "—"} />
        </div>

        <div className="space-y-1">
          <p className="text-sm text-white/60">summary</p>
          <p className="text-white/85">{brand.raw_summary || "—"}</p>
        </div>

        <div className="pt-2 flex gap-3 flex-wrap">
          <Link
            href={`/matches/${brand.id}`}
            className="inline-flex rounded-xl bg-white text-black px-4 py-3 font-medium"
          >
            find creators →
          </Link>

          <Link
            href={`/creator-dashboard?brandId=${brand.id}`}
            className="inline-flex rounded-xl bg-white/10 text-white px-4 py-3 font-medium ring-1 ring-white/15"
          >
            creator-side view →
          </Link>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-white/60">{label}</p>
      <p className="text-white/85">{value}</p>
    </div>
  );
}
