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

  const realSelect = `
    select
      c.id,
      c.name,
      c.niche,
      c.platforms,
      c.audience_types,
      c.sample_links,
      c.estimated_engagement,
      c.metrics,
      coalesce(
        nullif(c.metrics->'import_meta'->>'stan_header_image_url', ''),
        csp.header_image_url
      ) as profile_photo_url,
      c.source as record_source
    from creators c
    left join creator_stan_profiles csp on csp.creator_identity_id = c.creator_identity_id
  `;

  const syntheticSelect = `
    select
      sc.id,
      sc.name,
      sc.niche,
      sc.platforms,
      sc.audience_types,
      sc.sample_links,
      sc.estimated_engagement,
      sc.metrics,
      null::text as profile_photo_url,
      'synthetic'::text as record_source
    from synthetic_creators sc
  `;

  if (source === "synthetic") {
    const creators = await q<any>(
      `${syntheticSelect}
       order by sc.id asc
       limit $1`,
      [limit]
    );
    return NextResponse.json({ creators, source: "synthetic_creators", fallbackUsed: false });
  }

  if (source === "all") {
    const creators = await q<any>(
      `select id, name, niche, platforms, audience_types, sample_links, estimated_engagement, metrics, profile_photo_url, record_source
       from (
         select
           c.id,
           c.name,
           c.niche,
           c.platforms,
           c.audience_types,
           c.sample_links,
           c.estimated_engagement,
           c.metrics,
           coalesce(
             nullif(c.metrics->'import_meta'->>'stan_header_image_url', ''),
             csp.header_image_url
           ) as profile_photo_url,
           c.source as record_source,
           0 as priority
         from creators c
         left join creator_stan_profiles csp on csp.creator_identity_id = c.creator_identity_id
         union all
         select
           sc.id,
           sc.name,
           sc.niche,
           sc.platforms,
           sc.audience_types,
           sc.sample_links,
           sc.estimated_engagement,
           sc.metrics,
           null::text as profile_photo_url,
           'synthetic'::text as record_source,
           1 as priority
         from synthetic_creators sc
       ) x
       order by priority asc, id asc
       limit $1`,
      [limit]
    );
    return NextResponse.json({ creators, source: "all", fallbackUsed: false });
  }

  const real = await q<any>(
    `${realSelect}
     order by c.id asc
     limit $1`,
    [limit]
  );

  if (real.length) {
    return NextResponse.json({ creators: real, source: "creators", fallbackUsed: false });
  }

  const synthetic = await q<any>(
    `${syntheticSelect}
     order by sc.id asc
     limit $1`,
    [limit]
  );
  return NextResponse.json({
    creators: synthetic,
    source: "synthetic_creators",
    fallbackUsed: true,
  });
}
