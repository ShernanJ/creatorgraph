/* eslint-disable @typescript-eslint/no-explicit-any */
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

/**
 * Build a MatchSpec from the Brand record.
 * v1: intent/spec are simple defaults; next step we infer intent + specificity properly.
 */
function buildMatchSpec(brand: Brand): MatchSpec {
  const topics =
    brand.match_topics?.length ? brand.match_topics : (brand.campaign_angles ?? brand.goals ?? []);

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
  const total = clamp01(
    modules.reduce((acc, m) => acc + m.score * (weights[m.name] ?? 0), 0)
  );

  // 5) reasons (module-driven, confidence-gated)
  const reasons = Array.from(
    new Set(
      modules
        .filter((m) => m.score * m.confidence >= 0.15)
        .flatMap((m) => m.reasons)
        .filter(Boolean)
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
    },
  };
}
