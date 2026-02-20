import type { PlatformMetric } from "../../match/types";

export type CompatibilitySignalInput = {
  canonicalStanSlug: string | null;
  bioDescription: string | null;
  offers: string[];
  pricingPoints: string[];
  productTypes: string[];
  outboundSocials: string[];
  ctaStyle: string | null;
  accountTitles: string[];
  accountSnippets: string[];
  accountQueries: string[];
  accountPlatforms: string[];
  profileUrls: string[];
  sourceUrls: string[];
  socialPlatformMetrics: Record<string, unknown>;
  socialEstimatedEngagement: number | null;
  stanConfidence: number | null;
  socialConfidence: number | null;
};

type NicheRule = {
  niche: string;
  keywords: string[];
  defaultTopics: string[];
  defaultAudiences: string[];
};

type KeywordRule = {
  value: string;
  keywords: string[];
};

export type DerivedCompatibilitySignals = {
  niche: string;
  nicheConfidence: number;
  topTopics: string[];
  audienceTypes: string[];
  productsSold: string[];
  platforms: string[];
  contentStyle: string;
  estimatedEngagement: number | null;
  primaryPlatform: string | null;
  buyingIntentScore: number;
  sellingStyle: string;
  intentSignals: string[];
  confidence: number;
  platformMetrics: Record<string, PlatformMetric>;
  evidence: {
    matchedNicheKeywords: string[];
    matchedTopicKeywords: string[];
    matchedAudienceKeywords: string[];
    matchedProductKeywords: string[];
    matchedIntentKeywords: string[];
    sourcesUsed: string[];
  };
};

const NICHE_RULES: NicheRule[] = [
  {
    niche: "fitness coaching",
    keywords: [
      "fitness",
      "gym",
      "workout",
      "training",
      "coach",
      "weight loss",
      "fat loss",
      "body transformation",
    ],
    defaultTopics: ["gym routines", "fitness transformations", "nutrition", "weight loss"],
    defaultAudiences: ["gym beginners", "wellness seekers"],
  },
  {
    niche: "personal finance",
    keywords: [
      "finance",
      "investing",
      "budget",
      "credit",
      "debt",
      "cash flow",
      "wealth",
      "money habits",
    ],
    defaultTopics: ["budgeting", "saving", "investing", "debt payoff"],
    defaultAudiences: ["young professionals", "students"],
  },
  {
    niche: "beauty & skincare",
    keywords: [
      "skincare",
      "beauty",
      "makeup",
      "routine",
      "haircare",
      "self care",
      "cosmetics",
    ],
    defaultTopics: ["skincare routines", "product reviews", "beauty tutorials"],
    defaultAudiences: ["beauty shoppers", "women 18-34"],
  },
  {
    niche: "ecommerce & marketing",
    keywords: [
      "ecommerce",
      "shopify",
      "marketing",
      "ads",
      "creative strategy",
      "conversion",
      "funnel",
      "ugc",
    ],
    defaultTopics: ["paid ads", "creative testing", "conversion optimization", "ugc performance"],
    defaultAudiences: ["brand owners", "marketers"],
  },
  {
    niche: "ai productivity",
    keywords: [
      "ai",
      "automation",
      "agent",
      "prompt",
      "workflow",
      "notion",
      "productivity",
      "systems",
    ],
    defaultTopics: ["ai tools", "automation workflows", "productivity systems"],
    defaultAudiences: ["founders", "operators"],
  },
  {
    niche: "real estate investing",
    keywords: [
      "real estate",
      "property",
      "mortgage",
      "airbnb",
      "rental",
      "wholesale",
      "investor",
    ],
    defaultTopics: ["real estate leads", "cash flow", "property investing"],
    defaultAudiences: ["first-time investors", "real estate buyers"],
  },
  {
    niche: "business coaching",
    keywords: [
      "coaching",
      "consulting",
      "mentor",
      "strategy call",
      "service provider",
      "agency",
      "clients",
    ],
    defaultTopics: ["offer positioning", "client acquisition", "service delivery"],
    defaultAudiences: ["coaches", "solopreneurs"],
  },
  {
    niche: "wellness & nutrition",
    keywords: [
      "wellness",
      "nutrition",
      "meal plan",
      "hormone",
      "healthy lifestyle",
      "supplements",
    ],
    defaultTopics: ["nutrition plans", "healthy habits", "wellness routines"],
    defaultAudiences: ["health-conscious adults", "wellness seekers"],
  },
  {
    niche: "creator monetization",
    keywords: [
      "creator",
      "content creator",
      "influencer",
      "ugc creator",
      "creator store",
      "stan store",
      "brand deals",
    ],
    defaultTopics: ["creator economy", "brand partnerships", "digital products"],
    defaultAudiences: ["content creators", "solopreneurs"],
  },
];

