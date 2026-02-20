import type { Creator, MatchSpec, ScoreResult } from "../types";

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function tokenSet(s: string) {
  return new Set(normalize(s).split(/[^a-z0-9]+/).filter(Boolean));
}

export function nicheAffinity(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandCategory = spec.category ? normalize(spec.category) : "";
  const creatorNiche = creator.niche ? normalize(creator.niche) : "";

  if (!brandCategory || !creatorNiche) {
    return { score: 0, confidence: 0.1, reasons: [] };
  }

  if (brandCategory === creatorNiche) {
    return { score: 1, confidence: 0.95, reasons: ["category/niche match"] };
  }

  if (
    brandCategory.includes(creatorNiche) ||
    creatorNiche.includes(brandCategory)
  ) {
    return { score: 0.75, confidence: 0.8, reasons: ["related niche fit"] };
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
    return { score: 0.55, confidence: 0.65, reasons: ["partial niche overlap"] };
  }

  return { score: 0, confidence: 0.85, reasons: [] };
}
