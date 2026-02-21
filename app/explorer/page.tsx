"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

type SourceMode = "real" | "synthetic" | "all";
type PlatformKey = "instagram" | "tiktok" | "youtube" | "x" | "linkedin";

type CreatorRow = {
  id: string;
  name: string;
  niche: string;
  platforms?: string[] | string | null;
  audience_types?: string[] | string | null;
  sample_links?: string[] | string | null;
  estimated_engagement?: number | null;
  profile_photo_url?: string | null;
  record_source?: string | null;
  metrics?: unknown;
};

const PAGE_SIZE = 12;
const SOURCE_OPTIONS: Array<{ value: SourceMode; label: string }> = [
  { value: "all", label: "All Sources" },
  { value: "real", label: "Real Creators" },
  { value: "synthetic", label: "Synthetic Creators" },
];

const STANLEY_NICHE_GROUPS: Record<string, string[]> = {
  Business: [
    "business coaching",
    "creator monetization",
    "ecommerce & marketing",
    "ecommerce growth",
    "b2b saas",
    "startups & entrepreneurship",
    "careers & job search",
    "personal finance",
    "real estate investing",
  ],
  Technology: ["ai productivity", "ai tools", "consumer tech & gadgets"],
  Education: ["education & upskilling", "study productivity"],
  Fitness: ["fitness coaching", "fitness", "sports & outdoors"],
  Wellness: ["wellness & nutrition", "mental wellness"],
  Cooking: ["healthy cooking", "food & recipes"],
  Fashion: ["fashion & apparel"],
  Lifestyle: ["life coaching", "home & decor", "parenting & family"],
  Skincare: ["beauty & skincare", "skincare"],
  Pet: ["pets"],
  Travel: ["travel"],
  Gaming: ["gaming"],
};
const STANLEY_GROUP_ORDER = Object.keys(STANLEY_NICHE_GROUPS);

const PLATFORM_ORDER: PlatformKey[] = ["instagram", "tiktok", "youtube", "x", "linkedin"];
const PLATFORM_META: Record<PlatformKey, { label: string; short: string; badgeClass: string }> = {
  instagram: {
    label: "Instagram",
    short: "IG",
    badgeClass: "bg-[#f56040]/20 text-[#ffd8cf] ring-[#f56040]/40",
  },
  tiktok: {
    label: "TikTok",
    short: "TT",
    badgeClass: "bg-[#22d3ee]/20 text-[#d6fbff] ring-[#22d3ee]/40",
  },
  youtube: {
    label: "YouTube",
    short: "YT",
    badgeClass: "bg-[#ef4444]/22 text-[#ffe0e0] ring-[#ef4444]/40",
  },
  x: {
    label: "X",
    short: "X",
    badgeClass: "bg-white/18 text-white ring-white/30",
  },
  linkedin: {
    label: "LinkedIn",
    short: "IN",
    badgeClass: "bg-[#3b82f6]/22 text-[#dbeafe] ring-[#3b82f6]/45",
  },
};