const TOPIC_RULES: KeywordRule[] = [
  { value: "ugc content", keywords: ["ugc", "user generated content", "creator content"] },
  { value: "affiliate marketing", keywords: ["affiliate", "commission", "rev share"] },
  { value: "digital products", keywords: ["template", "ebook", "guide", "digital product"] },
  { value: "coaching offers", keywords: ["coaching", "strategy call", "book a call"] },
  { value: "membership growth", keywords: ["membership", "community", "join"] },
  { value: "newsletter growth", keywords: ["newsletter", "substack", "subscribe"] },
  { value: "personal branding", keywords: ["personal brand", "thought leadership"] },
  { value: "paid ads", keywords: ["meta ads", "facebook ads", "tiktok ads", "paid ads"] },
  { value: "sales funnels", keywords: ["funnel", "landing page", "checkout"] },
  { value: "fitness routines", keywords: ["workout", "gym", "routine"] },
  { value: "nutrition", keywords: ["nutrition", "meal plan", "macros"] },
  { value: "skincare", keywords: ["skincare", "skin", "beauty"] },
  { value: "investing", keywords: ["invest", "portfolio", "stocks"] },
  { value: "budgeting", keywords: ["budget", "debt", "credit"] },
  { value: "real estate", keywords: ["real estate", "property", "mortgage"] },
  { value: "ai automation", keywords: ["automation", "ai", "agent", "prompt"] },
];

const AUDIENCE_RULES: KeywordRule[] = [
  { value: "content creators", keywords: ["creator", "influencer", "ugc creator"] },
  { value: "founders", keywords: ["founder", "startup", "operator"] },
  { value: "coaches", keywords: ["coach", "coaching", "mentor"] },
  { value: "brand owners", keywords: ["brand owner", "ecommerce", "shopify"] },
  { value: "young professionals", keywords: ["young professionals", "career", "9-5"] },
  { value: "students", keywords: ["student", "college", "study"] },
  { value: "fitness beginners", keywords: ["fitness beginners", "gym beginner", "weight loss"] },
  { value: "beauty shoppers", keywords: ["beauty", "skincare", "makeup"] },
  { value: "real estate buyers", keywords: ["home buyer", "mortgage", "real estate"] },
];

const PRODUCT_RULES: KeywordRule[] = [
  { value: "coaching", keywords: ["coaching", "strategy call", "book a call"] },
  { value: "course", keywords: ["course", "program", "masterclass"] },
  { value: "template", keywords: ["template", "notion", "swipe file"] },
  { value: "membership", keywords: ["membership", "community", "mastermind"] },
  { value: "newsletter", keywords: ["newsletter", "substack"] },
  { value: "digital guide", keywords: ["ebook", "guide", "pdf"] },
  { value: "service", keywords: ["service", "done for you", "agency"] },
  { value: "ugc package", keywords: ["ugc package", "ugc bundle", "content package"] },
];

const INTENT_RULES: KeywordRule[] = [
  { value: "direct_purchase", keywords: ["buy", "checkout", "purchase", "shop now"] },
  { value: "lead_generation", keywords: ["book", "apply", "consult", "strategy call"] },
  { value: "affiliate", keywords: ["affiliate", "commission", "rev share"] },
  { value: "community", keywords: ["join community", "membership", "newsletter", "subscribe"] },
  { value: "ugc", keywords: ["ugc", "user generated content"] },
  { value: "digital_product", keywords: ["template", "course", "guide", "ebook"] },
];

