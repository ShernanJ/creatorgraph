import type { Creator, MatchSpec, ScoreResult } from "../types";

function normalize(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\bskin care\b/g, "skincare")
    .replace(/\be[\s-]?commerce\b/g, "ecommerce")
    .replace(/\buser generated content\b/g, "ugc")
    .replace(/\bcontent creators\b/g, "creator")
    .replace(/\bcreators\b/g, "creator")
    .replace(/\binfluencers\b/g, "influencer")
    .replace(/\s+/g, " ");
}

function tokens(s: string) {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => {
      if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
      if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
        return token.slice(0, -1);
      }
      return token;
    });
}

function lexicalSimilarity(a: string, b: string) {
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.84;

  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (aa.size === 0 || bb.size === 0) return 0;

  let inter = 0;
  for (const t of aa) {
    if (bb.has(t)) inter += 1;
  }
  const union = aa.size + bb.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  const overlap = inter / Math.max(1, Math.min(aa.size, bb.size));
  return Math.max(jaccard, overlap * 0.82);
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
    ...(creator.products_sold ?? []),
  ]);

  if (brandTopics.length === 0 || creatorTopics.length === 0) {
    return { score: 0, confidence: 0.2, reasons: [] };
  }

  let totalBest = 0;
  for (const bt of brandTopics) {
    let best = 0;
    for (const ct of creatorTopics) {
      const sim = lexicalSimilarity(bt, ct);
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
