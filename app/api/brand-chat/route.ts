import { NextResponse } from "next/server";
import { z } from "zod";
import {
  groqText,
  isGroqCreditsExhaustedError,
  GROQ_CREDITS_EXHAUSTED_USER_MESSAGE,
} from "@/lib/groq";
import {
  stanLeeChatSystemPrompt,
  stanLeeChatUserPrompt,
  type StanLeeChatPromptInput,
} from "@/lib/prompts";

const historyMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: z.string().min(1).max(2500),
});

const brandSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(1),
  website: z.string().min(1),
  category: z.string().nullable(),
  budgetRange: z.string().nullable(),
  targetAudience: z.array(z.string()),
  goals: z.array(z.string()),
  preferredPlatforms: z.array(z.string()),
  campaignAngles: z.array(z.string()),
  matchTopics: z.array(z.string()),
  rawSummary: z.string(),
});

const creatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  niche: z.string(),
  platforms: z.array(z.string()),
  fitScore: z.number(),
  reasons: z.array(z.string()),
  estimatedEngagement: z.number().nullable(),
  avgViews: z.number().nullable(),
  estPricePerVideo: z.number().nullable(),
});

const bodySchema = z.object({
  brand: brandSchema,
  crawlSummary: z
    .object({
      pageCount: z.number().int().nonnegative(),
      lastFetched: z.string().nullable(),
    })
    .optional(),
  userMessage: z.string().min(1).max(2000),
  history: z.array(historyMessageSchema).optional(),
  topCreators: z.array(creatorSchema).optional(),
  campaignPreferences: z
    .object({
      partnershipType: z.string().nullable(),
      compensationModel: z.string().nullable(),
      compensationAmount: z.number().nullable(),
      compensationUnit: z.string().nullable(),
    })
    .optional(),
  rankingDirectives: z
    .object({
      campaignGoals: z.array(z.string()).optional(),
      preferredPlatforms: z.array(z.string()).optional(),
      priorityNiches: z.array(z.string()).optional(),
      priorityTopics: z.array(z.string()).optional(),
    })
    .optional(),
});

function fallbackReply(brandName: string) {
  return (
    `Great input from ${brandName}. ` +
    "If you share your target outcome, payout model, and any niche priorities, I can tighten the creator ranking immediately."
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const crawlSummary = parsed.data.crawlSummary ?? { pageCount: 0, lastFetched: null };
  const history = parsed.data.history ?? [];
  const topCreators = parsed.data.topCreators ?? [];

  const promptInput: StanLeeChatPromptInput = {
    brand: parsed.data.brand,
    crawlSummary,
    userMessage: parsed.data.userMessage,
    history,
    topCreators,
    campaignPreferences: parsed.data.campaignPreferences,
    rankingDirectives: parsed.data.rankingDirectives,
  };

  try {
    const raw = await groqText(stanLeeChatUserPrompt(promptInput), {
      system: stanLeeChatSystemPrompt,
      temperature: 0.45,
      maxCompletionTokens: 420,
    });

    const reply = raw.trim();
    return NextResponse.json({
      reply: reply.length ? reply : fallbackReply(parsed.data.brand.name),
    });
  } catch (err) {
    console.error("[brand-chat] error", err);
    if (isGroqCreditsExhaustedError(err)) {
      return NextResponse.json({ reply: GROQ_CREDITS_EXHAUSTED_USER_MESSAGE }, { status: 200 });
    }
    return NextResponse.json(
      { reply: fallbackReply(parsed.data.brand.name) },
      { status: 200 }
    );
  }
}
