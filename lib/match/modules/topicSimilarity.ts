import type { Creator, MatchSpec, ScoreResult } from "../types";

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function tokens(s: string) {
  return normalize(s).split(/[^a-z0-9]+/).filter(Boolean);
}

function tokenJaccard(a: string, b: string) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (aa.size === 0 || bb.size === 0) return 0;

  let inter = 0;
  for (const t of aa) {
    if (bb.has(t)) inter += 1;
  }
  const union = aa.size + bb.size - inter;
  return union > 0 ? inter / union : 0;
}

export function topicSimilarity(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandTopics = (spec.topics ?? []).map(normalize).filter(Boolean);
  const creatorTopics = (creator.metrics?.top_topics ?? [])
    .map(normalize)
    .filter(Boolean);

  if (brandTopics.length === 0 || creatorTopics.length === 0) {
    return { score: 0, confidence: 0.2, reasons: [] };
  }

  let totalBest = 0;
  for (const bt of brandTopics) {
    let best = 0;
    for (const ct of creatorTopics) {
      const sim = bt === ct ? 1 : tokenJaccard(bt, ct);
      if (sim > best) best = sim;
    }
    totalBest += best;
  }

  const score = totalBest / brandTopics.length;
  const coverage = Math.min(1, brandTopics.length / 4);
  const confidence = Math.max(0.35, Math.min(0.95, 0.45 + coverage * 0.5));

  const reasons: string[] = [];
  if (score >= 0.35) reasons.push("topic overlap");
  if (score >= 0.65) reasons.push("strong topic alignment");

  return { score, confidence, reasons };
}
