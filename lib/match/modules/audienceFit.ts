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

function uniq(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalize(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function audienceFit(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandAudiences = uniq(spec.audiences ?? []);
  const creatorAudiences = uniq([
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
      const sim = ba === ca ? 1 : tokenOverlap(ba, ca);
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
