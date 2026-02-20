import type { Creator, MatchSpec, PlatformMetric, ScoreResult } from "../types";

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function deriveEngagementFromPlatformMetrics(
  platformMetrics: Record<string, PlatformMetric> | undefined
) {
  if (!platformMetrics) return null;

  const entries = Object.values(platformMetrics);
  if (entries.length === 0) return null;

  const erValues = entries
    .map((m) => (typeof m.engagement_rate === "number" ? m.engagement_rate : null))
    .filter((v): v is number => v !== null && v > 0);
  if (erValues.length > 0) {
    return erValues.reduce((a, b) => a + b, 0) / erValues.length;
  }

  const proxies: number[] = [];
  for (const m of entries) {
    if (
      typeof m.avg_views === "number" &&
      typeof m.followers === "number" &&
      m.followers > 0
    ) {
      proxies.push(m.avg_views / m.followers);
    }
  }
  if (proxies.length === 0) return null;
  return proxies.reduce((a, b) => a + b, 0) / proxies.length;
}

export function engagementFit(spec: MatchSpec, creator: Creator): ScoreResult {
  void spec;

  const direct = creator.estimated_engagement;
  const derived = deriveEngagementFromPlatformMetrics(creator.metrics?.platform_metrics);
  const engagementRate = typeof direct === "number" && direct > 0 ? direct : derived;

  if (!engagementRate) {
    return { score: 0, confidence: 0.25, reasons: [] };
  }

  const targetRate = 0.04;
  const score = clamp01(engagementRate / targetRate);

  const reasons: string[] = [];
  if (score >= 0.8) reasons.push("strong engagement");

  const confidence = typeof direct === "number" ? 0.9 : 0.7;
  return { score, confidence, reasons };
}
