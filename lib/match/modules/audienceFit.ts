import type { Creator, MatchSpec, ScoreResult } from "../types";
import { phraseSimilarity, uniqNormalizedPhrases } from "../semantic";

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function audienceFit(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandAudiences = uniqNormalizedPhrases(spec.audiences ?? []);
  const creatorAudiences = uniqNormalizedPhrases([
    ...(creator.audience_types ?? []),
    ...(creator.metrics?.compatibility_signals?.audience_signals ?? []),
  ]);

  if (brandAudiences.length === 0 || creatorAudiences.length === 0) {
    return { score: 0, confidence: 0.2, reasons: [] };
  }

  let totalBest = 0;
  for (const ba of brandAudiences) {
    let best = 0;
    for (const ca of creatorAudiences) {
      const sim = phraseSimilarity(ba, ca);
      if (sim > best) best = sim;
    }
    totalBest += best;
  }

  const score = totalBest / brandAudiences.length;
  const compatibilityConfidence = clamp01(
    Number(creator.metrics?.compatibility_signals?.confidence ?? 0)
  );
  const buyingIntentScore = clamp01(
    Number(creator.metrics?.compatibility_signals?.buying_intent_score ?? 0)
  );
  const reasons: string[] = [];
  if (score >= 0.3) reasons.push("audience fit");
  if (score >= 0.65) reasons.push("strong audience overlap");
  if (buyingIntentScore >= 0.55 && score >= 0.3) reasons.push("audience has conversion intent");

  return {
    score,
    confidence: clamp01(
      0.45 + 0.08 * Math.min(4, brandAudiences.length) + 0.15 * compatibilityConfidence
    ),
    reasons,
  };
}
