import { normalizeSerpResult } from "./normalize";
import type { DiscoveryPlatform } from "./types";

export type RawAccountExtractionSource = {
  id: string;
  discovery_run_id: string;
  platform: string | null;
  source_url: string;
  title: string | null;
  snippet: string | null;
  raw: unknown;
};

export type RawAccountExtractionResult = {
  rawAccountId: string;
  discoveryRunId: string;
  platform: DiscoveryPlatform;
  sourceUrl: string;
  stanUrl: string | null;
  stanSlug: string | null;
  allStanUrls: string[];
  followerCountEstimate: number | null;
  platformProfileUrl: string | null;
  platformHandle: string | null;
  instagramProfileUrl: string | null;
  instagramHandle: string | null;
  confidence: number;
  signals: string[];
  evidence: Record<string, unknown>;
};

const RESERVED_IG_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "stories",
  "accounts",
  "about",
]);

const RESERVED_X_SEGMENTS = new Set(["home", "search", "explore", "i", "intent", "settings"]);

function toDiscoveryPlatform(value: string | null | undefined): DiscoveryPlatform {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return "unknown";
  if (v === "x" || v === "twitter") return "x";
  if (v === "instagram") return "instagram";
  if (v === "linkedin") return "linkedin";
  if (v === "tiktok") return "tiktok";
  if (v === "youtube") return "youtube";
  return "unknown";
}

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pushText(out: string[], value: unknown, cap = 12_000) {
  const text = String(value ?? "").trim();
  if (!text) return;
  out.push(text.slice(0, cap));
}

function collectStringsFromUnknown(input: unknown, out: string[], depth = 0) {
  if (depth > 4 || out.length >= 180) return;
  if (typeof input === "string") {
    pushText(out, input);
    return;
  }
  if (typeof input === "number" || typeof input === "boolean") {
    pushText(out, String(input));
    return;
  }
  if (!input || typeof input !== "object") return;
  if (Array.isArray(input)) {
    for (const item of input) {
      collectStringsFromUnknown(item, out, depth + 1);
      if (out.length >= 180) return;
    }
    return;
  }
  for (const value of Object.values(input as Record<string, unknown>)) {
    collectStringsFromUnknown(value, out, depth + 1);
    if (out.length >= 180) return;
  }
}

function collectCandidateTexts(row: RawAccountExtractionSource) {
  const texts: string[] = [];
  pushText(texts, row.source_url);
  pushText(texts, row.title);
  pushText(texts, row.snippet);
  collectStringsFromUnknown(row.raw, texts, 0);
  return uniqStrings(texts).slice(0, 220);
}

function parseSocialCount(rawValue: string, suffixRaw: string | undefined) {
  const compact = rawValue.replace(/,/g, "").replace(/\s+/g, "").replace(/\+$/g, "");
  const n = Number(compact);
  if (!Number.isFinite(n)) return null;
  const suffix = String(suffixRaw ?? "").toLowerCase();
  if (suffix === "k") return Math.round(n * 1_000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  if (suffix === "b") return Math.round(n * 1_000_000_000);
  return Math.round(n);
}

function extractFollowerCount(texts: string[]) {
  const pattern =
    /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kmb])?\+?\s*(followers?|subscribers?|subs?)\b/gi;
  let best: number | null = null;
  const mentions: string[] = [];
  for (const text of texts) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const count = parseSocialCount(match[1], match[2]);
      if (count === null) continue;
      if (best === null || count > best) best = count;
      mentions.push(match[0]);
      if (mentions.length >= 12) break;
    }
    if (mentions.length >= 12) break;
  }
  return {
    count: best,
    mentions: uniqStrings(mentions).slice(0, 8),
  };
}

function cleanStanSlug(raw: string): string | null {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^[\s"'`([{<]+/, "")
    .replace(/[\s"'`)\]}>.,!?;:]+$/g, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return cleaned || null;
}

function extractStanUrls(texts: string[]) {
  const pattern =
    /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)?stan\.store\/([a-zA-Z0-9._-]+)/gi;
  const out: string[] = [];
  const seenSlug = new Set<string>();
  for (const text of texts) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const slug = cleanStanSlug(String(match[1] ?? ""));
      if (!slug) continue;
      const key = slug.toLowerCase();
      if (seenSlug.has(key)) continue;
      seenSlug.add(key);
      out.push(`https://stan.store/${slug}`);
      if (out.length >= 40) break;
    }
    if (out.length >= 40) break;
  }
  const first = out[0] ?? null;
  return {
    urls: out.slice(0, 10),
    stanUrl: first,
    stanSlug: first
      ? first.replace(/^https?:\/\/(?:www\.)?stan\.store\//i, "").toLowerCase()
      : null,
  };
}

function firstRegexMatches(texts: string[], pattern: RegExp, cap = 20) {
  const out: string[] = [];
  for (const text of texts) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const full = String(match[0] ?? "").trim();
      if (full) out.push(full);
      if (out.length >= cap) return uniqStrings(out);
    }
  }
  return uniqStrings(out);
}

