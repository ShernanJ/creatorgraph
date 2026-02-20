/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import { brandProfilePrompt } from "@/lib/prompts";
import {
  groqText,
  isGroqCreditsExhaustedError,
  GROQ_CREDITS_EXHAUSTED_USER_MESSAGE,
} from "@/lib/groq";
import { htmlToText } from "html-to-text";
import { runGoogleDorkBrandAgent } from "@/lib/brand/googleDorkAgent";
import { runPlaywrightSiteAgent } from "@/lib/brand/playwrightSiteAgent";
import { runLlmSearchBackupAgent } from "@/lib/brand/llmSearchBackupAgent";

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

function normalizeSignalList(values: string[]) {
  return uniqStrings(values.map((value) => String(value ?? "").trim().toLowerCase()));
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

  const campaignGoals = normalizeSignalList(asStringArray(raw.campaignGoals));
  const preferredPlatforms = normalizeSignalList(asStringArray(raw.preferredPlatforms));

  return {
    partnershipType,
    compensationModel,
    compensationAmount,
    compensationUnit,
    campaignGoals,
    preferredPlatforms,
  };
}

function intakeToSignals(prefs: ReturnType<typeof parseIntakePreferences>) {
  if (!prefs) {
    return {
      goalSignals: [] as string[],
      angleSignals: [] as string[],
      topicSignals: [] as string[],
      preferredPlatformSignals: [] as string[],
      summaryLine: "",
    };
  }

  const goalSignals: string[] = [];
  const angleSignals: string[] = [];
  const topicSignals: string[] = [];
  const preferredPlatformSignals: string[] = [];
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

  if (prefs.campaignGoals.length) {
    for (const goal of prefs.campaignGoals) {
      goalSignals.push(goal);
      angleSignals.push(`campaign goal priority: ${goal}`);
    }
    summary.push(`Campaign goal focus: ${prefs.campaignGoals.join(", ")}.`);
  }

  if (prefs.preferredPlatforms.length) {
    for (const platform of prefs.preferredPlatforms) {
      preferredPlatformSignals.push(platform);
      angleSignals.push(`preferred platform: ${platform}`);
    }
    summary.push(`Preferred platforms: ${prefs.preferredPlatforms.join(", ")}.`);
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
    preferredPlatformSignals: uniqStrings(preferredPlatformSignals),
    summaryLine: summary.join(" "),
  };
}

function json400(error: string, extra?: any) {
  console.error("[analyze-brand] 400:", error, extra ?? "");
  return NextResponse.json({ error, ...extra }, { status: 400 });
}

function brandNameFromUrl(input: string) {
  try {
    const host = new URL(input).hostname.replace(/^www\./i, "");
    const root = host.split(".")[0] ?? "";
    if (!root) return "unknown brand";
    return root
      .split(/[-_]/g)
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(" ");
  } catch {
    return "unknown brand";
  }
}

