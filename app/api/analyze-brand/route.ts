/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import { brandProfilePrompt } from "@/lib/prompts";
import { groqText } from "@/lib/groq";
import { htmlToText } from "html-to-text";

function stripHtml(html: string) {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "noscript", format: "skip" },
    ],
  });
}

/** Extract the first top-level JSON object if the model wraps it in extra text. */
function extractJson(s: string) {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function normalizeUrl(input: string) {
  const s = input.trim();
  if (!s) return null;
  // if user types "nike.com" → make it valid
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}

function json400(error: string, extra?: any) {
  console.error("[analyze-brand] 400:", error, extra ?? "");
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return json400("invalid json body");

  // accept both keys so UI can't drift
  const raw = body.url ?? body.website ?? body.brandUrl;
  if (!raw || typeof raw !== "string") {
    return json400("missing url", { received: body });
  }

  const url = normalizeUrl(raw);
  if (!url) return json400("empty url");
  try {
    // validate URL early (catches "htp://" etc.)
    new URL(url);
  } catch {
    return json400("invalid url", { url });
  }

  // fetch with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let html = "";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CreatorGraphBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      clearTimeout(timeout);
      return json400("failed to fetch url", {
        url,
        status: res.status,
        statusText: res.statusText,
      });
    }

    html = await res.text();
  } catch (e: any) {
    clearTimeout(timeout);
    return json400("fetch threw error", {
      url,
      message: e?.message ?? String(e),
      name: e?.name,
      // AbortError helps you distinguish timeout from other failures
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = stripHtml(html).slice(0, 12000);

  const prompt = brandProfilePrompt(url, text);
  const rawOut = await groqText(prompt, {
    system: "return only valid json. no markdown. no extra text.",
    temperature: 0.1,
    maxCompletionTokens: 600,
  });

  const json = extractJson(rawOut);
  if (!json) return json400("LLM returned non-json", { raw: rawOut });

  let profile: any;
  try {
    profile = JSON.parse(json);
  } catch {
    return json400("LLM returned invalid json", { raw: rawOut });
  }

  const id = `br_${nanoid(10)}`;

  await q(
    `insert into brands (id, name, website, category, target_audience, goals, preferred_platforms, budget_range, campaign_angles, raw_summary)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10)`,
    [
      id,
      profile.name ?? "unknown brand",
      profile.website ?? url,
      profile.category ?? null,
      JSON.stringify(profile.target_audience ?? []),
      JSON.stringify(profile.goals ?? []),
      JSON.stringify(profile.preferred_platforms ?? []),
      profile.budget_range ?? "2k-10k",
      JSON.stringify(profile.campaign_angles ?? []),
      profile.raw_summary ?? "",
    ]
  );

  return NextResponse.json({ brandId: id, profile });
}
