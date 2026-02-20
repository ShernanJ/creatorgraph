/**
 * Central niche registry for CreatorGraph / Stan-Lee matching.
 *
 * Purpose:
 * - Keep current production niches in one place.
 * - Preserve historical/legacy labels from earlier seed data.
 * - Track planned expansion niches for backend rollout.
 *
 * Notes:
 * - ACTIVE_NICHES should represent the current canonical taxonomy.
 * - LEGACY_NICHES should be treated as aliases during normalization.
 * - PLANNED_NICHES are approved candidates not yet fully wired into scoring.
 */

export const ACTIVE_NICHES = [
  "ai productivity",
  "beauty & skincare",
  "business coaching",
  "creator monetization",
  "ecommerce & marketing",
  "fitness coaching",
  "life coaching",
  "personal finance",
  "real estate investing",
  "wellness & nutrition",
] as const;

export const LEGACY_NICHES = [
  "ai tools",
  "b2b saas",
  "ecommerce growth",
  "fitness",
  "healthy cooking",
  "mental wellness",
  "skincare",
  "study productivity",
] as const;

export const PLANNED_NICHES = [
  "fashion & apparel",
  "home & decor",
  "parenting & family",
  "food & recipes",
  "travel",
  "gaming",
  "consumer tech & gadgets",
  "startups & entrepreneurship",
  "careers & job search",
  "education & upskilling",
  "sports & outdoors",
  "pets",
] as const;

export const ALL_REFERENCE_NICHES = Array.from(
  new Set([...ACTIVE_NICHES, ...LEGACY_NICHES, ...PLANNED_NICHES])
).sort();

export type ActiveNiche = (typeof ACTIVE_NICHES)[number];
export type LegacyNiche = (typeof LEGACY_NICHES)[number];
export type PlannedNiche = (typeof PLANNED_NICHES)[number];
export type AnyKnownNiche = ActiveNiche | LegacyNiche | PlannedNiche;
