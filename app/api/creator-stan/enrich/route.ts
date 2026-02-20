import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichStanProfiles } from "@/lib/creator/stan/enrichStanProfile";

const bodySchema = z.object({
  creatorIdentityId: z.string().min(3).optional(),
  stanSlug: z.string().min(2).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  force: z.boolean().optional(),
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

  const out = await enrichStanProfiles(parsed.data);
  return NextResponse.json(out);
}