function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizePlatform(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("insta")) return "instagram";
  if (v.includes("tiktok") || v === "tt") return "tiktok";
  if (v.includes("youtube") || v.includes("youtu") || v === "yt") return "youtube";
  if (v === "x" || v.includes("x.com") || v.includes("twitter")) return "x";
  if (v.includes("linkedin") || v === "in") return "linkedin";
  return null;
}

function platformFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return normalizePlatform(host);
  } catch {
    return null;
  }
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

function escapeRegex(raw: string) {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsKeyword(corpus: string, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes(" ")) {
    return corpus.includes(normalized);
  }
  const pattern = new RegExp(`\\b${escapeRegex(normalized)}\\b`, "i");
  return pattern.test(corpus);
}

function matchKeywords(corpus: string, keywords: string[]) {
  const matches: string[] = [];
  for (const keyword of keywords) {
    if (containsKeyword(corpus, keyword)) matches.push(keyword.toLowerCase());
  }
  return uniqStrings(matches);
}

function keywordValues(corpus: string, rules: KeywordRule[]) {
  const values: string[] = [];
  const matchedKeywords: string[] = [];
  for (const rule of rules) {
    const hits = matchKeywords(corpus, rule.keywords);
    if (!hits.length) continue;
    values.push(rule.value);
    matchedKeywords.push(...hits);
  }
  return {
    values: uniqStrings(values),
    matchedKeywords: uniqStrings(matchedKeywords),
  };
}

function asPlatformMetric(value: unknown): PlatformMetric | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const followers = toFiniteNumber(row.followers);
  const avgViews = toFiniteNumber(row.avg_views);
  const engagementRate = toFiniteNumber(row.engagement_rate);
  const confidence = toFiniteNumber(row.confidence);
  const sampleSize = toFiniteNumber(row.sample_size);
  const source = typeof row.source === "string" ? row.source : undefined;

  const out: PlatformMetric = {};
  if (followers !== null) out.followers = Math.max(0, Math.round(followers));
  if (avgViews !== null) out.avg_views = Math.max(0, Math.round(avgViews));
  if (engagementRate !== null) out.engagement_rate = clamp(engagementRate, 0, 1);
  if (confidence !== null) out.confidence = clamp(confidence, 0, 1);
  if (sampleSize !== null) out.sample_size = Math.max(0, Math.round(sampleSize));
  if (source) out.source = source;

  if (!Object.keys(out).length) return null;
  return out;
}

function sanitizePlatformMetrics(raw: Record<string, unknown>) {
  const out: Record<string, PlatformMetric> = {};
  for (const [platformRaw, value] of Object.entries(raw)) {
    const platform = normalizePlatform(platformRaw);
    if (!platform) continue;
    const metric = asPlatformMetric(value);
    if (!metric) continue;
    out[platform] = metric;
  }
  return out;
}

