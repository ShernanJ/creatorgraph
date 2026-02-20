// lib/match/types.ts

export type IntentVector = {
  product_sale: number;
  creator_enablement: number;
  b2b_leadgen: number;
  community: number;
};

export type Brand = {
  category?: string | null;
  target_audience?: string[];
  goals?: string[];
  preferred_platforms?: string[];
  campaign_angles?: string[];
  match_topics?: string[];
};

export type PlatformMetric = {
  followers?: number;
  avg_views?: number;
  engagement_rate?: number;
};

export type CreatorMetrics = {
  top_topics?: string[];
  platform_metrics?: Record<string, PlatformMetric>;
};

export type Creator = {
  id?: string;
  niche?: string;
  platforms?: string[];
  audience_types?: string[];
  content_style?: string;
  products_sold?: string[];
  estimated_engagement?: number | null;
  metrics?: CreatorMetrics;
};

export type MatchSpec = {
  // brand “normalized dossier”
  intent: IntentVector;
  category?: string | null;

  topics: string[];          // creator-native ontology tags
  audiences: string[];       // target audience types
  outcomes: string[];        // desired outcomes (e.g., conversions, signups, ugc)
  platforms: string[];       // preferred platforms

  // 0–1: how complete / specific this dossier is
  evidence_confidence: number;

  // 0–1: how narrow vs broad the brand is (used for specificity scaling)
  specificity: number;
};

export type ScoreResult = {
  score: number;       // 0–1
  confidence: number;  // 0–1
  reasons: string[];
};

export type ModuleName =
  | "nicheAffinity"
  | "topicSimilarity"
  | "platformAlignment"
  | "engagementFit"
  | "audienceFit";

export type ModuleOutput = {
  name: ModuleName;
  score: number;
  confidence: number;
  reasons: string[];
};

export type CompatibilityScore = {
  total: number;                 // final 0–1
  weights: Record<ModuleName, number>;
  modules: ModuleOutput[];       // breakdown
  reasons: string[];
  meta?: {
    bestPlatform: string | null;
    baseWeights: Record<ModuleName, number>;
    brandTopicsCount: number;
    creatorTopicsCount: number;
  };
};
