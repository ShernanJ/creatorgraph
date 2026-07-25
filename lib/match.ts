// lib/match.ts
import type { Brand, Creator } from "./match/types";
import { computeCompatibilityScore } from "./match/computeCompatibilityScore";

export type { Brand, Creator };

export function scoreMatch(brand: Brand, creator: Creator) {
  const res = computeCompatibilityScore({ brand, creator });

  // Keep the existing fields while adding richer diagnostics for result tuning.
  const breakdownMap = Object.fromEntries(
    res.modules.map((m) => [m.name, m.score])
  );

  return {
    score: res.total,
    reasons: res.reasons,
    breakdown: {
      nicheScore: Number((breakdownMap.nicheAffinity ?? 0).toFixed(4)),
      topicScore: Number((breakdownMap.topicSimilarity ?? 0).toFixed(4)),
      platformScore: Number((breakdownMap.platformAlignment ?? 0).toFixed(4)),
      engagementScore: Number((breakdownMap.engagementFit ?? 0).toFixed(4)),
      audienceScore: Number((breakdownMap.audienceFit ?? 0).toFixed(4)),
      bestPlatform: res.meta?.bestPlatform ?? null,
      priorityBoost: Number((res.meta?.priorityBoost ?? 0).toFixed(4)),
      weights: Object.fromEntries(
        res.modules.map((m) => [m.name, Number((res.weights[m.name] ?? 0).toFixed(4))])
      ),
      confidence: Object.fromEntries(
        res.modules.map((m) => [m.name, Number(m.confidence.toFixed(4))])
      ),
    },
  };
}
