/* eslint-disable @typescript-eslint/no-explicit-any */
import { nanoid } from "nanoid";
import { htmlToText } from "html-to-text";
import { q } from "@/lib/db";
import type { StanEnrichInput, StanEnrichResult, StanEnrichStats } from "./types";

type IdentityRow = {
  id: string;
  canonical_stan_slug: string | null;
};

type ExtractedStanSignals = {
  bioDescription: string | null;
  offers: string[];
  pricingPoints: string[];
  productTypes: string[];
  outboundSocials: string[];
  email: string | null;
  ctaStyle: string;
  sourceText: string;
  sourceHtmlLen: number;
  extractedConfidence: number;
};

function initStats(): StanEnrichStats {
  return { selected: 0, processed: 0, succeeded: 0, failed: 0, skippedNoSlug: 0 };
}

function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

function uniqueStrings(xs: string[]) {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

function extractEmails(text: string) {
  return uniqueStrings(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []);
}

function extractUrls(text: string) {
  return uniqueStrings((text.match(/https?:\/\/[^\s"'<>]+/gi) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")));
}

function classifyProductTypes(text: string) {
  const t = text.toLowerCase();
  const types: string[] = [];
  if (/\b(course|program)\b/.test(t)) types.push("course");
  if (/\b(coaching|consulting|mentor)\b/.test(t)) types.push("coaching");
  if (/\b(template|notion|swipe file)\b/.test(t)) types.push("template");
  if (/\b(membership|community)\b/.test(t)) types.push("membership");
  if (/\b(newsletter|substack)\b/.test(t)) types.push("newsletter");
  if (/\b(ebook|guide|pdf)\b/.test(t)) types.push("digital_guide");
  if (/\b(service|done-for-you|agency)\b/.test(t)) types.push("service");
  return uniqueStrings(types);
}

function detectCtaStyle(text: string) {
  const t = text.toLowerCase();
  if (/\b(book|schedule|apply|call)\b/.test(t)) return "consultative";
  if (/\b(buy|checkout|shop|purchase)\b/.test(t)) return "transactional";
  if (/\b(join|subscribe|newsletter)\b/.test(t)) return "community";
  if (/\b(dm|message|contact)\b/.test(t)) return "inbound_dm";
  return "generic";
}

function extractPricingPoints(text: string) {
  const prices = text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) ?? [];
  return uniqueStrings(prices.map((p) => p.replace(/\s+/g, ""))).slice(0, 30);
}

function extractOfferCandidates(html: string, text: string) {
  const fromAnchors = Array.from(
    html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi),
    (m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  ).filter((x) => x.length >= 5 && x.length <= 100);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 5 && l.length <= 90);

  const offerish = [...fromAnchors, ...lines].filter((l) =>
    /\b(course|program|coaching|template|ebook|guide|membership|newsletter|workshop|bundle|service|1:1)\b/i.test(l)
  );

  return uniqueStrings(offerish).slice(0, 25);
}

function pickBioDescription(text: string) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => l.length > 20 && l.length < 220);
  if (lines.length === 0) return null;
  return lines.slice(0, 2).join(" ");
}

function outboundSocialUrls(urls: string[]) {
  return uniqueStrings(
    urls.filter((u) =>
      /(x\.com|twitter\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be)/i.test(u)
    )
  ).slice(0, 20);
}

function confidenceScore(signals: {
  offers: string[];
  pricingPoints: string[];
  productTypes: string[];
  email: string | null;
  outboundSocials: string[];
}) {
  let c = 0.25;
  if (signals.offers.length > 0) c += 0.2;
  if (signals.pricingPoints.length > 0) c += 0.2;
  if (signals.productTypes.length > 0) c += 0.15;
  if (signals.email) c += 0.1;
  if (signals.outboundSocials.length > 0) c += 0.1;
  return Math.max(0, Math.min(1, Number(c.toFixed(2))));
}

function extractSignalsFromHtml(html: string): ExtractedStanSignals {
  const text = htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "noscript", format: "skip" },
    ],
  }).slice(0, 120_000);

  const offers = extractOfferCandidates(html, text);
  const pricingPoints = extractPricingPoints(text);
  const productTypes = classifyProductTypes(text);
  const urls = extractUrls(`${html}\n${text}`);
  const outboundSocials = outboundSocialUrls(urls);
  const email = extractEmails(text)[0] ?? null;
  const ctaStyle = detectCtaStyle(text);
  const bioDescription = pickBioDescription(text);

  return {
    bioDescription,
    offers,
    pricingPoints,
    productTypes,
    outboundSocials,
    email,
    ctaStyle,
    sourceText: text.slice(0, 35_000),
    sourceHtmlLen: html.length,
    extractedConfidence: confidenceScore({
      offers,
      pricingPoints,
      productTypes,
      email,
      outboundSocials,
    }),
  };
}