function pickPlatformProfileFromTexts(texts: string[], platform: DiscoveryPlatform) {
  if (platform === "instagram") {
    const candidates = firstRegexMatches(
      texts,
      /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?/gi
    );
    for (const candidate of candidates) {
      try {
        const u = new URL(candidate);
        const first = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
        if (!first || RESERVED_IG_SEGMENTS.has(first)) continue;
        return `https://instagram.com/${first}`;
      } catch {}
    }
    return null;
  }

  if (platform === "x") {
    const candidates = firstRegexMatches(
      texts,
      /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/?/gi
    );
    for (const candidate of candidates) {
      try {
        const u = new URL(candidate);
        const first = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
        if (!first || RESERVED_X_SEGMENTS.has(first)) continue;
        const host = u.hostname.toLowerCase().includes("twitter.com") ? "twitter.com" : "x.com";
        return `https://${host}/${first}`;
      } catch {}
    }
    return null;
  }

  if (platform === "linkedin") {
    const candidates = firstRegexMatches(
      texts,
      /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9_%\-]+\/?/gi
    );
    if (!candidates.length) return null;
    try {
      const u = new URL(candidates[0]);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && (parts[0] === "in" || parts[0] === "company")) {
        return `https://linkedin.com/${parts[0]}/${parts[1]}`;
      }
    } catch {}
    return null;
  }

  if (platform === "tiktok") {
    const candidates = firstRegexMatches(
      texts,
      /https?:\/\/(?:www\.)?tiktok\.com\/@[a-zA-Z0-9._]+\/?/gi
    );
    if (!candidates.length) return null;
    try {
      const u = new URL(candidates[0]);
      const first = u.pathname.split("/").filter(Boolean)[0];
      if (!first || !first.startsWith("@")) return null;
      return `https://tiktok.com/${first}`;
    } catch {
      return null;
    }
  }

  if (platform === "youtube") {
    const candidates = firstRegexMatches(
      texts,
      /https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)\/?/gi
    );
    if (!candidates.length) return null;
    try {
      const u = new URL(candidates[0]);
      const parts = u.pathname.split("/").filter(Boolean);
      if (!parts.length) return null;
      if (parts[0].startsWith("@")) return `https://youtube.com/${parts[0]}`;
      if (parts.length >= 2 && ["channel", "c", "user"].includes(parts[0])) {
        return `https://youtube.com/${parts[0]}/${parts[1]}`;
      }
    } catch {}
    return null;
  }

  return null;
}

function extractInstagramProfile(texts: string[]) {
  const candidates = firstRegexMatches(
    texts,
    /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?/gi
  );
  for (const candidate of candidates) {
    try {
      const u = new URL(candidate);
      const first = u.pathname.split("/").filter(Boolean)[0];
      if (!first || RESERVED_IG_SEGMENTS.has(first.toLowerCase())) continue;
      return {
        url: `https://instagram.com/${first}`,
        handle: first,
      };
    } catch {}
  }
  return {
    url: null,
    handle: null,
  };
}

function extractHandleFromProfile(url: string | null, platform: DiscoveryPlatform) {
  if (!url) return null;
  const parsed = normalizeSerpResult({ url, title: "", snippet: "" });
  if (!parsed || parsed.platform !== platform) return null;
  return parsed.handle;
}

function firstHandleMatch(texts: string[], pattern: RegExp) {
  for (const text of texts) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const handle = String(match[1] ?? "").trim();
      if (!handle) continue;
      return handle;
    }
  }
  return null;
}

