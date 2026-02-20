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
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be" || host.endsWith(".youtu.be")) return "youtube";
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
  } else if (platform === "youtube") {
    const first = parts[0]?.toLowerCase();
    if (!first) return null;
    if (host.endsWith("youtu.be")) {
      if (!parts[0]) return null;
      normalizedPath = `/${parts[0]}`;
    } else if ((first === "@" || first.startsWith("@")) && parts[0]) {
      normalizedPath = `/${parts[0]}`;
    } else if (["channel", "c", "user", "@"].includes(first) && parts[1]) {
      normalizedPath = `/${first}/${parts[1]}`;
    } else if (first.startsWith("@")) {
      normalizedPath = `/${parts[0]}`;
    } else if (first === "watch" && inputUrl.searchParams.get("v")) {
      normalizedPath = `/watch?v=${inputUrl.searchParams.get("v")}`;
    } else {
      return null;
    }
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

  if (platform === "youtube") {
    if (parts.length === 0) return null;
    const first = parts[0];
    if (first.startsWith("@")) return first.replace(/^@/, "");
    if (parts.length >= 2 && (first === "channel" || first === "c" || first === "user")) {
      return parts[1];
    }
    return first;
  }

  if (parts.length === 0) return null;
  const raw = parts[0];
  return platform === "tiktok" ? raw.replace(/^@/, "") : raw;
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
  if (platform === "linkedin") {
    const m = trimmed.match(/^[A-Za-z0-9_%\-]{2,120}$/);
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
  return trimmed;
}

function extractMentionHandle(text: string, platform: DiscoveryPlatform): string | null {
  if (!text) return null;
  if (platform === "x") {
    const m = text.match(/\(\s*@([A-Za-z0-9_]{1,15})\s*\)|\b(?:x|twitter)\s*·\s*([A-Za-z0-9_]{1,15})\b|@([A-Za-z0-9_]{1,15})/i);
    const v = m?.[1] ?? m?.[2] ?? m?.[3] ?? null;
    return v ? cleanHandle(v, platform) : null;
  }
  if (platform === "instagram") {
    const m = text.match(/\(\s*@([A-Za-z0-9._]{2,30})\s*\)|\binstagram\s*·\s*([A-Za-z0-9._]{2,30})\b|@([A-Za-z0-9._]{2,30})/i);
    const v = m?.[1] ?? m?.[2] ?? m?.[3] ?? null;
    return v ? cleanHandle(v, platform) : null;
  }
  if (platform === "linkedin") {
    const m = text.match(/linkedin\.com\/in\/([A-Za-z0-9_%\-]{2,120})|linkedin\.com\/company\/([A-Za-z0-9_%\-]{2,120})/i);
    const v = m?.[1] ?? m?.[2] ?? null;
    return v ? cleanHandle(v, platform) : null;
  }
  if (platform === "tiktok") {
    const m = text.match(/tiktok\.com\/@([A-Za-z0-9._]{2,24})|\(\s*@([A-Za-z0-9._]{2,24})\s*\)|@([A-Za-z0-9._]{2,24})/i);
    const v = m?.[1] ?? m?.[2] ?? m?.[3] ?? null;
    return v ? cleanHandle(v, platform) : null;
  }
  if (platform === "youtube") {
    const m = text.match(/youtube\.com\/@([A-Za-z0-9._-]{2,60})|@([A-Za-z0-9._-]{2,60})/i);
    const v = m?.[1] ?? m?.[2] ?? null;
    return v ? cleanHandle(v, platform) : null;
  }
  return null;
}

function buildCanonicalStanUrl(slug: string | null) {
  if (!slug) return null;
  return `https://stan.store/${slug}`;
}

function sanitizeStanSlug(raw: string): string | null {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^[\s"'`([{<]+/, "")
    .replace(/[\s"'`)\]}>.,!?;:]+$/g, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!cleaned) return null;
  return cleaned.toLowerCase();
}

function extractStanSlug(text: string): string | null {
  const m = text.match(/(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)?stan\.store\/([a-zA-Z0-9._-]+)/i);
  if (!m?.[1]) return null;
  return sanitizeStanSlug(m[1]);
}

function extractFollowerCount(text: string): number | null {
  const compact = text.replace(/,/g, "").toLowerCase();
  const m = compact.match(
    /\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kmb])?\+?\s*(followers?|subscribers?|subs?)\b/i
  );
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;

  const suffix = (m[2] ?? "").toLowerCase();
  if (suffix === "k") return Math.round(n * 1_000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  if (suffix === "b") return Math.round(n * 1_000_000_000);
  return Math.round(n);
}

function collectStringsFromRaw(input: unknown, out: string[], depth = 0) {
  if (depth > 4 || out.length >= 120) return;
  if (typeof input === "string") {
    const text = input.trim();
    if (text) out.push(text.slice(0, 1000));
    return;
  }
  if (typeof input === "number" || typeof input === "boolean") {
    out.push(String(input));
    return;
  }
  if (!input || typeof input !== "object") return;
  if (Array.isArray(input)) {
    for (const item of input) {
      collectStringsFromRaw(item, out, depth + 1);
      if (out.length >= 120) return;
    }
    return;
  }
  for (const value of Object.values(input as Record<string, unknown>)) {
    collectStringsFromRaw(value, out, depth + 1);
    if (out.length >= 120) return;
  }
}

function collectJoinedText(input: RawSerpResultInput) {
  const chunks = [input.title ?? "", input.snippet ?? "", input.url];
  const rawStrings: string[] = [];
  collectStringsFromRaw(input.raw, rawStrings, 0);
  chunks.push(...rawStrings);
  return chunks.join(" ");
}

export function normalizeSerpResult(input: RawSerpResultInput): NormalizedDiscoveryResult | null {
  const parsed = safeUrl(input.url);
  if (!parsed) return null;

  const platform = detectPlatform(parsed.hostname);
  let normalizedProfileUrl = normalizeProfileUrl(parsed, platform);
  let handle = extractHandle(normalizedProfileUrl, platform);

  const joined = collectJoinedText(input);
  const mentionHandle = extractMentionHandle(joined, platform);
  if (!handle && mentionHandle) {
    handle = mentionHandle;
  }
  if (
    platform === "youtube" &&
    mentionHandle &&
    handle &&
    /^UC[A-Za-z0-9_-]{10,}$/.test(handle)
  ) {
    handle = mentionHandle;
    normalizedProfileUrl = `https://youtube.com/@${mentionHandle}`;
  }
  const stanSlug = extractStanSlug(joined);
  const stanUrl = buildCanonicalStanUrl(stanSlug);
  const followerCountEstimate = extractFollowerCount(joined);

  return {
    sourceUrl: input.url,
    normalizedProfileUrl,
    platform,
    handle,
    stanUrl,
    stanSlug,
    followerCountEstimate,
  };
}
