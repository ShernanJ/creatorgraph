export type DiscoveryPlatform = "x" | "instagram" | "linkedin" | "tiktok" | "unknown";

export type RawSerpResultInput = {
  title?: string;
  snippet?: string;
  url: string;
  position?: number;
  raw?: unknown;
};

export type DiscoveryIngestInput = {
  discoveryRunId?: string;
  query: string;
  results: RawSerpResultInput[];
};

export type NormalizedDiscoveryResult = {
  sourceUrl: string;
  normalizedProfileUrl: string | null;
  platform: DiscoveryPlatform;
  handle: string | null;
  stanSlug: string | null;
  followerCountEstimate: number | null;
};

export type DiscoveryCoverageReport = {
  discoveryRunId: string;
  total: number;
  withStanSlug: number;
  stanSlugCoveragePct: number;
  byPlatform: Record<DiscoveryPlatform, number>;
};
