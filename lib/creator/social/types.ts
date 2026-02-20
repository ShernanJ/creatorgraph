export type SocialEnrichInput = {
  creatorIdentityId?: string;
  limit?: number;
  force?: boolean;
  minFollowerEstimate?: number;
  dryRun?: boolean;
};

export type SocialEnrichStats = {
  selected: number;
  processed: number;
  enriched: number;
  updated: number;
  skippedNoSignals: number;
  skippedLowFollowers: number;
  failed: number;
};

export type SocialEnrichResult = {
  dryRun: boolean;
  filters: {
    creatorIdentityId: string | null;
    force: boolean;
    limit: number;
    minFollowerEstimate: number;
  };
  stats: SocialEnrichStats;
  results: Array<{
    creatorIdentityId: string;
    status: "enriched" | "updated" | "skipped" | "failed";
    platformCount?: number;
    syncedCreatorId?: string | null;
    reason?: string;
  }>;
};
