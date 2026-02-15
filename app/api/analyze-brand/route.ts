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

/**
 * Extract the first top-level JSON object if the model wraps it in extra text.
 */
function extractJson(s: string) {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

export async function POST(req: Request) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let html = "";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      // basic headers help some sites return consistent HTML
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; StanForBrandsBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "failed to fetch url", status: res.status },
        { status: 400 }
      );
    }

    html = await res.text();
  } catch (e: any) {
    return NextResponse.json(
      { error: "fetch threw error", message: e?.message ?? String(e) },
      { status: 400 }
    );
  }

  const text = stripHtml(html).slice(0, 20000);

  const prompt = brandProfilePrompt(url, text);
  const raw = await groqText(prompt, {
    system: "return only valid json. no markdown. no extra text.",
    temperature: 0.1,
    maxCompletionTokens: 900,
  });
  console.log(raw);

  const json = extractJson(raw);
  if (!json) {
    return NextResponse.json(
      { error: "LLM returned non-json", raw },
      { status: 400 }
    );
  }

  let profile: any;
  try {
    profile = JSON.parse(json);
  } catch {
    return NextResponse.json(
      { error: "LLM returned invalid json", raw },
      { status: 400 }
    );
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
