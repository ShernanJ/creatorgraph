import type { DiscoveryPlatform, NormalizedDiscoveryResult, RawSerpResultInput } from "./types";

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function detectPlatform(hostname: string): DiscoveryPlatform {
  const host = hostname.toLowerCase();
  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  return "unknown";
}

function normalizeProfileUrl(inputUrl: URL, platform: DiscoveryPlatform): string | null {
  const protocol = "https:";
  const host = inputUrl.hostname.toLowerCase().replace(/^www\./, "");
  const parts = inputUrl.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  let normalizedPath: string | null = null;
  if (platform === "x") {
    const first = parts[0]?.toLowerCase();
    if (!first || ["home", "search", "explore", "i", "intent"].includes(first)) return null;
    normalizedPath = `/${parts[0]}`;
  } else if (platform === "instagram") {
    const first = parts[0];
    if (!first || first === "p" || first === "reel" || first === "explore") return null;
    normalizedPath = `/${first}`;
  } else if (platform === "linkedin") {
    const first = parts[0]?.toLowerCase();
    if (first === "in" && parts[1]) normalizedPath = `/in/${parts[1]}`;
    else if (first === "company" && parts[1]) normalizedPath = `/company/${parts[1]}`;
    else return null;
  } else if (platform === "tiktok") {
    const first = parts[0];
    if (!first || !first.startsWith("@")) return null;
    normalizedPath = `/${first}`;
  } else {
    return null;
  }

  return `${protocol}//${host}${normalizedPath}`;
}

function extractHandle(normalizedProfileUrl: string | null, platform: DiscoveryPlatform): string | null {
  if (!normalizedProfileUrl || platform === "unknown") return null;
  const parsed = safeUrl(normalizedProfileUrl);
  if (!parsed) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (platform === "linkedin") {
    if (parts.length >= 2 && (parts[0] === "in" || parts[0] === "company")) return parts[1];
    return null;
  }

  if (parts.length === 0) return null;
  const raw = parts[0];
  return platform === "tiktok" ? raw.replace(/^@/, "") : raw;
}

function extractStanSlug(text: string): string | null {
  const m = text.match(/stan\.store\/([a-zA-Z0-9._-]+)/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
}

function extractFollowerCount(text: string): number | null {
  const compact = text.replace(/,/g, "").toLowerCase();
  const m = compact.match(/\b(\d+(?:\.\d+)?)\s*([km])?\s*(followers?|subs?)\b/i);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;

  const suffix = (m[2] ?? "").toLowerCase();
  if (suffix === "k") return Math.round(n * 1_000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

export function normalizeSerpResult(input: RawSerpResultInput): NormalizedDiscoveryResult | null {
  const parsed = safeUrl(input.url);
  if (!parsed) return null;

  const platform = detectPlatform(parsed.hostname);
  const normalizedProfileUrl = normalizeProfileUrl(parsed, platform);
  const handle = extractHandle(normalizedProfileUrl, platform);

  const joined = [input.title ?? "", input.snippet ?? "", input.url].join(" ");
  const stanSlug = extractStanSlug(joined);
  const followerCountEstimate = extractFollowerCount(joined);

  return {
    sourceUrl: input.url,
    normalizedProfileUrl,
    platform,
    handle,
    stanSlug,
    followerCountEstimate,
  };
}