function asArray(v: unknown): string[] {
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

function asObject(v: unknown): Record<string, unknown> {
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

function prettyPct(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function compactCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function normalizeNicheLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stanleyGroupForNiche(niche: string) {
  const normalizedNiche = normalizeNicheLabel(niche);
  if (!normalizedNiche) return "Business";
  for (const [group, labels] of Object.entries(STANLEY_NICHE_GROUPS)) {
    for (const label of labels) {
      const normalizedLabel = normalizeNicheLabel(label);
      if (
        normalizedNiche === normalizedLabel ||
        normalizedNiche.includes(normalizedLabel) ||
        normalizedLabel.includes(normalizedNiche)
      ) {
        return group;
      }
    }
  }
  return "Business";
}

function stanleyImageForGroup(group: string) {
  return `/Stanley-${group}.png`;
}

function stanleyImageForNiche(niche: string) {
  return stanleyImageForGroup(stanleyGroupForNiche(niche));
}

function normalizePlatformKey(value: string): PlatformKey | null {
  const lower = value.trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("insta")) return "instagram";
  if (lower.includes("tiktok") || lower === "tt") return "tiktok";
  if (lower.includes("youtube") || lower.includes("youtu") || lower === "yt") return "youtube";
  if (lower === "x" || lower.includes("x.com") || lower.includes("twitter")) return "x";
  if (lower.includes("linkedin") || lower === "in") return "linkedin";
  return null;
}

function creatorMetrics(c: CreatorRow) {
  return asObject(c.metrics);
}

function platformMetricsForCreator(c: CreatorRow) {
  const raw = asObject(creatorMetrics(c).platform_metrics);
  const normalized: Record<string, { followers?: number; avg_views?: number }> = {};
  for (const [key, value] of Object.entries(raw)) {
    const m = asObject(value);
    const followers = Number(m.followers);
    const avgViews = Number(m.avg_views);
    normalized[key] = {
      followers: Number.isFinite(followers) && followers > 0 ? followers : undefined,
      avg_views: Number.isFinite(avgViews) && avgViews > 0 ? avgViews : undefined,
    };
  }
  return normalized;
}

function topicList(c: CreatorRow) {
  return asArray(creatorMetrics(c).top_topics);
}

function creatorPlatforms(c: CreatorRow) {
  const metricKeys = Object.keys(platformMetricsForCreator(c));
  const normalized = Array.from(
    new Set(
      [...asArray(c.platforms), ...metricKeys]
        .map((x) => normalizePlatformKey(String(x)))
        .filter((x): x is PlatformKey => Boolean(x))
    )
  );
  return PLATFORM_ORDER.filter((p) => normalized.includes(p));
}

function followersByPlatform(c: CreatorRow, platform: PlatformKey) {
  const metrics = platformMetricsForCreator(c);
  const direct = metrics[platform];
  if (direct?.followers && Number.isFinite(Number(direct.followers))) {
    return Math.round(Number(direct.followers));
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (normalizePlatformKey(key) === platform && value?.followers) {
      const n = Number(value.followers);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
  }
  return null;
}

function followersTotal(c: CreatorRow) {
  const followers = Object.values(platformMetricsForCreator(c))
    .map((x) => Number(x?.followers))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (!followers.length) return null;
  return Math.round(followers.reduce((a, b) => a + b, 0));
}

function avgViews(c: CreatorRow) {
  const views = Object.values(platformMetricsForCreator(c))
    .map((x) => Number(x?.avg_views))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (!views.length) return null;
  return Math.round(views.reduce((a, b) => a + b, 0) / views.length);
}

function estimatedPrice(c: CreatorRow) {
  const niche = String(c.niche ?? "").toLowerCase();
  const views = avgViews(c) ?? 0;
  if (!views) return null;
  const cpmMap: Array<[RegExp, number]> = [
    [/fitness|wellness|nutrition|gym/, 25],
    [/finance|invest/, 55],
    [/saas|b2b|software/, 75],
    [/beauty|skincare|fashion/, 28],
    [/ecom|ecommerce|marketing/, 35],
  ];
  const matched = cpmMap.find(([re]) => re.test(niche));
  const cpm = matched?.[1] ?? 22;
  return Math.round((views / 1000) * cpm);
}

function followerBandLabel(value: number | null) {
  if (!value || value <= 0) return "~1k";
  if (value >= 1_000_000) return `${Math.floor(value / 1_000_000)}M+`;
  if (value >= 10_000) return `${Math.floor(value / 1_000)}k+`;
  if (value >= 1_000) return `~${Math.round(value / 1_000)}k`;
  return "~1k";
}

function sanitizeHandle(value: string) {
  return value
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function handleFromUrl(link: string) {
  try {
    const parsed = new URL(link);
    const host = parsed.hostname.toLowerCase();
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    if (host.includes("stan.store")) return sanitizeHandle(parts[0] ?? "");
    if (host.includes("linkedin.com") && parts[0] === "in") return sanitizeHandle(parts[1] ?? "");
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      if ((parts[0] ?? "").startsWith("@")) return sanitizeHandle((parts[0] ?? "").slice(1));
      if (["channel", "c", "user", "@"].includes(parts[0] ?? "")) return sanitizeHandle(parts[1] ?? "");
      return sanitizeHandle(parts[0] ?? "");
    }
    if (host.includes("tiktok.com") && (parts[0] ?? "").startsWith("@")) {
      return sanitizeHandle((parts[0] ?? "").slice(1));
    }
    return sanitizeHandle(parts[0] ?? "");
  } catch {
    return null;
  }
}

function platformFromSocialUrl(link: string): PlatformKey | null {
  try {
    const host = new URL(link).hostname.toLowerCase();
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("tiktok.com")) return "tiktok";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (host.includes("x.com") || host.includes("twitter.com")) return "x";
    if (host.includes("linkedin.com")) return "linkedin";
    return null;
  } catch {
    return null;
  }
}

function stanLink(c: CreatorRow) {
  const links = asArray(c.sample_links);
  return links.find((l) => /stan\.store/i.test(l)) ?? null;
}

function platformProfileLink(c: CreatorRow, platform: PlatformKey) {
  const links = asArray(c.sample_links);
  return links.find((link) => platformFromSocialUrl(link) === platform) ?? null;
}

function creatorUsername(c: CreatorRow) {
  const links = asArray(c.sample_links);
  for (const link of links) {
    const handle = handleFromUrl(link);
    if (handle) return `@${handle}`;
  }
  const fallback = c.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return `@${fallback || "creator"}`;
}

function stanSlugFromCreator(c: CreatorRow) {
  const link = stanLink(c);
  return link ? handleFromUrl(link) : null;
}

function profilePhotoUrl(c: CreatorRow) {
  const explicit = String(c.profile_photo_url ?? "").trim();
  if (explicit) return explicit;
  const importMeta = asObject(creatorMetrics(c).import_meta);
  const fromMeta = String(importMeta.stan_header_image_url ?? "").trim();
  return fromMeta || null;
}

function creatorSummarySnapshot(c: CreatorRow) {
  const platforms = creatorPlatforms(c).map((platform) => PLATFORM_META[platform].label);
  const topics = topicList(c).slice(0, 4);
  const audiences = asArray(c.audience_types).slice(0, 3);
  const followers = followersTotal(c);
  const rate = estimatedPrice(c);
  const why = platforms.length
    ? `${c.niche} positioning with active ${platforms.slice(0, 2).join(" & ")} presence.`
    : `${c.niche} positioning with growing creator-market signals.`;

  return {
    about: `${c.name} is a ${c.niche} creator${
      platforms.length ? ` active on ${platforms.join(", ")}` : ""
    }. ${why}`.trim(),
    platforms: platforms.length ? platforms.join(" • ") : "Platform signals still enriching",
    audience: audiences.length ? audiences.join(", ") : "Audience signals still enriching",
    reach: followers ? `${compactCount(followers)} followers` : "Reach signal pending",
    estRate: rate ? `$${compactCount(rate)}/video` : "Rate signal pending",
    themes: topics.length ? topics.join(", ") : "No strong topic tags yet",
    why,
  };
}

function sourceChipLabel(value: string | null | undefined) {
  const lower = String(value ?? "").toLowerCase();
  if (!lower) return "unknown";
  if (lower.includes("synthetic")) return "synthetic";
  if (lower.includes("stan_pipeline")) return "stan pipeline";
  return lower.replace(/_/g, " ");
}

function PlatformIcon({ platform }: { platform: PlatformKey }) {
  const cls = "h-3.5 w-3.5";

  if (platform === "instagram") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={cls}>
        <rect x="4.5" y="4.5" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16.2" cy="7.8" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (platform === "tiktok") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={cls}>
        <path
          d="M14 4.5v8.3a3.6 3.6 0 1 1-2.5-3.4V6.2c1.1.9 2.4 1.4 3.8 1.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={cls}>
        <rect x="3.8" y="6.3" width="16.4" height="11.4" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 9.6l5.1 2.4-5.1 2.4V9.6z" fill="currentColor" />
      </svg>
    );
  }
  if (platform === "x") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={cls}>
        <path
          d="M5 5h3.8l3.8 5.2L16.9 5H19l-5.4 6.7L19 19h-3.8l-4-5.5L7 19H5l5.7-7.2L5 5z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={cls}>
      <rect x="4.8" y="4.8" width="14.4" height="14.4" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.5 10.2V16M8.5 8V8.1M12 11.1V16M12 11.1c0-1.2.8-2 2-2s2 .8 2 2V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NicheCharacterSelector({
  selectedGroup,
  onSelect,
  groupCounts,
}: {
  selectedGroup: string;
  onSelect: (group: string) => void;
  groupCounts: Record<string, number>;
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/70">
        Niche Character Selector
      </p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onSelect("all")}
          className={[
            "flex min-w-[120px] items-center gap-2 rounded-xl border px-3 py-2 transition",
            selectedGroup === "all"
              ? "border-violet-300/45 bg-violet-300/15 text-white"
              : "border-white/12 bg-black/20 text-white/80 hover:border-white/24",
          ].join(" ")}
        >
          <span className="text-xs font-semibold">All Niches</span>
        </button>
        {STANLEY_GROUP_ORDER.map((group) => {
          const selected = selectedGroup === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => onSelect(group)}
              className={[
                "flex min-w-[182px] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition",
                selected
                  ? "border-violet-300/45 bg-violet-300/15 text-white"
                  : "border-white/12 bg-black/20 text-white/80 hover:border-white/24",
              ].join(" ")}
            >
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/30 ring-1 ring-white/15">
                <Image
                  src={stanleyImageForGroup(group)}
                  alt={`${group} Stanley`}
                  fill
                  sizes="44px"
                  className="object-contain p-1"
                />
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white/95">{group}</p>
                <p className="truncate text-[10px] text-white/62">
                  {(STANLEY_NICHE_GROUPS[group] ?? [])[0] ?? "niche"}
                </p>
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/78 ring-1 ring-white/15">
                {groupCounts[group] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreatorCardsGrid({ cards }: { cards: CreatorRow[] }) {
  const [expandedCardKey, setExpandedCardKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    setExpandedCardKey((prev) => {
      if (!prev) return null;
      const stillExists = cards.some((c, idx) => `${c.record_source ?? "creator"}-${c.id}-${idx}` === prev);
      return stillExists ? prev : null;
    });
  }, [cards]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c, index) => {
        const cardKey = `${c.record_source ?? "creator"}-${c.id}-${index}`;
        const isExpanded = expandedCardKey === cardKey;
        const summary = creatorSummarySnapshot(c);
        const followers = followersTotal(c);
        const rate = estimatedPrice(c);
        const stanSlug = stanSlugFromCreator(c);
        const user = creatorUsername(c);
        const platforms = creatorPlatforms(c).slice(0, 4);
        const photoUrl = profilePhotoUrl(c);
        const topics = topicList(c).slice(0, 4);
        const engagementLabel = prettyPct(c.estimated_engagement);

        return (
          <article
            key={cardKey}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={() => setExpandedCardKey((prev) => (prev === cardKey ? null : cardKey))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setExpandedCardKey((prev) => (prev === cardKey ? null : cardKey));
              }
            }}
            className={[
              "creator-card-in group relative cursor-pointer overflow-hidden rounded-[22px] border border-white/15 bg-[linear-gradient(165deg,#4f4a66_0%,#343549_55%,#242636_100%)] p-3 shadow-[0_12px_32px_rgba(8,10,18,0.42)] backdrop-blur-md transition-all duration-500",
              isExpanded
                ? "sm:col-span-2 border-white/26 shadow-[0_16px_40px_rgba(5,7,12,0.58)]"
                : "hover:-translate-y-[1px] hover:border-white/25 hover:shadow-[0_14px_36px_rgba(5,7,12,0.5)]",
            ].join(" ")}
            style={{ animationDelay: `${index * 65}ms` }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(280px_140px_at_0%_0%,rgba(199,158,255,0.24),transparent_62%)]" />
            <div className={isExpanded ? "relative min-h-[500px]" : "relative"}>
              <div
                className="relative h-full transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: isExpanded ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                <div
                  className="relative space-y-3"
                  style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white/95">{user}</p>
                      {stanSlug ? (
                        <a
                          href={`https://stan.store/${stanSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="truncate text-[11px] text-violet-200/90 underline underline-offset-4 transition hover:text-violet-100"
                        >
                          stan.store/{stanSlug}
                        </a>
                      ) : (
                        <p className="text-[11px] text-white/45">{sourceChipLabel(c.record_source)}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full bg-emerald-400/18 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-200/30">
                        {engagementLabel}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-white/70 ring-1 ring-white/15">
                        engagement
                      </span>
                    </div>
                  </div>

                  {photoUrl ? (
                    <div className="relative h-32 overflow-hidden rounded-2xl border border-white/15 ring-1 ring-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl}
                        alt={c.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="relative h-32 overflow-hidden rounded-2xl border border-white/15 bg-black/20 ring-1 ring-white/10">
                      <Image
                        src={stanleyImageForNiche(c.niche)}
                        alt={`Stanley ${stanleyGroupForNiche(c.niche)}`}
                        fill
                        sizes="300px"
                        className="object-contain p-3"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-medium text-white/85 ring-1 ring-white/15">
                      {c.niche}
                    </span>
                    <span className="text-[11px] text-white/60">
                      reach {followers ? compactCount(followers) : "—"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {platforms.length ? (
                      platforms.map((platform) => {
                        const meta = PLATFORM_META[platform];
                        const platformFollowers = followersByPlatform(c, platform);
                        const platformUrl = platformProfileLink(c, platform);
                        return (
                          platformUrl ? (
                            <a
                              key={`${c.id}-${platform}`}
                              href={platformUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="flex items-center justify-between rounded-lg bg-black/25 px-2 py-1.5 ring-1 ring-white/12 transition hover:bg-black/30 hover:ring-white/22"
                              title={`Open ${meta.label} profile`}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className={[
                                    "inline-flex h-5 w-5 items-center justify-center rounded-md ring-1",
                                    meta.badgeClass,
                                  ].join(" ")}
                                >
                                  <PlatformIcon platform={platform} />
                                </span>
                                <span className="text-[10px] uppercase tracking-[0.07em] text-white/70">
                                  {meta.short}
                                </span>
                              </span>
                              <span className="text-[10px] text-white/78">
                                ({followerBandLabel(platformFollowers)})
                              </span>
                            </a>
                          ) : (
                            <div
                              key={`${c.id}-${platform}`}
                              className="flex items-center justify-between rounded-lg bg-black/25 px-2 py-1.5 ring-1 ring-white/12"
                              title={meta.label}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className={[
                                    "inline-flex h-5 w-5 items-center justify-center rounded-md ring-1",
                                    meta.badgeClass,
                                  ].join(" ")}
                                >
                                  <PlatformIcon platform={platform} />
                                </span>
                                <span className="text-[10px] uppercase tracking-[0.07em] text-white/70">
                                  {meta.short}
                                </span>
                              </span>
                              <span className="text-[10px] text-white/78">
                                ({followerBandLabel(platformFollowers)})
                              </span>
                            </div>
                          )
                        );
                      })
                    ) : (
                      <div className="col-span-2 rounded-lg bg-black/20 px-2 py-1.5 text-[10px] text-white/55 ring-1 ring-white/12">
                        No platform data yet
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-[1fr_132px] items-stretch gap-2">
                    <div className="rounded-xl bg-black/25 px-3 py-2.5 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/45">est. rate</p>
                      <p className="text-sm font-medium text-white/95">
                        {rate ? `$${compactCount(rate)}/video` : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[linear-gradient(165deg,rgba(146,142,187,0.18)_0%,rgba(62,65,97,0.22)_100%)] p-2 ring-1 ring-white/14">
                      <p className="mb-1.5 text-center text-[10px] font-semibold text-white/82">{c.niche}</p>
                      <Image
                        src={stanleyImageForNiche(c.niche)}
                        alt={`Stanley ${stanleyGroupForNiche(c.niche)}`}
                        width={108}
                        height={108}
                        sizes="108px"
                        className="h-[96px] w-auto object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.3)]"
                      />
                    </div>
                  </div>

                  {topics.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {topics.map((topic) => (
                        <span
                          key={`${c.id}-${topic}`}
                          className="rounded-full bg-white/8 px-2 py-1 text-[10px] text-white/78 ring-1 ring-white/10"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <p className="text-[11px] leading-5 text-white/62">Why: {summary.why}</p>
                  <p className="text-[10px] text-white/45">Click card to flip for full creator summary</p>
                </div>

                <div
                  className="absolute inset-0 flex flex-col gap-3 rounded-[18px] border border-white/16 bg-[linear-gradient(175deg,#4a4a67_0%,#2d3048_55%,#202236_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white/95">{c.name}</p>
                      <p className="truncate text-[12px] text-white/62">{user}</p>
                    </div>
                    <span className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] text-white/85 ring-1 ring-white/18">
                      {sourceChipLabel(c.record_source)}
                    </span>
                  </div>

                  <p className="text-[13px] leading-6 text-white/88">{summary.about}</p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Platforms</p>
                      <p className="text-[12px] text-white/86">{summary.platforms}</p>
                    </div>
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Audience</p>
                      <p className="text-[12px] text-white/86">{summary.audience}</p>
                    </div>
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Estimated Reach</p>
                      <p className="text-[12px] text-white/86">{summary.reach}</p>
                    </div>
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Rate Benchmark</p>
                      <p className="text-[12px] text-white/86">{summary.estRate}</p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-black/22 px-3 py-2 ring-1 ring-white/12">
                    <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Content Themes</p>
                    <p className="text-[12px] text-white/84">{summary.themes}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {stanSlug ? (
                      <a
                        href={`https://stan.store/${stanSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-violet-100 ring-1 ring-white/16 transition hover:bg-white/15"
                      >
                        Open stan.store/{stanSlug}
                      </a>
                    ) : null}
                    <Link
                      href={`/creator/${c.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-white/90 ring-1 ring-white/16 transition hover:bg-white/15"
                    >
                      Open creator profile
                    </Link>
                  </div>

                  <p className="mt-auto text-[10px] text-white/48">Click card again to flip back</p>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function ExplorerPage() {
  const [creators, setCreators] = React.useState<CreatorRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [term, setTerm] = React.useState("");
  const [sourceMode, setSourceMode] = React.useState<SourceMode>("all");
  const [platformFilter, setPlatformFilter] = React.useState<string>("all");
  const [nicheGroupFilter, setNicheGroupFilter] = React.useState<string>("all");
  const [sourceLabel, setSourceLabel] = React.useState<string>("creators");
  const [fallbackUsed, setFallbackUsed] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const loadMoreRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          source: sourceMode,
          limit: "1500",
        });
        const res = await fetch(`/api/explorer/creators?${params.toString()}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error ?? "failed to load creators");
        setCreators(Array.isArray(data?.creators) ? data.creators : []);
        setSourceLabel(typeof data?.source === "string" ? data.source : "creators");
        setFallbackUsed(Boolean(data?.fallbackUsed));
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load creators");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceMode]);

  const availablePlatforms = React.useMemo(() => {
    const set = new Set<PlatformKey>();
    for (const creator of creators) {
      for (const platform of creatorPlatforms(creator)) set.add(platform);
    }
    return PLATFORM_ORDER.filter((platform) => set.has(platform));
  }, [creators]);

  const nicheGroupCounts = React.useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(STANLEY_GROUP_ORDER.map((group) => [group, 0]));
    for (const creator of creators) {
      const group = stanleyGroupForNiche(creator.niche);
      counts[group] = (counts[group] ?? 0) + 1;
    }
    return counts;
  }, [creators]);

  const filtered = React.useMemo(() => {
    const search = term.trim().toLowerCase();
    return creators.filter((creator) => {
      if (
        platformFilter !== "all" &&
        !creatorPlatforms(creator).includes(platformFilter as PlatformKey)
      ) {
        return false;
      }
      if (nicheGroupFilter !== "all" && stanleyGroupForNiche(creator.niche) !== nicheGroupFilter) {
        return false;
      }
      if (!search) return true;
      const blob = [
        creator.id,
        creator.name,
        creator.niche,
        ...asArray(creator.platforms),
        ...asArray(creator.audience_types),
        ...topicList(creator),
        ...asArray(creator.sample_links),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(search);
    });
  }, [creators, nicheGroupFilter, platformFilter, term]);

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sourceMode, platformFilter, nicheGroupFilter, term, creators.length]);

  const visibleCards = React.useMemo(
    () => filtered.slice(0, Math.min(visibleCount, filtered.length)),
    [filtered, visibleCount]
  );
  const hasMore = visibleCards.length < filtered.length;

  React.useEffect(() => {
    if (!hasMore || loading) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length, hasMore, loading]);

  return (
    <main className="min-h-screen w-full bg-[#2c2f3a] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_650px_at_50%_40%,rgba(110,120,255,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_100%,rgba(130,70,255,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)]" />
      </div>

      <section className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">CreatorGraph Explorer</h1>
            <p className="text-sm text-white/70">
              interactive creator card explorer with flip summaries and signal filters
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-white/10 px-4 py-2 text-white ring-1 ring-white/15 transition hover:bg-white/15"
          >
            ← back to brand app
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px_210px]">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder='search creators (e.g. "gym", "finance", "stan.store")'
            className="w-full rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/15 outline-none placeholder:text-white/45"
          />

          <select
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as SourceMode)}
            className="rounded-xl bg-white/5 px-3 py-3 text-sm ring-1 ring-white/15 outline-none"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#242735]">
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-xl bg-white/5 px-3 py-3 text-sm ring-1 ring-white/15 outline-none"
          >
            <option value="all" className="bg-[#242735]">
              all platforms
            </option>
            {availablePlatforms.map((platform) => (
              <option key={platform} value={platform} className="bg-[#242735]">
                {PLATFORM_META[platform].label}
              </option>
            ))}
          </select>
        </div>

        <NicheCharacterSelector
          selectedGroup={nicheGroupFilter}
          onSelect={setNicheGroupFilter}
          groupCounts={nicheGroupCounts}
        />

        {loading ? (
          <p className="text-sm text-white/60">loading creators…</p>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <p className="text-sm text-white/60">
            showing {visibleCards.length} / {filtered.length} creators (loaded {creators.length}) · source{" "}
            {sourceLabel}
            {fallbackUsed ? " (fallback)" : ""}
          </p>
        )}

        {!loading && !error && filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-6 text-sm text-white/70">
            no creators matched your current search/filter combination
          </div>
        ) : null}

        <CreatorCardsGrid cards={visibleCards} />

        {!loading && hasMore ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div ref={loadMoreRef} className="h-1 w-full" />
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length))}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white ring-1 ring-white/15 transition hover:bg-white/15"
            >
              load more creators
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