function pickPrimaryPlatform(
  platformMetrics: Record<string, PlatformMetric>,
  fallbackPlatforms: string[]
) {
  const entries = Object.entries(platformMetrics);
  if (!entries.length) {
    return fallbackPlatforms[0] ?? null;
  }

  const scored = entries.map(([platform, metric]) => {
    const avgViews = toFiniteNumber(metric.avg_views);
    const followers = toFiniteNumber(metric.followers);
    const confidence = toFiniteNumber(metric.confidence) ?? 0.4;
    const score =
      Math.log10(Math.max(1, (avgViews ?? 0) + 1)) * 0.5 +
      Math.log10(Math.max(1, (followers ?? 0) + 1)) * 0.35 +
      confidence * 0.15;
    return { platform, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.platform ?? fallbackPlatforms[0] ?? null;
}

function estimateEngagementRate(args: {
  explicitEstimate: number | null;
  platformMetrics: Record<string, PlatformMetric>;
}) {
  if (typeof args.explicitEstimate === "number" && args.explicitEstimate > 0) {
    return Number(args.explicitEstimate.toFixed(4));
  }

  const entries = Object.values(args.platformMetrics)
    .map((metric) => {
      const er = toFiniteNumber(metric.engagement_rate);
      if (!er || er <= 0) return null;
      const followers = toFiniteNumber(metric.followers) ?? 1;
      const confidence = toFiniteNumber(metric.confidence) ?? 0.4;
      const weight = Math.max(0.2, confidence) * Math.max(1, Math.log10(followers + 10));
      return { er, weight };
    })
    .filter((x): x is { er: number; weight: number } => Boolean(x));

  if (!entries.length) return null;
  const weighted = entries.reduce((sum, row) => sum + row.er * row.weight, 0);
  const totalWeight = entries.reduce((sum, row) => sum + row.weight, 0);
  return Number((weighted / Math.max(1e-9, totalWeight)).toFixed(4));
}

function inferSellingStyle(ctaStyle: string | null, intentSignals: string[]) {
  const cta = String(ctaStyle ?? "").toLowerCase();
  if (cta === "consultative") return "consultative";
  if (cta === "transactional") return "direct_response";
  if (cta === "community") return "community_led";
  if (cta === "inbound_dm") return "dm_conversion";

  if (intentSignals.includes("direct_purchase")) return "direct_response";
  if (intentSignals.includes("lead_generation")) return "consultative";
  if (intentSignals.includes("community")) return "community_led";
  return "educational";
}

function inferContentStyle(sellingStyle: string, topicSignals: string[]) {
  if (sellingStyle === "consultative") return "consultative coaching-style content";
  if (sellingStyle === "direct_response") return "direct response offer-led content";
  if (sellingStyle === "community_led") return "community and newsletter-led content";
  if (sellingStyle === "dm_conversion") return "personal brand and DM-led conversion content";
  if (topicSignals.includes("ugc content")) return "ugc demonstration content";
  return "educational creator content";
}

export function extractCompatibilitySignals(
  input: CompatibilitySignalInput
): DerivedCompatibilitySignals {
  const sourcesUsed: string[] = [];
  if (input.bioDescription) sourcesUsed.push("stan_bio");
  if (input.offers.length) sourcesUsed.push("stan_offers");
  if (input.productTypes.length) sourcesUsed.push("stan_product_types");
  if (input.pricingPoints.length) sourcesUsed.push("stan_pricing_points");
  if (input.accountSnippets.length || input.accountTitles.length) sourcesUsed.push("serp_account_text");
  if (Object.keys(input.socialPlatformMetrics).length) sourcesUsed.push("social_metrics");

  const corpus = [
    input.canonicalStanSlug ?? "",
    input.bioDescription ?? "",
    ...input.offers,
    ...input.productTypes,
    ...input.accountTitles,
    ...input.accountSnippets,
    ...input.accountQueries,
  ]
    .join(" \n ")
    .toLowerCase();

  let selectedNiche = "creator monetization";
  let selectedNicheScore = 0;
  let selectedNicheKeywords: string[] = [];
  let selectedTopics: string[] = [];
  let selectedAudiences: string[] = [];

  for (const rule of NICHE_RULES) {
    const hits = matchKeywords(corpus, rule.keywords);
    if (!hits.length) continue;
    const score = hits.length / Math.max(1, rule.keywords.length);
    if (score > selectedNicheScore) {
      selectedNiche = rule.niche;
      selectedNicheScore = score;
      selectedNicheKeywords = hits;
      selectedTopics = rule.defaultTopics;
      selectedAudiences = rule.defaultAudiences;
    }
  }

  if (selectedNicheScore <= 0) {
    const fallback = NICHE_RULES.find((x) => x.niche === "creator monetization");
    selectedTopics = fallback?.defaultTopics ?? [];
    selectedAudiences = fallback?.defaultAudiences ?? [];
  }

  const topicSignals = keywordValues(corpus, TOPIC_RULES);
  const audienceSignals = keywordValues(corpus, AUDIENCE_RULES);
  const productSignals = keywordValues(corpus, PRODUCT_RULES);
  const intentSignals = keywordValues(corpus, INTENT_RULES);

  const productsFromExplicit = uniqStrings(input.productTypes.map((x) => x.toLowerCase()));
  const productsSold = uniqStrings([...productsFromExplicit, ...productSignals.values]).slice(0, 10);

  const topTopics = uniqStrings([
    ...selectedTopics,
    ...topicSignals.values,
    ...productsSold,
    ...intentSignals.values.map((v) => v.replace(/_/g, " ")),
  ]).slice(0, 12);

  const audienceTypes = uniqStrings([...selectedAudiences, ...audienceSignals.values]).slice(0, 8);

  const socialMetrics = sanitizePlatformMetrics(input.socialPlatformMetrics);

  const platforms = uniqStrings([
    ...input.accountPlatforms.map((x) => normalizePlatform(x) ?? ""),
    ...input.outboundSocials.map((x) => platformFromUrl(x) ?? ""),
    ...input.profileUrls.map((x) => platformFromUrl(x) ?? ""),
    ...input.sourceUrls.map((x) => platformFromUrl(x) ?? ""),
    ...Object.keys(socialMetrics),
  ]).filter(Boolean);

  const primaryPlatform = pickPrimaryPlatform(socialMetrics, platforms);
  const estimatedEngagement = estimateEngagementRate({
    explicitEstimate: input.socialEstimatedEngagement,
    platformMetrics: socialMetrics,
  });

  const sellingStyle = inferSellingStyle(input.ctaStyle, intentSignals.values);
  const contentStyle = inferContentStyle(sellingStyle, topicSignals.values);

  let buyingIntentScore = 0.3;
  if (input.pricingPoints.length > 0) buyingIntentScore += 0.15;
  if (productsSold.length >= 1) buyingIntentScore += 0.1;
  if (productsSold.length >= 3) buyingIntentScore += 0.06;
  if (intentSignals.values.includes("direct_purchase")) buyingIntentScore += 0.14;
  if (intentSignals.values.includes("lead_generation")) buyingIntentScore += 0.1;
  if (intentSignals.values.includes("affiliate")) buyingIntentScore += 0.08;
  if (sellingStyle === "direct_response" || sellingStyle === "consultative") buyingIntentScore += 0.08;
  if (Object.keys(socialMetrics).length > 0) buyingIntentScore += 0.07;
  if (primaryPlatform) buyingIntentScore += 0.04;
  buyingIntentScore = Number(clamp(buyingIntentScore, 0.1, 0.98).toFixed(3));

  const nicheConfidence = Number(clamp(0.35 + selectedNicheScore * 1.3, 0.25, 0.98).toFixed(3));
  const stanConfidence = clamp(toFiniteNumber(input.stanConfidence) ?? 0.4, 0, 1);
  const socialConfidence = clamp(toFiniteNumber(input.socialConfidence) ?? 0.4, 0, 1);

  let confidence = 0.26;
  confidence += 0.23 * stanConfidence;
  confidence += 0.2 * socialConfidence;
  confidence += 0.12 * nicheConfidence;
  confidence += 0.07 * Math.min(1, topTopics.length / 8);
  confidence += 0.05 * Math.min(1, audienceTypes.length / 5);
  confidence += 0.04 * Math.min(1, productsSold.length / 4);
  confidence += Object.keys(socialMetrics).length ? 0.08 : 0;
  confidence = Number(clamp(confidence, 0.2, 0.98).toFixed(3));

  return {
    niche: selectedNiche,
    nicheConfidence,
    topTopics,
    audienceTypes,
    productsSold,
    platforms,
    contentStyle,
    estimatedEngagement,
    primaryPlatform,
    buyingIntentScore,
    sellingStyle,
    intentSignals: intentSignals.values,
    confidence,
    platformMetrics: socialMetrics,
    evidence: {
      matchedNicheKeywords: selectedNicheKeywords,
      matchedTopicKeywords: topicSignals.matchedKeywords,
      matchedAudienceKeywords: audienceSignals.matchedKeywords,
      matchedProductKeywords: productSignals.matchedKeywords,
      matchedIntentKeywords: intentSignals.matchedKeywords,
      sourcesUsed: uniqStrings(sourcesUsed),
    },
  };
}
