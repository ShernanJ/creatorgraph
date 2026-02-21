"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type BrandView = {
  id: string;
  name: string;
  website: string;
  category: string | null;
  budgetRange: string | null;
  targetAudience: string[];
  goals: string[];
  preferredPlatforms: string[];
  campaignAngles: string[];
  matchTopics: string[];
  rawSummary: string;
};

type CrawlSummary = {
  pageCount: number;
  lastFetched: string | null;
};

type RankedCreator = {
  creator: {
    id: string;
    name: string;
    niche: string;
    username?: string | null;
    avatar_url?: string | null;
    profile_photo_url?: string | null;
    platforms?: string[];
    sample_links?: string[];
    estimated_engagement?: number | null;
    metrics?: {
      top_topics?: string[];
      platform_metrics?: Record<string, { followers?: number; avg_views?: number }>;
      import_meta?: {
        stan_header_image_url?: string | null;
      };
    };
  };
  score: number;
  reasons: string[];
};

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
  quickReplies?: string[];
};

type CreatorDeck = {
  id: string;
  signature: string;
  title: string;
  reason: string;
  cards: RankedCreator[];
  createdAt: string;
  updatedAt: string;
};

type PartnershipType = "affiliate" | "sponsored_video" | "ugc" | "ambassador";
type CompensationModel = "flat_fee" | "cpm" | "rev_share" | "hybrid";
type CompensationUnit = "per_video" | "per_post" | "per_1k_views";

type CampaignPreferences = {
  partnershipType: PartnershipType | null;
  compensationModel: CompensationModel | null;
  compensationAmount: number | null;
  compensationUnit: CompensationUnit;
  budgetCaptured: boolean;
  updatedAt: string | null;
};

type RankingDirectives = {
  campaignGoals: string[];
  priorityNiches: string[];
  priorityTopics: string[];
  preferredPlatforms: string[];
  updatedAt: string | null;
};

type ParsedIntentPatch = {
  preferencePatch: Partial<CampaignPreferences>;
  directivePatch: Partial<RankingDirectives>;
  changes: string[];
};

const COMMON_CHAT_QUICK_REPLIES = [
  "Show top creator matches",
  "I need UGC creators around $1 per 1k views",
  "Prioritize gym influencers",
  "Why do these creators fit?",
];

const MAX_DECK_HISTORY = 7;
const AGENT_LEFT_PX = 4;
const AGENT_MOVE_MS = 320;
const PLACEHOLDER_ROTATE_MS = 3400;
const PLACEHOLDER_OUT_MS = 280;
const PLACEHOLDER_GAP_MS = 70;
const PLACEHOLDER_IN_MS = 340;

type RectBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ChipMorphState = {
  id: string;
  text: string;
  rect: RectBox;
  phase: "origin" | "animating";
  sourceKey: string | null;
};

function TypewriterText({
  text,
  speedMs = 12,
  onDone,
  onTick,
}: {
  text: string;
  speedMs?: number;
  onDone?: () => void;
  onTick?: () => void;
}) {
  const [count, setCount] = React.useState(0);
  const onDoneRef = React.useRef(onDone);
  const onTickRef = React.useRef(onTick);

  React.useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  React.useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  React.useEffect(() => {
    setCount(0);
    if (!text) {
      onDoneRef.current?.();
      return;
    }

    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      onTickRef.current?.();
      if (i >= text.length) {
        clearInterval(id);
        onDoneRef.current?.();
      }
    }, speedMs);

    return () => clearInterval(id);
  }, [text, speedMs]);

  const visible = text.slice(0, count);
  const done = count >= text.length;

  return (
    <p className="whitespace-pre-wrap text-[16px] sm:text-[17px] leading-[1.55] tracking-[-0.01em] text-white/95">
      {visible}
      {!done ? (
        <>
          <span className="typing-caret">|</span>
          <span className="typing-trail-inline" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </>
      ) : null}
    </p>
  );
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function compactCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function followersTotal(c: RankedCreator["creator"]) {
  const m = c.metrics?.platform_metrics ?? {};
  const followers = Object.values(m)
    .map((x) => Number(x?.followers))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (followers.length === 0) return null;
  return Math.round(followers.reduce((a, b) => a + b, 0));
}

function avgViews(c: RankedCreator["creator"]) {
  const m = c.metrics?.platform_metrics ?? {};
  const views = Object.values(m)
    .map((x) => Number(x?.avg_views))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (views.length === 0) return null;
  return Math.round(views.reduce((a, b) => a + b, 0) / views.length);
}

