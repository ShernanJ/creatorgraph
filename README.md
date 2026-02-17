# CreatorGraph — Creator Partnership Intelligence Platform

CreatorGraph is an automated brand-to-creator deal generation layer designed to integrate directly into creator ecosystems like Stan.

It transforms brand onboarding, campaign creation, creator matching, and outreach into a structured, intelligence-driven revenue pipeline.

---

# 🚀 Core Thesis

Most creator platforms focus on storefronts, link-in-bio monetization, and inbound discovery.

CreatorGraph focuses on the missing side:

> Turning creator ecosystems into structured, automated partnership engines.

Instead of:

* Creators manually searching for deals
* Brands manually browsing creators
* Cold outbound guessing

CreatorGraph:

* Structures brand intent
* Structures creator performance signals
* Computes compatibility deterministically
* Orchestrates deal flow automatically

The result is reduced friction, higher match quality, and scalable revenue generation.

---

# 🔁 Platform Model

CreatorGraph is not internal tooling.
It is a platform layer embedded within the creator ecosystem.

## Brand Experience

1. Brand pastes website URL
2. AI agents crawl and build structured brand dossier
3. Campaign briefs auto-generated
4. High-fit creators ranked
5. Outreach auto-generated (optional auto-send)

Brands can operate in:

• **Auto Mode** — fully automated campaign launch
• **Review Mode** — approve matches and outreach
• **Manual Mode** — custom selection and messaging

---

## Creator Experience

Creators do not search for gigs.

They receive:

* Ranked inbound deal opportunities
* Pre-qualified campaign briefs
* One-click accept/decline

Deals feel native inside the platform.

---

# 🧠 System Architecture

```
Brand URL
   ↓
Playwright Crawl Agent
   ↓
Structured Brand Dossier
   ↓
Brand Profiler (LLM)
   ↓
Postgres Knowledge Graph
   ↓
Compatibility Scoring Engine
   ↓
Ranked Creator Matches
   ↓
Outreach Agent
   ↓
Deal Lifecycle Tracking
```

---

# 📊 Creator Data Model

CreatorGraph prioritizes measurable performance signals over subjective labels.

Creators are modeled using:

* niche_primary
* platforms
* followers per platform
* average views per platform
* engagement rate
* content formats
* top topics
* post frequency

This allows deterministic ranking and future ML optimization.

---

# 🔥 Engagement Rate

Preferred calculation:

```
engagement_rate = (avg_likes + avg_comments) / avg_views
```

MVP approximation:

```
engagement_rate ≈ avg_views / followers
```

Engagement is normalized to compare creators across audience sizes.

---

# 🎯 Compatibility Scoring Model

Each brand–creator pair receives a normalized score between `0 → 1`.

## Signals

### 1️⃣ Niche Alignment

```
niche_score = 1 if creator.niche_primary == brand.category else 0
```

### 2️⃣ Topic Overlap

```
topic_score = |intersection(creator.top_topics, brand.campaign_angles)|
              / |brand.campaign_angles|
```

### 3️⃣ Platform Fit

```
platform_score = |intersection(creator.platforms, brand.preferred_platforms)|
                 / |brand.preferred_platforms|
```

### 4️⃣ Engagement Strength

```
engagement_score = min(engagement_rate / target_rate, 1)
```

---

# 🧮 Final Compatibility Formula

```
compatibility_score =
  0.45 × niche_score +
  0.35 × topic_score +
  0.10 × platform_score +
  0.10 × engagement_score
```

These weights are domain-informed priors and are designed to evolve into learned weights based on deal outcomes.

---

# 🤖 AI Agent Layers

## Brand Crawl Agent

Uses Playwright to:

* Extract pricing
* Extract positioning
* Identify ICP
* Detect social presence
* Capture testimonials and case studies

Improves data quality for campaign generation.

## Campaign Planner Agent

Generates:

* Campaign angles
* Hook ideas
* Deliverables
* Suggested CTAs
* Measurement plan

## Outreach Agent

Generates personalized messages grounded in:

* Brand dossier
* Creator signals
* Campaign brief

---

# 📈 Outcome Feedback Loop

Match lifecycle states:

* suggested
* contacted
* replied
* interested
* closed

Outcome data enables:

* Weight optimization
* Conversion prediction
* Future learning-to-rank models

---

# 🎯 Design Principles

* Measurable over inferred
* Deterministic first, ML later
* Explainable scoring
* Automation by default, override optional
* Agent-enhanced data quality

---

# 🚀 Future Roadmap

* Creator enrichment agents
* Conversion prediction modeling
* Learning-to-rank optimization
* Multi-creator campaign optimization
* Full autonomous deal routing

---

# 📍 Vision

CreatorGraph transforms creator ecosystems from monetization tools into revenue intelligence networks.

It bridges demand and supply using structured signals, automation, and agentic data acquisition — while preserving human control.

The result is scalable creator–brand commerce with reduced friction and higher conversion probability.
