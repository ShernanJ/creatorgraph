/* eslint-disable @typescript-eslint/no-explicit-any */
import { nanoid } from "nanoid";
import { chromium as playwrightChromium, type Browser, type Page } from "playwright";
import { q } from "@/lib/db";

export type StanAgentBrowser = "playwright" | "patchright";

export type StanAgentEnrichInput = {
  discoveryRunId?: string;
  creatorIdentityId?: string;
  stanSlug?: string;
  limit?: number;
  force?: boolean;
  browser?: StanAgentBrowser;
  headless?: boolean;
  timeoutMs?: number;
  waitAfterLoadMs?: number;
  dryRun?: boolean;
};

export type StanAgentEnrichStats = {
  selected: number;
  processed: number;
  enriched: number;
  updated: number;
  skippedNoSlug: number;
  skippedExisting: number;
  failed: number;
};

export type StanAgentEnrichResult = {
  config: {
    discoveryRunId: string | null;
    creatorIdentityId: string | null;
    stanSlug: string | null;
    limit: number;
    force: boolean;
    dryRun: boolean;
    requestedBrowser: StanAgentBrowser;
    browserUsed: StanAgentBrowser;
    headless: boolean;
    timeoutMs: number;
    waitAfterLoadMs: number;
  };
  warnings: string[];
  stats: StanAgentEnrichStats;
  results: Array<{
    creatorIdentityId: string;
    stanSlug: string | null;
    status: "enriched" | "updated" | "skipped" | "failed";
    profileName?: string | null;
    profileHandle?: string | null;
    confidence?: number | null;
    offersFound?: number;
    pricesFound?: number;
    socialsFound?: number;
    headerImageUrl?: string | null;
    reason?: string;
  }>;
};

type IdentityRow = {
  id: string;
  canonical_stan_slug: string | null;
  has_existing_profile: boolean;
};

type OfferCard = {
  title: string | null;
  description: string | null;
  price: string | null;
  cta: string | null;
  imageUrl: string | null;
  href: string | null;
  source: "dom_callout" | "dom_pill" | "nuxt";
  sourceType: string | null;
};

type CrawledStanPage = {
  finalUrl: string;
  pageTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  fullName: string | null;
  bio: string | null;
  headerImageUrl: string | null;
  socialLinks: string[];
  anchorLinks: string[];
  offerCards: OfferCard[];
  offerImageUrls: string[];
  bodyText: string;
  htmlLength: number;
};

