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

function flattenCreators(input: unknown): CreatorSeed[] {
  if (Array.isArray(input)) {
    return input.flatMap((x) => flattenCreators(x));
  }
  if (!input || typeof input !== "object") return [];
  const row = input as Partial<CreatorSeed>;
  if (!row.id || !row.name || !row.niche) return [];
  return [
    {
      id: String(row.id),
      name: String(row.name),
      niche: String(row.niche),
      platforms: Array.isArray(row.platforms) ? row.platforms.map((x) => String(x)) : [],
      audience_types: Array.isArray(row.audience_types)
        ? row.audience_types.map((x) => String(x))
        : [],
      content_style: row.content_style ? String(row.content_style) : undefined,
      products_sold: Array.isArray(row.products_sold)
        ? row.products_sold.map((x) => String(x))
        : [],
      sample_links: Array.isArray(row.sample_links) ? row.sample_links.map((x) => String(x)) : [],
      estimated_engagement:
        typeof row.estimated_engagement === "number" ? row.estimated_engagement : undefined,
      metrics: row.metrics ?? {},
    },
  ];
}

function dedupeById(rows: CreatorSeed[]) {
  const seen = new Set<string>();
  const out: CreatorSeed[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function loadSeedFiles(files: string[]) {
  const all: CreatorSeed[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    all.push(...flattenCreators(parsed));
  }
  return dedupeById(all);
}

function resolveTargetTable(rawTarget: string | undefined) {
  const normalized = String(rawTarget ?? "synthetic").trim().toLowerCase();
  if (normalized === "creators" || normalized === "real") return "creators" as const;
  if (normalized === "synthetic_creators" || normalized === "synthetic") {
    return "synthetic_creators" as const;
  }
  throw new Error(
    `invalid CREATOR_SEED_TARGET "${rawTarget}". use one of: synthetic, synthetic_creators, real, creators`
  );
}

async function main() {
  const connectionString = requireEnv("DATABASE_URL");
  const targetTable = resolveTargetTable(process.env.CREATOR_SEED_TARGET);

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const seedPaths = [
    path.join(process.cwd(), "data", "creators.seed.json"),
    path.join(process.cwd(), "data", "backup-creators.seed.json"),
  ];
  const creators = loadSeedFiles(seedPaths);

  console.log(`seeding ${creators.length} creators into ${targetTable}...`);

  for (const c of creators) {
    const sql =
      targetTable === "creators"
        ? `
      insert into creators
        (id, name, niche, platforms, audience_types, content_style, products_sold, sample_links, estimated_engagement, metrics, source)
      values
        ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,'seed')
      on conflict (id) do update set
        name=excluded.name,
        niche=excluded.niche,
        platforms=excluded.platforms,
        audience_types=excluded.audience_types,
        content_style=excluded.content_style,
        products_sold=excluded.products_sold,
        sample_links=excluded.sample_links,
        estimated_engagement=excluded.estimated_engagement,
        metrics=excluded.metrics,
        source=excluded.source
      `
        : `
      insert into synthetic_creators
        (id, name, niche, platforms, audience_types, content_style, products_sold, sample_links, estimated_engagement, metrics, seed_source, updated_at)
      values
        ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,'seed',now())
      on conflict (id) do update set
        name=excluded.name,
        niche=excluded.niche,
        platforms=excluded.platforms,
        audience_types=excluded.audience_types,
        content_style=excluded.content_style,
        products_sold=excluded.products_sold,
        sample_links=excluded.sample_links,
        estimated_engagement=excluded.estimated_engagement,
        metrics=excluded.metrics,
        seed_source=excluded.seed_source,
        updated_at=now()
      `;

    await pool.query(
      sql,
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

  const count = await pool.query(
    targetTable === "creators"
      ? `select count(*)::int as c from creators`
      : `select count(*)::int as c from synthetic_creators`
  );
  console.log(`✅ done. ${targetTable} rows in db: ${count.rows[0].c}`);

  await pool.end();
}

main().catch((err) => {
  console.error("❌ seed failed:", err);
  process.exit(1);
});
