# personal notes

> a living log of how the system evolved from naive matching to a real intelligence pipeline

---

## phase 0 - a naive mvp ("just make it work")

### what i built

* brand url input → scrape homepage → llm generates brand profile
* seeded creators with basic fields (niche, platforms, estimated engagement)
* simple deterministic scoring:

  * niche match
  * topic overlap (raw strings)
  * platform overlap
  * engagement

### problems

* campaign angles were generic marketing language
* topic overlap was almost always zero
* scores felt random or very low
* only ranking worked, confidence numbers didn’t

### lesson

> matching is only as good as the representation of the data

---

## phase 1 — scoring fix attempts (signal tuning era)

### improvements made

* added creator `metrics` (jsonb):

  * top_topics
  * platform_metrics
  * engagement_rate
  * post frequency
* stored explainable breakdown per match
* hardened engagement normalization
* added keyword-based topic overlap

### what improved

* rankings became more reasonable
* engagement started to matter properly
* system became explainable

### what still sucked

* brand topics were still marketing abstractions
* obvious matches scored ~50–65%
* scoring tweaks felt like hacks

### realization

> this isn’t a math problem, it’s an ontology problem

---

## phase 2 — insight (representation > model choice)

### core discovery

brand language ≠ creator language

brand side outputs:

* “wellness tips”
* “success stories”
* “brand awareness”

creator side topics:

* “gym routines”
* “weight loss transformations”
* “nutrition for fat loss”

They mean the same thing, but never overlap lexically.

### result

topic scores stayed low even for perfect matches.

### key lesson

> ai reasoning isn’t broken, the data representation is

---

## phase 3 — ontology layer introduced (big turning point)

### what changed

instead of forcing marketing language to match creator language, i split the concept space:

* `campaign_angles` → messaging layer (for briefs + outreach)
* `match_topics` → creator-native topic layer (for scoring)

brands are now projected into the same topic space creators live in.

### why this mattered

* matching finally became intuitive
* obvious matches started making sense logically
* scoring stopped feeling random

this wasn’t a prompt tweak — it was a representation upgrade.

### realization

> intelligence systems live or die on shared vocabularies

---

## phase 4 — system correctness + real engineering discipline

### fixes added

* unique constraint on `(brand_id, creator_id)`
* upsert matching instead of duplicate inserts
* structured reasons + breakdown stored per match
* normalized json handling across pages (no more `.join` crashes)

### why it mattered

* recomputing matches is now deterministic
* database reflects reality, not noise
* pipeline behaves like real infra, not a hacky demo

this was the moment it stopped being a toy.

---

## phase 5 — crawler layer (grounding reality)

### shift in thinking

homepage scraping wasn’t enough.

brand representation needed:

* pricing pages
* about pages
* positioning language
* product details
* testimonials

### what i built

* `/api/crawl-brand` using playwright
* multi-page crawl
* stored structured brand_pages
* added rebuild dossier button (crawl → analyze loop)

### why this mattered

this added **ground truth**.

not just llm inference — but:

> extracted evidence → structured dossier → deterministic scoring

this created the wow factor.

real infra.

---

## phase 6 — scoring philosophy recalibration

### insight

platform + engagement are not primary semantic signals.

niche + topics decide:

> is this the right type of creator?

platform + engagement decide:

> is this a good execution vehicle?

### weight update

moved toward:

* 0.45 niche
* 0.35 topics
* 0.10 platform
* 0.10 engagement

80% semantic fit.
20% execution quality.

this made scores feel human-correct.

---

## phase 7 — economic realism (cpm + pricing power layer)

### new realization

compatibility is necessary.
but not sufficient.

in real creator markets, price is not arbitrary.

it is loosely correlated with:

* avg_views (distribution power)
* engagement rate (audience responsiveness)
* niche cpm norms
* format type (reel vs static vs youtube)

### real-world cpm ranges (rough priors)

these aren’t exact — but directionally true:

* lifestyle → $15–$25 cpm
* fitness → $20–$35 cpm
* ecommerce → $25–$45 cpm
* finance → $40–$70 cpm
* b2b saas → $60–$120 cpm

rough pricing heuristic:

```
price_per_post ≈ (avg_views / 1000) × niche_cpm
```

example:

if a fitness creator averages 90,000 views
and fitness cpm prior = $25

```
(90,000 / 1000) × 25 = $2,250 per post
```

suddenly engagement is not just ranking.
it’s leverage.

### why this changes the system

before:

> engagement_score = signal strength

now:

> engagement + avg_views = pricing power

which means:

* high engagement creators likely cost more
* lower engagement creators may be affordable but less efficient

