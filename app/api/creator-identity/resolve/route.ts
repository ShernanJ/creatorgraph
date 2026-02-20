import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveIdentities } from "@/lib/creator/identity/resolveIdentities";

const bodySchema = z.object({
  discoveryRunId: z.string().min(3).optional(),
  limit: z.number().int().positive().max(5000).optional(),
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

  const out = await resolveIdentities(parsed.data);
  return NextResponse.json(out);
}
