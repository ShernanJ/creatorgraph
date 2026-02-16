import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";


type CreatorSeed = {
  id: string;
  name: string;
  niche: string;
  platforms: string[];
  audience_types: string[];
  content_style?: string;
  products_sold: string[];
  sample_links: string[];
  estimated_engagement?: number;
  metrics?: unknown; // json blob (keep flexible)
};


function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || typeof v !== "string") throw new Error(`missing env: ${name}`);
  return v;
}

async function main() {
  const connectionString = requireEnv("DATABASE_URL");

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const filePath = path.join(process.cwd(), "data", "creators.seed.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const creators: CreatorSeed[] = JSON.parse(raw);

  console.log(`seeding ${creators.length} creators...`);

  for (const c of creators) {
    await pool.query(
      `
      insert into creators
        (id, name, niche, platforms, audience_types, content_style, products_sold, sample_links, estimated_engagement, metrics)
      values
        ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb)
      on conflict (id) do update set
        name=excluded.name,
        niche=excluded.niche,
        platforms=excluded.platforms,
        audience_types=excluded.audience_types,
        content_style=excluded.content_style,
        products_sold=excluded.products_sold,
        sample_links=excluded.sample_links,
        estimated_engagement=excluded.estimated_engagement,
        metrics=excluded.metrics
      `,
      [
        c.id,
        c.name,
        c.niche,
        JSON.stringify(c.platforms ?? []),
        JSON.stringify(c.audience_types ?? []),
        c.content_style ?? null,
        JSON.stringify(c.products_sold ?? []),
        JSON.stringify(c.sample_links ?? []),
        c.estimated_engagement ?? null,
        JSON.stringify(c.metrics ?? {}),
      ]
    );    
  }

  const count = await pool.query(`select count(*)::int as c from creators`);
  console.log(`✅ done. creators in db: ${count.rows[0].c}`);

  await pool.end();
}

main().catch((err) => {
  console.error("❌ seed failed:", err);
  process.exit(1);
});
