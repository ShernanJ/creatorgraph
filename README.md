# CreatorGraph

Creator discovery and brand-fit engine that turns messy public web data into explainable creator recommendations.

<img src="./public/Stan-Lee-Agent.png" width="96" alt="Stan-Lee agent" />

[Portfolio Case Study](https://shernanjavier.com/work/creatorgraph)

## The idea

Finding relevant creators is still surprisingly manual.

Brands often have to search across social platforms, inspect profiles and storefronts one by one, estimate audience fit, and then guess whether someone is actually a good campaign match.

CreatorGraph turns that process into a structured pipeline: understand the brand, discover creators, enrich what is publicly available, resolve who is who, and rank the strongest matches with reasons.

## What it does

- Analyzes a brand website into a structured campaign profile
- Discovers publicly indexed creators through targeted Google/SERP searches
- Crawls Stan.store storefronts and extracts creator, offer, and product signals
- Links social profiles, Stan slugs, and domains into canonical creator identities
- Enriches raw evidence into structured creator records
- Ranks creators using explainable compatibility scoring
- Generates outreach context from the resulting brand-creator match

## How it works

```text
Brand URL
    ↓
Brand profile
    ↓
Creator discovery
    ↓
Raw web evidence
    ↓
Identity resolution
    ↓
Storefront + social enrichment
    ↓
Creator profile
    ↓
Compatibility scoring
    ↓
Ranked matches
````

## Technical highlights

* Built SERP-led creator discovery using targeted `site:` queries across public web sources
* Used Playwright and Patchright to crawl JavaScript-rendered Stan.store storefronts
* Designed identity resolution around Stan slugs, personal domains, social accounts, and cross-link evidence
* Preserved raw search evidence and extraction snapshots so ingestion stages could be debugged independently
* Built modular compatibility scoring across niche, topic, platform, engagement, and audience fit
* Added human-readable match reasons and module-level diagnostics instead of opaque recommendation scores
* Created a semantic alias layer for related concepts such as `skin care` / `skincare` and `UGC` / `creator content`
* Added fixture-based regression checks for matchmaking behavior

## Stack

`Next.js` · `React` · `TypeScript` · `PostgreSQL` · `Playwright` · `Patchright` · `Groq` · `SerpAPI`

## Creator discovery

CreatorGraph does not depend on a public Stan.store creator directory.

Instead, it finds publicly indexed social profiles that reference Stan.store using queries like:

```text
site:instagram.com "https://stan.store/"
site:tiktok.com "https://stan.store/"
site:youtube.com "stan.store/" "subscribers"
site:linkedin.com/in "stan.store/"
site:x.com "Website: stan.store/" "followers"
```

Those results are normalized into raw account records, resolved into creator identities, and then used to crawl the relevant storefronts.

The discovery layer supports multiple execution paths including Google, DuckDuckGo, and SerpAPI.

## Architecture

```text
Search / SERP
     ↓
raw_accounts
     ↓
extraction
     ↓
identity resolution
     ↓
creator identities
    ↙             ↘
Stan profiles    social profiles
    ↘             ↙
      creators
         ↓
      matching
         ↓
   ranked results
```

Brand and creator data remain separate until matchmaking:

```text
Brand website
     ↓
Brand analysis
     ↓
Brand profile ─────────┐
                       ↓
                  Match engine
                       ↑
Creator discovery      │
     ↓                 │
Creator profiles ──────┘
```

This separation lets discovery, parsing, enrichment, and matching improve independently without losing the original evidence.

## Project origin

I built CreatorGraph during a Stan co-working build-in-public event, which is why the first version focuses on `stan.store` creators.

The brand-facing agent is called **Stan-Lee**, a small riff on Stan's Stanley assistant while exploring what a creator partnership tool could look like from the brand side.

<details>
<summary><strong>Repo structure</strong></summary>

```text
.
├── app/
│   ├── api/                 # API routes
│   ├── brand/               # Brand analysis surfaces
│   ├── creator/             # Creator views
│   ├── creator-dashboard/   # Creator dashboard
│   ├── explorer/            # Creator discovery / exploration
│   └── matches/             # Match results
├── lib/
│   ├── brand/               # Brand analysis logic
│   ├── creator/             # Creator discovery + enrichment
│   ├── match/               # Matchmaking logic
│   ├── db.ts                # Database access
│   ├── groq.ts              # AI integration
│   └── schema.sql           # PostgreSQL schema
├── data/
├── docs/
├── public/
├── example.env
├── package.json
└── README.md
```

</details>

<details>
<summary><strong>Run locally</strong></summary>

Prerequisites:

* Node.js
* PostgreSQL
* `pnpm`

Install and start:

```bash
pnpm install
cp example.env .env.local
pnpm dev
```

Open:

```text
http://localhost:3000
```

Useful commands:

```bash
pnpm lint
pnpm build
pnpm match:fixtures
pnpm seed
```

Environment variables:

```text
DATABASE_URL
GROQ_API_KEY
GROQ_MODEL
NEXT_PUBLIC_SITE_URL
SERP_API_KEY
SERPAPI_API_KEY
CREATOR_DISCOVERY_ENGINE
CREATOR_DISCOVERY_BROWSER
CREATOR_STAN_ENRICH_BROWSER
```

</details>

<details>
<summary><strong>Implementation notes</strong></summary>

### Matching

Each brand-creator pair is evaluated across several deterministic modules:

* `nicheAffinity`
* `topicSimilarity`
* `platformAlignment`
* `engagementFit`
* `audienceFit`

The result includes a normalized score, human-readable reasons, and module-level diagnostics.

### Why deterministic matching first?

The initial version uses modular scoring, shared taxonomy, and alias-aware similarity rather than embeddings for every comparison.

That keeps rankings:

* explainable
* reproducible
* inexpensive
* easy to regression test

### Why preserve raw evidence?

Creator data moves through several stages:

```text
search result
    ↓
raw evidence
    ↓
extraction
    ↓
identity
    ↓
enrichment
    ↓
creator
    ↓
match
```

Keeping those stages separate makes the pipeline easier to debug and lets extraction or enrichment logic improve without losing the original source data.

### Current limitations

* Discovery coverage depends on publicly indexed profiles
* Stan.store layout changes can require scraper updates
* Social metrics are currently evidence/prior-based estimates rather than deep platform analytics
* Semantic matching is taxonomy-based and deterministic
* A production-scale crawler would need stronger queueing, retries, rate limiting, and observability

</details>
