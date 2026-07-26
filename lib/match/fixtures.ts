import type { Brand, Creator } from "./types";
import { computeCompatibilityScore } from "./computeCompatibilityScore";

type Fixture = {
  name: string;
  brand: Brand;
  creators: Creator[];
  expectedTopCreatorNiche: string;
};

const FIXTURES: Fixture[] = [
  {
    name: "fitness brand should prioritize fitness creator",
    brand: {
      category: "fitness coaching",
      preferred_platforms: ["instagram", "tiktok"],
      target_audience: ["weight loss", "gym beginners"],
      goals: ["sales"],
      campaign_angles: ["weight loss tips", "nutrition routine"],
      match_topics: ["gym routines", "weight loss transformations", "nutrition for fat loss"],
    },
    creators: [
      {
        niche: "fitness coaching",
        platforms: ["instagram", "tiktok"],
        audience_types: ["gym beginners", "weight loss"],
        estimated_engagement: 0.058,
        metrics: { top_topics: ["gym routines", "weight loss transformations"] },
      },
      {
        niche: "personal finance",
        platforms: ["youtube"],
        audience_types: ["young professionals"],
        estimated_engagement: 0.05,
        metrics: { top_topics: ["investing", "credit cards"] },
      },
    ],
    expectedTopCreatorNiche: "fitness coaching",
  },
  {
    name: "finance brand should prioritize finance creator",
    brand: {
      category: "personal finance",
      preferred_platforms: ["youtube", "x"],
      target_audience: ["young professionals"],
      goals: ["signups"],
      campaign_angles: ["money habits", "debt payoff"],
      match_topics: ["budgeting", "saving", "debt payoff"],
    },
    creators: [
      {
        niche: "personal finance",
        platforms: ["youtube", "x"],
        audience_types: ["young professionals", "students"],
        estimated_engagement: 0.04,
        metrics: { top_topics: ["budgeting", "saving", "debt payoff"] },
      },
      {
        niche: "beauty & skincare",
        platforms: ["instagram", "tiktok"],
        audience_types: ["women 18-34"],
        estimated_engagement: 0.07,
        metrics: { top_topics: ["skincare", "routine"] },
      },
    ],
    expectedTopCreatorNiche: "personal finance",
  },
  {
    name: "if topics/platforms weak, audience match still contributes",
    brand: {
      category: "life coaching",
      preferred_platforms: ["linkedin"],
      target_audience: ["young adults", "self-improvement"],
      goals: ["community"],
      campaign_angles: ["confidence growth"],
      match_topics: ["confidence", "habits"],
    },
    creators: [
      {
        niche: "life coaching",
        platforms: ["youtube"],
        audience_types: ["young adults", "self-improvement"],
        estimated_engagement: 0.03,
        metrics: { top_topics: ["confidence", "habits"] },
      },
      {
        niche: "life coaching",
        platforms: ["linkedin"],
        audience_types: ["enterprise founders"],
        estimated_engagement: 0.02,
        metrics: { top_topics: ["leadership"] },
      },
    ],
    expectedTopCreatorNiche: "life coaching",
  },
  {
    name: "wording variants should still rank the closest creator",
    brand: {
      category: "skin care",
      preferred_platforms: ["instagram", "tiktok"],
      target_audience: ["women 18-34"],
      goals: ["sales"],
      campaign_angles: ["routine education"],
      match_topics: ["hydrating routine", "acne care"],
    },
    creators: [
      {
        niche: "beauty & skincare",
        platforms: ["instagram", "tiktok"],
        audience_types: ["women 18-34"],
        estimated_engagement: 0.044,
        metrics: {
          top_topics: ["skincare routine", "acne treatment"],
          compatibility_signals: { niche_confidence: 0.82, confidence: 0.78 },
        },
      },
      {
        niche: "creator monetization",
        platforms: ["instagram", "tiktok"],
        audience_types: ["content creators"],
        estimated_engagement: 0.08,
        metrics: {
          top_topics: ["creator economy", "digital products"],
          compatibility_signals: { niche_confidence: 0.35, confidence: 0.42 },
        },
      },
    ],
    expectedTopCreatorNiche: "beauty & skincare",
  },
  {
    name: "creator products should contribute to topic fit",
    brand: {
      category: "ecommerce marketing",
      preferred_platforms: ["instagram"],
      target_audience: ["brand owners"],
      goals: ["source UGC creative"],
      campaign_angles: ["creator content for ads"],
      match_topics: ["UGC creators", "content production"],
    },
    creators: [
      {
        niche: "ecommerce & marketing",
        platforms: ["instagram"],
        audience_types: ["brand owners", "ecommerce founders"],
        products_sold: ["UGC content package", "content production"],
        estimated_engagement: 0.038,
        metrics: {
          top_topics: ["ad creatives"],
          compatibility_signals: { niche_confidence: 0.76, confidence: 0.72 },
        },
      },
      {
        niche: "personal finance",
        platforms: ["instagram"],
        audience_types: ["young professionals"],
        products_sold: ["budget planner"],
        estimated_engagement: 0.07,
        metrics: {
          top_topics: ["saving money", "debt payoff"],
          compatibility_signals: { niche_confidence: 0.8, confidence: 0.75 },
        },
      },
    ],
    expectedTopCreatorNiche: "ecommerce & marketing",
  },
  {
    name: "taxonomy aliases should connect adjacent wellness language",
    brand: {
      category: "wellness & nutrition",
      preferred_platforms: ["instagram"],
      target_audience: ["health-conscious women"],
      goals: ["sales"],
      campaign_angles: ["gut health education"],
      match_topics: ["supplement routines", "meal prep"],
    },
    creators: [
      {
        niche: "healthy cooking",
        platforms: ["instagram"],
        audience_types: ["women", "busy professionals"],
        products_sold: ["meal plan", "gut health guide"],
        estimated_engagement: 0.036,
        metrics: {
          top_topics: ["healthy recipes", "meal prep"],
          compatibility_signals: { niche_confidence: 0.74, confidence: 0.76 },
        },
      },
      {
        niche: "business coaching",
        platforms: ["instagram"],
        audience_types: ["founders"],
        products_sold: ["sales script template"],
        estimated_engagement: 0.075,
        metrics: {
          top_topics: ["consulting", "sales calls"],
          compatibility_signals: { niche_confidence: 0.85, confidence: 0.8 },
        },
      },
    ],
    expectedTopCreatorNiche: "healthy cooking",
  },
  {
    name: "priority boost should understand alias language",
    brand: {
      category: "ecommerce & marketing",
      preferred_platforms: ["tiktok"],
      target_audience: ["small businesses"],
      goals: ["source UGC creative"],
      campaign_angles: ["performance ads"],
      match_topics: ["creator content"],
      priority_topics: ["Shopify brand owners"],
    },
    creators: [
      {
        niche: "ecommerce & marketing",
        platforms: ["tiktok"],
        audience_types: ["ecommerce founders"],
        products_sold: ["UGC content package"],
        estimated_engagement: 0.035,
        metrics: {
          top_topics: ["DTC ads", "shopify growth"],
          compatibility_signals: { niche_confidence: 0.72, confidence: 0.74 },
        },
      },
      {
        niche: "business coaching",
        platforms: ["tiktok"],
        audience_types: ["small businesses"],
        products_sold: ["founder sales playbook"],
        estimated_engagement: 0.055,
        metrics: {
          top_topics: ["founder coaching", "sales calls"],
          compatibility_signals: { niche_confidence: 0.82, confidence: 0.78 },
        },
      },
    ],
    expectedTopCreatorNiche: "ecommerce & marketing",
  },
];

export function runMatchFixtures() {
  for (const f of FIXTURES) {
    const ranked = f.creators
      .map((creator) => ({
        creator,
        result: computeCompatibilityScore({ brand: f.brand, creator }),
      }))
      .sort((a, b) => b.result.total - a.result.total);

    const top = ranked[0]?.creator?.niche ?? "";
    if (top !== f.expectedTopCreatorNiche) {
      throw new Error(
        `Fixture failed: ${f.name}. Expected top niche "${f.expectedTopCreatorNiche}", got "${top}".`
      );
    }
  }
}
