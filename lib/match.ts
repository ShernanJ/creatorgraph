// lib/match.ts
import type { Brand, Creator } from "./match/types";
import { computeCompatibilityScore } from "./match/computeCompatibilityScore";

export type { Brand, Creator };

export function scoreMatch(brand: Brand, creator: Creator) {
  const res = computeCompatibilityScore({ brand, creator });

  // Keep the API response shape identical to what your route expects today
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
      bestPlatform: res.meta?.bestPlatform ?? null,
      priorityBoost: Number((res.meta?.priorityBoost ?? 0).toFixed(4)),
    },
  };
}
