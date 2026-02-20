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


create table if not exists brand_pages (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  url text not null,
  title text,
  text text not null,
  html_len int,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_brand_pages_brand on brand_pages(brand_id);
create unique index if not exists uniq_brand_pages_brand_url on brand_pages(brand_id, url);

-- stage 2: creator discovery (SERP ingestion)
create table if not exists raw_accounts (
  id text primary key,
  discovery_run_id text not null,
  query text not null,
  position int,
  title text,
  snippet text,
  source_url text not null,
  normalized_profile_url text,
  platform text,
  handle text,
  stan_slug text,
  follower_count_estimate int,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_raw_accounts_run on raw_accounts(discovery_run_id);
create index if not exists idx_raw_accounts_platform on raw_accounts(platform);
create index if not exists idx_raw_accounts_stan_slug on raw_accounts(stan_slug);
create unique index if not exists uniq_raw_accounts_run_query_url
on raw_accounts(discovery_run_id, query, source_url);

-- stage 3: creator identity resolution
create table if not exists creator_identities (
  id text primary key,
  canonical_stan_slug text unique,
  canonical_personal_domain text unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_identities_stan on creator_identities(canonical_stan_slug);
create index if not exists idx_creator_identities_domain on creator_identities(canonical_personal_domain);

create table if not exists creator_identity_accounts (
  id text primary key,
  creator_identity_id text not null references creator_identities(id) on delete cascade,
  raw_account_id text not null references raw_accounts(id) on delete cascade,
  platform text,
  handle text,
  normalized_profile_url text,
  source_url text not null,
  stan_slug text,
  personal_domain text,
  linkage_reason text not null,
  created_at timestamptz not null default now(),
  unique(raw_account_id)
);

create index if not exists idx_creator_identity_accounts_identity
on creator_identity_accounts(creator_identity_id);
create index if not exists idx_creator_identity_accounts_stan
on creator_identity_accounts(stan_slug);
create index if not exists idx_creator_identity_accounts_domain
on creator_identity_accounts(personal_domain);

create table if not exists identity_merge_candidates (
  id text primary key,
  raw_account_id text not null references raw_accounts(id) on delete cascade,
  discovery_run_id text not null,
  candidate_identity_id text references creator_identities(id) on delete set null,
  reason text not null,
  confidence numeric not null default 0.5,
  status text not null default 'pending',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(raw_account_id)
);

create index if not exists idx_identity_merge_candidates_run
on identity_merge_candidates(discovery_run_id);
create index if not exists idx_identity_merge_candidates_status
on identity_merge_candidates(status);
