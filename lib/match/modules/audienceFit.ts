import type { Creator, MatchSpec, ScoreResult } from "../types";

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function tokens(s: string) {
  return normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
}

function tokenOverlap(a: string, b: string) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (aa.size === 0 || bb.size === 0) return 0;
  let inter = 0;
  for (const t of aa) {
    if (bb.has(t)) inter += 1;
  }
  return inter / Math.max(1, Math.min(aa.size, bb.size));
}

export function audienceFit(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandAudiences = (spec.audiences ?? []).map(normalize).filter(Boolean);
  const creatorAudiences = (creator.audience_types ?? []).map(normalize).filter(Boolean);

  if (brandAudiences.length === 0 || creatorAudiences.length === 0) {
    return { score: 0, confidence: 0.2, reasons: [] };
  }

  let totalBest = 0;
  for (const ba of brandAudiences) {
    let best = 0;
    for (const ca of creatorAudiences) {
      const sim = ba === ca ? 1 : tokenOverlap(ba, ca);
      if (sim > best) best = sim;
    }
    totalBest += best;
  }

  const score = totalBest / brandAudiences.length;
  const reasons: string[] = [];
  if (score >= 0.3) reasons.push("audience fit");
  if (score >= 0.65) reasons.push("strong audience overlap");

  return {
    score,
    confidence: Math.min(0.9, 0.45 + 0.1 * brandAudiences.length),
    reasons,
  };
}
