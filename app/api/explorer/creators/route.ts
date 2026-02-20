/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";

type SourceMode = "real" | "synthetic" | "all";

function parseSourceMode(raw: string | null): SourceMode {
  const value = String(raw ?? "real").trim().toLowerCase();
  if (value === "synthetic") return "synthetic";
  if (value === "all") return "all";
  return "real";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = parseSourceMode(url.searchParams.get("source"));
  const limitRaw = Number(url.searchParams.get("limit") ?? "500");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(2000, Math.round(limitRaw)) : 500;

  if (source === "synthetic") {
    const creators = await q<any>(
      `select id, name, niche, platforms, audience_types, estimated_engagement, metrics
       from synthetic_creators
       order by id asc
       limit $1`,
      [limit]
    );
    return NextResponse.json({ creators, source: "synthetic_creators", fallbackUsed: false });
  }

  if (source === "all") {
    const creators = await q<any>(
      `select id, name, niche, platforms, audience_types, estimated_engagement, metrics
       from (
         select id, name, niche, platforms, audience_types, estimated_engagement, metrics, 0 as priority
         from creators
         union all
         select id, name, niche, platforms, audience_types, estimated_engagement, metrics, 1 as priority
         from synthetic_creators
       ) x
       order by priority asc, id asc
       limit $1`,
      [limit]
    );
    return NextResponse.json({ creators, source: "all", fallbackUsed: false });
  }

  const real = await q<any>(
    `select id, name, niche, platforms, audience_types, estimated_engagement, metrics
     from creators
     order by id asc
     limit $1`,
    [limit]
  );

  if (real.length) {
    return NextResponse.json({ creators: real, source: "creators", fallbackUsed: false });
  }

  const synthetic = await q<any>(
    `select id, name, niche, platforms, audience_types, estimated_engagement, metrics
     from synthetic_creators
     order by id asc
     limit $1`,
    [limit]
  );
  return NextResponse.json({
    creators: synthetic,
    source: "synthetic_creators",
    fallbackUsed: true,
  });
}
