/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { q } from "@/lib/db";
import { ingestSerpResults } from "@/lib/creator/discovery/ingestSerpResults";
import type { DiscoveryPlatform } from "@/lib/creator/discovery/types";

const rawResultSchema = z.object({
  title: z.string().optional(),
  snippet: z.string().optional(),
  url: z.string().url(),
  position: z.number().int().positive().optional(),
  raw: z.unknown().optional(),
});

const ingestSchema = z.object({
  discoveryRunId: z.string().min(3).optional(),
  query: z.string().min(3),
  results: z.array(rawResultSchema).min(1),
});

function emptyPlatformCounts(): Record<DiscoveryPlatform, number> {
  return { x: 0, instagram: 0, linkedin: 0, tiktok: 0, unknown: 0 };
}

function pct(part: number, total: number) {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

async function runReport(discoveryRunId: string) {
  const rows = await q<{ platform: DiscoveryPlatform | null; stan_slug: string | null }>(
    `select platform, stan_slug
     from raw_accounts
     where discovery_run_id=$1`,
    [discoveryRunId]
  );

  const byPlatform = emptyPlatformCounts();
  let withStanSlug = 0;

  for (const row of rows) {
    const p = (row.platform ?? "unknown") as DiscoveryPlatform;
    byPlatform[p] = (byPlatform[p] ?? 0) + 1;
    if (row.stan_slug) withStanSlug += 1;
  }

  return {
    discoveryRunId,
    total: rows.length,
    withStanSlug,
    stanSlugCoveragePct: pct(withStanSlug, rows.length),
    byPlatform,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const out = await ingestSerpResults(parsed.data);
  return NextResponse.json(out);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const discoveryRunId = url.searchParams.get("discoveryRunId");
  if (!discoveryRunId) {
    return NextResponse.json({ error: "missing discoveryRunId" }, { status: 400 });
  }

  const report = await runReport(discoveryRunId);
  return NextResponse.json(report);
}