this introduces a third dimension:

1. semantic compatibility
2. execution strength
3. economic feasibility

### system reconsideration

previously, scoring assumed:

> the best semantic match is the best recommendation.

but in reality:

> the best viable match within budget is the best recommendation.

this reframes creatorgraph from:

compatibility engine

into:

deal feasibility engine.

### upcoming direction

add:

* estimated_price_per_post (derived from avg_views × niche_cpm)
* brand budget per deliverable
* economic feasibility score

so the system can reason:

* "this creator fits but is likely above your budget"
* "these 3 creators maximize fit within your price range"

this is not ml.

this is marketplace physics.

---

## current mental model

creatorgraph is evolving from:

> semantic compatibility engine

into:

> semantic + execution + economic intelligence system

architecture principle:

workers gather reality → models structure knowledge → deterministic logic decides → economics calibrates

---

## core principles locked in

* measurable signals over vibes
* deterministic first, ml later
* automation by default
* explainability always
* workers gather truth, models reason
* ontology > prompt tweaks
* economics eventually > aesthetics

---

## reflection

biggest improvements didn’t come from changing models.

they came from changing:

* representation
* ontology
* system architecture
* grounding
* calibration
* economic context

> good data → shared ontology → structured reasoning → deterministic decisions → economic calibration

that’s the path from mvp to real intelligence infra.

---

# post stan event

### updates

i posted what i had so far on linkedin and demo'd to a few people - but i intriuged engineers at stan with this and therefore i wanted to improve it by looking into actually scraping **real stan.store creators** so thats why im going to focus on here.

---



## phase 8 — matcher hardening (guardrails before expansion)

### what changed

before scaling discovery, i stabilized scoring infra:

* refactored matching into modular components (`lib/match/*`)
* locked a module contract:

  * `score`
  * `confidence`
  * `reasons`
* added deterministic fixture tests for ranking sanity
* fixed type-safety issues in `computeCompatibilityScore` so refactors stop breaking compile

### why this mattered

this reduced fear while iterating.

i can now change scoring logic fast and still know if i broke obvious match behavior.

it turned matching from "fragile script logic" into "maintainable scoring infra."

### realization

> before scaling data pipelines, stabilize your decision engine

---

## phase 9 — creator discovery ingestion layer (serp → structured rows)

### what changed

instead of jumping straight into full crawler complexity, i built ingestion first:

* added `raw_accounts` table
* added `/api/creator-discovery`
* ingest payload now stores:

  * query context
  * source url
  * normalized profile url
  * platform
  * handle
  * `stan_slug`
  * follower estimate

* added run-level coverage report:

  * total rows
  * by-platform distribution
  * `stan_slug` coverage %

### why this mattered

this locked the data contract before scraper complexity.

i now know exactly what "good discovery output" should look like.

### realization

> ingestion schema first, fetch logic second

---

## phase 10 — identity graph layer (merge before enrichment)

### what changed

discovered accounts are not creators yet.

so i added identity resolution:

* canonical identities table (`creator_identities`)
* account linkage table (`creator_identity_accounts`)
* unresolved queue (`identity_merge_candidates`)

merge priority:

1. same `stan_slug`
2. same personal domain
3. explicit cross-link evidence
4. else queue candidate

### why this mattered

this prevents duplicate creators and bad merges.

it creates a real graph:

many discovered accounts → one canonical creator identity.

### realization

> without identity resolution, enrichment and matching are built on duplicates

---

## phase 11 — stan hub enrichment baseline (monetization signals start)

### what changed

once identity has `canonical_stan_slug`, enrich from `stan.store/<slug>`:

* added `creator_stan_profiles`
* added `/api/creator-stan/enrich`
* extraction now stores:

  * offers
  * pricing points
  * product types
  * outbound socials
  * email
  * cta style
  * extraction confidence

### what i observed

for some pages, extraction returns sparse output (empty offers/pricing, low confidence).

likely reasons:

* js-rendered pages
* thin html on basic fetch
* anti-bot / redirect behavior

### why this still mattered

even baseline enrichment proved the pipeline works end-to-end:

serp account → canonical identity → stan enrichment row.

this is huge because the architecture is now layered and composable.

### realization

> missing signals are a crawler-depth problem, not an architecture problem

---

## current stage-by-stage memory hook

1. find accounts (`raw_accounts`)
2. decide who is who (`creator_identities`)
3. learn how they monetize (`creator_stan_profiles`)
4. later: enrich performance + ontology
5. then: score compatibility with stronger signals

short version:

> discover → resolve identity → enrich monetization → score with confidence
