import type { Creator, MatchSpec, ScoreResult } from "../types";
import { phraseSimilarity, uniqNormalizedPhrases } from "../semantic";

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function topicSimilarity(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandTopics = uniqNormalizedPhrases(spec.topics ?? []);
  const creatorTopics = uniqNormalizedPhrases([
    ...(creator.metrics?.top_topics ?? []),
    ...(creator.metrics?.compatibility_signals?.match_topics ?? []),
    ...(creator.metrics?.compatibility_signals?.intent_signals ?? []),
    ...(creator.products_sold ?? []),
  ]);

  if (brandTopics.length === 0 || creatorTopics.length === 0) {
    return { score: 0, confidence: 0.2, reasons: [] };
  }

  let totalBest = 0;
  for (const bt of brandTopics) {
    let best = 0;
    for (const ct of creatorTopics) {
      const sim = phraseSimilarity(bt, ct);
      if (sim > best) best = sim;
    }
    totalBest += best;
  }

  const score = totalBest / brandTopics.length;
  const compatibilityConfidence = clamp01(
    Number(creator.metrics?.compatibility_signals?.confidence ?? 0)
  );
  const coverage = Math.min(1, brandTopics.length / 4);
  const confidence = clamp01(
    0.4 + coverage * 0.35 + Math.min(0.18, creatorTopics.length * 0.02) + 0.15 * compatibilityConfidence
  );

  const reasons: string[] = [];
  if (score >= 0.35) reasons.push("topic overlap");
  if (score >= 0.65) reasons.push("strong topic alignment");
  if (compatibilityConfidence >= 0.6 && score >= 0.4) reasons.push("topic evidence from creator signals");

  return { score, confidence, reasons };
}
