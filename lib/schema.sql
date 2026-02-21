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

-- synthetic/demo creators (seed fixtures only)
create table if not exists synthetic_creators (
  id text primary key,
  name text not null,
  niche text not null,
  platforms jsonb not null default '[]'::jsonb,
  audience_types jsonb not null default '[]'::jsonb,
  content_style text,
  products_sold jsonb not null default '[]'::jsonb,
  sample_links jsonb not null default '[]'::jsonb,
  estimated_engagement numeric,
  metrics jsonb not null default '{}'::jsonb,
  seed_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_synthetic_creators_niche on synthetic_creators(niche);

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

-- stage 2b: raw account extraction snapshots (iterative parser outputs)
create table if not exists raw_account_extractions (
  id text primary key,
  raw_account_id text not null references raw_accounts(id) on delete cascade,
  discovery_run_id text not null,
  platform text,
  extractor_version text not null default 'v1',
  stan_url text,
  stan_slug text,
  all_stan_urls jsonb not null default '[]'::jsonb,
  follower_count_estimate int,
  platform_profile_url text,
  platform_handle text,
  instagram_profile_url text,
  instagram_handle text,
  extraction_confidence numeric not null default 0.5,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(raw_account_id, extractor_version)
);

create index if not exists idx_raw_account_extractions_run
on raw_account_extractions(discovery_run_id);
create index if not exists idx_raw_account_extractions_platform
on raw_account_extractions(platform);
create index if not exists idx_raw_account_extractions_stan_slug
on raw_account_extractions(stan_slug);

alter table raw_account_extractions
add column if not exists all_stan_urls jsonb not null default '[]'::jsonb;

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

-- real creator import metadata (stage 5+)
alter table creators add column if not exists creator_identity_id text;
alter table creators add column if not exists source text not null default 'real';
alter table creators add column if not exists imported_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_creators_creator_identity'
  ) then
    alter table creators
      add constraint fk_creators_creator_identity
      foreign key (creator_identity_id)
      references creator_identities(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists uniq_creators_creator_identity
on creators(creator_identity_id)
where creator_identity_id is not null;

create index if not exists idx_creators_source on creators(source);

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

-- stage 4: stan hub enrichment
create table if not exists creator_stan_profiles (
  id text primary key,
  creator_identity_id text not null references creator_identities(id) on delete cascade,
  stan_slug text not null,
  stan_url text not null,
  profile_name text,
  profile_handle text,
  bio_description text,
  offers jsonb not null default '[]'::jsonb,
  offer_cards jsonb not null default '[]'::jsonb,
  offer_image_urls jsonb not null default '[]'::jsonb,
  header_image_url text,
  pricing_points jsonb not null default '[]'::jsonb,
  product_types jsonb not null default '[]'::jsonb,
  outbound_socials jsonb not null default '[]'::jsonb,
  email text,
  cta_style text,
  source_text text,
  source_html_len int,
  extracted_confidence numeric not null default 0.5,
  enriched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(creator_identity_id)
);

create index if not exists idx_creator_stan_profiles_identity
on creator_stan_profiles(creator_identity_id);
create index if not exists idx_creator_stan_profiles_slug
on creator_stan_profiles(stan_slug);

alter table creator_stan_profiles
add column if not exists profile_name text;
alter table creator_stan_profiles
add column if not exists profile_handle text;
alter table creator_stan_profiles
add column if not exists offer_cards jsonb not null default '[]'::jsonb;
alter table creator_stan_profiles
add column if not exists offer_image_urls jsonb not null default '[]'::jsonb;
alter table creator_stan_profiles
add column if not exists header_image_url text;

-- stage 5: social performance enrichment
create table if not exists creator_social_profiles (
  id text primary key,
  creator_identity_id text not null references creator_identities(id) on delete cascade,
  platform text not null,
  followers_estimate int,
  avg_views_estimate int,
  engagement_rate_estimate numeric,
  sample_size int not null default 0,
  data_quality text not null default 'estimated',
  source text not null default 'identity_graph',
  extraction_confidence numeric not null default 0.4,
  evidence jsonb not null default '{}'::jsonb,
  enriched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(creator_identity_id, platform)
);

create index if not exists idx_creator_social_profiles_identity
on creator_social_profiles(creator_identity_id);
create index if not exists idx_creator_social_profiles_platform
on creator_social_profiles(platform);
