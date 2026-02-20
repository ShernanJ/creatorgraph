import type { DiscoveryPlatform } from "@/lib/creator/discovery/types";

export type IdentityResolutionInput = {
  discoveryRunId?: string;
  limit?: number;
};

export type IdentityRawAccount = {
  id: string;
  discovery_run_id: string;
  source_url: string;
  normalized_profile_url: string | null;
  platform: DiscoveryPlatform | null;
  handle: string | null;
  stan_slug: string | null;
  title: string | null;
  snippet: string | null;
  raw: unknown;
};

export type IdentityResolutionStats = {
  processed: number;
  createdIdentities: number;
  mergedByStanSlug: number;
  mergedByPersonalDomain: number;
  mergedByCrossLink: number;
  alreadyLinked: number;
  queuedCandidates: number;
};

export type IdentityResolutionResult = {
  discoveryRunId: string | null;
  stats: IdentityResolutionStats;
};
