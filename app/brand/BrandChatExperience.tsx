"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type BrandView = {
  id: string;
  name: string;
  website: string;
  category: string | null;
  budgetRange: string | null;
  targetAudience: string[];
  goals: string[];
  preferredPlatforms: string[];
  campaignAngles: string[];
  matchTopics: string[];
  rawSummary: string;
};

type CrawlSummary = {
  pageCount: number;
  lastFetched: string | null;
};

type RankedCreator = {
  creator: {
    id: string;
    name: string;
    niche: string;
    platforms?: string[];
    sample_links?: string[];
    estimated_engagement?: number | null;
    metrics?: {
      top_topics?: string[];
      platform_metrics?: Record<string, { followers?: number; avg_views?: number }>;
    };
  };
  score: number;
  reasons: string[];
};

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
  quickReplies?: string[];
};

type CreatorDeck = {
  id: string;
  signature: string;
  title: string;
  reason: string;
  cards: RankedCreator[];
  createdAt: string;
  updatedAt: string;
};

type PartnershipType = "affiliate" | "sponsored_video" | "ugc" | "ambassador";
type CompensationModel = "flat_fee" | "cpm" | "rev_share" | "hybrid";
type CompensationUnit = "per_video" | "per_post" | "per_1k_views";

type CampaignPreferences = {
  partnershipType: PartnershipType | null;
  compensationModel: CompensationModel | null;
  compensationAmount: number | null;
  compensationUnit: CompensationUnit;
  budgetCaptured: boolean;
  updatedAt: string | null;
};

type OnboardingStep = "partnership" | "comp_model" | "budget" | "done";

const ONBOARDING_PARTNERSHIP_REPLIES = [
  "Sponsored Video",
  "UGC Assets",
  "Affiliate Sales",
  "Ambassador Program",
];

const ONBOARDING_COMP_MODEL_REPLIES = [
  "Flat Fee",
  "Per 1k Views (CPM)",
  "Revenue Share",
  "Hybrid",
];

const ONBOARDING_BUDGET_REPLIES = [
  "$100 per video",
  "$250 per video",
  "$500 per video",
  "No fixed budget yet",
];

const COMMON_CHAT_QUICK_REPLIES = [
  "Show top creator matches",
  "Who fits around $100 per video?",
  "Explain why these creators fit",
  "I want to change my budget",
];

const MAX_DECK_HISTORY = 7;

function TypewriterText({
  text,
  speedMs = 12,
  onDone,
  onTick,
}: {
  text: string;
  speedMs?: number;
  onDone?: () => void;
  onTick?: () => void;
}) {
  const [count, setCount] = React.useState(0);
  const onDoneRef = React.useRef(onDone);
  const onTickRef = React.useRef(onTick);

  React.useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  React.useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  React.useEffect(() => {
    setCount(0);
    if (!text) {
      onDoneRef.current?.();
      return;
    }

    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      onTickRef.current?.();
      if (i >= text.length) {
        clearInterval(id);
        onDoneRef.current?.();
      }
    }, speedMs);

    return () => clearInterval(id);
  }, [text, speedMs]);

  const visible = text.slice(0, count);
  const done = count >= text.length;

  return (
    <p className="whitespace-pre-wrap text-[16px] sm:text-[17px] leading-[1.55] tracking-[-0.01em] text-white/95">
      {visible}
      {!done ? <span className="typing-caret">|</span> : null}
    </p>
  );
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function compactCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function socialLabel(url: string) {
  const lower = url.toLowerCase();
  if (/(x\.com|twitter\.com)/.test(lower)) return "X";
  if (/instagram\.com/.test(lower)) return "Instagram";
  if (/linkedin\.com/.test(lower)) return "LinkedIn";
  if (/tiktok\.com/.test(lower)) return "TikTok";
  if (/(youtube\.com|youtu\.be)/.test(lower)) return "YouTube";
  return "Social";
}

function followersTotal(c: RankedCreator["creator"]) {
  const m = c.metrics?.platform_metrics ?? {};
  const followers = Object.values(m)
    .map((x) => Number(x?.followers))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (followers.length === 0) return null;
  return Math.round(followers.reduce((a, b) => a + b, 0));
}

function avgViews(c: RankedCreator["creator"]) {
  const m = c.metrics?.platform_metrics ?? {};
  const views = Object.values(m)
    .map((x) => Number(x?.avg_views))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (views.length === 0) return null;
  return Math.round(views.reduce((a, b) => a + b, 0) / views.length);
}

function estimatedPrice(c: RankedCreator["creator"]) {
  const niche = String(c.niche ?? "").toLowerCase();
  const views = avgViews(c) ?? 0;
  if (!views) return null;

  const cpmMap: Array<[RegExp, number]> = [
    [/fitness|wellness|nutrition|gym/, 25],
    [/finance|invest/, 55],
    [/saas|b2b|software/, 75],
    [/beauty|skincare|fashion/, 28],
    [/ecom|ecommerce|marketing/, 35],
  ];
  const matched = cpmMap.find(([re]) => re.test(niche));
  const cpm = matched?.[1] ?? 22;
  return Math.round((views / 1000) * cpm);
}

