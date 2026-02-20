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
- `POST /api/creator-discovery`
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

# API Surface (Current)

- `POST /api/preview-url`
- `POST /api/analyze-brand`
- `POST /api/crawl-brand`
- `POST /api/match-creators`
- `POST /api/generate-outreach`
- `POST /api/creator-discovery`
- `GET /api/creator-discovery?discoveryRunId=...`
- `POST /api/creator-identity/resolve`
- `POST /api/creator-stan/enrich`

---

# Core Tables (Current)

- `brands`
- `brand_pages`
- `creators`
- `matches`
- `raw_accounts`
- `creator_identities`
- `creator_identity_accounts`
- `identity_merge_candidates`
- `creator_stan_profiles`

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

## Commands

```bash
npm install
npm run dev
```

Useful:

```bash
npm run seed
npm run generate-creators
npm run match:fixtures
```

---

# Roadmap (Next Stages)

- Stage 5: Social metrics enrichment (recent-post sampling)
- Stage 6: Creator ontology classification
- Stage 7: Compatibility engine v2 on normalized feature store
- Stage 8: Intelligence dashboard and analytics views

---

# Design Principles

- Measurable over inferred
- Deterministic first, ML later
- Explainability always
- Automation by default
- Shared ontology over prompt hacks