async function fetchStanHtml(stanSlug: string) {
  const url = `https://stan.store/${encodeURIComponent(stanSlug)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "CreatorGraphStanEnricher/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!resp.ok) {
      throw new Error(`stan fetch failed (${resp.status})`);
    }
    const html = await resp.text();
    return { url, html };
  } finally {
    clearTimeout(t);
  }
}

async function selectIdentities(input: StanEnrichInput): Promise<IdentityRow[]> {
  if (input.creatorIdentityId) {
    return q<IdentityRow>(
      `select id, canonical_stan_slug from creator_identities where id=$1 limit 1`,
      [input.creatorIdentityId]
    );
  }

  if (input.stanSlug) {
    return q<IdentityRow>(
      `select id, canonical_stan_slug
       from creator_identities
       where canonical_stan_slug=$1
       limit 1`,
      [normalizeSlug(input.stanSlug)]
    );
  }

  const params: any[] = [input.limit ?? 100];
  const force = input.force === true;
  return q<IdentityRow>(
    `select ci.id, ci.canonical_stan_slug
     from creator_identities ci
     left join creator_stan_profiles csp on csp.creator_identity_id = ci.id
     where ci.canonical_stan_slug is not null
       and (${force ? "true" : "csp.creator_identity_id is null"})
     order by ci.created_at asc
     limit $1`,
    params
  );
}

async function upsertStanProfile(args: {
  creatorIdentityId: string;
  stanSlug: string;
  stanUrl: string;
  extracted: ExtractedStanSignals;
}) {
  await q(
    `insert into creator_stan_profiles (
       id, creator_identity_id, stan_slug, stan_url, bio_description,
       offers, pricing_points, product_types, outbound_socials, email,
       cta_style, source_text, source_html_len, extracted_confidence
     )
     values (
       $1,$2,$3,$4,$5,
       $6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,
       $11,$12,$13,$14
     )
     on conflict (creator_identity_id) do update set
       stan_slug = excluded.stan_slug,
       stan_url = excluded.stan_url,
       bio_description = excluded.bio_description,
       offers = excluded.offers,
       pricing_points = excluded.pricing_points,
       product_types = excluded.product_types,
       outbound_socials = excluded.outbound_socials,
       email = excluded.email,
       cta_style = excluded.cta_style,
       source_text = excluded.source_text,
       source_html_len = excluded.source_html_len,
       extracted_confidence = excluded.extracted_confidence,
       enriched_at = now(),
       updated_at = now()`,
    [
      `csp_${nanoid(10)}`,
      args.creatorIdentityId,
      args.stanSlug,
      args.stanUrl,
      args.extracted.bioDescription,
      JSON.stringify(args.extracted.offers),
      JSON.stringify(args.extracted.pricingPoints),
      JSON.stringify(args.extracted.productTypes),
      JSON.stringify(args.extracted.outboundSocials),
      args.extracted.email,
      args.extracted.ctaStyle,
      args.extracted.sourceText,
      args.extracted.sourceHtmlLen,
      args.extracted.extractedConfidence,
    ]
  );
}

export async function enrichStanProfiles(input: StanEnrichInput = {}): Promise<StanEnrichResult> {
  const stats = initStats();
  const results: StanEnrichResult["results"] = [];
  const identities = await selectIdentities(input);
  stats.selected = identities.length;

  for (const identity of identities) {
    stats.processed += 1;
    const stanSlug = identity.canonical_stan_slug ? normalizeSlug(identity.canonical_stan_slug) : null;

    if (!stanSlug) {
      stats.skippedNoSlug += 1;
      results.push({
        creatorIdentityId: identity.id,
        stanSlug: null,
        status: "skipped",
        reason: "identity missing canonical_stan_slug",
      });
      continue;
    }

    try {
      const { url, html } = await fetchStanHtml(stanSlug);
      const extracted = extractSignalsFromHtml(html);
      await upsertStanProfile({
        creatorIdentityId: identity.id,
        stanSlug,
        stanUrl: url,
        extracted,
      });
      stats.succeeded += 1;
      results.push({ creatorIdentityId: identity.id, stanSlug, status: "enriched" });
    } catch (err: any) {
      stats.failed += 1;
      results.push({
        creatorIdentityId: identity.id,
        stanSlug,
        status: "failed",
        reason: err?.message ?? "unknown error",
      });
    }
  }

  return { stats, results };
}
