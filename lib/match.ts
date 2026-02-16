// lib/match.ts

export type Creator = {
  id: string;
  niche: string;
  platforms: string[];
  audience_types: string[];
  content_style?: string | null;
  products_sold: string[];
  estimated_engagement?: number | null;
  metrics?: {
    top_topics?: string[];
    post_frequency_per_week?: number;
    content_formats?: string[];
    platform_metrics?: Record<
      string,
      { followers?: number; avg_views?: number; engagement_rate?: number }
    >;
  };
};

export type Brand = {
  category?: string | null;
  target_audience: string[];
  goals: string[];
  preferred_platforms: string[];
  campaign_angles?: string[]; // ✅ used for topic overlap
  match_topics?: string[];
};

function normalizeTopic(t: string) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(
      /\b(journey|journeys|tips|guide|guides|story|stories|routine|routines|program|programs)\b/g,
      ""
    )
    .trim();
}

const TOPIC_STOPWORDS = new Set([
  "the","a","an","and","or","to","for","of","in","on","with","at","by",
  "from","into","your","my","our",
  "tips","tip","guide","guides","story","stories","journey","journeys",
  "routine","routines","program","programs","motivation","success","stories",
  "how","what","why","best","top"
]);

function topicKeywords(list: string[]) {
  const out = new Set<string>();
  for (const raw of list ?? []) {
    const tokens = String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !TOPIC_STOPWORDS.has(w));
    for (const t of tokens) out.add(t);
  }
  return [...out];
}


function overlap(a: string[] = [], b: string[] = []) {
  const A = new Set((a ?? []).map((x) => String(x).toLowerCase()));
  const B = new Set((b ?? []).map((x) => String(x).toLowerCase()));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(A.size, B.size);
}

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pickBestPlatform(brandPlatforms: string[] = [], creatorPlatforms: string[] = []) {
  const b = new Set((brandPlatforms ?? []).map((p) => p.toLowerCase()));
  for (const p of creatorPlatforms ?? []) {
    if (b.has(String(p).toLowerCase())) return String(p).toLowerCase();
  }
  return creatorPlatforms?.[0] ? String(creatorPlatforms[0]).toLowerCase() : null;
}

function engagementScoreFor(creator: Creator, bestPlatform: string | null) {
  // prefer metrics.platform_metrics[bestPlatform].engagement_rate
  const m = creator?.metrics?.platform_metrics ?? {};
  const rateFromPlatform = bestPlatform ? m?.[bestPlatform]?.engagement_rate : undefined;
  const rate = Number(rateFromPlatform ?? creator?.estimated_engagement ?? 0);

  // normalize so "target" engagement maps to 1.0
  const target = 0.05; // 5% is a solid prior; tune per niche later
  return clamp01(rate / target);
}

export function scoreMatch(brand: Brand, creator: Creator) {
  const nicheScore = brand.category
    ? creator.niche.toLowerCase().includes(brand.category.toLowerCase())
      ? 1
      : 0.3
    : 0.4;

  const bp = (brand.preferred_platforms ?? []).map((p) => String(p).toLowerCase());
  const cp = (creator.platforms ?? []).map((p) => String(p).toLowerCase());
  const platformScore = cp.some((p) => bp.includes(p)) ? 1 : 0;
    

  const brandTopics =
  brand.match_topics?.length ? brand.match_topics : (brand.campaign_angles ?? brand.goals);
  
  const creatorTopics = creator?.metrics?.top_topics ?? [];
  
  const topicScore = overlap(
    topicKeywords(brandTopics),
    topicKeywords(creatorTopics)
  );
  

  const bestPlatform = pickBestPlatform(brand.preferred_platforms ?? [], creator.platforms ?? []);
  const engagementScore = engagementScoreFor(creator, bestPlatform);

  // README weights: 0.35 niche + 0.25 topics + 0.20 platform + 0.20 engagement
  const score =
    nicheScore * 0.35 +
    topicScore * 0.25 +
    platformScore * 0.20 +
    engagementScore * 0.20;

  const reasons: string[] = [];
  if (nicheScore >= 0.8) reasons.push("category/niche match");
  if (topicScore >= 0.25) reasons.push("topic overlap");
  if (platformScore >= 0.5) reasons.push("platform alignment");
  if (engagementScore >= 0.8) reasons.push("strong engagement");

  // optional: audience fit is explainability-only (not part of score)
  const audienceScore = overlap(brand.target_audience ?? [], creator.audience_types ?? []);
  if (audienceScore >= 0.3) reasons.push("audience fit");

  return {
    score: Number(score.toFixed(4)),
    reasons,
    breakdown: {
      nicheScore: Number(nicheScore.toFixed(4)),
      topicScore: Number(topicScore.toFixed(4)),
      platformScore: Number(platformScore.toFixed(4)),
      engagementScore: Number(engagementScore.toFixed(4)),
      bestPlatform,
    },
  };
}
