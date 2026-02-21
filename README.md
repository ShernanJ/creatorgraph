# CreatorGraph — Creator Partnership Intelligence Platform

CreatorGraph is an automated brand-to-creator deal generation layer designed to integrate directly into creator ecosystems like Stan.

It transforms brand onboarding, campaign creation, creator matching, and outreach into a structured, intelligence-driven revenue pipeline.

---

# Core Thesis

Most creator platforms focus on storefronts, link-in-bio monetization, and inbound discovery.

CreatorGraph focuses on the missing side:

> Turning creator ecosystems into structured, automated partnership engines.

Instead of:

- Creators manually searching for deals
- Brands manually browsing creators
- Cold outbound guessing

CreatorGraph:

- Structures brand intent
- Structures creator signals
- Computes compatibility deterministically
- Orchestrates deal flow automatically

The result is reduced friction, higher match quality, and scalable revenue generation.

---

# Platform Model

CreatorGraph is a platform layer embedded within the creator ecosystem.

## Brand Experience

1. Brand pastes website URL
2. AI crawl + analysis builds structured brand dossier
3. High-fit creators are ranked
4. Outreach is generated with campaign context

## Creator Experience

Creators receive ranked inbound opportunities rather than searching manually.

---

# System Architecture (Vision)

```text
Brand URL
   ↓
Playwright Crawl Agent
   ↓
Structured Brand Dossier
   ↓
Creator Discovery + Identity Resolution
   ↓
Creator Enrichment Layers
   ↓
Compatibility Scoring Engine
   ↓
Ranked Matches
   ↓
Outreach + Deal Lifecycle Tracking
```

---

# Current Build Status (Implemented)

## Stage 1 — Matching Engine Hardening

- Modular scoring in `lib/match/*`
- Confidence-aware weighting + explainable reasons
- Deterministic fixture checks via `npm run match:fixtures`

## Stage 2 — Creator Discovery Ingestion

- `raw_accounts` table in `lib/schema.sql`
- `POST /api/creator-discovery/crawl` (Playwright Google SERP crawler preview + optional persist)
- Crawl endpoint supports:
  - `engine=auto|google|duckduckgo|serpapi`
  - `auto` prefers `serpapi` when `SERP_API_KEY` is set
  - `browser=playwright|patchright` (`CREATOR_DISCOVERY_BROWSER` env default)
  - `platforms=["instagram"]` style platform targeting
  - `maxResultsPerPlatform` + optional `platformLimits` for per-platform caps
  - `queryDelayMsMin/queryDelayMsMax` for slow-run scheduling
  - one-shot persist + extraction when `persist=true` (set `extractAfterPersist=true`)
  - extraction controls: `extractorVersion`, `extractLimit`, `extractPreviewLimit`
- `POST /api/creator-discovery`
- `POST /api/creator-discovery/extract`
  - `dryRun=true` by default for parser iteration
  - platform/run-scoped extraction snapshots into `raw_account_extractions`
  - sample mode: pass `samples[]` to extract directly from raw snippets without DB writes
- Ingest + normalize SERP rows:
  - `platform`
  - `handle`
  - `normalized_profile_url`
  - `stan_slug`
  - `follower_count_estimate`
- Run-level report:
  - total
  - by-platform distribution
  - `stanSlugCoveragePct`

## Stage 3 — Identity Resolution

- `creator_identities`
- `creator_identity_accounts`
- `identity_merge_candidates`
- `POST /api/creator-identity/resolve`
- Deterministic merge priority:
  1. `stan_slug`
  2. personal domain
  3. explicit cross-link evidence
  4. otherwise candidate queue

## Stage 4 — Stan Hub Enrichment (Baseline)

- `creator_stan_profiles`
- `POST /api/creator-stan/enrich`
- `POST /api/creator-stan/enrich-agent`
  - Playwright-based Stan page crawl for richer JS-rendered data
  - supports `discoveryRunId` targeting after a specific crawl run
  - extracts profile name/handle, header image, structured offer cards, pricing, and social links
- Extracted signals:
  - offers
  - pricing points
  - product types
  - outbound socials
  - email
  - CTA style
  - extraction confidence

Known limitation:
- baseline HTML extraction can be sparse for JS-heavy Stan pages.

## Stage 5 — Real Creator Import (Baseline)