type ExtractedSignals = {
  profileName: string | null;
  profileHandle: string | null;
  bioDescription: string | null;
  offers: string[];
  offerCards: OfferCard[];
  offerImageUrls: string[];
  headerImageUrl: string | null;
  pricingPoints: string[];
  productTypes: string[];
  outboundSocials: string[];
  email: string | null;
  ctaStyle: string;
  sourceText: string;
  sourceHtmlLen: number;
  extractedConfidence: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_AFTER_LOAD_MS = 1_200;

let schemaEnsured = false;

function initStats(): StanAgentEnrichStats {
  return {
    selected: 0,
    processed: 0,
    enriched: 0,
    updated: 0,
    skippedNoSlug: 0,
    skippedExisting: 0,
    failed: 0,
  };
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSlug(input: string) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

function cleanText(input: string | null | undefined, max = 2_000) {
  const text = String(input ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.slice(0, max);
}

function uniqueStrings(values: Array<string | null | undefined>, max = 100) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = cleanText(raw, 4_000);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function extractEmails(text: string) {
  return uniqueStrings(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [], 20);
}

function extractMoneyValues(text: string) {
  const prices = text.match(/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g) ?? [];
  return uniqueStrings(prices.map((p) => p.replace(/\s+/g, "")), 40);
}

function urlHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isUsefulOutbound(url: string) {
  const host = urlHost(url);
  if (!host) return false;

  if (
    host.includes("google.") ||
    host.includes("gstatic.com") ||
    host.includes("clarity.ms") ||
    host.includes("googletagmanager.com") ||
    host.includes("googleapis.com") ||
    host.includes("stanwith.me")
  ) {
    return false;
  }

  if (host === "stan.store" || host.endsWith(".stan.store")) return false;
  return true;
}

function outboundSocialUrls(urls: string[]) {
  const social = urls.filter((u) =>
    /(x\.com|twitter\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com)/i.test(u)
  );
  return uniqueStrings(social, 30);
}

function detectCtaStyle(text: string) {
  const t = text.toLowerCase();
  if (/\b(book|schedule|apply|consult|1:1|coaching)\b/.test(t)) return "consultative";
  if (/\b(buy|checkout|shop|purchase|order)\b/.test(t)) return "transactional";
  if (/\b(join|subscribe|newsletter|community)\b/.test(t)) return "community";
  if (/\b(dm|message|contact)\b/.test(t)) return "inbound_dm";
  return "generic";
}

function classifyProductTypes(corpus: string, cards: OfferCard[]) {
  const t = corpus.toLowerCase();
  const hinted = cards.map((c) => String(c.sourceType ?? "").toLowerCase());
  const hintedText = hinted.join(" ");
  const types: string[] = [];
  if (/\b(course|program|masterclass|workshop|class)\b/.test(t) || /\bdigital-download\b/.test(hintedText)) {
    types.push("course");
  }
  if (/\b(coaching|consulting|mentor|vip|1:1|one-on-one)\b/.test(t) || /\bmeeting\b/.test(hintedText)) {
    types.push("coaching");
  }
  if (/\b(template|notion|swipe file)\b/.test(t)) types.push("template");
  if (/\b(membership|community)\b/.test(t)) types.push("membership");
  if (/\b(newsletter|substack)\b/.test(t)) types.push("newsletter");
  if (/\b(ebook|guide|pdf|resource)\b/.test(t)) types.push("digital_guide");
  if (/\b(service|done-for-you|agency)\b/.test(t)) types.push("service");
  return uniqueStrings(types, 20);
}

function profileNameFromTitle(pageTitle: string | null) {
  const title = cleanText(pageTitle, 200);
  if (!title) return null;
  const noSuffix = title.replace(/\|\s*stan.*$/i, "").trim();
  const m = noSuffix.match(/^(.*?)\s*\(@/);
  if (m?.[1]) return cleanText(m[1], 120);
  return cleanText(noSuffix, 120);
}

function profileHandleFromTitle(pageTitle: string | null) {
  const title = cleanText(pageTitle, 250);
  if (!title) return null;
  const m = title.match(/\(@([^)]+)\)/i);
  if (!m?.[1]) return null;
  return cleanText(m[1].replace(/^@+/, ""), 80);
}

function confidenceScore(signals: {
  profileName: string | null;
  bioDescription: string | null;
  offers: string[];
  pricingPoints: string[];
  productTypes: string[];
  outboundSocials: string[];
  headerImageUrl: string | null;
  email: string | null;
}) {
  let score = 0.25;
  if (signals.profileName) score += 0.08;
  if (signals.bioDescription) score += 0.12;
  if (signals.offers.length > 0) score += 0.16;
  if (signals.pricingPoints.length > 0) score += 0.14;
  if (signals.productTypes.length > 0) score += 0.13;
  if (signals.outboundSocials.length > 0) score += 0.1;
  if (signals.headerImageUrl) score += 0.07;
  if (signals.email) score += 0.07;
  if (signals.offers.length >= 3) score += 0.04;
  if (signals.pricingPoints.length >= 2) score += 0.04;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function buildSourceText(page: CrawledStanPage) {
  const lines = uniqueStrings(
    [
      page.pageTitle,
      page.metaDescription,
      page.fullName,
      page.bio,
      ...page.offerCards.map((card) => card.title),
      ...page.offerCards.map((card) => card.description),
      ...page.offerCards.map((card) => card.cta),
      page.bodyText,
    ],
    300
  );
  return lines.join("\n").slice(0, 40_000);
}

function extractSignals(page: CrawledStanPage, stanSlug: string): ExtractedSignals {
  const profileName = page.fullName ?? profileNameFromTitle(page.pageTitle);
  const profileHandle = profileHandleFromTitle(page.pageTitle) ?? stanSlug;
  const offers = uniqueStrings(page.offerCards.map((card) => card.title), 40);

  const cardPrices = uniqueStrings(page.offerCards.map((card) => card.price), 40);
  const inferredPrices = extractMoneyValues(
    [
      page.bodyText,
      ...page.offerCards.map((card) => card.title ?? ""),
      ...page.offerCards.map((card) => card.description ?? ""),
    ].join("\n")
  );
  const pricingPoints = uniqueStrings([...cardPrices, ...inferredPrices], 40);

  const allLinks = uniqueStrings([...page.socialLinks, ...page.anchorLinks], 400);
  const usefulLinks = uniqueStrings(allLinks.filter((url) => isUsefulOutbound(url)), 100);
  const outboundSocials = outboundSocialUrls(usefulLinks);

  const imageUrls = uniqueStrings(
    [
      page.headerImageUrl,
      page.ogImage,
      ...page.offerImageUrls,
      ...page.offerCards.map((card) => card.imageUrl),
    ],
    80
  );

  const bioDescription = page.bio ?? page.metaDescription;
  const email = extractEmails([page.bodyText, ...usefulLinks].join("\n"))[0] ?? null;
  const ctaStyle = detectCtaStyle(
    [page.bodyText, ...page.offerCards.map((card) => card.cta ?? "")].join("\n")
  );
  const sourceText = buildSourceText(page);
  const productTypes = classifyProductTypes(
    [
      sourceText,
      page.pageTitle ?? "",
      ...page.offerCards.map((card) => card.sourceType ?? ""),
    ].join("\n"),
    page.offerCards
  );

  const extractedConfidence = confidenceScore({
    profileName,
    bioDescription,
    offers,
    pricingPoints,
    productTypes,
    outboundSocials,
    headerImageUrl: page.headerImageUrl,
    email,
  });

  return {
    profileName,
    profileHandle,
    bioDescription,
    offers,
    offerCards: page.offerCards,
    offerImageUrls: imageUrls,
    headerImageUrl: page.headerImageUrl ?? page.ogImage,
    pricingPoints,
    productTypes,
    outboundSocials,
    email,
    ctaStyle,
    sourceText,
    sourceHtmlLen: page.htmlLength,
    extractedConfidence,
  };
}

function normalizeBrowser(value: string | undefined): StanAgentBrowser {
  return String(value ?? "").trim().toLowerCase() === "patchright" ? "patchright" : "playwright";
}

function defaultBrowser() {
  return normalizeBrowser(process.env.CREATOR_STAN_ENRICH_BROWSER);
}

async function resolveChromium(args: { browser: StanAgentBrowser }) {
  if (args.browser === "patchright") {
    const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    const mod = await dynamicImport("patchright");
    if (!mod?.chromium) {
      throw new Error("patchright loaded but chromium is missing");
    }
    return mod.chromium as typeof playwrightChromium;
  }
  return playwrightChromium;
}

async function launchBrowserWithFallback(args: { requestedBrowser: StanAgentBrowser; headless: boolean }) {
  if (args.requestedBrowser === "patchright") {
    try {
      const chromium = await resolveChromium({ browser: "patchright" });
      const browser = await chromium.launch({ headless: args.headless });
      return {
        browser,
        browserName: "patchright" as StanAgentBrowser,
        warning: null as string | null,
      };
    } catch (err: any) {
      const browser = await playwrightChromium.launch({ headless: args.headless });
      return {
        browser,
        browserName: "playwright" as StanAgentBrowser,
        warning: `patchright unavailable; fell back to playwright (${err?.message ?? String(err)})`,
      };
    }
  }

  return {
    browser: await playwrightChromium.launch({ headless: args.headless }),
    browserName: "playwright" as StanAgentBrowser,
    warning: null as string | null,
  };
}

async function selectIdentities(input: StanAgentEnrichInput): Promise<IdentityRow[]> {
  if (input.creatorIdentityId) {
    return q<IdentityRow>(
      `select
         ci.id,
         ci.canonical_stan_slug,
         exists(select 1 from creator_stan_profiles csp where csp.creator_identity_id = ci.id) as has_existing_profile
       from creator_identities ci
       where ci.id = $1
       limit 1`,
      [input.creatorIdentityId]
    );
  }

  if (input.stanSlug) {
    return q<IdentityRow>(
      `select
         ci.id,
         ci.canonical_stan_slug,
         exists(select 1 from creator_stan_profiles csp where csp.creator_identity_id = ci.id) as has_existing_profile
       from creator_identities ci
       where ci.canonical_stan_slug = $1
       limit 1`,
      [normalizeSlug(input.stanSlug)]
    );
  }

  if (input.discoveryRunId) {
    return q<IdentityRow>(
      `select
         ci.id,
         ci.canonical_stan_slug,
         exists(select 1 from creator_stan_profiles csp where csp.creator_identity_id = ci.id) as has_existing_profile
       from creator_identities ci
       where ci.canonical_stan_slug is not null
         and exists (
           select 1
           from creator_identity_accounts cia
           join raw_accounts ra on ra.id = cia.raw_account_id
           where cia.creator_identity_id = ci.id
             and ra.discovery_run_id = $1
         )
       order by ci.updated_at desc nulls last, ci.created_at desc
       limit $2`,
      [input.discoveryRunId, input.limit ?? 100]
    );
  }

  return q<IdentityRow>(
    `select
       ci.id,
       ci.canonical_stan_slug,
       exists(select 1 from creator_stan_profiles csp where csp.creator_identity_id = ci.id) as has_existing_profile
     from creator_identities ci
     where ci.canonical_stan_slug is not null
     order by ci.updated_at desc nulls last, ci.created_at desc
     limit $1`,
    [input.limit ?? 100]
  );
}

async function ensureStanProfileColumns() {
  if (schemaEnsured) return;
  await q(`alter table creator_stan_profiles add column if not exists profile_name text`);
  await q(`alter table creator_stan_profiles add column if not exists profile_handle text`);
  await q(`alter table creator_stan_profiles add column if not exists offer_cards jsonb not null default '[]'::jsonb`);
  await q(`alter table creator_stan_profiles add column if not exists offer_image_urls jsonb not null default '[]'::jsonb`);
  await q(`alter table creator_stan_profiles add column if not exists header_image_url text`);
  schemaEnsured = true;
}

async function upsertStanProfile(args: {
  creatorIdentityId: string;
  stanSlug: string;
  stanUrl: string;
  extracted: ExtractedSignals;
}) {
  await q(
    `insert into creator_stan_profiles (
       id, creator_identity_id, stan_slug, stan_url,
       profile_name, profile_handle, bio_description,
       offers, offer_cards, offer_image_urls, header_image_url,
       pricing_points, product_types, outbound_socials, email,
       cta_style, source_text, source_html_len, extracted_confidence
     )
     values (
       $1,$2,$3,$4,
       $5,$6,$7,
       $8::jsonb,$9::jsonb,$10::jsonb,$11,
       $12::jsonb,$13::jsonb,$14::jsonb,$15,
       $16,$17,$18,$19
     )
     on conflict (creator_identity_id) do update set
       stan_slug = excluded.stan_slug,
       stan_url = excluded.stan_url,
       profile_name = excluded.profile_name,
       profile_handle = excluded.profile_handle,
       bio_description = excluded.bio_description,
       offers = excluded.offers,
       offer_cards = excluded.offer_cards,
       offer_image_urls = excluded.offer_image_urls,
       header_image_url = excluded.header_image_url,
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
      args.extracted.profileName,
      args.extracted.profileHandle,
      args.extracted.bioDescription,
      JSON.stringify(args.extracted.offers),
      JSON.stringify(args.extracted.offerCards),
      JSON.stringify(args.extracted.offerImageUrls),
      args.extracted.headerImageUrl,
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

async function crawlStanPage(
  page: Page,
  stanSlug: string,
  args: { timeoutMs: number; waitAfterLoadMs: number }
): Promise<CrawledStanPage> {
  const targetUrl = `https://stan.store/${encodeURIComponent(stanSlug)}`;
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: args.timeoutMs,
  });

  await page.waitForTimeout(args.waitAfterLoadMs);
  await page.waitForSelector(".store-header, .store-layout", { timeout: Math.min(8_000, args.timeoutMs) }).catch(() => {});

  return page.evaluate(() => {
    const clean = (value: string | null | undefined, max = 4_000) => {
      const text = String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return null;
      return text.slice(0, max);
    };

    const toAbsoluteUrl = (value: string | null | undefined) => {
      if (!value) return null;
      try {
        return new URL(value, window.location.href).toString();
      } catch {
        return null;
      }
    };

    const uniq = (values: Array<string | null | undefined>, max = 200) => {
      const out: string[] = [];
      const seen = new Set<string>();
      for (const raw of values) {
        const value = clean(raw, 8_000);
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= max) break;
      }
      return out;
    };

    const pageTitle = clean(document.title, 280);
    const metaDescription = clean(
      (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content,
      500
    );
    const ogImage = toAbsoluteUrl(
      (document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null)?.content
    );
    const fullName = clean(document.querySelector(".store-header__fullname")?.textContent, 140);
    const bio = clean(document.querySelector(".store-header__bio")?.textContent, 320);
    const headerImageUrl = toAbsoluteUrl(
      (document.querySelector(".store-header__image img") as HTMLImageElement | null)?.getAttribute("src")
    );

    const socialLinks = uniq(
      Array.from(document.querySelectorAll(".social-icons a[href]")).map((el) =>
        toAbsoluteUrl((el as HTMLAnchorElement).getAttribute("href"))
      ),
      60
    );

    const anchorLinks = uniq(
      Array.from(document.querySelectorAll(".store-header a[href], .store-content a[href]")).map((el) =>
        toAbsoluteUrl((el as HTMLAnchorElement).getAttribute("href"))
      ),
      240
    );

    const calloutCards = Array.from(document.querySelectorAll(".block.block--callout")).map((block) => {
      const title = clean(block.querySelector(".block__heading")?.textContent, 180);
      const description = clean(block.querySelector(".block__subheading")?.textContent, 320);
      const price = clean(block.querySelector(".product-price .amount")?.textContent, 60);
      const cta = clean(block.querySelector(".cta-button__label")?.textContent, 120);
      const imageUrl = toAbsoluteUrl(
        (block.querySelector(".block__image img") as HTMLImageElement | null)?.getAttribute("src")
      );
      const href = toAbsoluteUrl((block.querySelector("a[href]") as HTMLAnchorElement | null)?.getAttribute("href"));
      return {
        title,
        description,
        price,
        cta,
        imageUrl,
        href,
        source: "dom_callout" as const,
        sourceType: null,
      };
    });

    const pillCards = Array.from(document.querySelectorAll(".block.block--pill")).map((block) => {
      const title = clean(block.querySelector(".block__text--pill")?.textContent, 180);
      const description = null;
      const price = null;
      const cta = clean(block.querySelector("button .cta-button__label")?.textContent, 120);
      const imageUrl = toAbsoluteUrl(
        (block.querySelector(".block__image--pill img") as HTMLImageElement | null)?.getAttribute("src")
      );
      const href = toAbsoluteUrl((block.querySelector("a[href]") as HTMLAnchorElement | null)?.getAttribute("href"));
      return {
        title,
        description,
        price,
        cta,
        imageUrl,
        href,
        source: "dom_pill" as const,
        sourceType: null,
      };
    });

    const nuxtCards: OfferCard[] = [];
    try {
      const pages = (window as any)?.__NUXT__?.data?.[0]?.store?.pages;
      if (Array.isArray(pages)) {
        for (const page of pages) {
          const product = page?.data?.product;
          if (!product) continue;

          const amount = product?.price?.amount;
          const currency = clean(String(product?.price?.currency ?? "USD"), 10) ?? "USD";
          let price: string | null = null;
          if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
            const formatted = Number(amount).toLocaleString();
            price = currency.toUpperCase() === "USD" ? `$${formatted}` : `${currency.toUpperCase()} ${formatted}`;
          }

          nuxtCards.push({
            title: clean(product?.title, 180),
            description: clean(product?.description, 350),
            price,
            cta: clean(page?.data?.button?.button_text, 120),
            imageUrl: toAbsoluteUrl(product?.image),
            href: toAbsoluteUrl(product?.link?.url),
            source: "nuxt",
            sourceType: clean(product?.type, 80),
          });
        }
      }
    } catch {}

    const offerCards = [...calloutCards, ...pillCards, ...nuxtCards]
      .filter((card) => card.title || card.price || card.cta)
      .slice(0, 80);

    const offerImageUrls = uniq(
      [
        headerImageUrl,
        ogImage,
        ...offerCards.map((card) => card.imageUrl),
        ...Array.from(document.querySelectorAll(".store-content img[src], .store-header img[src]")).map((el) =>
          toAbsoluteUrl((el as HTMLImageElement).getAttribute("src"))
        ),
      ],
      120
    );

    const bodyText = clean(document.body?.innerText, 120_000) ?? "";

    return {
      finalUrl: window.location.href,
      pageTitle,
      metaDescription,
      ogImage,
      fullName,
      bio,
      headerImageUrl,
      socialLinks,
      anchorLinks,
      offerCards,
      offerImageUrls,
      bodyText,
      htmlLength: document.documentElement?.outerHTML?.length ?? 0,
    };
  });
}

export async function enrichStanProfilesWithAgent(
  input: StanAgentEnrichInput = {}
): Promise<StanAgentEnrichResult> {
  const limit = clampInt(input.limit, 1, 1_000, 100);
  const force = input.force === true;
  const dryRun = input.dryRun === true;
  const requestedBrowser = normalizeBrowser(input.browser ?? defaultBrowser());
  const headless = input.headless !== false;
  const timeoutMs = clampInt(input.timeoutMs, 3_000, 120_000, DEFAULT_TIMEOUT_MS);
  const waitAfterLoadMs = clampInt(input.waitAfterLoadMs, 0, 30_000, DEFAULT_WAIT_AFTER_LOAD_MS);

  const warnings: string[] = [];
  const stats = initStats();
  const results: StanAgentEnrichResult["results"] = [];
  const identities = await selectIdentities({
    ...input,
    limit,
  });
  stats.selected = identities.length;

  if (!dryRun) {
    await ensureStanProfileColumns();
  }

  let browser: Browser | null = null;
  let browserUsed: StanAgentBrowser = requestedBrowser;

  try {
    const launched = await launchBrowserWithFallback({
      requestedBrowser,
      headless,
    });
    browser = launched.browser;
    browserUsed = launched.browserName;
    if (launched.warning) warnings.push(launched.warning);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    });

    for (const identity of identities) {
      stats.processed += 1;
      const stanSlug = identity.canonical_stan_slug
        ? normalizeSlug(identity.canonical_stan_slug)
        : null;

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

      if (identity.has_existing_profile && !force) {
        stats.skippedExisting += 1;
        results.push({
          creatorIdentityId: identity.id,
          stanSlug,
          status: "skipped",
          reason: "profile already enriched; use force=true",
        });
        continue;
      }

      const page = await context.newPage();
      try {
        const crawled = await crawlStanPage(page, stanSlug, {
          timeoutMs,
          waitAfterLoadMs,
        });
        const extracted = extractSignals(crawled, stanSlug);

        if (!dryRun) {
          await upsertStanProfile({
            creatorIdentityId: identity.id,
            stanSlug,
            stanUrl: crawled.finalUrl,
            extracted,
          });
        }

        const status: "enriched" | "updated" = identity.has_existing_profile ? "updated" : "enriched";
        if (status === "updated") stats.updated += 1;
        else stats.enriched += 1;

        results.push({
          creatorIdentityId: identity.id,
          stanSlug,
          status,
          profileName: extracted.profileName,
          profileHandle: extracted.profileHandle,
          confidence: extracted.extractedConfidence,
          offersFound: extracted.offers.length,
          pricesFound: extracted.pricingPoints.length,
          socialsFound: extracted.outboundSocials.length,
          headerImageUrl: extracted.headerImageUrl,
        });
      } catch (err: any) {
        stats.failed += 1;
        results.push({
          creatorIdentityId: identity.id,
          stanSlug,
          status: "failed",
          reason: err?.message ?? "stan page crawl failed",
        });
      } finally {
        await page.close().catch(() => {});
      }
    }

    await context.close();
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return {
    config: {
      discoveryRunId: input.discoveryRunId ?? null,
      creatorIdentityId: input.creatorIdentityId ?? null,
      stanSlug: input.stanSlug ? normalizeSlug(input.stanSlug) : null,
      limit,
      force,
      dryRun,
      requestedBrowser,
      browserUsed,
      headless,
      timeoutMs,
      waitAfterLoadMs,
    },
    warnings,
    stats,
    results,
  };
}
