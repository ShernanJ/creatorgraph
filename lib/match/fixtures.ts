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
