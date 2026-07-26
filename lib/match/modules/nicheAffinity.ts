import type { Creator, MatchSpec, ScoreResult } from "../types";
import { normalizePhrase, phraseSimilarity } from "../semantic";

export function nicheAffinity(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandCategory = spec.category ? normalizePhrase(spec.category) : "";
  const creatorNiche = creator.niche ? normalizePhrase(creator.niche) : "";
  const nicheConfidence =
    typeof creator.metrics?.compatibility_signals?.niche_confidence === "number"
      ? Math.max(0, Math.min(1, creator.metrics.compatibility_signals.niche_confidence))
      : null;
  const confidenceScale = nicheConfidence === null ? 1 : 0.45 + nicheConfidence * 0.55;

  if (!brandCategory || !creatorNiche) {
    return { score: 0, confidence: 0.1, reasons: [] };
  }

  if (brandCategory === creatorNiche) {
    return { score: 1, confidence: 0.95 * confidenceScale, reasons: ["category/niche match"] };
  }

  const similarity = phraseSimilarity(brandCategory, creatorNiche);

  if (similarity >= 0.72) {
    return { score: 0.75, confidence: 0.8 * confidenceScale, reasons: ["related niche fit"] };
  }

  if (similarity >= 0.45) {
    return { score: 0.55, confidence: 0.65 * confidenceScale, reasons: ["partial niche overlap"] };
  }

  return { score: 0, confidence: 0.85 * confidenceScale, reasons: [] };
}
