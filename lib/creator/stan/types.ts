export type StanEnrichInput = {
  creatorIdentityId?: string;
  stanSlug?: string;
  limit?: number;
  force?: boolean;
};

export type StanEnrichStats = {
  selected: number;
  processed: number;
  succeeded: number;
  failed: number;
  skippedNoSlug: number;
};

export type StanEnrichResult = {
  stats: StanEnrichStats;
  results: Array<{
    creatorIdentityId: string;
    stanSlug: string | null;
    status: "enriched" | "skipped" | "failed";
    reason?: string;
  }>;
};