function cleanHandle(raw: string, platform: DiscoveryPlatform): string | null {
  const trimmed = String(raw ?? "").trim().replace(/^@+/, "");
  if (!trimmed) return null;

  if (platform === "x") {
    const m = trimmed.match(/^[A-Za-z0-9_]{1,15}$/);
    return m ? m[0] : null;
  }
  if (platform === "instagram") {
    const m = trimmed.match(/^[A-Za-z0-9._]{2,30}$/);
    return m ? m[0] : null;
  }
  if (platform === "tiktok") {
    const m = trimmed.match(/^[A-Za-z0-9._]{2,24}$/);
    return m ? m[0] : null;
  }
  if (platform === "youtube") {
    const m = trimmed.match(/^[A-Za-z0-9._-]{2,60}$/);
    return m ? m[0] : null;
  }
  if (platform === "linkedin") {
    const m = trimmed.match(/^[A-Za-z0-9_%\-]{2,120}$/);
    return m ? m[0] : null;
  }
  return trimmed;
}

function extractPlatformHandleFromTexts(texts: string[], platform: DiscoveryPlatform) {
  if (platform === "x") {
    const fromTitle = firstHandleMatch(texts, /\(\s*@([A-Za-z0-9_]{1,15})\s*\)/g);
    if (fromTitle) return cleanHandle(fromTitle, platform);
    const fromSource = firstHandleMatch(texts, /\b(?:x|twitter)\s*·\s*([A-Za-z0-9_]{1,15})\b/gi);
    if (fromSource) return cleanHandle(fromSource, platform);
    const generic = firstHandleMatch(texts, /@([A-Za-z0-9_]{1,15})/g);
    if (generic) return cleanHandle(generic, platform);
    return null;
  }

  if (platform === "instagram") {
    const fromTitle = firstHandleMatch(texts, /\(\s*@([A-Za-z0-9._]{2,30})\s*\)/g);
    if (fromTitle) return cleanHandle(fromTitle, platform);
    const fromSource = firstHandleMatch(
      texts,
      /\binstagram\s*·\s*([A-Za-z0-9._]{2,30})\b/gi
    );
    if (fromSource) return cleanHandle(fromSource, platform);
    const generic = firstHandleMatch(texts, /@([A-Za-z0-9._]{2,30})/g);
    if (generic) return cleanHandle(generic, platform);
    return null;
  }

  if (platform === "linkedin") {
    const fromInUrl = firstHandleMatch(
      texts,
      /linkedin\.com\/in\/([A-Za-z0-9_%\-]{2,120})/gi
    );
    if (fromInUrl) return cleanHandle(fromInUrl, platform);
    const fromCompanyUrl = firstHandleMatch(
      texts,
      /linkedin\.com\/company\/([A-Za-z0-9_%\-]{2,120})/gi
    );
    if (fromCompanyUrl) return cleanHandle(fromCompanyUrl, platform);
    return null;
  }

  if (platform === "tiktok") {
    const fromUrl = firstHandleMatch(
      texts,
      /tiktok\.com\/@([A-Za-z0-9._]{2,24})/gi
    );
    if (fromUrl) return cleanHandle(fromUrl, platform);
    const fromTitle = firstHandleMatch(texts, /\(\s*@([A-Za-z0-9._]{2,24})\s*\)/g);
    if (fromTitle) return cleanHandle(fromTitle, platform);
    const generic = firstHandleMatch(texts, /@([A-Za-z0-9._]{2,24})/g);
    if (generic) return cleanHandle(generic, platform);
    return null;
  }

  if (platform === "youtube") {
    const fromUrl = firstHandleMatch(
      texts,
      /youtube\.com\/@([A-Za-z0-9._-]{2,60})/gi
    );
    if (fromUrl) return cleanHandle(fromUrl, platform);
    const fromSnippet = firstHandleMatch(texts, /@([A-Za-z0-9._-]{2,60})/g);
    if (fromSnippet) return cleanHandle(fromSnippet, platform);
    return null;
  }

  return null;
}

function profileUrlFromHandle(platform: DiscoveryPlatform, rawHandle: string | null) {
  const handle = cleanHandle(rawHandle ?? "", platform);
  if (!handle) return null;

  if (platform === "x") return `https://x.com/${handle}`;
  if (platform === "instagram") return `https://instagram.com/${handle}`;
  if (platform === "linkedin") return `https://linkedin.com/in/${handle}`;
  if (platform === "tiktok") return `https://tiktok.com/@${handle}`;
  if (platform === "youtube") return `https://youtube.com/@${handle}`;
  return null;
}

