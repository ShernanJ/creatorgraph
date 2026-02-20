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
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}

function asStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {}
  }
  return [];
}

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function parseIntakePreferences(raw: any) {
  if (!raw || typeof raw !== "object") return null;

  const partnershipType =
    typeof raw.partnershipType === "string" ? raw.partnershipType.trim().toLowerCase() : null;
  const compensationModel =
    typeof raw.compensationModel === "string" ? raw.compensationModel.trim().toLowerCase() : null;
  const compensationUnit =
    typeof raw.compensationUnit === "string" ? raw.compensationUnit.trim().toLowerCase() : null;

  let compensationAmount: number | null = null;
  if (typeof raw.compensationAmount === "number" && Number.isFinite(raw.compensationAmount)) {
    compensationAmount = raw.compensationAmount;
  } else if (typeof raw.compensationAmount === "string" && raw.compensationAmount.trim()) {
    const n = Number(raw.compensationAmount);
    compensationAmount = Number.isFinite(n) ? n : null;
  }

  return {
    partnershipType,
    compensationModel,
    compensationAmount,
    compensationUnit,
  };
}

function intakeToSignals(prefs: ReturnType<typeof parseIntakePreferences>) {
  if (!prefs) {
    return {
      goalSignals: [] as string[],
      angleSignals: [] as string[],
      topicSignals: [] as string[],
      summaryLine: "",
    };
  }

  const goalSignals: string[] = [];
  const angleSignals: string[] = [];
  const topicSignals: string[] = [];
  const summary: string[] = [];

  const partnershipMap: Record<string, { label: string; goal: string; topic: string }> = {
    affiliate: {
      label: "affiliate program",
      goal: "drive affiliate sales",
      topic: "affiliate creators",
    },
    sponsored_video: {
      label: "sponsored videos",
      goal: "run sponsored video placements",
      topic: "brand integration videos",
    },
    ugc: {
      label: "UGC assets",
      goal: "source UGC creative",
      topic: "ugc creators",
    },
    ambassador: {
      label: "ambassador partnership",
      goal: "secure long-term ambassadors",
      topic: "creator ambassadors",
    },
  };

  const compensationMap: Record<string, { label: string; goal: string; topic: string }> = {
    flat_fee: {
      label: "flat fee",
      goal: "predictable flat-fee creator deals",
      topic: "flat fee collaborations",
    },
    cpm: {
      label: "CPM (per 1k views)",
      goal: "performance-priced creator deals",
      topic: "cpm creator pricing",
    },
    rev_share: {
      label: "revenue share",
      goal: "commission-based creator deals",
      topic: "affiliate commission campaigns",
    },
    hybrid: {
      label: "hybrid compensation",
      goal: "hybrid creator compensation",
      topic: "hybrid creator partnerships",
    },
  };

  if (prefs.partnershipType && partnershipMap[prefs.partnershipType]) {
    const m = partnershipMap[prefs.partnershipType];
    goalSignals.push(m.goal);
    angleSignals.push(`preferred collaboration: ${m.label}`);
    topicSignals.push(m.topic);
    summary.push(`Preferred collaboration type: ${m.label}.`);
  }

  if (prefs.compensationModel && compensationMap[prefs.compensationModel]) {
    const m = compensationMap[prefs.compensationModel];
    goalSignals.push(m.goal);
    angleSignals.push(`preferred compensation model: ${m.label}`);
    topicSignals.push(m.topic);
    summary.push(`Preferred compensation model: ${m.label}.`);
  }

  if (
    typeof prefs.compensationAmount === "number" &&
    Number.isFinite(prefs.compensationAmount) &&
    prefs.compensationAmount > 0
  ) {
    const unit = prefs.compensationUnit?.replaceAll("_", " ") ?? "per video";
    const amountText = `$${Math.round(prefs.compensationAmount)}`;
    angleSignals.push(`target payout: ${amountText} ${unit}`);
    topicSignals.push(`creator rate ${amountText} ${unit}`);
    summary.push(`Stated payout target: ${amountText} ${unit}.`);
  }

  return {
    goalSignals: uniqStrings(goalSignals),
    angleSignals: uniqStrings(angleSignals),
    topicSignals: uniqStrings(topicSignals),
    summaryLine: summary.join(" "),
  };
}

