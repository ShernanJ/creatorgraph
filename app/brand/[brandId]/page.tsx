/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import RebuildDossierButton from "@/app/brand/RebuildDossierButton";
import { q } from "@/lib/db";

function asArray(v: any): string[] {
  // handles: jsonb array, null, or stringified json array (Neon sometimes shows it like that)
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {}
    // fallback: "a, b, c"
    if (v.includes(",")) return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function shortUrl(u: string) {
  try {
    const url = new URL(u);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return u;
  }
}

function previewText(t: string, n = 220) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

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

  // wow factor: show crawl sources + coverage
  const pages = await q<any>(
    `select url, title, text, fetched_at
     from brand_pages
     where brand_id=$1
     order by fetched_at asc`,
    [brandId]
  );

  const pageCount = pages?.length ?? 0;
  const lastFetched = pageCount ? pages[pageCount - 1]?.fetched_at : null;

  const preferredPlatforms = asArray(brand.preferred_platforms);
  const goals = asArray(brand.goals);
  const campaignAngles = asArray(brand.campaign_angles);
  const matchTopics = asArray(brand.match_topics);

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{brand.name}</h1>
        <p className="text-white/70">{brand.website}</p>
      </div>

      {/* dossier */}
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">brand dossier</h2>
            <p className="text-sm text-white/60">
              structured profile + ontology topics + grounded sources
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="category" value={brand.category ?? "—"} />
          <Field label="budget" value={brand.budget_range ?? "—"} />
          <Field
            label="preferred platforms"
            value={preferredPlatforms.join(", ") || "—"}
          />
          <Field label="goals" value={goals.join(", ") || "—"} />
        </div>

        <div className="space-y-1">
          <p className="text-sm text-white/60">summary</p>
          <p className="text-white/85">{brand.raw_summary || "—"}</p>
        </div>

        <RebuildDossierButton brandId={brand.id} />
      </div>

      {/* ontology split */}
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">topic layers</h2>
            <p className="text-sm text-white/60">
              messaging vs matching (creator-native)
            </p>
          </div>
          <p className="text-xs text-white/50">
            campaign_angles = marketing language • match_topics = creator-native ontology
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TagList
            title="campaign_angles"
            subtitle="used for briefs + outreach copy"
            items={campaignAngles}
            empty="no campaign angles generated yet"
          />
          <TagList
            title="match_topics"
            subtitle="used for deterministic scoring"
            items={matchTopics}
            empty="no match topics generated yet"
          />
        </div>
      </div>

      {/* sources */}
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">crawl sources</h2>
            <p className="text-sm text-white/60">
              what the system actually read
            </p>
          </div>

          <div className="text-xs text-white/50">
            {pageCount ? (
              <span>
                {pageCount} pages saved{lastFetched ? ` • last fetched ${new Date(lastFetched).toLocaleString()}` : ""}
              </span>
            ) : (
              <span>no pages saved yet</span>
            )}
          </div>
        </div>

        {pageCount === 0 ? (
          <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-white/75">
            no crawl pages found for this brand yet. run the crawl step and re-analyze to build a grounded dossier.
          </div>
        ) : (
          <div className="space-y-3">
            {pages.slice(0, 8).map((p: any) => (
              <div
                key={p.url}
                className="rounded-xl bg-black/20 ring-1 ring-white/10 p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{p.title || shortUrl(p.url)}</p>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-white/60 underline underline-offset-4"
                    >
                      {shortUrl(p.url)}
                    </a>
                  </div>
                  <div className="text-xs text-white/50">
                    {p.fetched_at ? new Date(p.fetched_at).toLocaleDateString() : ""}
                  </div>
                </div>

                <p className="text-sm text-white/70">
                  {previewText(p.text, 260)}
                </p>
              </div>
            ))}

            {pageCount > 8 && (
              <p className="text-xs text-white/50">
                showing 8 / {pageCount} pages (cap for ui)
              </p>
            )}
          </div>
        )}
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

function TagList({
  title,
  subtitle,
  items,
  empty,
}: {
  title: string;
  subtitle: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-xl bg-black/20 ring-1 ring-white/10 p-4 space-y-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-white/60">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-white/60">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 12).map((t) => (
            <span
              key={t}
              className="text-xs rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-white/85"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
