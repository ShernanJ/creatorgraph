import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichSocialMetrics } from "@/lib/creator/social/enrichSocialMetrics";

const bodySchema = z.object({
  creatorIdentityId: z.string().min(3).optional(),
  limit: z.number().int().positive().max(2000).optional(),
  force: z.boolean().optional(),
  minFollowerEstimate: z.number().int().nonnegative().optional(),
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

  const out = await enrichSocialMetrics(parsed.data);
  return NextResponse.json(out);
}