function estimatedPrice(c: RankedCreator["creator"]) {
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

function stanLink(c: RankedCreator["creator"]) {
  const links = c.sample_links ?? [];
  const found = links.find((l) => /stan\.store/i.test(l));
  return found ?? null;
}

function socialLinks(c: RankedCreator["creator"]) {
  const links = c.sample_links ?? [];
  return links.filter((l) =>
    /(x\.com|twitter\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be)/i.test(l)
  );
}

type PlatformKey = "instagram" | "tiktok" | "youtube" | "x" | "linkedin";

type StanleyVariant = {
  title: string;
  glyph: string;
  gradient: string;
  assetKey: string;
};

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

function normalizeNicheLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function stanleyImageForNiche(niche: string) {
  const group = stanleyGroupForNiche(niche);
  const assetByGroup: Record<string, string> = {
    Business: "Business",
    Technology: "Technology",
    Education: "Education",
    Fitness: "Fitness",
    Wellness: "Wellness",
    Cooking: "Cooking",
    Fashion: "Fashion",
    Lifestyle: "Lifestyle",
    Skincare: "Skincare",
    Pet: "Pet",
    Travel: "Travel",
    Gaming: "Gaming",
  };
  const asset = assetByGroup[group] ?? "Business";
  return `/Stanley-${asset}.png`;
}

const STANLEY_VARIANTS: Array<[RegExp, StanleyVariant]> = [
  [/fitness|wellness|nutrition|gym/i, {
    title: "Athlete Stanley",
    glyph: "FLX",
    gradient: "linear-gradient(150deg,#2e5dd0 0%,#5a31c0 50%,#211c46 100%)",
    assetKey: "fitness-coaching",
  }],
  [/finance|invest|real estate/i, {
    title: "Analyst Stanley",
    glyph: "ROI",
    gradient: "linear-gradient(150deg,#1f5a70 0%,#2f6e93 45%,#1f2b4d 100%)",
    assetKey: "money-strategy",
  }],
  [/beauty|skincare|fashion/i, {
    title: "Style Stanley",
    glyph: "GLW",
    gradient: "linear-gradient(150deg,#8a3d7f 0%,#c95a83 45%,#3e234e 100%)",
    assetKey: "beauty-skincare",
  }],
  [/business|ecommerce|marketing|creator monetization/i, {
    title: "Operator Stanley",
    glyph: "OPS",
    gradient: "linear-gradient(150deg,#5d4a9e 0%,#5a6ddb 45%,#24243d 100%)",
    assetKey: "growth-operator",
  }],
  [/ai|productivity|saas|study/i, {
    title: "Tech Stanley",
    glyph: "AI",
    gradient: "linear-gradient(150deg,#265f86 0%,#3f7aa5 45%,#262b4a 100%)",
    assetKey: "ai-productivity",
  }],
  [/life|mindset|mental/i, {
    title: "Coach Stanley",
    glyph: "ZEN",
    gradient: "linear-gradient(150deg,#4a3b8f 0%,#7759b8 45%,#28244b 100%)",
    assetKey: "life-coaching",
  }],
];

const DEFAULT_STANLEY_VARIANT: StanleyVariant = {
  title: "Core Stanley",
  glyph: "STD",
  gradient: "linear-gradient(150deg,#41477c 0%,#5b63a7 45%,#252942 100%)",
  assetKey: "core-default",
};

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

function platformProfileLink(c: RankedCreator["creator"], platform: PlatformKey) {
  const links = socialLinks(c);
  return links.find((link) => platformFromSocialUrl(link) === platform) ?? null;
}

function creatorPlatforms(c: RankedCreator["creator"]) {
  const metricKeys = Object.keys(c.metrics?.platform_metrics ?? {});
  const normalized = Array.from(
    new Set(
      [...(c.platforms ?? []), ...metricKeys]
        .map((x) => normalizePlatformKey(String(x)))
        .filter((x): x is PlatformKey => Boolean(x))
    )
  );
  return PLATFORM_ORDER.filter((p) => normalized.includes(p));
}

function followersByPlatform(c: RankedCreator["creator"], platform: PlatformKey) {
  const metrics = c.metrics?.platform_metrics ?? {};
  const direct = metrics[platform];
  if (direct?.followers && Number.isFinite(Number(direct.followers))) {
    return Math.max(0, Math.round(Number(direct.followers)));
  }

  for (const [key, value] of Object.entries(metrics)) {
    if (normalizePlatformKey(key) === platform && value?.followers) {
      const n = Number(value.followers);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
  }
  return null;
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

    if (host.includes("stan.store")) {
      return sanitizeHandle(parts[0] ?? "");
    }

    if (host.includes("linkedin.com") && parts[0] === "in") {
      return sanitizeHandle(parts[1] ?? "");
    }

    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      if ((parts[0] ?? "").startsWith("@")) return sanitizeHandle((parts[0] ?? "").slice(1));
      if (["channel", "c", "user", "@"].includes(parts[0] ?? "")) {
        return sanitizeHandle(parts[1] ?? "");
      }
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

function slugFromName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

function creatorUsername(c: RankedCreator["creator"]) {
  const explicit = sanitizeHandle(c.username ?? "");
  if (explicit) return `@${explicit}`;

  const socials = socialLinks(c);
  for (const link of socials) {
    const handle = handleFromUrl(link);
    if (handle) return `@${handle}`;
  }

  const stan = stanLink(c);
  const stanHandle = stan ? handleFromUrl(stan) : null;
  if (stanHandle) return `@${stanHandle}`;

  return `@${slugFromName(c.name)}`;
}

function stanSlug(link: string | null) {
  if (!link) return null;
  const handle = handleFromUrl(link);
  return handle || null;
}

function stanleyVariantForNiche(niche: string): StanleyVariant {
  const matched = STANLEY_VARIANTS.find(([re]) => re.test(niche));
  return matched?.[1] ?? DEFAULT_STANLEY_VARIANT;
}

function profilePhotoUrl(c: RankedCreator["creator"]) {
  const stanHeader = c.metrics?.import_meta?.stan_header_image_url;
  if (typeof stanHeader === "string" && stanHeader.trim()) return stanHeader.trim();
  return c.profile_photo_url ?? c.avatar_url ?? null;
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
      <path d="M8.5 10.2V16M8.5 8V8.1M12 11.1V16M12 11.1c0-1.2.8-2 2-2s2 .8 2 2V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NicheStanleyPortrait({ niche }: { niche: string }) {
  const variant = stanleyVariantForNiche(niche);
  return (
    <div
      className="relative h-32 overflow-hidden rounded-2xl border border-white/15 ring-1 ring-white/10"
      style={{ background: variant.gradient }}
      data-robot-asset={`stanley-variants/${variant.assetKey}.png`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(200px_90px_at_10%_10%,rgba(255,255,255,0.28),transparent_62%)]" />
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex h-full flex-col justify-between p-3">
        <span className="inline-flex w-fit items-center rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/85 ring-1 ring-white/25">
          {variant.glyph}
        </span>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-white/95">{variant.title}</p>
            <p className="text-[10px] text-white/70">stanley-variants/{variant.assetKey}.png</p>
          </div>
          <Image
            src="/Stan-Lee-Agent.png"
            alt={variant.title}
            width={52}
            height={52}
            className="opacity-95 drop-shadow-[0_6px_12px_rgba(0,0,0,0.32)]"
          />
        </div>
      </div>
    </div>
  );
}

function extractBudgetAmount(input: string, opts: { strictDollar?: boolean } = {}) {
  const text = input.replace(/,/g, "");
  const dollar = text.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (dollar?.[1]) {
    const n = Number(dollar[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  if (opts.strictDollar) return null;

  const contextHint = /(budget|pay|price|cost|spend|fee|per\s*(video|post|1k|1000)|cpm)/i.test(text);
  if (!contextHint) return null;

  const raw = text.match(/\b(\d{2,6})(?:\.\d+)?\b/);
  if (!raw?.[1]) return null;
  const n = Number(raw[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function detectPartnershipType(text: string): PartnershipType | null {
  if (/\bugc\b/i.test(text)) return "ugc";
  if (/\baffiliate|commission\b/i.test(text)) return "affiliate";
  if (/\bambassador\b/i.test(text)) return "ambassador";
  if (/\bsponsored|sponsor\b/i.test(text)) return "sponsored_video";
  return null;
}

function detectCompensationModel(text: string): CompensationModel | null {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\brev(?:enue)?\s*share|commission\b/i.test(text)) return "rev_share";
  if (/\bcpm|per\s*(1k|1000|thousand)|\/\s*(1k|1000)(?:\s*views?)?/i.test(text)) return "cpm";
  if (/\bflat\s*fee|fixed\s*fee\b/i.test(text)) return "flat_fee";
  return null;
}

function detectCompensationUnit(text: string): CompensationUnit | null {
  if (/(?:per|\/)\s*(1k|1000)(?:\s*views?)?/i.test(text)) return "per_1k_views";
  if (/per\s*post/i.test(text)) return "per_post";
  if (/per\s*video/i.test(text)) return "per_video";
  return null;
}

function partnershipLabel(v: PartnershipType | null) {
  if (v === "affiliate") return "Affiliate Sales";
  if (v === "sponsored_video") return "Sponsored Video";
  if (v === "ugc") return "UGC Assets";
  if (v === "ambassador") return "Ambassador Program";
  return "Not set";
}

function compensationModelLabel(v: CompensationModel | null) {
  if (v === "flat_fee") return "Flat Fee";
  if (v === "cpm") return "Per 1k Views (CPM)";
  if (v === "rev_share") return "Revenue Share";
  if (v === "hybrid") return "Hybrid";
  return "Not set";
}

function compensationUnitLabel(v: CompensationUnit) {
  if (v === "per_post") return "per post";
  if (v === "per_1k_views") return "per 1k views";
  return "per video";
}

function deckSignature(cards: RankedCreator[]) {
  return cards.map((c) => c.creator.id).join("|");
}

function prettyDeckTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  return `${Math.max(1, Math.round(ms / 3_600_000))}h ago`;
}

function deckTitleFromContext(text: string, prefs: CampaignPreferences) {
  const lower = text.toLowerCase();
  if (/(budget|\$|price|cost|pay|spend)/i.test(lower) && prefs.compensationAmount !== null) {
    return `Budget deck · $${prefs.compensationAmount} ${compensationUnitLabel(prefs.compensationUnit)}`;
  }
  if (/(top|best|fit|match|creator|shortlist|recommend)/i.test(lower)) return "Top-fit deck";
  if (/(why|reason|explain)/i.test(lower)) return "Why-this-fits deck";
  return "Creator deck";
}

function extractOptionQuickReplies(text: string) {
  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const options = lines
    .map((line) => line.match(/^[A-D][\)\.\-:]\s*(.+)$/i)?.[1]?.trim() ?? null)
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);

  return options.length >= 2 ? options : undefined;
}

function normalizePhrase(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqPhrases(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const normalized = normalizePhrase(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function inferInitialPreferences(brand: BrandView): CampaignPreferences {
  const joined = [
    ...brand.campaignAngles,
    ...brand.goals,
    ...brand.matchTopics,
    brand.rawSummary,
  ].join(" ");

  const partnershipType = detectPartnershipType(joined);
  const compensationModel = detectCompensationModel(joined);
  const compensationUnit = detectCompensationUnit(joined) ?? "per_video";
  const compensationAmount = extractBudgetAmount(joined, { strictDollar: true });
  const budgetCaptured =
    compensationAmount !== null || /no fixed budget|open budget|flexible budget/i.test(joined);

  return {
    partnershipType,
    compensationModel,
    compensationAmount,
    compensationUnit,
    budgetCaptured,
    updatedAt: null,
  };
}

function inferInitialDirectives(): RankingDirectives {
  return {
    campaignGoals: [],
    priorityNiches: [],
    priorityTopics: [],
    preferredPlatforms: [],
    updatedAt: null,
  };
}

const GOAL_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "brand awareness", pattern: /\b(brand awareness|awareness|reach|top of funnel)\b/i },
  { label: "direct sales", pattern: /\b(sales|revenue|conversion|conversions|purchase|checkout|roi)\b/i },
  { label: "ugc content library", pattern: /\b(ugc|content library|creative asset|ad creative)\b/i },
  { label: "app installs and signups", pattern: /\b(app installs?|installs?|downloads?|sign[- ]?ups?|activations?)\b/i },
  { label: "qualified traffic", pattern: /\b(traffic|site visits?|landing page clicks?)\b/i },
  { label: "lead generation", pattern: /\b(leads?|pipeline|demo requests?|booked demos?)\b/i },
];

const PRIORITY_STOPWORDS = new Set([
  "any",
  "best",
  "better",
  "content",
  "creator",
  "creators",
  "influencer",
  "influencers",
  "more",
  "someone",
  "strong",
  "stronger",
  "top",
]);

const PRIORITY_NOISE_TOKENS = new Set([
  "around",
  "explain",
  "find",
  "fit",
  "fits",
  "give",
  "match",
  "matches",
  "recommend",
  "send",
  "show",
  "top",
  "why",
  "who",
]);

function detectCampaignGoals(text: string) {
  return uniqPhrases(
    GOAL_SIGNAL_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.label)
  );
}

function detectPreferredPlatforms(text: string) {
  const found = new Set<PlatformKey>();
  if (/\b(instagram|insta|ig)\b/i.test(text)) found.add("instagram");
  if (/\b(tiktok|tt)\b/i.test(text)) found.add("tiktok");
  if (/\b(youtube|yt|youtu\.be)\b/i.test(text)) found.add("youtube");
  if (/\b(x\.com|twitter)\b/i.test(text) || /\bx\b/i.test(text)) found.add("x");
  if (/\b(linkedin|li)\b/i.test(text)) found.add("linkedin");
  return PLATFORM_ORDER.filter((platform) => found.has(platform));
}

function sanitizePriorityPhrase(raw: string) {
  const normalized = normalizePhrase(raw)
    .replace(/^(for|about|around|the|some|more|mostly|with)\s+/, "")
    .replace(/\s+(for|audiences?|content|profiles?)$/, "")
    .trim();

  if (!normalized || normalized.length < 3) return null;
  if (PRIORITY_STOPWORDS.has(normalized)) return null;
  const tokens = normalized.split(/\s+/);
  if (tokens.some((token) => PRIORITY_NOISE_TOKENS.has(token))) return null;
  return normalized;
}

function extractPriorityMatches(text: string, pattern: RegExp) {
  const found: string[] = [];
  let match = pattern.exec(text);
  while (match) {
    const phrase = match[1] ?? "";
    const chunks = phrase.split(/,|\/|&|\band\b/gi);
    for (const chunk of chunks) {
      const cleaned = sanitizePriorityPhrase(chunk);
      if (cleaned) found.push(cleaned);
    }
    match = pattern.exec(text);
  }
  return found;
}

function detectPriorityNiches(text: string) {
  const patterns = [
    /\b(?:looking for|look for|need|want|seeking|searching for|priorit(?:ize|ise)|focus(?:ing)? on|lean(?:ing)? into)\s+([a-z0-9][a-z0-9\s,&\/+\-]{1,56}?)\s+(?:influencers|creators)\b/gi,
    /\b([a-z0-9][a-z0-9\s,&\/+\-]{1,36}?)\s+(?:influencers|creators)\b/gi,
  ];

  const matches: string[] = [];
  for (const pattern of patterns) {
    matches.push(...extractPriorityMatches(text, pattern));
  }
  return uniqPhrases(matches).slice(0, 6);
}

function detectPriorityTopics(text: string, priorityNiches: string[]) {
  const topicHints: string[] = [...priorityNiches];
  const topicPattern =
    /\b(?:content about|topics around|focus on topics|covering)\s+([a-z0-9][a-z0-9\s,&\/+\-]{1,56})(?=$|[.!?,])/gi;

  let match = topicPattern.exec(text);
  while (match) {
    const phrase = match[1] ?? "";
    const chunks = phrase.split(/,|\/|&|\band\b/gi);
    for (const chunk of chunks) {
      const cleaned = sanitizePriorityPhrase(chunk);
      if (cleaned) topicHints.push(cleaned);
    }
    match = topicPattern.exec(text);
  }

  return uniqPhrases(topicHints).slice(0, 8);
}

function brandSummaryText(brand: BrandView) {
  const category = brand.category ?? "digital";
  const goal = brand.goals[0] ?? "drive measurable campaign outcomes";
  const audience =
    brand.targetAudience.slice(0, 2).join(" + ") || "the right buyer audience";
  const creatorTopics =
    brand.matchTopics.slice(0, 3).join(", ") ||
    brand.campaignAngles.slice(0, 2).join(", ") ||
    "creator-native content in your niche";
  const platforms = brand.preferredPlatforms.slice(0, 2).join(" and ");
  const platformHint = platforms ? ` on ${platforms}` : "";

  return (
    `From your site, ${brand.name} looks like a ${category} brand focused on ${goal}. ` +
    `Best-fit creators are those already posting about ${creatorTopics}${platformHint}, ` +
    `with audience overlap around ${audience}.`
  );
}

function mergeDirectiveValues(existing: string[], patch: string[] | undefined) {
  if (!patch?.length) return existing;
  return uniqPhrases([...existing, ...patch]);
}

function parseIntentPatch(text: string): ParsedIntentPatch {
  const preferencePatch: Partial<CampaignPreferences> = {};
  const directivePatch: Partial<RankingDirectives> = {};
  const normalized = text.toLowerCase();
  const changes: string[] = [];

  const partnershipType = detectPartnershipType(normalized);
  if (partnershipType) {
    preferencePatch.partnershipType = partnershipType;
    changes.push(`collaboration type: ${partnershipLabel(partnershipType)}`);
  }

  const compensationModel = detectCompensationModel(normalized);
  if (compensationModel) {
    preferencePatch.compensationModel = compensationModel;
    changes.push(`comp model: ${compensationModelLabel(compensationModel)}`);
    if (compensationModel === "cpm" && !detectCompensationUnit(normalized)) {
      preferencePatch.compensationUnit = "per_1k_views";
    }
  }

  const compensationUnit = detectCompensationUnit(normalized);
  if (compensationUnit) {
    preferencePatch.compensationUnit = compensationUnit;
  }

  if (/no fixed budget|no budget|open budget|flexible budget|budget tbd/i.test(normalized)) {
    preferencePatch.compensationAmount = null;
    preferencePatch.budgetCaptured = true;
    changes.push("budget: no fixed cap");
  } else {
    const amount = extractBudgetAmount(text);
    if (amount !== null) {
      preferencePatch.compensationAmount = amount;
      preferencePatch.budgetCaptured = true;
      changes.push(`budget: $${amount}`);
    }
  }

  const campaignGoals = detectCampaignGoals(normalized);
  if (campaignGoals.length) {
    directivePatch.campaignGoals = campaignGoals;
    changes.push(`goal: ${campaignGoals.slice(0, 2).join(" + ")}`);
  }

  const preferredPlatforms = detectPreferredPlatforms(normalized);
  if (preferredPlatforms.length) {
    directivePatch.preferredPlatforms = preferredPlatforms;
    changes.push(`platform priority: ${preferredPlatforms.join(", ")}`);
  }

  const priorityNiches = detectPriorityNiches(text);
  if (priorityNiches.length) {
    directivePatch.priorityNiches = priorityNiches;
    changes.push(`niche priority: ${priorityNiches.slice(0, 2).join(", ")}`);
  }

  const priorityTopics = detectPriorityTopics(text, priorityNiches);
  if (priorityTopics.length) {
    directivePatch.priorityTopics = priorityTopics;
  }

  return { preferencePatch, directivePatch, changes };
}

function budgetFilter(rows: RankedCreator[], budget: number) {
  return rows
    .filter((r) => {
      const p = estimatedPrice(r.creator);
      return p !== null && p <= budget * 1.1;
    })
    .sort((a, b) => b.score - a.score);
}

function summarizeCreatorsForPrompt(rows: RankedCreator[]) {
  return rows.slice(0, 8).map((r) => ({
    id: r.creator.id,
    name: r.creator.name,
    niche: r.creator.niche,
    platforms: r.creator.platforms ?? [],
    fitScore: Number(r.score) || 0,
    reasons: r.reasons ?? [],
    estimatedEngagement:
      typeof r.creator.estimated_engagement === "number" ? r.creator.estimated_engagement : null,
    avgViews: avgViews(r.creator),
    estPricePerVideo: estimatedPrice(r.creator),
  }));
}

function selectCardsForQuery(text: string, ranked: RankedCreator[], prefs: CampaignPreferences) {
  if (!ranked.length) return undefined;
  const lower = text.toLowerCase();
  const explicitBudget = extractBudgetAmount(text);
  const activeBudget = explicitBudget ?? prefs.compensationAmount;
  const budgeted = activeBudget ? budgetFilter(ranked, activeBudget) : [];

  if (/(budget|\$|price|cost)/i.test(lower)) {
    if (!activeBudget) return ranked.slice(0, 3);
    return budgeted.length ? budgeted.slice(0, 6) : ranked.slice(0, 3);
  }

  if (/(top|best|fit|match|creator|recommend|shortlist)/i.test(lower)) {
    return (budgeted.length ? budgeted : ranked).slice(0, 6);
  }

  if (/(why|reason|explain)/i.test(lower)) {
    return (budgeted.length ? budgeted : ranked).slice(0, 3);
  }

  return undefined;
}

const INDEXING_STATUS_LINES = [
  "Scanning creator graph for relevant profiles...",
  "Computing cross-platform compatibility signals...",
  "Ranking creator cards for your brand strategy...",
];

const THINKING_STATUS_LINES = [
  "Thinking through your request...",
  "Processing budget and performance constraints...",
  "Building the best creator shortlist...",
];

const PREFERENCE_SYNC_STATUS_LINES = [
  "Updating campaign intent and priorities...",
  "Recomputing creator shortlist with new constraints...",
  "Refreshing compatibility scores with your niche boosts...",
];

function creatorSummarySnapshot(r: RankedCreator) {
  const c = r.creator;
  const platforms = creatorPlatforms(c).map((platform) => PLATFORM_META[platform].label);
  const topics = (c.metrics?.top_topics ?? []).slice(0, 4);
  const followers = followersTotal(c);
  const rate = estimatedPrice(c);
  const primaryReason =
    r.reasons?.[0] ?? "their audience and content profile align with your campaign priorities";
  const reasonSentence = primaryReason
    ? `${primaryReason.charAt(0).toUpperCase()}${primaryReason.slice(1)}.`
    : "";

  return {
    about: `${c.name} is a ${c.niche} creator${
      platforms.length ? ` active on ${platforms.join(", ")}` : ""
    }. ${reasonSentence}`.trim(),
    platforms: platforms.length ? platforms.join(" • ") : "Platform signals still enriching",
    reach: followers ? `${compactCount(followers)} followers` : "Reach signal pending",
    estRate: rate ? `$${compactCount(rate)}/video` : "Rate signal pending",
    themes: topics.length ? topics.join(", ") : "No strong topic tags yet",
    whyFit: primaryReason,
    topics,
  };
}

function CreatorCardsGrid({ cards }: { cards: RankedCreator[] }) {
  const [expandedCardKey, setExpandedCardKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    setExpandedCardKey((prev) => {
      if (!prev) return null;
      const stillExists = cards.some((item, idx) => `${item.creator.id}-${idx}` === prev);
      return stillExists ? prev : null;
    });
  }, [cards]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((r, index) => {
        const c = r.creator;
        const cardKey = `${c.id}-${index}`;
        const isExpanded = expandedCardKey === cardKey;
        const followers = followersTotal(c);
        const p = estimatedPrice(c);
        const stan = stanLink(c);
        const stanSlugValue = stanSlug(stan);
        const user = creatorUsername(c);
        const platforms = creatorPlatforms(c).slice(0, 4);
        const photoUrl = profilePhotoUrl(c);
        const topics = (c.metrics?.top_topics ?? []).slice(0, 3);
        const summary = creatorSummarySnapshot(r);

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
            style={{ animationDelay: `${index * 85}ms` }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(280px_140px_at_0%_0%,rgba(199,158,255,0.24),transparent_62%)]" />
            <div className={isExpanded ? "relative min-h-[520px]" : "relative"}>
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
                      {stanSlugValue ? (
                        <a
                          href={`https://stan.store/${stanSlugValue}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="truncate text-[11px] text-violet-200/90 underline underline-offset-4 transition hover:text-violet-100"
                        >
                          stan.store/{stanSlugValue}
                        </a>
                      ) : (
                        <p className="text-[11px] text-white/45">no stan.store link</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full bg-emerald-400/18 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-200/30">
                        {formatPct(Number(r.score) || 0)}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-white/70 ring-1 ring-white/15">
                        compat
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
                    <NicheStanleyPortrait niche={c.niche} />
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
                        {p ? `$${compactCount(p)}/video` : "—"}
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

                  {r.reasons?.[0] ? (
                    <p className="text-[11px] leading-5 text-white/62">Why: {r.reasons[0]}</p>
                  ) : null}
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
                    <span className="rounded-full bg-emerald-400/18 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-200/30">
                      {formatPct(Number(r.score) || 0)} fit
                    </span>
                  </div>

                  <p className="text-[13px] leading-6 text-white/88">{summary.about}</p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Platforms</p>
                      <p className="text-[12px] text-white/86">{summary.platforms}</p>
                    </div>
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Estimated Reach</p>
                      <p className="text-[12px] text-white/86">{summary.reach}</p>
                    </div>
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Rate Benchmark</p>
                      <p className="text-[12px] text-white/86">{summary.estRate}</p>
                    </div>
                    <div className="rounded-lg bg-black/24 px-3 py-2 ring-1 ring-white/12">
                      <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Why Match</p>
                      <p className="text-[12px] text-white/86">{summary.whyFit}</p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-black/22 px-3 py-2 ring-1 ring-white/12">
                    <p className="text-[10px] uppercase tracking-[0.09em] text-white/48">Content Themes</p>
                    <p className="text-[12px] text-white/84">{summary.themes}</p>
                  </div>

                  {stanSlugValue ? (
                    <a
                      href={`https://stan.store/${stanSlugValue}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-violet-100 ring-1 ring-white/16 transition hover:bg-white/15"
                    >
                      Open stan.store/{stanSlugValue}
                    </a>
                  ) : null}

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

export default function BrandChatExperience({
  brand,
  crawlSummary,
}: {
  brand: BrandView;
  crawlSummary: CrawlSummary;
}) {
  const router = useRouter();
  const [preferences, setPreferences] = React.useState<CampaignPreferences>(() =>
    inferInitialPreferences(brand)
  );
  const [rankingDirectives, setRankingDirectives] = React.useState<RankingDirectives>(() =>
    inferInitialDirectives()
  );
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [ranked, setRanked] = React.useState<RankedCreator[]>([]);
  const [decks, setDecks] = React.useState<CreatorDeck[]>([]);
  const [activeDeckSignature, setActiveDeckSignature] = React.useState<string | null>(null);
  const [showDeckInCenter, setShowDeckInCenter] = React.useState(false);
  const [loadingCreators, setLoadingCreators] = React.useState(true);
  const [syncingPreferences, setSyncingPreferences] = React.useState(false);
  const [typingMessageId, setTypingMessageId] = React.useState<string | null>(null);
  const [typingReadyMessageId, setTypingReadyMessageId] = React.useState<string | null>(null);
  const [processingLineIndex, setProcessingLineIndex] = React.useState(0);
  const [agentY, setAgentY] = React.useState(0);
  const [agentVisible, setAgentVisible] = React.useState(false);
  const [agentParticlePos, setAgentParticlePos] = React.useState({ left: 0, top: 0 });
  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
  const placeholderRef = React.useRef("Message Stan-Lee");
  const [animatedPlaceholder, setAnimatedPlaceholder] = React.useState("Message Stan-Lee");
  const [outgoingPlaceholder, setOutgoingPlaceholder] = React.useState<string | null>(null);
  const [placeholderIn, setPlaceholderIn] = React.useState(false);
  const placeholderSwapTimerRef = React.useRef<number | null>(null);
  const placeholderClearTimerRef = React.useRef<number | null>(null);
  const placeholderInTimerRef = React.useRef<number | null>(null);
  const [chipMorph, setChipMorph] = React.useState<ChipMorphState | null>(null);
  const [isHandoffEntering, setIsHandoffEntering] = React.useState(false);
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const assistantMessageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const thinkingAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const pendingUserScrollIdRef = React.useRef<string | null>(null);
  const composerTextAreaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const autoFollowRef = React.useRef(true);
  const lastAutoFollowMsRef = React.useRef(0);
  const hasShownTopMatchesRef = React.useRef(false);

  const rectBoxToSection = React.useCallback(
    (rect: Pick<DOMRect, "left" | "top" | "width" | "height">): RectBox | null => {
      const section = sectionRef.current;
      if (!section) return null;
      const sectionRect = section.getBoundingClientRect();
      return {
        left: rect.left - sectionRect.left + section.scrollLeft,
        top: rect.top - sectionRect.top + section.scrollTop,
        width: rect.width,
        height: rect.height,
      };
    },
    []
  );

  const latestAssistantMessageId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  const activeDeck = React.useMemo(() => {
    if (!decks.length) return null;
    return decks.find((d) => d.signature === activeDeckSignature) ?? decks[0];
  }, [decks, activeDeckSignature]);

  const agentTargetMessageId = typingMessageId ?? latestAssistantMessageId;
  const queueTypingMessage = React.useCallback((messageId: string) => {
    setTypingReadyMessageId(null);
    setTypingMessageId(messageId);
  }, []);
  const isAssistantTyping = Boolean(typingMessageId && typingReadyMessageId === typingMessageId);
  const isStagingAssistantTyping = Boolean(
    typingMessageId && typingReadyMessageId !== typingMessageId
  );
  const showProcessing =
    sending || loadingCreators || syncingPreferences || isStagingAssistantTyping;
  const processingLines = loadingCreators
    ? INDEXING_STATUS_LINES
    : syncingPreferences
    ? PREFERENCE_SYNC_STATUS_LINES
    : THINKING_STATUS_LINES;
  const shouldUseThinkingAnchor = showProcessing && !typingMessageId;

  const composerPlaceholders = React.useMemo(() => {
    if (showProcessing) return ["Stan-Lee is thinking..."];

    const hasBudget = preferences.compensationAmount !== null;
    const budgetHint = hasBudget
      ? `${preferences.compensationAmount} ${compensationUnitLabel(preferences.compensationUnit)}`
      : "no fixed budget";
    const firstDeckCreator = activeDeck?.cards[0]?.creator?.name ?? null;
    const topPriorityNiche = rankingDirectives.priorityNiches[0] ?? null;

    if (activeDeck) {
      return [
        firstDeckCreator
          ? `Try: "Why does ${firstDeckCreator} fit my brand?"`
          : 'Try: "Why does this deck fit my brand?"',
        topPriorityNiche
          ? `Try: "Keep ${topPriorityNiche} creators as top priority"`
          : 'Try: "Prioritize gym influencers"',
        `Try: "Find a tighter set around ${budgetHint}"`,
      ];
    }

    return [
      `Try: "I need UGC creators around $1 per 1k views for ${brand.name}"`,
      'Try: "Prioritize gym influencers on TikTok"',
      `Try: "Find creators around ${budgetHint}"`,
    ];
  }, [
    showProcessing,
    brand.name,
    preferences.compensationAmount,
    preferences.compensationUnit,
    activeDeck,
    rankingDirectives.priorityNiches,
  ]);

  const composerPlaceholder = React.useMemo(() => {
    const options = composerPlaceholders;
    if (!options.length) return "Message Stan-Lee";
    return options[placeholderIndex % options.length] ?? options[0];
  }, [composerPlaceholders, placeholderIndex]);

  React.useEffect(() => {
    const next = composerPlaceholder || "Message Stan-Lee";
    const current = placeholderRef.current;
    if (next === current) return;

    if (placeholderSwapTimerRef.current) {
      window.clearTimeout(placeholderSwapTimerRef.current);
      placeholderSwapTimerRef.current = null;
    }
    if (placeholderClearTimerRef.current) {
      window.clearTimeout(placeholderClearTimerRef.current);
      placeholderClearTimerRef.current = null;
    }
    if (placeholderInTimerRef.current) {
      window.clearTimeout(placeholderInTimerRef.current);
      placeholderInTimerRef.current = null;
    }

    setPlaceholderIn(false);
    setOutgoingPlaceholder(current || null);

    const swapDelay = current ? PLACEHOLDER_OUT_MS + PLACEHOLDER_GAP_MS : 0;
    placeholderClearTimerRef.current = window.setTimeout(() => {
      setOutgoingPlaceholder(null);
      placeholderClearTimerRef.current = null;
    }, current ? PLACEHOLDER_OUT_MS : 0);

    placeholderSwapTimerRef.current = window.setTimeout(() => {
      setAnimatedPlaceholder(next);
      placeholderRef.current = next;
      setPlaceholderIn(true);
      placeholderSwapTimerRef.current = null;
      placeholderInTimerRef.current = window.setTimeout(() => {
        setPlaceholderIn(false);
        placeholderInTimerRef.current = null;
      }, PLACEHOLDER_IN_MS + 20);
    }, swapDelay);
  }, [composerPlaceholder]);

  React.useEffect(() => {
    return () => {
      if (placeholderSwapTimerRef.current) window.clearTimeout(placeholderSwapTimerRef.current);
      if (placeholderClearTimerRef.current) window.clearTimeout(placeholderClearTimerRef.current);
      if (placeholderInTimerRef.current) window.clearTimeout(placeholderInTimerRef.current);
    };
  }, []);

  const isNearBottom = React.useCallback(() => {
    const section = sectionRef.current;
    if (!section) return true;
    return section.scrollTop + section.clientHeight >= section.scrollHeight - 130;
  }, []);

  const softScrollToBottom = React.useCallback(
    (force = false) => {
      const section = sectionRef.current;
      if (!section) return;
      if (!force && !autoFollowRef.current) return;
      const now = Date.now();
      if (!force && now - lastAutoFollowMsRef.current < 120) return;
      lastAutoFollowMsRef.current = now;
      section.scrollTo({ top: section.scrollHeight, behavior: "smooth" });
    },
    []
  );

  const syncAgentPosition = React.useCallback(() => {
    const section = sectionRef.current;
    if (!section) {
      setAgentVisible(false);
      return;
    }

    const target = shouldUseThinkingAnchor
      ? thinkingAnchorRef.current
      : agentTargetMessageId
      ? assistantMessageRefs.current[agentTargetMessageId]
      : null;

    if (!target) {
      setAgentVisible(false);
      return;
    }

    const sectionRect = section.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextY = targetRect.top - sectionRect.top + section.scrollTop;
    const nextTop = sectionRect.top + nextY - section.scrollTop;
    const nextLeft = sectionRect.left + AGENT_LEFT_PX;
    setAgentY(Math.max(0, nextY));
    setAgentParticlePos({ left: nextLeft, top: nextTop });
    setAgentVisible(true);
  }, [agentTargetMessageId, shouldUseThinkingAnchor]);

  const captureDeck = React.useCallback((cards: RankedCreator[], title: string, reason: string) => {
    if (!cards.length) return;
    const signature = deckSignature(cards);
    const now = new Date().toISOString();
    const nextCards = cards.slice(0, 8);
    setActiveDeckSignature(signature);

    setDecks((prev) => {
      const existing = prev.find((d) => d.signature === signature);
      if (existing) {
        const updated: CreatorDeck = {
          ...existing,
          title,
          reason,
          cards: nextCards,
          updatedAt: now,
        };
        return [updated, ...prev.filter((d) => d.id !== existing.id)];
      }

      const created: CreatorDeck = {
        id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        signature,
        title,
        reason,
        cards: nextCards,
        createdAt: now,
        updatedAt: now,
      };
      return [created, ...prev].slice(0, MAX_DECK_HISTORY);
    });
  }, []);

  React.useEffect(() => {
    const initialPrefs = inferInitialPreferences(brand);
    const initialDirectives = inferInitialDirectives();
    setPreferences(initialPrefs);
    setRankingDirectives(initialDirectives);
    setDecks([]);
    setActiveDeckSignature(null);
    setShowDeckInCenter(false);
    hasShownTopMatchesRef.current = false;

    const intro: Message = {
      id: "intro",
      role: "assistant",
      text: brandSummaryText(brand),
    };
    const kickoff: Message = {
      id: "kickoff-intake",
      role: "assistant",
      text:
        "You can give your full brief in one message. Include collaboration type, pay model, payout target, goal, and any creator priorities (for example: “prioritize gym influencers”). I’ll parse it and refresh matches immediately.",
      quickReplies: COMMON_CHAT_QUICK_REPLIES,
    };

    setMessages([intro, kickoff]);
    queueTypingMessage("kickoff-intake");
  }, [brand, queueTypingMessage]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("cg:route-handoff");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { from?: string; at?: number };
      const isFresh = typeof parsed?.at === "number" && Date.now() - parsed.at < 12_000;
      if (parsed?.from === "home" && isFresh) {
        setIsHandoffEntering(true);
        const id = window.setTimeout(() => setIsHandoffEntering(false), 720);
        return () => window.clearTimeout(id);
      }
    } catch {
      // ignore handoff parse errors
    } finally {
      window.sessionStorage.removeItem("cg:route-handoff");
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCreators(true);
      try {
        const res = await fetch("/api/match-creators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: brand.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rows = Array.isArray(data?.ranked) ? data.ranked : [];
        setRanked(rows);
      } catch {
        if (!cancelled) {
          setMessages((prev) => [
            ...prev,
            {
              id: "err-load",
              role: "assistant",
              text: "I couldn't load creator matches right now. Try again in a moment.",
            },
          ]);
          queueTypingMessage("err-load");
        }
      } finally {
        if (!cancelled) setLoadingCreators(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brand.id, queueTypingMessage]);

  React.useEffect(() => {
    if (!ranked.length) return;
    if (typingMessageId) return;
    if (hasShownTopMatchesRef.current) return;

    hasShownTopMatchesRef.current = true;
    const cards =
      preferences.compensationAmount !== null
        ? budgetFilter(ranked, preferences.compensationAmount).slice(0, 4)
        : ranked.slice(0, 4);
    const cardsToShow = cards.length ? cards : ranked.slice(0, 4);
    const deckTitle =
      preferences.compensationAmount !== null
        ? `Budget deck · $${preferences.compensationAmount} ${compensationUnitLabel(preferences.compensationUnit)}`
        : "Initial top-fit deck";
    captureDeck(cardsToShow, deckTitle, "initial shortlist");

    const note =
      preferences.compensationAmount !== null
        ? ` around $${preferences.compensationAmount} ${compensationUnitLabel(preferences.compensationUnit)}`
        : "";

    const topMessage: Message = {
      id: `top-initial-${Date.now()}`,
      role: "assistant",
      text: `I created your ${deckTitle.toLowerCase()}${note}. If you want a tighter direction, type it naturally (example: “prioritize gym influencers” or “focus on TikTok creators”).`,
    };
    setMessages((prev) => [...prev, topMessage]);
    queueTypingMessage(topMessage.id);
  }, [
    ranked,
    typingMessageId,
    preferences.compensationAmount,
    preferences.compensationUnit,
    captureDeck,
    queueTypingMessage,
  ]);

  React.useEffect(() => {
    if (!showProcessing) return;
    setProcessingLineIndex(0);
    const id = setInterval(() => {
      setProcessingLineIndex((prev) => (prev + 1) % processingLines.length);
    }, 1400);
    return () => clearInterval(id);
  }, [showProcessing, processingLines.length, loadingCreators]);

  React.useEffect(() => {
    setPlaceholderIndex(0);
  }, [composerPlaceholders]);

  React.useEffect(() => {
    if (input.trim().length) return;
    if (composerPlaceholders.length < 2) return;
    const id = window.setInterval(() => {
      if (outgoingPlaceholder || placeholderIn) return;
      setPlaceholderIndex((prev) => (prev + 1) % composerPlaceholders.length);
    }, PLACEHOLDER_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [input, composerPlaceholders, outgoingPlaceholder, placeholderIn]);

  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const onViewportChange = () => {
      autoFollowRef.current = isNearBottom();
      syncAgentPosition();
    };

    onViewportChange();
    window.addEventListener("resize", onViewportChange);
    section.addEventListener("scroll", onViewportChange, { passive: true });

    return () => {
      window.removeEventListener("resize", onViewportChange);
      section.removeEventListener("scroll", onViewportChange);
    };
  }, [isNearBottom, syncAgentPosition]);

  React.useEffect(() => {
    syncAgentPosition();
  }, [syncAgentPosition, messages, typingMessageId]);

  React.useEffect(() => {
    if (!typingMessageId) {
      setTypingReadyMessageId(null);
      return;
    }

    syncAgentPosition();
    const rafId = window.requestAnimationFrame(() => syncAgentPosition());
    const readyId = window.setTimeout(() => {
      setTypingReadyMessageId(typingMessageId);
    }, AGENT_MOVE_MS + 40);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(readyId);
    };
  }, [typingMessageId, syncAgentPosition]);

  React.useEffect(() => {
    const pendingId = pendingUserScrollIdRef.current;
    if (!pendingId) return;

    const section = sectionRef.current;
    if (!section) return;

    const node = messageRefs.current[pendingId];
    if (!node) return;
    const sectionRect = section.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const targetTop = nodeRect.top - sectionRect.top + section.scrollTop - 18;
    section.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    pendingUserScrollIdRef.current = null;
  }, [messages]);

  React.useEffect(() => {
    if (!chipMorph) return;

    const node = messageRefs.current[chipMorph.id];
    if (!node) return;

    const bubble =
      node.querySelector<HTMLElement>('[data-user-bubble="true"]') ?? node;
    const targetRect = rectBoxToSection(bubble.getBoundingClientRect());
    if (!targetRect) return;

    const startId = window.setTimeout(() => {
      setChipMorph((prev) =>
        prev?.id === chipMorph.id ? { ...prev, rect: targetRect, phase: "animating" } : prev
      );
    }, 12);

    const clearId = window.setTimeout(() => {
      setChipMorph((prev) => (prev?.id === chipMorph.id ? null : prev));
    }, 520);

    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(clearId);
    };
  }, [messages, chipMorph, rectBoxToSection]);

  React.useEffect(() => {
    const node = composerTextAreaRef.current;
    if (!node) return;
    node.style.height = "0px";
    const max = 280;
    const next = Math.min(node.scrollHeight, max);
    node.style.height = `${Math.max(32, next)}px`;
    node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
  }, [input]);

  async function syncBrandPreferences(
    nextPrefs: CampaignPreferences,
    nextDirectives: RankingDirectives
  ): Promise<RankedCreator[] | null> {
    const hasAnyPreference =
      nextPrefs.partnershipType !== null ||
      nextPrefs.compensationModel !== null ||
      nextPrefs.budgetCaptured ||
      nextDirectives.campaignGoals.length > 0 ||
      nextDirectives.preferredPlatforms.length > 0 ||
      nextDirectives.priorityNiches.length > 0 ||
      nextDirectives.priorityTopics.length > 0;
    if (!hasAnyPreference) return null;

    setSyncingPreferences(true);
    try {
      await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          brandId: brand.id,
          intakePreferences: {
            partnershipType: nextPrefs.partnershipType,
            compensationModel: nextPrefs.compensationModel,
            compensationAmount: nextPrefs.compensationAmount,
            compensationUnit: nextPrefs.compensationUnit,
            campaignGoals: nextDirectives.campaignGoals,
            preferredPlatforms: nextDirectives.preferredPlatforms,
          },
        }),
      });

      const res = await fetch("/api/match-creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          brandId: brand.id,
          rankingDirectives: {
            priorityNiches: nextDirectives.priorityNiches,
            priorityTopics: nextDirectives.priorityTopics,
            preferredPlatforms: nextDirectives.preferredPlatforms,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data?.ranked)) {
        setRanked(data.ranked);
        return data.ranked as RankedCreator[];
      }
    } catch (err) {
      console.warn("preference sync failed", err);
    } finally {
      setSyncingPreferences(false);
    }
    return null;
  }

  async function submitUserMessage(
    rawText: string,
    opts: { chipOriginRect?: RectBox; sourceKey?: string } = {}
  ) {
    const text = rawText.trim();
    if (!text || sending) return;

    const userMsgId = `u-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      text,
    };
    pendingUserScrollIdRef.current = opts.chipOriginRect ? null : userMsgId;
    if (opts.chipOriginRect) {
      setChipMorph({
        id: userMsgId,
        text,
        rect: opts.chipOriginRect,
        phase: "origin",
        sourceKey: opts.sourceKey ?? null,
      });
    }
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    let nextPrefs = preferences;
    let nextDirectives = rankingDirectives;
    const parsed = parseIntentPatch(text);
    const hasPreferenceUpdate = Object.keys(parsed.preferencePatch).length > 0;
    const hasDirectiveUpdate = Object.keys(parsed.directivePatch).length > 0;
    const hasIntentUpdate = hasPreferenceUpdate || hasDirectiveUpdate;

    if (hasPreferenceUpdate) {
      nextPrefs = {
        ...preferences,
        ...parsed.preferencePatch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(nextPrefs);
    }

    if (hasDirectiveUpdate) {
      nextDirectives = {
        campaignGoals: mergeDirectiveValues(
          rankingDirectives.campaignGoals,
          parsed.directivePatch.campaignGoals
        ),
        priorityNiches: mergeDirectiveValues(
          rankingDirectives.priorityNiches,
          parsed.directivePatch.priorityNiches
        ),
        priorityTopics: mergeDirectiveValues(
          rankingDirectives.priorityTopics,
          parsed.directivePatch.priorityTopics
        ),
        preferredPlatforms: mergeDirectiveValues(
          rankingDirectives.preferredPlatforms,
          parsed.directivePatch.preferredPlatforms
        ),
        updatedAt: new Date().toISOString(),
      };
      setRankingDirectives(nextDirectives);
    }

    try {
      let rankedSource = ranked;

      if (hasIntentUpdate) {
        const refreshedRanked = await syncBrandPreferences(nextPrefs, nextDirectives);
        if (refreshedRanked?.length) rankedSource = refreshedRanked;
        hasShownTopMatchesRef.current = true;
        const cardsForDeck =
          selectCardsForQuery(text, rankedSource, nextPrefs) ??
          (nextPrefs.compensationAmount !== null
            ? budgetFilter(rankedSource, nextPrefs.compensationAmount).slice(0, 6)
            : rankedSource.slice(0, 6));
        if (cardsForDeck.length) {
          captureDeck(
            cardsForDeck,
            deckTitleFromContext(text, nextPrefs),
            "campaign intent updated from chat"
          );
        }

        const summary = parsed.changes.length
          ? `Updated ${parsed.changes.join(" · ")}. ✅`
          : "Updated your campaign brief. ✅";
        const priorityNote = nextDirectives.priorityNiches.length
          ? " I boosted creators that match your priority niches without replacing your base dossier niche."
          : " I refreshed your ranking with the latest constraints.";
        const deckNote = cardsForDeck.length
          ? " I updated the active deck so you can compare it with prior decks."
          : " Creator cards are still loading, but your ranking directives were saved.";
        const assistant: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `${summary}${priorityNote}${deckNote}`,
        };
        setMessages((prev) => [...prev, assistant]);
        queueTypingMessage(assistant.id);
        return;
      }

      const history = [...messages, userMsg]
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch("/api/brand-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          crawlSummary,
          userMessage: text,
          history,
          topCreators: summarizeCreatorsForPrompt(ranked),
          campaignPreferences: {
            partnershipType: nextPrefs.partnershipType,
            compensationModel: nextPrefs.compensationModel,
            compensationAmount: nextPrefs.compensationAmount,
            compensationUnit: nextPrefs.compensationUnit,
          },
          rankingDirectives: {
            campaignGoals: nextDirectives.campaignGoals,
            preferredPlatforms: nextDirectives.preferredPlatforms,
            priorityNiches: nextDirectives.priorityNiches,
            priorityTopics: nextDirectives.priorityTopics,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      const replyText =
        typeof data?.reply === "string" && data.reply.trim().length
          ? data.reply.trim()
          : "I can help with creator shortlist strategy, budget-fit options, or next-step campaign planning. Share what matters most right now.";

      const cardsForDeck = selectCardsForQuery(text, rankedSource, nextPrefs) ?? [];
      if (cardsForDeck.length) {
        captureDeck(cardsForDeck, deckTitleFromContext(text, nextPrefs), "chat query");
      }

      const optionReplies = extractOptionQuickReplies(replyText);

      const assistant: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: replyText,
        quickReplies: optionReplies,
      };

      setMessages((prev) => [...prev, assistant]);
      queueTypingMessage(assistant.id);
    } catch {
      const fallback: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text:
          "I hit a temporary issue generating a response. Ask again and I can continue with your campaign intake or shortlist review.",
        quickReplies: undefined,
      };
      setMessages((prev) => [...prev, fallback]);
      queueTypingMessage(fallback.id);
    } finally {
      setSending(false);
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    await submitUserMessage(input);
  }

  return (
    <main className={["h-screen w-full overflow-hidden bg-[#2f3140] text-white", isHandoffEntering ? "cg-brand-enter" : ""].join(" ")}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_650px_at_50%_40%,rgba(110,120,255,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_100%,rgba(130,70,255,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)]" />
      </div>

      {isHandoffEntering ? <div className="pointer-events-none fixed inset-0 z-40 cg-brand-handoff-layer" /> : null}

      <header className="fixed left-0 right-0 top-0 z-40 flex w-full items-start px-1 py-1 pr-2">
        <div className="relative mx-auto w-full max-w-6xl">
          <div className="z-20 flex h-[42px] items-center">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          </div>

          <div className="pointer-events-auto absolute left-1/2 top-1 z-30 -translate-x-1/2">
            <div className="flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-1 backdrop-blur-sm sm:px-6">
              <Image src="/Stan-Lee-Agent.png" alt="Stan-Lee" width={20} height={20} />
              <p className="text-base font-semibold tracking-tight text-white">Stan-Lee</p>
            </div>
          </div>

          <div className="pointer-events-auto absolute right-2 top-1 z-30 flex items-center">
            <a
              href="https://shernanjavier.com/"
              target="_blank"
              rel="noreferrer"
              className="px-2 py-2 text-[11px] text-white/70 underline underline-offset-4 transition hover:text-white/95"
            >
              built by shernan javier
            </a>
          </div>
        </div>
      </header>

      <section className="relative mx-auto h-full w-full max-w-[1480px] px-4 pt-20">
        <section
          ref={sectionRef}
          className="hide-scrollbar relative mx-auto h-[calc(100vh-80px)] w-full max-w-3xl space-y-6 overflow-y-auto pb-[220px]"
        >
        <div
          className="pointer-events-none absolute z-10 will-change-transform"
          style={{
            left: AGENT_LEFT_PX,
            opacity: agentVisible ? 1 : 0,
            transform: `translate3d(0, ${agentY}px, 0)`,
            transition:
              "transform 320ms cubic-bezier(0.16, 0.9, 0.25, 1), opacity 200ms ease-out",
          }}
        >
          <div className="relative">
            <Image
              src="/Stan-Lee-Agent.png"
              alt="Stan-Lee"
              width={40}
              height={40}
              className={typingMessageId ? "agent-thinking" : "animate-floaty"}
            />
            {showProcessing && agentVisible && !isAssistantTyping ? (
              <div
                key={`${loadingCreators ? "index" : syncingPreferences ? "pref" : "thinking"}-${processingLineIndex}`}
                className="stan-thinking-bubble processing-pop absolute left-[48px] top-1"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#bda9ff]" />
                <span>{processingLines[processingLineIndex]}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div
          className={[
            "stan-writing-particles-overlay",
            typingReadyMessageId && agentVisible ? "is-active" : "",
          ].join(" ")}
          style={{
            left: agentParticlePos.left,
            top: agentParticlePos.top,
          }}
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        {messages.map((m) => {
          const morphTargetPhase = chipMorph?.id === m.id ? chipMorph.phase : null;

          return (
            <div
              key={m.id}
              ref={(node) => {
                messageRefs.current[m.id] = node;
              }}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div className={m.role === "user" ? "max-w-[85%]" : "w-full max-w-2xl pl-14"}>
                {m.role === "assistant" ? (
                  <div
                    ref={(node) => {
                      assistantMessageRefs.current[m.id] = node;
                    }}
                    className="w-full"
                  >
                    {typingMessageId === m.id && typingReadyMessageId === m.id ? (
                      <TypewriterText
                        text={m.text}
                        speedMs={12}
                        onTick={() => {
                          syncAgentPosition();
                          softScrollToBottom(false);
                        }}
                        onDone={() => {
                          setTypingMessageId((current) => (current === m.id ? null : current));
                          setTypingReadyMessageId((current) =>
                            current === m.id ? null : current
                          );
                          requestAnimationFrame(() => softScrollToBottom(false));
                        }}
                      />
                    ) : typingMessageId === m.id ? (
                      <p aria-hidden="true" className="h-6" />
                    ) : (
                      <p className="whitespace-pre-wrap text-[16px] leading-[1.55] tracking-[-0.01em] text-white/95 sm:text-[17px]">
                        {m.text}
                      </p>
                    )}
                  </div>
                ) : (
                  <div
                    data-user-bubble="true"
                    data-morph-phase={morphTargetPhase ?? undefined}
                    className={[
                      "rounded-2xl bg-[linear-gradient(135deg,#505665,#60677a)] px-4 py-3 text-sm text-white",
                      morphTargetPhase ? "chip-morph-target" : "",
                    ].join(" ")}
                  >
                    {m.text}
                  </div>
                )}

                {(m.quickReplies?.length || m.id === latestAssistantMessageId) &&
                typingMessageId !== m.id &&
                m.id === latestAssistantMessageId ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(m.quickReplies?.length ? m.quickReplies : COMMON_CHAT_QUICK_REPLIES).map(
                      (reply, index) => {
                        const chipKey = `${m.id}-${index}-${reply}`;
                        const isMorphSource = chipMorph?.sourceKey === chipKey;

                        return (
                          <button
                            key={chipKey}
                            type="button"
                            disabled={sending}
                            onClick={(e) => {
                              const origin = rectBoxToSection(
                                e.currentTarget.getBoundingClientRect()
                              );
                              if (!origin) {
                                void submitUserMessage(reply);
                                return;
                              }
                              void submitUserMessage(reply, {
                                chipOriginRect: origin,
                                sourceKey: chipKey,
                              });
                            }}
                            className={[
                              "chat-chip-pop cursor-pointer rounded-full bg-white/10 px-3 py-1.5 text-xs text-white ring-1 ring-white/20 transition duration-200 hover:-translate-y-[1px] hover:scale-[1.03] hover:bg-white/20 hover:ring-white/35 hover:shadow-[0_8px_20px_rgba(109,95,255,0.28)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:bg-white/10 disabled:hover:shadow-none",
                              isMorphSource ? "opacity-0" : "",
                            ].join(" ")}
                            style={{ animationDelay: `${index * 55}ms` }}
                          >
                            {reply}
                          </button>
                        );
                      }
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <div
          ref={thinkingAnchorRef}
          className="pointer-events-none ml-14 h-8 w-full"
          aria-hidden="true"
        />

        {showDeckInCenter && activeDeck ? (
          <div className="ml-14 space-y-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white/95">{activeDeck.title}</p>
                <p className="text-xs text-white/60">
                  {activeDeck.cards.length} creators · {activeDeck.reason} · updated {prettyDeckTime(activeDeck.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeckInCenter(false)}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-xs ring-1 ring-white/20 hover:bg-white/15"
              >
                hide center
              </button>
            </div>
            <CreatorCardsGrid cards={activeDeck.cards} />
          </div>
        ) : null}

        {chipMorph ? (
          <div
            aria-hidden="true"
            className={[
              "chip-morph-glass",
              chipMorph.phase === "animating" ? "is-animating" : "",
            ].join(" ")}
            style={{
              left: chipMorph.rect.left,
              top: chipMorph.rect.top,
              width: chipMorph.rect.width,
              height: chipMorph.rect.height,
            }}
          >
            <span className="truncate px-3 text-xs font-medium text-white/95">{chipMorph.text}</span>
          </div>
        ) : null}
        </section>

        <aside className="pointer-events-none hidden min-[1450px]:block">
          <div className="pointer-events-auto fixed right-6 top-20 z-30 w-[320px] rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white/95">Creator Decks</p>
              <button
                type="button"
                onClick={() => setShowDeckInCenter((v) => !v)}
                disabled={!activeDeck}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] ring-1 ring-white/20 hover:bg-white/15 disabled:opacity-50"
              >
                {showDeckInCenter ? "pin to side" : "open in center"}
              </button>
            </div>

            {!decks.length ? (
              <p className="text-xs text-white/60">
                No creator deck yet. Ask for top matches or update budget to generate one.
              </p>
            ) : (
              <div className="space-y-2">
                {decks.map((deck) => {
                  const active = activeDeck?.id === deck.id;
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => setActiveDeckSignature(deck.signature)}
                      className={[
                        "w-full rounded-xl px-3 py-2 text-left ring-1 transition",
                        active
                          ? "bg-[#6c5cff]/25 ring-[#8d80ff]/55"
                          : "bg-white/5 ring-white/15 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <p className="text-xs font-semibold text-white/95">{deck.title}</p>
                      <p className="mt-0.5 text-[11px] text-white/60">
                        {deck.cards.length} creators · {prettyDeckTime(deck.updatedAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {activeDeck ? (
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
                  Active deck preview
                </p>
                <div className="hide-scrollbar max-h-[340px] space-y-2 overflow-y-auto">
                  {activeDeck.cards.slice(0, 6).map((item) => (
                    <div
                      key={`preview-${activeDeck.id}-${item.creator.id}`}
                      className="rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-white/90">{item.creator.name}</p>
                        <span className="rounded-full bg-emerald-400/18 px-2 py-0.5 text-[10px] font-semibold text-emerald-100 ring-1 ring-emerald-200/30">
                          {formatPct(Number(item.score) || 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/55">{item.creator.niche}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-3 pb-5 pt-4 pointer-events-auto sm:px-4">
          <div className="order-1 rounded-2xl border border-gray-700 bg-[#40414f]/80 px-4 py-4 backdrop-blur-md transition-all duration-300 focus-within:scale-[1.01] focus-within:border-gray-600">
            <form onSubmit={onSend} className="flex items-center gap-2">
              <div className="flex items-center">
                <button
                  type="button"
                  disabled
                  aria-label="Add files"
                  className="flex h-8 w-8 min-h-[2rem] min-w-[2rem] items-center justify-center rounded-full bg-[#4a4b57] text-gray-400 opacity-70"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>

              <div className="relative w-full flex-1">
                {input.trim().length === 0 ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-1 overflow-hidden"
                  >
                    {outgoingPlaceholder ? (
                      <span className="composer-placeholder composer-placeholder-out">
                        {outgoingPlaceholder}
                      </span>
                    ) : null}
                    <span
                      key={animatedPlaceholder}
                      className={[
                        "composer-placeholder",
                        placeholderIn ? "composer-placeholder-in" : "",
                      ].join(" ")}
                    >
                      {animatedPlaceholder}
                    </span>
                  </div>
                ) : null}
                <textarea
                  ref={composerTextAreaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitUserMessage(input);
                    }
                  }}
                  rows={1}
                  aria-label="Message Stan-Lee"
                  placeholder=""
                  className="min-h-[24px] max-h-[280px] w-full resize-none bg-transparent px-0 py-1 text-base font-medium tracking-tight text-gray-100 placeholder-transparent outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  aria-label="Microphone"
                  className="flex h-8 w-8 min-h-[2rem] min-w-[2rem] items-center justify-center rounded-full bg-[#4a4b57] text-gray-400 opacity-70"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
                <button
                  type="submit"
                  title="Send message"
                  disabled={sending || input.trim().length === 0}
                  className="flex h-8 w-8 min-h-[2rem] min-w-[2rem] items-center justify-center rounded-full bg-gradient-to-b from-[#6355ff] to-[#5040ff] transition-all duration-200 hover:scale-110 hover:rotate-12 hover:from-[#5040ff] hover:to-[#6355ff] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 disabled:hover:rotate-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="white" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5V4.5M5.25 9.75L12 4.5l6.75 5.25" />
                  </svg>
                </button>
              </div>

              <input type="file" multiple disabled className="hidden" />
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
