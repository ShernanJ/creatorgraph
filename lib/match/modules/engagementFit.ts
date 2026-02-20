import type { Creator, MatchSpec, PlatformMetric, ScoreResult } from "../types";

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function deriveEngagementFromPlatformMetrics(
  platformMetrics: Record<string, PlatformMetric> | undefined
) {
  if (!platformMetrics) return null;

  const entries = Object.values(platformMetrics);
  if (entries.length === 0) return null;

  const erSignals: Array<{ value: number; weight: number; confidence: number }> = [];
  for (const metric of entries) {
    const er = toFiniteNumber(metric.engagement_rate);
    if (!er || er <= 0) continue;

    const confidence = clamp01(toFiniteNumber(metric.confidence) ?? 0.6);
    const sampleSize = toFiniteNumber(metric.sample_size) ?? 1;
    const followers = toFiniteNumber(metric.followers) ?? 0;
    const weight =
      Math.max(0.2, confidence) *
      Math.max(0.3, Math.min(1, sampleSize / 5)) *
      Math.max(1, followers > 0 ? Math.log10(followers + 10) : 1);
    erSignals.push({ value: er, weight, confidence });
  }

  if (erSignals.length > 0) {
    const weighted = erSignals.reduce((sum, s) => sum + s.value * s.weight, 0);
    const totalWeight = erSignals.reduce((sum, s) => sum + s.weight, 0);
    const avgConfidence =
      erSignals.reduce((sum, s) => sum + s.confidence, 0) / erSignals.length;
    return {
      rate: weighted / Math.max(1e-9, totalWeight),
      confidence: clamp01(
        0.45 +
          0.2 * Math.min(1, erSignals.length / 3) +
          0.25 * avgConfidence
      ),
      signalCount: erSignals.length,
      mode: "engagement_rate",
    };
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
  return {
    rate: proxies.reduce((a, b) => a + b, 0) / proxies.length,
    confidence: clamp01(0.38 + 0.14 * Math.min(1, proxies.length / 3)),
    signalCount: proxies.length,
    mode: "views_over_followers",
  };
}

export function engagementFit(spec: MatchSpec, creator: Creator): ScoreResult {
  void spec;

  const direct = creator.estimated_engagement;
  const derived = deriveEngagementFromPlatformMetrics(creator.metrics?.platform_metrics);
  const hasDirect = typeof direct === "number" && direct > 0;
  const hasDerived = derived && typeof derived.rate === "number" && derived.rate > 0;
  let engagementRate: number | null = null;
  let confidence = 0.25;

  if (hasDirect && hasDerived) {
    const directConfidence = 0.8;
    const derivedConfidence = Math.max(0.2, derived.confidence);
    engagementRate =
      ((direct as number) * directConfidence + derived.rate * derivedConfidence) /
      (directConfidence + derivedConfidence);
    confidence = clamp01(0.55 + 0.25 * derived.confidence);
  } else if (hasDirect) {
    engagementRate = direct as number;
    confidence = 0.86;
  } else if (hasDerived) {
    engagementRate = derived.rate;
    confidence = derived.confidence;
  }

  if (!engagementRate) {
    return { score: 0, confidence: 0.25, reasons: [] };
  }

  const targetRate = 0.045;
  const score = clamp01(engagementRate / targetRate);

  const reasons: string[] = [];
  if (score >= 0.8) reasons.push("strong engagement");
  if (derived && derived.signalCount >= 2) reasons.push("engagement backed by multi-platform signals");
  return { score, confidence, reasons };
}