function modelKnowledgeBrandProfilePrompt(args: {
  url: string;
  brandNameHint?: string | null;
  fallbackDiagnostics: Array<Record<string, any>>;
}) {
  return `
you are a brand profiler for creator partnership intelligence systems.

web extraction failed due bot protections or blocked crawling. produce a best-effort profile using general public knowledge and domain-level inference.

return STRICT json only matching this schema:
{
  "name": string,
  "website": string,
  "category": string,
  "target_audience": string[],
  "goals": string[],
  "preferred_platforms": string[],
  "budget_range": "500-2k" | "2k-10k" | "10k+",
  "campaign_angles": string[],
  "match_topics": string[],
  "raw_summary": string
}

rules:
- no markdown, no comments, valid json only
- do not invent private/internal facts
- avoid exact metrics unless highly common public knowledge
- keep arrays <= 8 items each
- keep assumptions conservative and practical for creator matching
- if uncertain, prefer broad but realistic entries
- raw_summary must include: "(model-knowledge fallback used)"
- preferred platforms should usually be from: ["instagram","tiktok","youtube","x","linkedin"]

brand url: ${args.url}
brand name hint: ${String(args.brandNameHint ?? "").trim() || "unknown"}
previous failed stages:
${JSON.stringify(args.fallbackDiagnostics.slice(0, 6))}
`.trim();
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

function cleanTextBlock(input: string, cap = 12000) {
  return String(input ?? "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, cap);
}

function looksLikeBotChallengeHtml(html: string) {
  const lower = html.toLowerCase();
  const markers = [
    "captcha",
    "verify you are human",
    "are you human",
    "cloudflare",
    "attention required",
    "cf-chl",
    "/cdn-cgi/challenge-platform",
    "perimeterx",
    "bot protection",
    "bot detection",
    "request blocked",
    "access denied",
  ];
  const hits = markers.filter((m) => lower.includes(m)).length;
  return hits >= 2;
}

type UrlFetchAttempt = {
  ok: boolean;
  text?: string;
  status?: number;
  statusText?: string;
  error?: string;
  blockedByBotDetection?: boolean;
};

async function fetchWebsiteText(url: string, timeoutMs = 12_000): Promise<UrlFetchAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
      return {
        ok: false,
        status: res.status,
        statusText: res.statusText,
        blockedByBotDetection: [401, 403, 429, 503].includes(res.status),
      };
    }

    const html = await res.text();
    if (!html.trim()) {
      return {
        ok: false,
        status: res.status,
        statusText: res.statusText,
        error: "empty html response",
      };
    }

    if (looksLikeBotChallengeHtml(html)) {
      return {
        ok: false,
        status: res.status,
        statusText: res.statusText,
        error: "detected anti-bot challenge page",
        blockedByBotDetection: true,
      };
    }

    const stripped = cleanTextBlock(stripHtml(html), 12000);
    if (!stripped) {
      return {
        ok: false,
        status: res.status,
        statusText: res.statusText,
        error: "no extractable text from html",
      };
    }

    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      text: stripped,
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message ?? String(e),
      blockedByBotDetection: /captcha|cloudflare|challenge|blocked|denied/i.test(
        String(e?.message ?? "")
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return json400("invalid json body");
  const intakePrefs = parseIntakePreferences(body.intakePreferences);
  const intakeSignals = intakeToSignals(intakePrefs);
  const preferGoogleDorkAgent = Boolean(body.preferGoogleDorkAgent === true);

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
  const targetUrl = url;

  // 1) if we have a brandId, try to use crawled pages
  let textForPrompt = "";
  let used = "fetch";
  const fallbackDiagnostics: Array<Record<string, any>> = [];
  let directFetchBlockedByBot = false;
  let fallbackModelProfile: any | null = null;

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
  if (!textForPrompt && !preferGoogleDorkAgent) {
    const directAttempt = await fetchWebsiteText(targetUrl);
    if (directAttempt.ok && directAttempt.text) {
      textForPrompt = directAttempt.text;
      used = "fetch";
    } else {
      directFetchBlockedByBot = Boolean(directAttempt.blockedByBotDetection);
      fallbackDiagnostics.push({
        stage: "direct_fetch",
        status: directAttempt.status ?? null,
        statusText: directAttempt.statusText ?? null,
        message: directAttempt.error ?? null,
        blockedByBotDetection: directFetchBlockedByBot,
      });
    }
  } else if (!textForPrompt && preferGoogleDorkAgent) {
    directFetchBlockedByBot = true;
    fallbackDiagnostics.push({
      stage: "direct_fetch",
      skipped: true,
      reason: "preflight marked domain as bot-protected",
    });
  }

  async function runSiteAgentFallback() {
    const siteAgentResult = await runPlaywrightSiteAgent({ brandUrl: targetUrl }).catch((err: unknown) => ({
      ok: false,
      used: "playwright_site_agent" as const,
      bundle: "",
      pagesFound: 0,
      blockedByBotDetection: false,
      diagnostics: [String((err as Error)?.message ?? err)],
    }));

    if (siteAgentResult.ok && siteAgentResult.bundle) {
      textForPrompt = cleanTextBlock(siteAgentResult.bundle, 13000);
      used = siteAgentResult.used;
    } else {
      fallbackDiagnostics.push({
        stage: "playwright_site_agent",
        pagesFound: siteAgentResult.pagesFound,
        blockedByBotDetection: siteAgentResult.blockedByBotDetection,
        diagnostics: siteAgentResult.diagnostics.slice(0, 8),
      });
    }
  }

  async function runGoogleDorkFallback() {
    const dorkResult = await runGoogleDorkBrandAgent({
      brandUrl: targetUrl,
      brandName: existingBrand?.name ?? null,
    }).catch((err: unknown) => ({
      ok: false,
      used: "google_dork_agent" as const,
      bundle: "",
      queriesTried: [] as string[],
      pagesFound: 0,
      snippetCount: 0,
      diagnostics: [String((err as Error)?.message ?? err)],
    }));

    if (dorkResult.ok && dorkResult.bundle) {
      textForPrompt = cleanTextBlock(dorkResult.bundle, 13000);
      used = dorkResult.used;
    } else {
      fallbackDiagnostics.push({
        stage: "google_dork_agent",
        pagesFound: dorkResult.pagesFound,
        snippetCount: dorkResult.snippetCount,
        queriesTried: dorkResult.queriesTried,
        diagnostics: dorkResult.diagnostics.slice(0, 8),
      });
    }
  }

  async function runLlmSearchFallback() {
    const llmSearchResult = await runLlmSearchBackupAgent({
      brandUrl: targetUrl,
      brandName: existingBrand?.name ?? null,
    }).catch((err: unknown) => ({
      ok: false,
      used: "llm_search_backup_agent" as const,
      bundle: "",
      queriesTried: [] as string[],
      resultsCount: 0,
      diagnostics: [String((err as Error)?.message ?? err)],
    }));

    if (llmSearchResult.ok && llmSearchResult.bundle) {
      textForPrompt = cleanTextBlock(llmSearchResult.bundle, 13000);
      used = llmSearchResult.used;
    } else {
      fallbackDiagnostics.push({
        stage: "llm_search_backup_agent",
        resultsCount: llmSearchResult.resultsCount,
        queriesTried: llmSearchResult.queriesTried,
        diagnostics: llmSearchResult.diagnostics.slice(0, 8),
      });
    }
  }

  // 3) choose backup order based on crawlability/protection signals
  if (!textForPrompt) {
    const dorkFirst = preferGoogleDorkAgent || directFetchBlockedByBot;
    if (dorkFirst) {
      await runGoogleDorkFallback();
      if (!textForPrompt) await runSiteAgentFallback();
    } else {
      await runSiteAgentFallback();
      if (!textForPrompt) await runGoogleDorkFallback();
    }
    if (!textForPrompt) await runLlmSearchFallback();
  }

  if (!textForPrompt) {
    const fallbackPrompt = modelKnowledgeBrandProfilePrompt({
      url: targetUrl,
      brandNameHint: existingBrand?.name ?? brandNameFromUrl(targetUrl),
      fallbackDiagnostics,
    });

    let fallbackRaw = "";
    try {
      fallbackRaw = await groqText(fallbackPrompt, {
        system: "return only valid json. no markdown. no extra text.",
        temperature: 0.2,
        maxCompletionTokens: 700,
      });
    } catch (err) {
      console.error("[analyze-brand] model knowledge fallback groq error", err);
      if (isGroqCreditsExhaustedError(err)) {
        return NextResponse.json(
          { error: GROQ_CREDITS_EXHAUSTED_USER_MESSAGE, code: "groq_credits_exhausted" },
          { status: 429 }
        );
      }
      fallbackDiagnostics.push({
        stage: "model_knowledge_fallback",
        diagnostics: [String((err as Error)?.message ?? err)],
      });
    }

    if (fallbackRaw) {
      const fallbackJson = extractJson(fallbackRaw);
      if (!fallbackJson) {
        fallbackDiagnostics.push({
          stage: "model_knowledge_fallback",
          diagnostics: ["LLM returned non-json fallback response"],
        });
      } else {
        try {
          fallbackModelProfile = JSON.parse(fallbackJson);
          used = "model_knowledge_fallback";
        } catch {
          fallbackDiagnostics.push({
            stage: "model_knowledge_fallback",
            diagnostics: ["LLM returned invalid json fallback response"],
          });
        }
      }
    }
  }

  if (!textForPrompt && !fallbackModelProfile) {
    return json400("failed to gather brand context", {
      url,
      message:
        "Unable to gather enough brand context from direct fetch, site crawl agent, Google-dork backup agent, LLM-search backup agent, or model-knowledge fallback.",
      fallbackDiagnostics,
    });
  }

  let profile: any;
  if (fallbackModelProfile) {
    profile = fallbackModelProfile;
  } else {
    const prompt = brandProfilePrompt(url, textForPrompt);
    let rawOut = "";
    try {
      rawOut = await groqText(prompt, {
        system: "return only valid json. no markdown. no extra text.",
        temperature: 0.1,
        maxCompletionTokens: 700,
      });
    } catch (err) {
      console.error("[analyze-brand] groq error", err);
      if (isGroqCreditsExhaustedError(err)) {
        return NextResponse.json(
          { error: GROQ_CREDITS_EXHAUSTED_USER_MESSAGE, code: "groq_credits_exhausted" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "brand analysis model request failed", code: "groq_request_failed" },
        { status: 502 }
      );
    }

    const json = extractJson(rawOut);
    if (!json) return json400("LLM returned non-json", { raw: rawOut });

    try {
      profile = JSON.parse(json);
    } catch {
      return json400("LLM returned invalid json", { raw: rawOut });
    }
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
    ...intakeSignals.preferredPlatformSignals,
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
