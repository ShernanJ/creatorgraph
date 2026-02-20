import { NextResponse } from "next/server";

function normalizeUrl(input: string) {
  const raw = input.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(withScheme);
    const host = u.hostname.toLowerCase();
    const okHost = host === "localhost" || host.includes(".");
    if (!okHost) return null;

    // strip hash; keep pathname (some users paste /)
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function faviconUrl(siteUrl: string) {
  const host = new URL(siteUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
}

async function checkReachable(url: string, timeoutMs = 1800) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // GET with Range is usually more compatible than HEAD
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Range: "bytes=0-1024",
        Accept: "text/html,*/*",
        "User-Agent": "CreatorGraphPreview/1.0",
      },
      signal: controller.signal,
    });

    // If bot-protected, it might be 403/401 but the site *exists*
    if (resp.status === 401 || resp.status === 403) {
      return { reachable: true, status: resp.status, note: "protected" as const };
    }

    return { reachable: resp.ok, status: resp.status, note: "ok" as const };
  } catch {
    return { reachable: null as null, status: null as null, note: "unknown" as const };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({}));
  const normalized = normalizeUrl(String(url ?? ""));
  if (!normalized) {
    return NextResponse.json({ ok: false, reason: "invalid_url" }, { status: 400 });
  }

  // Best-effort (never blocks UX)
  const reach = await checkReachable(normalized);

  return NextResponse.json({
    ok: true,
    normalized,
    host: new URL(normalized).hostname,
    favicon: faviconUrl(normalized),
    reachability: reach, // { reachable: true/false/null, status, note }
  });
}
