import type { Creator, MatchSpec, ScoreResult } from "../types";

function normalize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\bskin care\b/g, "skincare")
    .replace(/\be[\s-]?commerce\b/g, "ecommerce")
    .replace(/\bai tools\b/g, "ai productivity")
    .replace(/\bskincare\b/g, "beauty skincare")
    .replace(/\bfitness\b/g, "fitness coaching")
    .replace(/\bhealthy cooking\b/g, "wellness nutrition")
    .replace(/\bmental wellness\b/g, "wellness nutrition")
    .replace(/\bcreator economy\b/g, "creator monetization")
    .replace(/\s+/g, " ");
}

function tokenSet(s: string) {
  return new Set(
    normalize(s)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((token) => {
        if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
        if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
          return token.slice(0, -1);
        }
        return token;
      })
  );
}

export function nicheAffinity(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandCategory = spec.category ? normalize(spec.category) : "";
  const creatorNiche = creator.niche ? normalize(creator.niche) : "";
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

  if (
    brandCategory.includes(creatorNiche) ||
    creatorNiche.includes(brandCategory)
  ) {
    return { score: 0.75, confidence: 0.8 * confidenceScale, reasons: ["related niche fit"] };
  }

  const b = tokenSet(brandCategory);
  const c = tokenSet(creatorNiche);
  let overlap = 0;
  for (const t of b) {
    if (c.has(t)) overlap += 1;
  }
  const denom = Math.max(1, Math.min(b.size, c.size));
  const ratio = overlap / denom;

  if (ratio >= 0.5) {
    return { score: 0.55, confidence: 0.65 * confidenceScale, reasons: ["partial niche overlap"] };
  }

  return { score: 0, confidence: 0.85 * confidenceScale, reasons: [] };
}