- `POST /api/creator-import`
- Imports resolved + enriched creator identities into canonical `creators`
- Uses `creator_identity_id` traceability and `source='stan_pipeline'`
- Import now runs deterministic compatibility signal extraction:
  - `niche` + `niche_confidence`
  - `top_topics` + `audience_types`
  - `products_sold`
  - `selling_style` + `buying_intent_score`
  - `primary_platform`
  - signal evidence + confidence in `creators.metrics.compatibility_signals`
- Keeps synthetic seed data isolated in `synthetic_creators`
- `POST /api/creator-social/enrich`
- Persists per-platform social performance priors in `creator_social_profiles`
- Syncs `creators.metrics.platform_metrics` + `estimated_engagement` with confidence metadata

## Brand Ingestion Fallback Chain

When `POST /api/analyze-brand` cannot parse enough content via a normal fetch, it now escalates through agent fallbacks:

1. direct site fetch
2. Playwright site crawlability agent (same-domain content extraction)
3. Playwright Google-dork backup agent (`site:<domain> "about"` and related queries)
4. LLM-guided web search backup agent (query generation + snippet bundling)
5. model-knowledge fallback profile when external extraction is blocked

---

# End-to-End Data Flow (Current)

```text
SERP Query Results
    ↓
raw_accounts (Stage 2)
    ↓
creator_identities + creator_identity_accounts (Stage 3)
    ↓
creator_stan_profiles (Stage 4)
    ↓
creator_social_profiles (Stage 5)
    ↓
creators (canonical import, Stage 5)
    ↓
compatibility scoring (Stage 1)
```

---

# Compatibility Scoring Model (Current)

Each brand-creator pair receives a normalized score between `0` and `1`.

Current module family:

- `nicheAffinity`
- `topicSimilarity`
- `platformAlignment`
- `engagementFit`
- `audienceFit`

Scoring is deterministic and explainable with module-level reasons and confidence.

---

# Niche Catalog (Reference)

Canonical niche taxonomy and planned expansion list live in:

- `lib/match/nicheCatalog.ts`

It includes:

- active canonical niches
- legacy niche labels (for alias/normalization support)
- planned niches approved for future backend rollout

---

# API Surface (Current)

- `POST /api/preview-url`
- `POST /api/analyze-brand`
- `POST /api/crawl-brand`
- `POST /api/match-creators`
- `POST /api/generate-outreach`
- `POST /api/creator-discovery/crawl`
- `POST /api/creator-discovery`
- `POST /api/creator-discovery/extract`
- `GET /api/creator-discovery?discoveryRunId=...`
- `POST /api/creator-identity/resolve`
- `POST /api/creator-stan/enrich`
- `POST /api/creator-stan/enrich-agent`
- `POST /api/creator-social/enrich`
- `POST /api/creator-import`

---

# Core Tables (Current)

- `brands`
- `brand_pages`
- `creators`
- `synthetic_creators`
- `matches`
- `raw_accounts`
- `raw_account_extractions`
- `creator_identities`
- `creator_identity_accounts`
- `identity_merge_candidates`
- `creator_stan_profiles`
- `creator_social_profiles`

---

# Local Development

## Prerequisites

- Node.js
- Postgres
- `.env.local` with:
  - `DATABASE_URL`
  - `GROQ_API_KEY`
  - `GROQ_MODEL` (optional)
  - `NEXT_PUBLIC_SITE_URL`
  - `SERP_API_KEY` (optional; enables `engine=serpapi` and auto-prefers SerpAPI)
  - `CREATOR_DISCOVERY_ENGINE` (optional: `auto|google|duckduckgo|serpapi`)
  - `CREATOR_DISCOVERY_BROWSER` (optional: `playwright` or `patchright`)

## Commands

```bash
npm install
npm run dev
```

Useful:

```bash
npm run seed
npm run move:synthetic-creators
npm run seed:real
npm run generate-creators
npm run match:fixtures
```

---

# Roadmap (Next Stages)

- Stage 6: High-fidelity social metrics sampling (recent-post crawl)
- Stage 7: Creator ontology classification
- Stage 8: Compatibility engine v2 on normalized feature store
- Stage 9: Intelligence dashboard and analytics views

---

# Design Principles

- Measurable over inferred
- Deterministic first, ML later
- Explainability always
- Automation by default
- Shared ontology over prompt hacks