function stanLink(c: RankedCreator["creator"]) {
  const links = c.sample_links ?? [];
  const found = links.find((l) => /stan\.store/i.test(l));
  return found ?? null;
}

function socialLinks(c: RankedCreator["creator"]) {
  const links = c.sample_links ?? [];
  return links.filter((l) =>
    /(x\.com|twitter\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be)/i.test(l)
  );
}

function extractBudgetAmount(input: string, opts: { strictDollar?: boolean } = {}) {
  const text = input.replace(/,/g, "");
  const dollar = text.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (dollar?.[1]) {
    const n = Number(dollar[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  if (opts.strictDollar) return null;

  const contextHint = /(budget|pay|price|cost|spend|fee|per\s*(video|post|1k|1000)|cpm)/i.test(text);
  if (!contextHint) return null;

  const raw = text.match(/\b(\d{2,6})(?:\.\d+)?\b/);
  if (!raw?.[1]) return null;
  const n = Number(raw[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function detectPartnershipType(text: string): PartnershipType | null {
  if (/\bugc\b/i.test(text)) return "ugc";
  if (/\baffiliate|commission\b/i.test(text)) return "affiliate";
  if (/\bambassador\b/i.test(text)) return "ambassador";
  if (/\bsponsored|sponsor\b/i.test(text)) return "sponsored_video";
  return null;
}

function detectCompensationModel(text: string): CompensationModel | null {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\brev(?:enue)?\s*share|commission\b/i.test(text)) return "rev_share";
  if (/\bcpm|per\s*(1k|1000|thousand)|\/\s*(1k|1000)(?:\s*views?)?/i.test(text)) return "cpm";
  if (/\bflat\s*fee|fixed\s*fee\b/i.test(text)) return "flat_fee";
  return null;
}

function detectCompensationUnit(text: string): CompensationUnit | null {
  if (/(?:per|\/)\s*(1k|1000)(?:\s*views?)?/i.test(text)) return "per_1k_views";
  if (/per\s*post/i.test(text)) return "per_post";
  if (/per\s*video/i.test(text)) return "per_video";
  return null;
}

function partnershipLabel(v: PartnershipType | null) {
  if (v === "affiliate") return "Affiliate Sales";
  if (v === "sponsored_video") return "Sponsored Video";
  if (v === "ugc") return "UGC Assets";
  if (v === "ambassador") return "Ambassador Program";
  return "Not set";
}

function compensationModelLabel(v: CompensationModel | null) {
  if (v === "flat_fee") return "Flat Fee";
  if (v === "cpm") return "Per 1k Views (CPM)";
  if (v === "rev_share") return "Revenue Share";
  if (v === "hybrid") return "Hybrid";
  return "Not set";
}

function compensationUnitLabel(v: CompensationUnit) {
  if (v === "per_post") return "per post";
  if (v === "per_1k_views") return "per 1k views";
  return "per video";
}

function deckSignature(cards: RankedCreator[]) {
  return cards.map((c) => c.creator.id).join("|");
}

function prettyDeckTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  return `${Math.max(1, Math.round(ms / 3_600_000))}h ago`;
}

function deckTitleFromContext(text: string, prefs: CampaignPreferences) {
  const lower = text.toLowerCase();
  if (/(budget|\$|price|cost|pay|spend)/i.test(lower) && prefs.compensationAmount !== null) {
    return `Budget deck · $${prefs.compensationAmount} ${compensationUnitLabel(prefs.compensationUnit)}`;
  }
  if (/(top|best|fit|match|creator|shortlist|recommend)/i.test(lower)) return "Top-fit deck";
  if (/(why|reason|explain)/i.test(lower)) return "Why-this-fits deck";
  return "Creator deck";
}

function extractOptionQuickReplies(text: string) {
  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const options = lines
    .map((line) => line.match(/^[A-D][\)\.\-:]\s*(.+)$/i)?.[1]?.trim() ?? null)
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);

  return options.length >= 2 ? options : undefined;
}

function getOnboardingStep(prefs: CampaignPreferences): OnboardingStep {
  if (!prefs.partnershipType) return "partnership";
  if (!prefs.compensationModel) return "comp_model";
  if (!prefs.budgetCaptured) return "budget";
  return "done";
}

function onboardingQuestion(step: OnboardingStep, brandName: string): Pick<Message, "text" | "quickReplies"> | null {
  if (step === "partnership") {
    return {
      text:
        `Great start for ${brandName}. ⚡\n\n` +
        "1) What collaboration type do you want first?\n" +
        "A) Sponsored Video\nB) UGC Assets\nC) Affiliate Sales\nD) Ambassador Program\n\n" +
        "This sets the creator format I should prioritize.",
      quickReplies: ONBOARDING_PARTNERSHIP_REPLIES,
    };
  }

  if (step === "comp_model") {
    return {
      text:
        "Perfect, next detail. ✅\n\n" +
        "2) How do you want to compensate creators?\n" +
        "A) Flat Fee\nB) Per 1k Views (CPM)\nC) Revenue Share\nD) Hybrid\n\n" +
        "This helps me frame both shortlist logic and deal feasibility.",
      quickReplies: ONBOARDING_COMP_MODEL_REPLIES,
    };
  }

  if (step === "budget") {
    return {
      text:
        "Last onboarding question. 🎯\n\n" +
        "3) What payout target should I optimize for?\n" +
        "A) $100 per video\nB) $250 per video\nC) $500 per video\nD) No fixed budget yet\n\n" +
        "This lets me filter for creators that are actually viable for your deal range.",
      quickReplies: ONBOARDING_BUDGET_REPLIES,
    };
  }

  return null;
}

function inferInitialPreferences(brand: BrandView): CampaignPreferences {
  const joined = [
    ...brand.campaignAngles,
    ...brand.goals,
    ...brand.matchTopics,
    brand.rawSummary,
  ].join(" ");

  const partnershipType = detectPartnershipType(joined);
  const compensationModel = detectCompensationModel(joined);
  const compensationUnit = detectCompensationUnit(joined) ?? "per_video";
  const compensationAmount = extractBudgetAmount(joined, { strictDollar: true });
  const budgetCaptured =
    compensationAmount !== null || /no fixed budget|open budget|flexible budget/i.test(joined);

  return {
    partnershipType,
    compensationModel,
    compensationAmount,
    compensationUnit,
    budgetCaptured,
    updatedAt: null,
  };
}

function brandSummaryText(brand: BrandView) {
  const category = brand.category ?? "digital";
  const goal = brand.goals[0] ?? "drive measurable campaign outcomes";
  const audience =
    brand.targetAudience.slice(0, 2).join(" + ") || "the right buyer audience";
  const creatorTopics =
    brand.matchTopics.slice(0, 3).join(", ") ||
    brand.campaignAngles.slice(0, 2).join(", ") ||
    "creator-native content in your niche";
  const platforms = brand.preferredPlatforms.slice(0, 2).join(" and ");
  const platformHint = platforms ? ` on ${platforms}` : "";

  return (
    `From your site, ${brand.name} looks like a ${category} brand focused on ${goal}. ` +
    `Best-fit creators are those already posting about ${creatorTopics}${platformHint}, ` +
    `with audience overlap around ${audience}.`
  );
}

function parsePreferencePatch(text: string) {
  const patch: Partial<CampaignPreferences> = {};
  const normalized = text.toLowerCase();
  const changes: string[] = [];

  const partnershipType = detectPartnershipType(normalized);
  if (partnershipType) {
    patch.partnershipType = partnershipType;
    changes.push(`collaboration type: ${partnershipLabel(partnershipType)}`);
  }

  const compensationModel = detectCompensationModel(normalized);
  if (compensationModel) {
    patch.compensationModel = compensationModel;
    changes.push(`comp model: ${compensationModelLabel(compensationModel)}`);
    if (compensationModel === "cpm" && !detectCompensationUnit(normalized)) {
      patch.compensationUnit = "per_1k_views";
    }
  }

  const compensationUnit = detectCompensationUnit(normalized);
  if (compensationUnit) {
    patch.compensationUnit = compensationUnit;
  }

  if (/no fixed budget|no budget|open budget|flexible budget|budget tbd/i.test(normalized)) {
    patch.compensationAmount = null;
    patch.budgetCaptured = true;
    changes.push("budget: no fixed cap");
  } else {
    const amount = extractBudgetAmount(text);
    if (amount !== null) {
      patch.compensationAmount = amount;
      patch.budgetCaptured = true;
      changes.push(`budget: $${amount}`);
    }
  }

  return { patch, changes };
}

function budgetFilter(rows: RankedCreator[], budget: number) {
  return rows
    .filter((r) => {
      const p = estimatedPrice(r.creator);
      return p !== null && p <= budget * 1.1;
    })
    .sort((a, b) => b.score - a.score);
}

function summarizeCreatorsForPrompt(rows: RankedCreator[]) {
  return rows.slice(0, 8).map((r) => ({
    id: r.creator.id,
    name: r.creator.name,
    niche: r.creator.niche,
    platforms: r.creator.platforms ?? [],
    fitScore: Number(r.score) || 0,
    reasons: r.reasons ?? [],
    estimatedEngagement:
      typeof r.creator.estimated_engagement === "number" ? r.creator.estimated_engagement : null,
    avgViews: avgViews(r.creator),
    estPricePerVideo: estimatedPrice(r.creator),
  }));
}

function selectCardsForQuery(text: string, ranked: RankedCreator[], prefs: CampaignPreferences) {
  if (!ranked.length) return undefined;
  const lower = text.toLowerCase();
  const explicitBudget = extractBudgetAmount(text);
  const activeBudget = explicitBudget ?? prefs.compensationAmount;
  const budgeted = activeBudget ? budgetFilter(ranked, activeBudget) : [];

  if (/(budget|\$|price|cost)/i.test(lower)) {
    if (!activeBudget) return ranked.slice(0, 3);
    return budgeted.length ? budgeted.slice(0, 6) : ranked.slice(0, 3);
  }

  if (/(top|best|fit|match|creator|recommend|shortlist)/i.test(lower)) {
    return (budgeted.length ? budgeted : ranked).slice(0, 6);
  }

  if (/(why|reason|explain)/i.test(lower)) {
    return (budgeted.length ? budgeted : ranked).slice(0, 3);
  }

  return undefined;
}

const INDEXING_STATUS_LINES = [
  "Scanning creator graph for relevant profiles...",
  "Computing cross-platform compatibility signals...",
  "Ranking creator cards for your brand strategy...",
];

const THINKING_STATUS_LINES = [
  "Thinking through your request...",
  "Processing budget and performance constraints...",
  "Building the best creator shortlist...",
];

const PREFERENCE_SYNC_STATUS_LINES = [
  "Updating campaign preferences...",
  "Recomputing creator shortlist with new constraints...",
  "Refreshing deal-feasible matches...",
];

function CreatorCardsGrid({ cards }: { cards: RankedCreator[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((r, index) => {
        const c = r.creator;
        const followers = followersTotal(c);
        const p = estimatedPrice(c);
        const stan = stanLink(c);
        const socials = socialLinks(c);
        const topics = (c.metrics?.top_topics ?? []).slice(0, 3);
        return (
          <article
            key={`${c.id}-${index}`}
            className="creator-card-in group rounded-2xl border border-white/15 bg-[linear-gradient(155deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05)_46%,rgba(12,14,22,0.24))] p-4 shadow-[0_10px_32px_rgba(5,7,12,0.35)] backdrop-blur-md transition hover:-translate-y-[1px] hover:border-white/25 hover:shadow-[0_14px_36px_rgba(5,7,12,0.45)] space-y-3"
            style={{ animationDelay: `${index * 85}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-[11px] font-bold uppercase ring-1 ring-white/20">
                  {c.name.slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-white/65">{c.niche}</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-400/18 px-2.5 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-200/30">
                {formatPct(Number(r.score) || 0)} fit
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-black/25 px-3 py-2 ring-1 ring-white/10">
                <p className="text-[11px] uppercase tracking-wide text-white/45">followers</p>
                <p className="text-sm font-medium text-white/95">
                  {followers ? compactCount(followers) : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-black/25 px-3 py-2 ring-1 ring-white/10">
                <p className="text-[11px] uppercase tracking-wide text-white/45">est. price</p>
                <p className="text-sm font-medium text-white/95">
                  {p ? `$${compactCount(p)}/video` : "—"}
                </p>
              </div>
            </div>

            <p className="text-xs text-white/65">
              platforms: {(c.platforms ?? []).join(", ") || "—"}
            </p>

            {topics.length ? (
              <div className="flex flex-wrap gap-1.5">
                {topics.map((topic) => (
                  <span
                    key={`${c.id}-${topic}`}
                    className="rounded-full bg-white/8 px-2 py-1 text-[11px] text-white/80 ring-1 ring-white/10"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              {stan ? (
                <a
                  href={stan}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-white/12 px-2.5 py-1 text-xs ring-1 ring-white/20 hover:bg-white/20"
                >
                  stan.store
                </a>
              ) : (
                <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/50 ring-1 ring-white/10">
                  no stan link
                </span>
              )}

              {socials.length ? (
                socials.slice(0, 2).map((s) => (
                  <a
                    key={`${c.id}-${s}`}
                    href={s}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-white/12 px-2.5 py-1 text-xs ring-1 ring-white/20 hover:bg-white/20"
                  >
                    {socialLabel(s)}
                  </a>
                ))
              ) : (
                <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/50 ring-1 ring-white/10">
                  no socials
                </span>
              )}
            </div>

            {r.reasons?.[0] ? (
              <p className="text-[11px] leading-5 text-white/60">Why: {r.reasons[0]}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function BrandChatExperience({
  brand,
  crawlSummary,
}: {
  brand: BrandView;
  crawlSummary: CrawlSummary;
}) {
  const router = useRouter();
  const [preferences, setPreferences] = React.useState<CampaignPreferences>(() =>
    inferInitialPreferences(brand)
  );
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [ranked, setRanked] = React.useState<RankedCreator[]>([]);
  const [decks, setDecks] = React.useState<CreatorDeck[]>([]);
  const [activeDeckSignature, setActiveDeckSignature] = React.useState<string | null>(null);
  const [showDeckInCenter, setShowDeckInCenter] = React.useState(false);
  const [loadingCreators, setLoadingCreators] = React.useState(true);
  const [syncingPreferences, setSyncingPreferences] = React.useState(false);
  const [typingMessageId, setTypingMessageId] = React.useState<string | null>(null);
  const [processingLineIndex, setProcessingLineIndex] = React.useState(0);
  const [agentY, setAgentY] = React.useState(0);
  const [agentVisible, setAgentVisible] = React.useState(false);
  const [isHandoffEntering, setIsHandoffEntering] = React.useState(false);
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const assistantMessageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const pendingUserScrollIdRef = React.useRef<string | null>(null);
  const composerTextAreaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const autoFollowRef = React.useRef(true);
  const lastAutoFollowMsRef = React.useRef(0);
  const hasShownTopMatchesRef = React.useRef(false);

  const latestAssistantMessageId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  const activeDeck = React.useMemo(() => {
    if (!decks.length) return null;
    return decks.find((d) => d.signature === activeDeckSignature) ?? decks[0];
  }, [decks, activeDeckSignature]);

  const agentTargetMessageId = typingMessageId ?? latestAssistantMessageId;
  const onboardingStep = getOnboardingStep(preferences);
  const onboardingComplete = onboardingStep === "done";
  const showProcessing = sending || loadingCreators || syncingPreferences;
  const processingLines = loadingCreators
    ? INDEXING_STATUS_LINES
    : syncingPreferences
    ? PREFERENCE_SYNC_STATUS_LINES
    : THINKING_STATUS_LINES;

  const isNearBottom = React.useCallback(() => {
    const doc = document.documentElement;
    return window.innerHeight + window.scrollY >= doc.scrollHeight - 130;
  }, []);

  const softScrollToBottom = React.useCallback(
    (force = false) => {
      if (!force && !autoFollowRef.current) return;
      const now = Date.now();
      if (!force && now - lastAutoFollowMsRef.current < 120) return;
      lastAutoFollowMsRef.current = now;
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    },
    []
  );

  const syncAgentPosition = React.useCallback(() => {
    const section = sectionRef.current;
    if (!section || !agentTargetMessageId) {
      setAgentVisible(false);
      return;
    }

    const target = assistantMessageRefs.current[agentTargetMessageId];
    if (!target) {
      setAgentVisible(false);
      return;
    }

    const sectionRect = section.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextY = targetRect.top - sectionRect.top + section.scrollTop;
    setAgentY(Math.max(0, nextY));
    setAgentVisible(true);
  }, [agentTargetMessageId]);

  const captureDeck = React.useCallback((cards: RankedCreator[], title: string, reason: string) => {
    if (!cards.length) return;
    const signature = deckSignature(cards);
    const now = new Date().toISOString();
    const nextCards = cards.slice(0, 8);
    setActiveDeckSignature(signature);

    setDecks((prev) => {
      const existing = prev.find((d) => d.signature === signature);
      if (existing) {
        const updated: CreatorDeck = {
          ...existing,
          title,
          reason,
          cards: nextCards,
          updatedAt: now,
        };
        return [updated, ...prev.filter((d) => d.id !== existing.id)];
      }

      const created: CreatorDeck = {
        id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        signature,
        title,
        reason,
        cards: nextCards,
        createdAt: now,
        updatedAt: now,
      };
      return [created, ...prev].slice(0, MAX_DECK_HISTORY);
    });
  }, []);

  React.useEffect(() => {
    const initialPrefs = inferInitialPreferences(brand);
    setPreferences(initialPrefs);
    setDecks([]);
    setActiveDeckSignature(null);
    setShowDeckInCenter(false);
    hasShownTopMatchesRef.current = false;

    const intro: Message = {
      id: "intro",
      role: "assistant",
      text: brandSummaryText(brand),
    };

    const step = getOnboardingStep(initialPrefs);
    const onboarding = onboardingQuestion(step, brand.name);
    if (onboarding) {
      const onboardingMsg: Message = {
        id: "onboarding-initial",
        role: "assistant",
        text: onboarding.text,
        quickReplies: onboarding.quickReplies,
      };
      setMessages([intro, onboardingMsg]);
      setTypingMessageId("onboarding-initial");
      return;
    }

    setMessages([intro]);
    setTypingMessageId("intro");
  }, [brand]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem("cg:route-handoff");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { from?: string; at?: number };
      const isFresh = typeof parsed?.at === "number" && Date.now() - parsed.at < 12_000;
      if (parsed?.from === "home" && isFresh) {
        setIsHandoffEntering(true);
        const id = window.setTimeout(() => setIsHandoffEntering(false), 720);
        return () => window.clearTimeout(id);
      }
    } catch {
      // ignore handoff parse errors
    } finally {
      window.sessionStorage.removeItem("cg:route-handoff");
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCreators(true);
      try {
        const res = await fetch("/api/match-creators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: brand.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rows = Array.isArray(data?.ranked) ? data.ranked : [];
        setRanked(rows);
      } catch {
        if (!cancelled) {
          setMessages((prev) => [
            ...prev,
            {
              id: "err-load",
              role: "assistant",
              text: "I couldn't load creator matches right now. Try again in a moment.",
            },
          ]);
          setTypingMessageId("err-load");
        }
      } finally {
        if (!cancelled) setLoadingCreators(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brand.id]);

  React.useEffect(() => {
    if (!onboardingComplete) return;
    if (!ranked.length) return;
    if (typingMessageId) return;
    if (hasShownTopMatchesRef.current) return;

    hasShownTopMatchesRef.current = true;
    const cards =
      preferences.compensationAmount !== null
        ? budgetFilter(ranked, preferences.compensationAmount).slice(0, 4)
        : ranked.slice(0, 4);
    const cardsToShow = cards.length ? cards : ranked.slice(0, 4);
    const deckTitle =
      preferences.compensationAmount !== null
        ? `Budget deck · $${preferences.compensationAmount} ${compensationUnitLabel(preferences.compensationUnit)}`
        : "Initial top-fit deck";
    captureDeck(cardsToShow, deckTitle, "initial onboarding shortlist");

    const note =
      preferences.compensationAmount !== null
        ? ` around $${preferences.compensationAmount} ${compensationUnitLabel(preferences.compensationUnit)}`
        : "";

    const topMessage: Message = {
      id: `top-initial-${Date.now()}`,
      role: "assistant",
      text: `You’re onboarded. I created your ${deckTitle.toLowerCase()}${note}. Use the deck rail to review, compare, or reopen it in center view.`,
    };
    setMessages((prev) => [...prev, topMessage]);
    setTypingMessageId(topMessage.id);
  }, [
    onboardingComplete,
    ranked,
    typingMessageId,
    preferences.compensationAmount,
    preferences.compensationUnit,
    captureDeck,
  ]);

  React.useEffect(() => {
    if (!showProcessing) return;
    setProcessingLineIndex(0);
    const id = setInterval(() => {
      setProcessingLineIndex((prev) => (prev + 1) % processingLines.length);
    }, 1400);
    return () => clearInterval(id);
  }, [showProcessing, processingLines.length, loadingCreators]);

  React.useEffect(() => {
    const onViewportChange = () => {
      autoFollowRef.current = isNearBottom();
      syncAgentPosition();
    };
    onViewportChange();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, { passive: true });
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange);
    };
  }, [isNearBottom, syncAgentPosition]);

  React.useEffect(() => {
    syncAgentPosition();
  }, [syncAgentPosition, messages, typingMessageId]);

  React.useEffect(() => {
    const pendingId = pendingUserScrollIdRef.current;
    if (!pendingId) return;
    const node = messageRefs.current[pendingId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingUserScrollIdRef.current = null;
  }, [messages]);

  React.useEffect(() => {
    const node = composerTextAreaRef.current;
    if (!node) return;
    node.style.height = "0px";
    const max = 280;
    const next = Math.min(node.scrollHeight, max);
    node.style.height = `${Math.max(32, next)}px`;
    node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
  }, [input]);

  async function syncBrandPreferences(nextPrefs: CampaignPreferences): Promise<RankedCreator[] | null> {
    const hasAnyPreference =
      nextPrefs.partnershipType !== null ||
      nextPrefs.compensationModel !== null ||
      nextPrefs.budgetCaptured;
    if (!hasAnyPreference) return null;

    setSyncingPreferences(true);
    try {
      await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          brandId: brand.id,
          intakePreferences: {
            partnershipType: nextPrefs.partnershipType,
            compensationModel: nextPrefs.compensationModel,
            compensationAmount: nextPrefs.compensationAmount,
            compensationUnit: nextPrefs.compensationUnit,
          },
        }),
      });

      const res = await fetch("/api/match-creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ brandId: brand.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data?.ranked)) {
        setRanked(data.ranked);
        return data.ranked as RankedCreator[];
      }
    } catch (err) {
      console.warn("preference sync failed", err);
    } finally {
      setSyncingPreferences(false);
    }
    return null;
  }

  async function submitUserMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || sending) return;

    const userMsgId = `u-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      text,
    };
    pendingUserScrollIdRef.current = userMsgId;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    let nextPrefs = preferences;
    const parsed = parsePreferencePatch(text);
    const hasPreferenceUpdate = Object.keys(parsed.patch).length > 0;

    if (hasPreferenceUpdate) {
      nextPrefs = {
        ...preferences,
        ...parsed.patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(nextPrefs);
    }

    const nextStep = getOnboardingStep(nextPrefs);

    try {
      if (hasPreferenceUpdate) {
        const refreshedRanked =
          nextStep === "done" ? await syncBrandPreferences(nextPrefs) : null;
        const rankedSource = refreshedRanked?.length ? refreshedRanked : ranked;
        const summary = parsed.changes.length
          ? `Updated ${parsed.changes.join(" · ")}. ✅`
          : "Updated your campaign preferences. ✅";

        if (nextStep !== "done") {
          const followUp = onboardingQuestion(nextStep, brand.name);
          const assistant: Message = {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: followUp ? `${summary}\n\n${followUp.text}` : summary,
            quickReplies: followUp?.quickReplies,
          };
          setMessages((prev) => [...prev, assistant]);
          setTypingMessageId(assistant.id);
          return;
        }

        hasShownTopMatchesRef.current = true;
        const cardsForDeck =
          selectCardsForQuery(text, rankedSource, nextPrefs) ??
          (nextPrefs.compensationAmount !== null
            ? budgetFilter(rankedSource, nextPrefs.compensationAmount).slice(0, 6)
            : rankedSource.slice(0, 6));
        if (cardsForDeck.length) {
          captureDeck(
            cardsForDeck,
            deckTitleFromContext(text, nextPrefs),
            "preferences updated from chat"
          );
        }
        const assistant: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          text:
            summary +
            " I updated the active creator deck so you can compare this set against previous ones.",
        };
        setMessages((prev) => [...prev, assistant]);
        setTypingMessageId(assistant.id);
        return;
      }

      if (nextStep !== "done") {
        const followUp = onboardingQuestion(nextStep, brand.name);
        const assistant: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          text:
            (followUp?.text ??
              "I still need your campaign setup details before I can optimize your shortlist.") +
            "\n\nTap an option below or type your own preference.",
          quickReplies: followUp?.quickReplies,
        };
        setMessages((prev) => [...prev, assistant]);
        setTypingMessageId(assistant.id);
        return;
      }

      const history = [...messages, userMsg]
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch("/api/brand-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          crawlSummary,
          userMessage: text,
          history,
          topCreators: summarizeCreatorsForPrompt(ranked),
          campaignPreferences: {
            partnershipType: nextPrefs.partnershipType,
            compensationModel: nextPrefs.compensationModel,
            compensationAmount: nextPrefs.compensationAmount,
            compensationUnit: nextPrefs.compensationUnit,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      const replyText =
        typeof data?.reply === "string" && data.reply.trim().length
          ? data.reply.trim()
          : "I can help with creator shortlist strategy, budget-fit options, or next-step campaign planning. Share what matters most right now.";

      const cardsForDeck = selectCardsForQuery(text, ranked, nextPrefs) ?? [];
      if (cardsForDeck.length) {
        captureDeck(cardsForDeck, deckTitleFromContext(text, nextPrefs), "chat query");
      }

      const optionReplies = extractOptionQuickReplies(replyText);

      const assistant: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: replyText,
        quickReplies: optionReplies,
      };

      setMessages((prev) => [...prev, assistant]);
      setTypingMessageId(assistant.id);
    } catch {
      const fallback: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text:
          "I hit a temporary issue generating a response. Ask again and I can continue with your campaign intake or shortlist review.",
        quickReplies: undefined,
      };
      setMessages((prev) => [...prev, fallback]);
      setTypingMessageId(fallback.id);
    } finally {
      setSending(false);
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    await submitUserMessage(input);
  }

  return (
    <main className={["min-h-screen w-full bg-[#2f3140] text-white", isHandoffEntering ? "cg-brand-enter" : ""].join(" ")}>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_650px_at_50%_40%,rgba(110,120,255,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_100%,rgba(130,70,255,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)]" />
      </div>

      {isHandoffEntering ? <div className="pointer-events-none fixed inset-0 z-40 cg-brand-handoff-layer" /> : null}

      <header className="fixed left-0 right-0 top-0 z-20 flex w-full items-start px-1 py-1 pr-2">
        <div className="relative mx-auto w-full max-w-6xl">
          <div className="z-20 flex h-[42px] items-center">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Back"
              className="flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          </div>

          <div className="pointer-events-auto absolute left-1/2 top-1 z-30 -translate-x-1/2">
            <div className="flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-1 backdrop-blur-sm sm:px-6">
              <Image src="/Stan-Lee-Agent.png" alt="Stan-Lee" width={20} height={20} />
              <p className="text-base font-semibold tracking-tight text-white">Stan-Lee</p>
            </div>
          </div>

          <div className="pointer-events-auto absolute right-2 top-1 z-30 flex items-center">
            <a
              href="https://shernanjavier.com/"
              target="_blank"
              rel="noreferrer"
              className="px-2 py-2 text-[11px] text-white/70 underline underline-offset-4 transition hover:text-white/95"
            >
              built by shernan javier
            </a>
          </div>
        </div>
      </header>

      <section className="relative mx-auto w-full max-w-[1480px] px-4 pb-64 pt-20">
        <section ref={sectionRef} className="relative mx-auto w-full max-w-3xl space-y-6">
        <div
          className="pointer-events-none absolute left-3 z-10 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            opacity: agentVisible ? 1 : 0,
            transform: `translate3d(0, ${agentY}px, 0)`,
          }}
        >
          <Image
            src="/Stan-Lee-Agent.png"
            alt="Stan-Lee"
            width={30}
            height={30}
            className={typingMessageId ? "agent-thinking" : "animate-floaty"}
          />
        </div>

        {messages.map((m) => (
          <div
            key={m.id}
            ref={(node) => {
              messageRefs.current[m.id] = node;
            }}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div className={m.role === "user" ? "max-w-[85%]" : "w-full max-w-2xl pl-12"}>
              {m.role === "assistant" ? (
                <div
                  ref={(node) => {
                    assistantMessageRefs.current[m.id] = node;
                  }}
                  className="w-full"
                >
                  {typingMessageId === m.id ? (
                    <TypewriterText
                      text={m.text}
                      speedMs={12}
                      onTick={() => {
                        syncAgentPosition();
                        softScrollToBottom(false);
                      }}
                      onDone={() => {
                        setTypingMessageId((current) => (current === m.id ? null : current));
                        requestAnimationFrame(() => softScrollToBottom(false));
                      }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-[16px] leading-[1.55] tracking-[-0.01em] text-white/95 sm:text-[17px]">
                      {m.text}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-[linear-gradient(135deg,#505665,#60677a)] px-4 py-3 text-sm text-white">
                  {m.text}
                </div>
              )}

              {(m.quickReplies?.length || m.id === latestAssistantMessageId) &&
              typingMessageId !== m.id &&
              m.id === latestAssistantMessageId ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(m.quickReplies?.length ? m.quickReplies : COMMON_CHAT_QUICK_REPLIES).map((reply, index) => (
                    <button
                      key={`${m.id}-${reply}`}
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        void submitUserMessage(reply);
                      }}
                      className="chat-chip-pop rounded-full bg-white/10 px-3 py-1.5 text-xs text-white ring-1 ring-white/20 transition hover:bg-white/15 disabled:opacity-50"
                      style={{ animationDelay: `${index * 55}ms` }}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {showDeckInCenter && activeDeck ? (
          <div className="ml-12 space-y-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white/95">{activeDeck.title}</p>
                <p className="text-xs text-white/60">
                  {activeDeck.cards.length} creators · {activeDeck.reason} · updated {prettyDeckTime(activeDeck.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeckInCenter(false)}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-xs ring-1 ring-white/20 hover:bg-white/15"
              >
                hide center
              </button>
            </div>
            <CreatorCardsGrid cards={activeDeck.cards} />
          </div>
        ) : null}
        </section>

        <aside className="pointer-events-none hidden min-[1450px]:block">
          <div className="pointer-events-auto fixed right-6 top-20 w-[320px] rounded-2xl border border-white/12 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white/95">Creator Decks</p>
              <button
                type="button"
                onClick={() => setShowDeckInCenter((v) => !v)}
                disabled={!activeDeck}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] ring-1 ring-white/20 hover:bg-white/15 disabled:opacity-50"
              >
                {showDeckInCenter ? "pin to side" : "open in center"}
              </button>
            </div>

            {!decks.length ? (
              <p className="text-xs text-white/60">
                No creator deck yet. Ask for top matches or update budget to generate one.
              </p>
            ) : (
              <div className="space-y-2">
                {decks.map((deck) => {
                  const active = activeDeck?.id === deck.id;
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => setActiveDeckSignature(deck.signature)}
                      className={[
                        "w-full rounded-xl px-3 py-2 text-left ring-1 transition",
                        active
                          ? "bg-[#6c5cff]/25 ring-[#8d80ff]/55"
                          : "bg-white/5 ring-white/15 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <p className="text-xs font-semibold text-white/95">{deck.title}</p>
                      <p className="mt-0.5 text-[11px] text-white/60">
                        {deck.cards.length} creators · {prettyDeckTime(deck.updatedAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {activeDeck ? (
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
                  Active deck preview
                </p>
                <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                  {activeDeck.cards.slice(0, 6).map((item) => (
                    <div
                      key={`preview-${activeDeck.id}-${item.creator.id}`}
                      className="rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-white/90">{item.creator.name}</p>
                        <span className="rounded-full bg-emerald-400/18 px-2 py-0.5 text-[10px] font-semibold text-emerald-100 ring-1 ring-emerald-200/30">
                          {formatPct(Number(item.score) || 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/55">{item.creator.niche}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </section>

      {showProcessing ? (
        <div className="pointer-events-none fixed bottom-[170px] left-1/2 z-30 -translate-x-1/2 sm:bottom-[160px]">
          <div
            key={`${loadingCreators ? "index" : "thinking"}-${processingLineIndex}`}
            className="processing-pop flex items-center gap-2 rounded-full border border-white/20 bg-[#3b4255]/90 px-4 py-1.5 text-xs text-white/90 shadow-[0_10px_28px_rgba(0,0,0,0.32)] backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#aeb9ff]" />
            <span>{processingLines[processingLineIndex]}</span>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 pointer-events-none pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-3 pb-5 pt-4 pointer-events-auto sm:px-4">
          <div className="order-1 rounded-2xl border border-gray-700 bg-[#40414f]/80 px-4 py-4 backdrop-blur-md transition-all duration-300 focus-within:scale-[1.01] focus-within:border-gray-600">
            <form onSubmit={onSend} className="flex items-center gap-2">
              <div className="flex items-center">
                <button
                  type="button"
                  disabled
                  aria-label="Add files"
                  className="flex h-8 w-8 min-h-[2rem] min-w-[2rem] items-center justify-center rounded-full bg-[#4a4b57] text-gray-400 opacity-70"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>

              <div className="relative w-full flex-1">
                <textarea
                  ref={composerTextAreaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitUserMessage(input);
                    }
                  }}
                  rows={1}
                  placeholder="What are we creating today?"
                  className="min-h-[24px] max-h-[280px] w-full resize-none bg-transparent px-0 py-1 text-base font-medium tracking-tight text-gray-100 placeholder-gray-400 outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  aria-label="Microphone"
                  className="flex h-8 w-8 min-h-[2rem] min-w-[2rem] items-center justify-center rounded-full bg-[#4a4b57] text-gray-400 opacity-70"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </button>
                <button
                  type="submit"
                  title="Send message"
                  disabled={sending || input.trim().length === 0}
                  className="flex h-8 w-8 min-h-[2rem] min-w-[2rem] items-center justify-center rounded-full bg-gradient-to-b from-[#6355ff] to-[#5040ff] transition-all duration-200 hover:scale-110 hover:rotate-12 hover:from-[#5040ff] hover:to-[#6355ff] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 disabled:hover:rotate-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="white" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5V4.5M5.25 9.75L12 4.5l6.75 5.25" />
                  </svg>
                </button>
              </div>

              <input type="file" multiple disabled className="hidden" />
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
