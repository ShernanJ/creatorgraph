import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

type CreatorSeed = { id: string };

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || typeof v !== "string") throw new Error(`missing env: ${name}`);
  return v;
}

function flattenSeedIds(input: unknown): string[] {
  if (Array.isArray(input)) return input.flatMap((x) => flattenSeedIds(x));
  if (!input || typeof input !== "object") return [];
  const row = input as Partial<CreatorSeed>;
  if (!row.id) return [];
  return [String(row.id)];
}

function loadSeedIds() {
  const files = [
    path.join(process.cwd(), "data", "creators.seed.json"),
    path.join(process.cwd(), "data", "backup-creators.seed.json"),
  ];

  const ids = new Set<string>();
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    for (const id of flattenSeedIds(parsed)) ids.add(id);
  }
  return [...ids];
}

async function main() {
  const connectionString = requireEnv("DATABASE_URL");
  const seedIds = loadSeedIds();
  if (!seedIds.length) {
    throw new Error("no seed creator ids found");
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query("begin");

    const selected = await client.query<{ c: number }>(
      `select count(*)::int as c
       from creators
       where id = any($1::text[]) or source='seed'`,
      [seedIds]
    );

    await client.query(
      `insert into synthetic_creators (
         id, name, niche, platforms, audience_types, content_style,
         products_sold, sample_links, estimated_engagement, metrics, seed_source, updated_at
       )
       select
         c.id, c.name, c.niche, c.platforms, c.audience_types, c.content_style,
         c.products_sold, c.sample_links, c.estimated_engagement, c.metrics,
         coalesce(sc.seed_source, 'migrated_from_creators'),
         now()
       from creators c
       left join synthetic_creators sc on sc.id = c.id
       where c.id = any($1::text[]) or c.source='seed'
       on conflict (id) do update set
         name = excluded.name,
         niche = excluded.niche,
         platforms = excluded.platforms,
         audience_types = excluded.audience_types,
         content_style = excluded.content_style,
         products_sold = excluded.products_sold,
         sample_links = excluded.sample_links,
         estimated_engagement = excluded.estimated_engagement,
         metrics = excluded.metrics,
         seed_source = excluded.seed_source,
         updated_at = now()`,
      [seedIds]
    );

    const deleted = await client.query<{ c: number }>(
      `with moved as (
         delete from creators
         where id = any($1::text[]) or source='seed'
         returning id
       )
       select count(*)::int as c from moved`,
      [seedIds]
    );

    const remainingReal = await client.query<{ c: number }>(
      `select count(*)::int as c from creators`
    );
    const syntheticCount = await client.query<{ c: number }>(
      `select count(*)::int as c from synthetic_creators`
    );

    await client.query("commit");

    console.log(`selected fake creators: ${selected.rows[0]?.c ?? 0}`);
    console.log(`moved out of creators: ${deleted.rows[0]?.c ?? 0}`);
    console.log(`creators (real table) count: ${remainingReal.rows[0]?.c ?? 0}`);
    console.log(`synthetic_creators count: ${syntheticCount.rows[0]?.c ?? 0}`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("failed to move synthetic creators:", err);
  process.exit(1);
});