function json400(error: string, extra?: any) {
  console.error("[analyze-brand] 400:", error, extra ?? "");
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

function buildBundleFromPages(pages: Array<{ url: string; title: string | null; text: string }>) {
  // keep token budget sane
  const perPageCap = 8000;
  const maxPages = 6;

  return pages.slice(0, maxPages).map((p, i) => {
    const t = (p.text ?? "").slice(0, perPageCap);
    return `PAGE ${i + 1}
URL: ${p.url}
TITLE: ${p.title ?? ""}
TEXT:
${t}`;
  }).join("\n\n---\n\n");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return json400("invalid json body");
  const intakePrefs = parseIntakePreferences(body.intakePreferences);
  const intakeSignals = intakeToSignals(intakePrefs);

  // optional: allow analyze by existing brandId (crawl-first path)
  const brandIdFromBody = body.brandId;
  let existingBrand: any | null = null;

  if (brandIdFromBody && typeof brandIdFromBody === "string") {
    const [b] = await q<any>(`select * from brands where id=$1`, [brandIdFromBody]);
    if (!b) return json400("brandId not found", { brandId: brandIdFromBody });
    existingBrand = b;
  }

  // accept both keys so UI can't drift
  const raw = body.url ?? body.website ?? body.brandUrl ?? existingBrand?.website;
  if (!raw || typeof raw !== "string") {
    return json400("missing url", { received: body });
  }

  const url = normalizeUrl(raw);
  if (!url) return json400("empty url");
  try {
    new URL(url);
  } catch {
    return json400("invalid url", { url });
  }

  // 1) if we have a brandId, try to use crawled pages
  let textForPrompt = "";
  let used = "fetch";

  if (existingBrand) {
    const pages = await q<any>(
      `select url, title, text
       from brand_pages
       where brand_id=$1
       order by fetched_at asc`,
      [existingBrand.id]
    );

    if (pages?.length) {
      textForPrompt = buildBundleFromPages(pages);
      used = "brand_pages";
    }
  }

  // 2) fallback to direct fetch if no brand_pages bundle available
  if (!textForPrompt) {
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
      });
    } finally {
      clearTimeout(timeout);
    }

    textForPrompt = stripHtml(html).slice(0, 12000);
  }

  const prompt = brandProfilePrompt(url, textForPrompt);
  const rawOut = await groqText(prompt, {
    system: "return only valid json. no markdown. no extra text.",
    temperature: 0.1,
    maxCompletionTokens: 700,
  });

  const json = extractJson(rawOut);
  if (!json) return json400("LLM returned non-json", { raw: rawOut });

  let profile: any;
  try {
    profile = JSON.parse(json);
  } catch {
    return json400("LLM returned invalid json", { raw: rawOut });
  }

  // create or update brand
  const brandId = existingBrand?.id ?? `br_${nanoid(10)}`;
  const mergedGoals = uniqStrings([
    ...asStringArray(existingBrand?.goals),
    ...asStringArray(profile.goals),
    ...intakeSignals.goalSignals,
  ]);
  const mergedCampaignAngles = uniqStrings([
    ...asStringArray(existingBrand?.campaign_angles),
    ...asStringArray(profile.campaign_angles),
    ...intakeSignals.angleSignals,
  ]);
  const mergedMatchTopics = uniqStrings([
    ...asStringArray(existingBrand?.match_topics),
    ...asStringArray(profile.match_topics),
    ...intakeSignals.topicSignals,
  ]);
  const mergedPreferredPlatforms = uniqStrings([
    ...asStringArray(existingBrand?.preferred_platforms),
    ...asStringArray(profile.preferred_platforms),
  ]);
  const mergedTargetAudience = uniqStrings([
    ...asStringArray(existingBrand?.target_audience),
    ...asStringArray(profile.target_audience),
  ]);
  const baseSummary = String(profile.raw_summary ?? "").trim();
  const summarySuffix = intakeSignals.summaryLine;
  const mergedSummary =
    summarySuffix && !baseSummary.toLowerCase().includes(summarySuffix.toLowerCase())
      ? `${baseSummary}${baseSummary ? "\n\n" : ""}${summarySuffix}`
      : baseSummary;

  if (existingBrand) {
    await q(
      `update brands set
        name=$2,
        website=$3,
        category=$4,
        target_audience=$5::jsonb,
        goals=$6::jsonb,
        preferred_platforms=$7::jsonb,
        budget_range=$8,
        campaign_angles=$9::jsonb,
        match_topics=$10::jsonb,
        raw_summary=$11
       where id=$1`,
      [
        brandId,
        profile.name ?? existingBrand.name ?? "unknown brand",
        profile.website ?? url,
        profile.category ?? null,
        JSON.stringify(mergedTargetAudience),
        JSON.stringify(mergedGoals),
        JSON.stringify(mergedPreferredPlatforms),
        profile.budget_range ?? existingBrand.budget_range ?? "2k-10k",
        JSON.stringify(mergedCampaignAngles),
        JSON.stringify(mergedMatchTopics),
        mergedSummary,
      ]
    );
  } else {
    await q(
      `insert into brands (
          id, name, website, category,
          target_audience, goals, preferred_platforms,
          budget_range, campaign_angles, match_topics, raw_summary
       )
       values (
          $1,$2,$3,$4,
          $5::jsonb,$6::jsonb,$7::jsonb,
          $8,$9::jsonb,$10::jsonb,$11
       )`,
      [
        brandId,
        profile.name ?? "unknown brand",
        profile.website ?? url,
        profile.category ?? null,
        JSON.stringify(mergedTargetAudience),
        JSON.stringify(mergedGoals),
        JSON.stringify(mergedPreferredPlatforms),
        profile.budget_range ?? "2k-10k",
        JSON.stringify(mergedCampaignAngles),
        JSON.stringify(mergedMatchTopics),
        mergedSummary,
      ]
    );
  }

  return NextResponse.json({ brandId, used, profile });
}