function extractInstagramHandleFromTexts(texts: string[]) {
  const pattern = /@([a-zA-Z0-9._]{2,})/g;
  for (const text of texts) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const candidate = String(match[1] ?? "").trim();
      if (!candidate) continue;
      const lower = candidate.toLowerCase();
      if (RESERVED_IG_SEGMENTS.has(lower)) continue;
      return candidate;
    }
  }
  return null;
}

function computeConfidence(args: {
  stanSlug: string | null;
  followerCountEstimate: number | null;
  platformProfileUrl: string | null;
  platformHandle: string | null;
  instagramProfileUrl: string | null;
  instagramHandle: string | null;
}) {
  let score = 0.1;
  if (args.stanSlug) score += 0.38;
  if (args.followerCountEstimate) score += 0.2;
  if (args.platformProfileUrl) score += 0.16;
  if (args.platformHandle) score += 0.1;
  if (args.instagramProfileUrl) score += 0.04;
  if (args.instagramHandle) score += 0.02;
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

export function extractDiscoverySignalsFromRawAccount(
  row: RawAccountExtractionSource
): RawAccountExtractionResult {
  const rawPlatform = toDiscoveryPlatform(row.platform);
  const normalized = normalizeSerpResult({
    url: row.source_url,
    title: row.title ?? "",
    snippet: row.snippet ?? "",
    raw: row.raw,
  });
  const platform =
    normalized?.platform && normalized.platform !== "unknown" ? normalized.platform : rawPlatform;
  const texts = collectCandidateTexts(row);

  const stan = extractStanUrls(texts);
  const follower = extractFollowerCount(texts);

  let platformProfileUrl =
    normalized?.platform === platform && normalized.normalizedProfileUrl
      ? normalized.normalizedProfileUrl
      : null;
  if (!platformProfileUrl) {
    platformProfileUrl = pickPlatformProfileFromTexts(texts, platform);
  }
  let platformHandle = normalized?.platform === platform ? normalized.handle : null;
  if (!platformHandle) {
    platformHandle = extractHandleFromProfile(platformProfileUrl, platform);
  }
  const fallbackPlatformHandle = extractPlatformHandleFromTexts(texts, platform);
  if (!platformHandle && fallbackPlatformHandle) {
    platformHandle = fallbackPlatformHandle;
  }
  if (!platformProfileUrl && platformHandle) {
    platformProfileUrl = profileUrlFromHandle(platform, platformHandle);
  }
  if (
    platform === "youtube" &&
    fallbackPlatformHandle &&
    platformProfileUrl &&
    platformProfileUrl.includes("/channel/")
  ) {
    platformHandle = fallbackPlatformHandle;
    platformProfileUrl = profileUrlFromHandle("youtube", fallbackPlatformHandle);
  }

  const instagramFromTexts = extractInstagramProfile(texts);
  const instagramProfileUrl =
    platform === "instagram" ? platformProfileUrl ?? instagramFromTexts.url : instagramFromTexts.url;
  const fallbackIgHandle = extractInstagramHandleFromTexts(texts);
  const instagramHandle =
    platform === "instagram"
      ? platformHandle ?? instagramFromTexts.handle ?? fallbackIgHandle
      : instagramFromTexts.handle ?? fallbackIgHandle;

  const signals: string[] = [];
  if (stan.stanSlug) signals.push("stan_slug");
  if (follower.count) signals.push("followers");
  if (platformProfileUrl) signals.push(`${platform}_profile_url`);
  if (platformHandle) signals.push(`${platform}_handle`);
  if (instagramProfileUrl) signals.push("instagram_profile_url");
  if (instagramHandle) signals.push("instagram_handle");

  const confidence = computeConfidence({
    stanSlug: stan.stanSlug,
    followerCountEstimate: follower.count,
    platformProfileUrl,
    platformHandle,
    instagramProfileUrl,
    instagramHandle,
  });

  return {
    rawAccountId: row.id,
    discoveryRunId: row.discovery_run_id,
    platform,
    sourceUrl: row.source_url,
    stanUrl: stan.stanUrl,
    stanSlug: stan.stanSlug,
    allStanUrls: stan.urls,
    followerCountEstimate: follower.count,
    platformProfileUrl,
    platformHandle,
    instagramProfileUrl,
    instagramHandle,
    confidence,
    signals,
    evidence: {
      stan_urls: stan.urls,
      follower_mentions: follower.mentions,
      sampled_texts: texts.slice(0, 12),
    },
  };
}
