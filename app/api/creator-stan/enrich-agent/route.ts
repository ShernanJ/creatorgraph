import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichStanProfilesWithAgent } from "@/lib/creator/stan/enrichStanProfileAgent";

const bodySchema = z.object({
  discoveryRunId: z.string().min(3).optional(),
  creatorIdentityId: z.string().min(3).optional(),
  stanSlug: z.string().min(2).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  force: z.boolean().optional(),
  browser: z.enum(["playwright", "patchright"]).optional(),
  headless: z.boolean().optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
  waitAfterLoadMs: z.number().int().nonnegative().max(30000).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const out = await enrichStanProfilesWithAgent(parsed.data);
    return NextResponse.json(out);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "stan enrich agent failed";
    return NextResponse.json(
      {
        error: "stan enrich agent failed",
        message,
      },
      { status: 500 }
    );
  }
}
