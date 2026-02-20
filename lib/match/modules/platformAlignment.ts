import type { Creator, MatchSpec, ScoreResult } from "../types";

function normalizeList(xs: string[]) {
  return Array.from(new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean)));
}

export function platformAlignment(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandPlatforms = normalizeList(spec.platforms ?? []);
  const creatorPlatforms = normalizeList(creator.platforms ?? []);

  if (brandPlatforms.length === 0) {
    return { score: 0.5, confidence: 0.2, reasons: [] };
  }

  if (creatorPlatforms.length === 0) {
    return { score: 0, confidence: 0.4, reasons: [] };
  }

  const creatorSet = new Set(creatorPlatforms);
  const overlap = brandPlatforms.filter((p) => creatorSet.has(p)).length;
  const score = overlap / brandPlatforms.length;

  const reasons: string[] = [];
  if (score >= 0.5) reasons.push("platform alignment");

  return {
    score,
    confidence: Math.min(0.95, 0.5 + 0.1 * brandPlatforms.length),
    reasons,
  };
}
