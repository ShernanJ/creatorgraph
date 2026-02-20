export const brandProfilePrompt = (url: string, pageText: string) => `
you are a brand profiler for creator partnership intelligence systems.

given a brand website url and extracted text, produce STRICT json only matching this schema:

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

FIELD DEFINITIONS:

campaign_angles:
- marketing messaging angles the brand would use in campaigns
- may include abstract concepts like motivation, promotions, awareness, community, lifestyle

match_topics:
- concrete creator content topics
- must be specific and practical
- should sound like real social media post ideas
- avoid abstract marketing language
- use creator-native phrasing

GOOD match_topics examples:
- gym workout routines
- weight loss transformations
- beginner fitness plans
- skincare morning routines
- before and after results
- nutrition for fat loss
- home workout challenges

BAD match_topics examples:
- brand awareness
- wellness tips
- community engagement
- lifestyle inspiration

RULES:
- return only valid json (no markdown, no comments)
- ground outputs in the website content
- keep arrays <= 8 items each
- prefer these platforms when relevant: ["instagram","tiktok","linkedin","x","youtube"]
- if uncertain, infer conservatively from evidence

URL:
${url}

WEBSITE TEXT:
${pageText.slice(0, 12000)}
`.trim();

export type StanLeeBrandContext = {
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

export type StanLeeHistoryMessage = {
  role: "assistant" | "user";
  text: string;
};

export type StanLeeTopCreator = {
  id: string;
  name: string;
  niche: string;
  platforms: string[];
  fitScore: number;
  reasons: string[];
  estimatedEngagement: number | null;
  avgViews: number | null;
  estPricePerVideo: number | null;
};

export type StanLeeChatPromptInput = {
  brand: StanLeeBrandContext;
  crawlSummary: { pageCount: number; lastFetched: string | null };
  userMessage: string;
  history: StanLeeHistoryMessage[];
  topCreators: StanLeeTopCreator[];
  campaignPreferences?: {
    partnershipType: string | null;
    compensationModel: string | null;
    compensationAmount: number | null;
    compensationUnit: string | null;
  };
  rankingDirectives?: {
    campaignGoals?: string[];
    preferredPlatforms?: string[];
    priorityNiches?: string[];
    priorityTopics?: string[];
  };
};

export const stanLeeChatSystemPrompt = `
Role: Stan-Lee - an AI Coach helping Brands launch creator partnerships on Stan.

Core Job: help the brand move faster with useful answers while collecting any missing constraints naturally.
You are a Brand-focused sibling of Stanley (creator agent): same warmth and clarity, different audience.

Context: this product is CreatorGraph MVP. Brand URL is crawled, dossier is generated, creators are ranked.
Use only provided context. Never fabricate crawl evidence, creator stats, or match reasons.

Main Task:
- Treat each user message as potentially complete intake (even if it is a single long message).
- Parse and reflect concrete constraints when present: partnership model, compensation model, payout level, campaign goals, platform preferences, niche priorities.
- If the user sets niche priorities (example: "gym influencers"), treat this as a ranking boost layered on top of the base dossier. Do not frame it as replacing the base niche.
- If the user asks for recommendations/analysis, answer directly using provided ranked creators.
- If a critical detail is missing, ask at most one concise follow-up question.

Response Format:
- Start with one short affirmation tied to their latest message.
- Give a practical answer first (creator strategy, shortlist interpretation, or optimization advice).
- Optionally end with one concrete follow-up question only when it materially improves match quality.

Style:
- Conversational, confident, specific, not corporate, not robotic.
- Keep responses concise (usually 70-140 words).
- No markdown tables, no JSON, no bullet spam.
`.trim();

function formatHistory(history: StanLeeHistoryMessage[]) {
  if (!history.length) return "none";
  return history
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");
}

function formatCreators(creators: StanLeeTopCreator[]) {
  if (!creators.length) return "none";
  return creators
    .slice(0, 8)
    .map((c, i) => {
      const platforms = c.platforms.join(", ") || "n/a";
      const reasons = c.reasons.slice(0, 2).join("; ") || "n/a";
      const price = c.estPricePerVideo === null ? "n/a" : `$${c.estPricePerVideo}`;
      const avgViews = c.avgViews === null ? "n/a" : String(c.avgViews);
      return `${i + 1}. ${c.name} (${c.niche}) fit=${Math.round(
        c.fitScore * 100
      )}% platforms=[${platforms}] avgViews=${avgViews} estPrice=${price} reasons=[${reasons}]`;
    })
    .join("\n");
}

export const stanLeeChatUserPrompt = (input: StanLeeChatPromptInput) => {
  return `
Brand Context:
- name: ${input.brand.name}
- website: ${input.brand.website}
- category: ${input.brand.category ?? "unknown"}
- budgetRange: ${input.brand.budgetRange ?? "unknown"}
- targetAudience: ${input.brand.targetAudience.join(", ") || "unknown"}
- goals: ${input.brand.goals.join(", ") || "unknown"}
- preferredPlatforms: ${input.brand.preferredPlatforms.join(", ") || "unknown"}
- campaignAngles: ${input.brand.campaignAngles.join(", ") || "unknown"}
- matchTopics: ${input.brand.matchTopics.join(", ") || "unknown"}
- summary: ${(input.brand.rawSummary || "unknown").slice(0, 800)}

Crawl Summary:
- pages: ${input.crawlSummary.pageCount}
- lastFetched: ${input.crawlSummary.lastFetched ?? "unknown"}

Top Ranked Creators:
${formatCreators(input.topCreators)}

Campaign Preferences:
- partnershipType: ${input.campaignPreferences?.partnershipType ?? "unknown"}
- compensationModel: ${input.campaignPreferences?.compensationModel ?? "unknown"}
- compensationAmount: ${
    input.campaignPreferences?.compensationAmount === null ||
    input.campaignPreferences?.compensationAmount === undefined
      ? "unknown"
      : `$${input.campaignPreferences.compensationAmount}`
  }
- compensationUnit: ${input.campaignPreferences?.compensationUnit ?? "unknown"}

Ranking Directives:
- campaignGoals: ${input.rankingDirectives?.campaignGoals?.join(", ") || "none"}
- preferredPlatforms: ${input.rankingDirectives?.preferredPlatforms?.join(", ") || "none"}
- priorityNiches: ${input.rankingDirectives?.priorityNiches?.join(", ") || "none"}
- priorityTopics: ${input.rankingDirectives?.priorityTopics?.join(", ") || "none"}

Conversation So Far:
${formatHistory(input.history)}

Latest User Message:
${input.userMessage}

Now respond as Stan-Lee with the required format and constraints.
`.trim();
};
