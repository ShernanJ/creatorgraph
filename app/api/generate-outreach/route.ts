/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { groqText } from "@/lib/groq";

function outreachPrompt(brand: any, creator: any, reasons: string[]) {
  return `
write a concise brand outreach email to a creator for a paid collaboration.

tone: professional, creator-friendly, not cringe, not corporate.
keep it under 180 words.

include:
- 1 sentence showing you actually understand the creator
- a specific collaboration idea (ugc angle) based on brand category + creator style
- a soft CTA to hop on a quick call
- a suggested compensation range based on budget_range

brand:
${JSON.stringify(
  {
    name: brand.name,
    website: brand.website,
    category: brand.category,
    target_audience: brand.target_audience,
    goals: brand.goals,
    budget_range: brand.budget_range,
    campaign_angles: brand.campaign_angles,
  },
  null,
  2
)}

creator:
${JSON.stringify(
  {
    name: creator.name,
    niche: creator.niche,
    platforms: creator.platforms,
    content_style: creator.content_style,
    audience_types: creator.audience_types,
    products_sold: creator.products_sold,
  },
  null,
  2
)}

why matched:
${reasons.join(", ")}

return only the email body (no subject).
  `.trim();
}

export async function POST(req: Request) {
  const { brandId, creatorId } = await req.json();

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);
  const [creator] = await q<any>(`select * from creators where id=$1`, [creatorId]);
  const [match] = await q<any>(
    `select * from matches where brand_id=$1 and creator_id=$2 order by created_at desc limit 1`,
    [brandId, creatorId]
  );

  if (!brand || !creator || !match) {
    return NextResponse.json(
      { error: "missing brand/creator/match", brand: !!brand, creator: !!creator, match: !!match },
      { status: 404 }
    );
  }

  const prompt = outreachPrompt(brand, creator, match.reasons ?? []);
  const pitch = await groqText(prompt, {
    temperature: 0.35,
    maxCompletionTokens: 500,
    system: "write exactly what the user asks. no extra sections.",
  });

  await q(`update matches set generated_pitch=$1, status='contacted' where id=$2`, [
    pitch,
    match.id,
  ]);

  return NextResponse.json({ pitch });
}
