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

### why it mattered

* recomputing matches is now deterministic
* database reflects reality, not noise
* pipeline behaves like real infra, not a hacky demo

---

## phase 5 — new architecture vision (current direction)

### principle

**deterministic systems gather reality → models structure it → logic decides**

---

### workers (engineering layer)

* crawl brand websites with playwright
* fetch multiple pages (home, pricing, features, about, case studies)
* extract clean text + evidence snippets
* store grounded data

### ai (reasoning layer)

* turn crawl data into structured dossiers
* classify category, icp, offerings
* generate:

  * `campaign_angles` (marketing messaging)
  * `match_topics` (creator-native content topics)

### matching (intelligence layer)

* deterministic scoring using aligned ontology topics
* explainable breakdowns
* rankings + confidence that feel human-correct

---

## core principles locked in

* measurable signals over vibes
* deterministic first, ml later
* automation by default
* explainability always
* workers gather truth, models reason

---

## notes to reflect

biggest improvements didn’t come from changing models.

they came from understanding:

> how intelligence systems should be built.

good data → shared ontology → structured reasoning → deterministic decisions.
