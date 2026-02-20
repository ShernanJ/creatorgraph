/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export async function GET() {
  const creators = await q<any>(
    `select id, name, niche, platforms, audience_types, estimated_engagement, metrics
     from creators
     order by id asc
     limit 500`
  );
  return NextResponse.json({ creators });
}
