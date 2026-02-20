// lib/match/policies.ts
import type { ModuleName, IntentVector } from "./types";

export type PolicyWeights = Record<ModuleName, number>;

/**
 * These are “prototype” policies. We blend them by intent vector.
 * Keep them simple first; tune later.
 */
export const POLICY_WEIGHTS: Record<keyof IntentVector, PolicyWeights> = {
  product_sale: {
    nicheAffinity: 0.35,
    topicSimilarity: 0.30,
    platformAlignment: 0.10,
    audienceFit: 0.15,
    engagementFit: 0.10,
  },
  creator_enablement: {
    nicheAffinity: 0.10,
    topicSimilarity: 0.20,
    platformAlignment: 0.10,
    audienceFit: 0.35,
    engagementFit: 0.25,
  },
  b2b_leadgen: {
    nicheAffinity: 0.10,
    topicSimilarity: 0.25,
    platformAlignment: 0.10,
    audienceFit: 0.35,
    engagementFit: 0.20,
  },
  community: {
    nicheAffinity: 0.10,
    topicSimilarity: 0.20,
    platformAlignment: 0.10,
    audienceFit: 0.40,
    engagementFit: 0.20,
  },
};

export function normalizeWeights(w: Record<ModuleName, number>) {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (sum <= 0) return w;
  const out = {} as Record<ModuleName, number>;
  (Object.keys(w) as ModuleName[]).forEach((k) => (out[k] = w[k] / sum));
  return out;
}

/** Blend module weights from the intent vector (mixture of experts). */
export function blendPolicyWeights(intent: IntentVector) {
  const blended: Record<ModuleName, number> = {
    nicheAffinity: 0,
    topicSimilarity: 0,
    platformAlignment: 0,
    audienceFit: 0,
    engagementFit: 0,
  };

  const keys = Object.keys(intent) as (keyof IntentVector)[];
  for (const key of keys) {
    const alpha = clamp01(intent[key]);
    const policy = POLICY_WEIGHTS[key];
    (Object.keys(blended) as ModuleName[]).forEach((m) => {
      blended[m] += alpha * policy[m];
    });
  }

  return normalizeWeights(blended);
}

export function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
