// lib/match/computeCompatibilityScore.ts

import type {
  Brand,
  Creator,
  CompatibilityScore,
  MatchSpec,
  ModuleName,
  ModuleOutput,
  ScoreResult,
} from "./types";
import { blendPolicyWeights, clamp01 } from "./policies";

// modules you already created
import { nicheAffinity } from "./modules/nicheAffinity";
import { topicSimilarity } from "./modules/topicSimilarity";
import { platformAlignment } from "./modules/platformAlignment";
import { engagementFit } from "./modules/engagementFit";
import { audienceFit } from "./modules/audienceFit";

function normalizePhrase(value: string) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqPhrases(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizePhrase(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function tokenSet(value: string) {
  return new Set(normalizePhrase(value).split(/[^a-z0-9]+/).filter(Boolean));
}

function phraseSimilarity(a: string, b: string) {
  const aa = normalizePhrase(a);
  const bb = normalizePhrase(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.84;

  const ta = tokenSet(aa);
  const tb = tokenSet(bb);
  if (!ta.size || !tb.size) return 0;

  let overlap = 0;
  for (const token of ta) {
    if (tb.has(token)) overlap += 1;
  }
  const denom = Math.max(1, Math.min(ta.size, tb.size));
  return overlap / denom;
}

/**
 * Build a MatchSpec from the Brand record.
 * v1: intent/spec are simple defaults; next step we infer intent + specificity properly.
 */
function buildMatchSpec(brand: Brand): MatchSpec {
  const topics =
    brand.match_topics?.length ? brand.match_topics : (brand.campaign_angles ?? brand.goals ?? []);
  const priorityNiches = uniqPhrases(brand.priority_niches ?? []);
  const priorityTopics = uniqPhrases(brand.priority_topics ?? []);

  return {
    intent: {
      // v1 default: behave like "product_sale" until you add intent inference
      product_sale: 1,
      creator_enablement: 0,
      b2b_leadgen: 0,
      community: 0,
    },
    category: brand.category ?? null,
    topics,
    audiences: brand.target_audience ?? [],
    outcomes: brand.goals ?? [],
    platforms: brand.preferred_platforms ?? [],
    priorityNiches,
    priorityTopics,
    evidence_confidence: 0.7,
    specificity: 0.5,
  };
}

/**
 * Confidence-aware weight renormalization:
 * effectiveWeight = baseWeight * moduleConfidence
 * then renormalize across modules with signal
 */
function confidenceBlendWeights(args: {
  baseWeights: Record<ModuleName, number>;
  modules: ModuleOutput[];
}): Record<ModuleName, number> {
  const { baseWeights, modules } = args;

  const out = Object.fromEntries(
    (Object.keys(baseWeights) as ModuleName[]).map((k) => [k, 0])
  ) as Record<ModuleName, number>;
  let sum = 0;

  for (const m of modules) {
    const bw = baseWeights[m.name] ?? 0;
    const eff = bw * clamp01(m.confidence);
    out[m.name] = eff;
    sum += eff;
  }

  // If everything is low-confidence, fall back to base weights (don’t zero out the score)
  if (sum <= 1e-9) return baseWeights;

  (Object.keys(out) as ModuleName[]).forEach((k) => (out[k] = out[k] / sum));

  return out;
}

function toModuleOutput(name: ModuleName, result: ScoreResult): ModuleOutput {
  return {
    name,
    score: clamp01(result.score),
    confidence: clamp01(result.confidence),
    reasons: (result.reasons ?? []).map((r) => String(r)),
  };
}

function computePriorityBoost(spec: MatchSpec, creator: Creator) {
  const priorities = uniqPhrases([...(spec.priorityNiches ?? []), ...(spec.priorityTopics ?? [])]);
  if (!priorities.length) {
    return { boost: 0, reason: null as string | null, matchedPriorities: [] as string[] };
  }

  const creatorSignals = uniqPhrases([
    creator.niche ?? "",
    ...(creator.metrics?.top_topics ?? []).map((topic) => String(topic)),
  ]);
  if (!creatorSignals.length) {
    return { boost: 0, reason: null as string | null, matchedPriorities: [] as string[] };
  }

  const matches = priorities
    .map((priority) => {
      let best = 0;
      for (const signal of creatorSignals) {
        best = Math.max(best, phraseSimilarity(priority, signal));
      }
      return { priority, score: best };
    })
    .filter((x) => x.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!matches.length) {
    return { boost: 0, reason: null as string | null, matchedPriorities: [] as string[] };
  }

  const avgScore = matches.reduce((sum, m) => sum + m.score, 0) / matches.length;
  const boost = Math.min(0.16, 0.04 * matches.length + avgScore * 0.07);
  const matchedPriorities = matches.map((m) => m.priority);
  const reason = `priority fit: ${matchedPriorities.join(", ")}`;

  return { boost, reason, matchedPriorities };
}

export function computeCompatibilityScore(args: {
  brand: Brand;
  creator: Creator;
}): CompatibilityScore {
  const spec = buildMatchSpec(args.brand);

  // 1) base policy blend (mixture-of-experts ready)
  const baseWeights = blendPolicyWeights(spec.intent);

  // 2) run modules (the ones you actually have)
  const modules: ModuleOutput[] = [
    toModuleOutput("nicheAffinity", nicheAffinity(spec, args.creator)),
    toModuleOutput("topicSimilarity", topicSimilarity(spec, args.creator)),
    toModuleOutput("platformAlignment", platformAlignment(spec, args.creator)),
    toModuleOutput("engagementFit", engagementFit(spec, args.creator)),
    toModuleOutput("audienceFit", audienceFit(spec, args.creator)),
  ];

  // 3) confidence-aware weights
  const weights = confidenceBlendWeights({ baseWeights, modules });

  // 4) aggregate
  const baseTotal = clamp01(
    modules.reduce((acc, m) => acc + m.score * (weights[m.name] ?? 0), 0)
  );
  const priorityBoost = computePriorityBoost(spec, args.creator);
  const total = clamp01(baseTotal + priorityBoost.boost);

  // 5) reasons (module-driven, confidence-gated)
  const moduleReasons = modules
    .filter((m) => m.score * m.confidence >= 0.15)
    .flatMap((m) => m.reasons)
    .filter(Boolean);
  if (priorityBoost.reason) moduleReasons.push(priorityBoost.reason);

  const reasons = Array.from(
    new Set(
      moduleReasons
    )
  );

  // bestPlatform (for UI/debugging)
  const firstPlatform = args.creator.platforms?.[0];
  const bestPlatform = firstPlatform ? String(firstPlatform).toLowerCase() : null;

  return {
    total: Number(total.toFixed(4)),
    weights,
    modules: modules.map((m) => ({
      name: m.name,
      score: Number(m.score.toFixed(4)),
      confidence: Number(m.confidence.toFixed(4)),
      reasons: m.reasons,
    })),
    reasons,
    meta: {
      bestPlatform,
      baseWeights,
      // useful in debug views later:
      brandTopicsCount: spec.topics.length,
      creatorTopicsCount: (args.creator.metrics?.top_topics ?? []).length,
      priorityBoost: Number(priorityBoost.boost.toFixed(4)),
      priorityMatches: priorityBoost.matchedPriorities,
    },
  };
}
