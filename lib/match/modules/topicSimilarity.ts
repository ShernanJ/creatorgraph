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

export function topicSimilarity(spec: MatchSpec, creator: Creator): ScoreResult {
  const brandTopics = uniq(spec.topics ?? []);
  const creatorTopics = uniq([
    ...(creator.metrics?.top_topics ?? []),
    ...(creator.metrics?.compatibility_signals?.match_topics ?? []),
    ...(creator.metrics?.compatibility_signals?.intent_signals ?? []),
  ]);

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
