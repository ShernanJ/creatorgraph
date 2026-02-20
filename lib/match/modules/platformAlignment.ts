import type { Creator, MatchSpec, PlatformMetric, ScoreResult } from "../types";

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normalizePlatform(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("insta")) return "instagram";
  if (v.includes("tiktok") || v === "tt") return "tiktok";
  if (v.includes("youtube") || v.includes("youtu") || v === "yt") return "youtube";
  if (v === "x" || v.includes("x.com") || v.includes("twitter")) return "x";
  if (v.includes("linkedin") || v === "in") return "linkedin";
  return v;
}

function normalizeList(xs: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of xs) {
    const value = normalizePlatform(String(raw ?? ""));
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeMetricMap(
  platformMetrics: Record<string, PlatformMetric> | undefined
): Record<string, PlatformMetric> {
  const out: Record<string, PlatformMetric> = {};
  for (const [platform, metric] of Object.entries(platformMetrics ?? {})) {
    const normalized = normalizePlatform(platform);
    if (!normalized || !metric) continue;
    out[normalized] = metric;
  }
  return out;
}

function platformStrength(args: {
  metric: PlatformMetric | undefined;
  maxAvgViews: number;
  hasPlatform: boolean;
}) {
  if (!args.hasPlatform) return 0;
  if (!args.metric) return 0.42;

  let strength = 0.35;

  const avgViews = toFiniteNumber(args.metric.avg_views);
  if (avgViews && avgViews > 0 && args.maxAvgViews > 0) {
    strength +=
      0.35 * clamp01(Math.log1p(avgViews) / Math.log1p(Math.max(avgViews, args.maxAvgViews)));
  } else {
    const followers = toFiniteNumber(args.metric.followers);
    if (followers && followers > 0) {
      strength += 0.18 * clamp01(Math.log1p(followers) / Math.log1p(1_000_000));
    }
  }

  const engagementRate = toFiniteNumber(args.metric.engagement_rate);
  if (engagementRate && engagementRate > 0) {
    strength += 0.2 * clamp01(engagementRate / 0.07);
  }

  const confidence = toFiniteNumber(args.metric.confidence);
  if (confidence && confidence > 0) {
    strength += 0.1 * clamp01(confidence);
  }

  const sampleSize = toFiniteNumber(args.metric.sample_size);
  if (sampleSize && sampleSize > 0) {
    strength += 0.06 * clamp01(sampleSize / 6);
  }

  return clamp01(strength);
}

export function platformAlignment(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandPlatforms = normalizeList(spec.platforms ?? []);
  if (brandPlatforms.length === 0) {
    return { score: 0.5, confidence: 0.2, reasons: [] };
  }

  const metricMap = normalizeMetricMap(creator.metrics?.platform_metrics);
  const creatorPlatforms = normalizeList([
    ...(creator.platforms ?? []),
    ...Object.keys(metricMap),
    creator.metrics?.compatibility_signals?.primary_platform ?? "",
  ]);

  if (creatorPlatforms.length === 0) {
    return { score: 0, confidence: 0.4, reasons: [] };
  }

  const creatorSet = new Set(creatorPlatforms);
  const avgViewValues = Object.values(metricMap)
    .map((m) => toFiniteNumber(m.avg_views))
    .filter((n): n is number => n !== null && n > 0);
  const maxAvgViews = avgViewValues.length ? Math.max(...avgViewValues) : 0;

  let withPresence = 0;
  let withMetrics = 0;
  const scores: number[] = [];
  for (const platform of brandPlatforms) {
    const hasPlatform = creatorSet.has(platform);
    if (hasPlatform) withPresence += 1;
    const metric = metricMap[platform];
    if (metric) withMetrics += 1;
    scores.push(
      platformStrength({
        metric,
        maxAvgViews,
        hasPlatform,
      })
    );
  }

  const score = scores.reduce((sum, s) => sum + s, 0) / brandPlatforms.length;
  const presenceCoverage = withPresence / brandPlatforms.length;
  const metricsCoverage = withMetrics / brandPlatforms.length;
  const confidence = clamp01(
    0.35 +
      0.3 * presenceCoverage +
      0.28 * metricsCoverage +
      0.05 * Math.min(1, brandPlatforms.length / 4)
  );

  const reasons: string[] = [];
  if (score >= 0.45) reasons.push("platform alignment");
  if (metricsCoverage >= 0.5 && score >= 0.45) reasons.push("performs on preferred platforms");

  return {
    score,
    confidence,
    reasons,
  };
}
