-- creators
create table if not exists creators (
  id text primary key,
  name text not null,
  niche text not null,
  platforms jsonb not null default '[]'::jsonb,
  audience_types jsonb not null default '[]'::jsonb,
  content_style text,
  products_sold jsonb not null default '[]'::jsonb,
  sample_links jsonb not null default '[]'::jsonb,
  estimated_engagement numeric,
  metrics jsonb not null default '{}'::jsonb
);

-- brands
create table if not exists brands (
  id text primary key,
  name text not null,
  website text not null,
  category text,
  target_audience jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  preferred_platforms jsonb not null default '[]'::jsonb,
  budget_range text,
  campaign_angles jsonb not null default '[]'::jsonb,
  match_topics jsonb not null default '[]'::jsonb,
  raw_summary text,
  created_at timestamptz not null default now()
);

-- matches
create table if not exists matches (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  creator_id text not null references creators(id) on delete cascade,
  score numeric not null,
  reasons jsonb not null default '{}'::jsonb,
  generated_pitch text,
  status text not null default 'suggested',
  created_at timestamptz not null default now()
);

-- indexes
create index if not exists idx_matches_brand on matches(brand_id);
create index if not exists idx_matches_creator on matches(creator_id);

-- ✅ critical: prevent duplicates for same brand + creator
create unique index if not exists uniq_matches_brand_creator
on matches (brand_id, creator_id);
