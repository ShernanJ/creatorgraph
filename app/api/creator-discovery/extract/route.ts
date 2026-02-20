import { NextResponse } from "next/server";
import { z } from "zod";
import {
  extractRawAccounts,
  extractRawAccountSamples,
  listPersistedRawAccountExtractions,
} from "@/lib/creator/discovery/extractRawAccounts";

const PLATFORM_VALUES = ["x", "instagram", "linkedin", "tiktok", "youtube", "unknown"] as const;

const postSchema = z.object({
  discoveryRunId: z.string().min(3).optional(),
  platform: z.enum(PLATFORM_VALUES).optional(),
  rawAccountIds: z.array(z.string().min(3)).max(5000).optional(),
  extractorVersion: z.string().min(1).max(64).optional(),
  limit: z.number().int().positive().max(20000).optional(),
  previewLimit: z.number().int().positive().max(500).optional(),
  dryRun: z.boolean().optional(),
  samples: z
    .array(
      z.object({
        platform: z.enum(PLATFORM_VALUES).optional(),
        sourceUrl: z.string().url(),
        title: z.string().optional(),
        snippet: z.string().optional(),
        raw: z.unknown().optional(),
        rawAccountId: z.string().min(1).optional(),
        discoveryRunId: z.string().min(1).optional(),
      })
    )
    .min(1)
    .max(200)
    .optional(),
});

const getSchema = z.object({
  discoveryRunId: z.string().min(3).optional(),
  platform: z.enum(PLATFORM_VALUES).optional(),
  extractorVersion: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().positive().max(5000).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  if (parsed.data.samples?.length) {
    const out = extractRawAccountSamples(parsed.data.samples);
    return NextResponse.json({
      mode: "sample",
      ...out,
    });
  }

  const out = await extractRawAccounts(parsed.data);
  return NextResponse.json(out);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = {
    discoveryRunId: url.searchParams.get("discoveryRunId") ?? undefined,
    platform: url.searchParams.get("platform") ?? undefined,
    extractorVersion: url.searchParams.get("extractorVersion") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };
  const parsed = getSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query params", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const out = await listPersistedRawAccountExtractions(parsed.data);
  return NextResponse.json(out);
}
