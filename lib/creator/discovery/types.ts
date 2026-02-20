export type DiscoveryPlatform =
  | "x"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "unknown";

export type CreatorSerpAgentId =
  | "x_stan_creators"
  | "instagram_stan_creators"
  | "linkedin_stan_creators"
  | "tiktok_stan_creators"
  | "youtube_stan_creators";

export type CreatorSerpAgentDefinition = {
  id: CreatorSerpAgentId;
  label: string;
  platform: DiscoveryPlatform;
  queries: string[];
};

export type CreatorSerpEngine = "auto" | "google" | "duckduckgo" | "serpapi";
export type CreatorSerpBrowser = "playwright" | "patchright";

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
  stanUrl: string | null;
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

export type CreatorSerpCrawlResult = {
  agentId: CreatorSerpAgentId;
  platform: DiscoveryPlatform;
  query: string;
  position: number;
  title: string;
  snippet: string;
  url: string;
  raw: unknown;
};

export type CreatorSerpAgentRun = {
  id: CreatorSerpAgentId;
  label: string;
  platform: DiscoveryPlatform;
  queries: string[];
  resultsFound: number;
  uniqueUrls: number;
  blockedQueries: number;
  diagnostics: string[];
};

export type CreatorSerpCrawlOutput = {
  ok: boolean;
  agentsRun: CreatorSerpAgentRun[];
  results: CreatorSerpCrawlResult[];
};
