"use client";

import * as React from "react";
import Link from "next/link";

type CreatorRow = {
  id: string;
  name: string;
  niche: string;
  platforms?: string[] | string | null;
  audience_types?: string[] | string | null;
  estimated_engagement?: number | null;
  metrics?: {
    top_topics?: string[] | string;
    platform_metrics?: Record<string, { avg_views?: number }>;
  } | null;
};

function asArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {}
  }
  return [];
}

function prettyPct(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function avgViews(metrics: CreatorRow["metrics"]) {
  const platformMetrics = metrics?.platform_metrics ?? {};
  const values = Object.values(platformMetrics)
    .map((x) => Number(x?.avg_views))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export default function ExplorerPage() {
  const [creators, setCreators] = React.useState<CreatorRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [term, setTerm] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/explorer/creators", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data?.error ?? "failed to load creators");
        }
        setCreators(Array.isArray(data?.creators) ? data.creators : []);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "failed to load creators");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = React.useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return creators;
    return creators.filter((c) => {
      const blob = [
        c.name,
        c.niche,
        ...asArray(c.platforms),
        ...asArray(c.audience_types),
        ...asArray(c.metrics?.top_topics),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(s);
    });
  }, [creators, term]);

  return (
    <main className="min-h-screen w-full bg-[#2c2f3a] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_650px_at_50%_40%,rgba(110,120,255,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_100%,rgba(130,70,255,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)]" />
      </div>
      <section className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold">CreatorGraph Explorer</h1>
            <p className="text-white/70 text-sm">
              read-only creator intelligence view for demos
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-white/10 text-white px-4 py-2 ring-1 ring-white/15"
          >
            ← back to brand app
          </Link>
        </div>

        <div className="flex gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder='search creators (e.g. "gym", "100k", "finance")'
            className="w-full rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/15 outline-none"
          />
        </div>

        {loading ? (
          <p className="text-sm text-white/60">loading creators…</p>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <p className="text-sm text-white/60">
            showing {filtered.length} / {creators.length} creators
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const topics = asArray(c.metrics?.top_topics).slice(0, 4);
            const platforms = asArray(c.platforms);
            const avg = avgViews(c.metrics);
            return (
              <article
                key={c.id}
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-sm text-white/65">{c.niche}</p>
                  </div>
                  <span className="text-xs rounded-full bg-white/10 px-2 py-1 ring-1 ring-white/10">
                    {c.id}
                  </span>
                </div>

                <p className="text-sm text-white/70">
                  platforms: {platforms.join(", ") || "—"}
                </p>
                <p className="text-sm text-white/70">
                  engagement: {prettyPct(c.estimated_engagement)}
                </p>
                <p className="text-sm text-white/70">
                  avg views: {avg ? String(avg) : "—"}
                </p>

                <div className="flex flex-wrap gap-2">
                  {topics.length ? (
                    topics.map((t) => (
                      <span
                        key={`${c.id}-${t}`}
                        className="text-xs rounded-full bg-black/30 px-2 py-1 ring-1 ring-white/10 text-white/80"
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-white/50">no top topics</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
