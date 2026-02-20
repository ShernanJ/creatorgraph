/* generateCreators.ts
   Usage:
     ts-node generateCreators.ts > data/creators.seed.json
   or:
     node --loader ts-node/esm generateCreators.ts > data/creators.seed.json

   Note:
     This generator produces synthetic fixture creators only.
     Seed them into `synthetic_creators` (default via `npm run seed`).
*/

type Platform = "tiktok" | "instagram" | "youtube" | "x" | "linkedin";

type PlatformMetrics = Record<
  Platform,
  { followers: number; avg_views: number; engagement_rate: number }
>;

type Creator = {
  id: string;
  name: string;
  niche: string;
  platforms: Platform[];
  audience_types: string[];
  content_style: string;
  products_sold: string[];
  sample_links: string[];
  estimated_engagement: number;
  metrics: {
    top_topics: string[];
    post_frequency_per_week: number;
    content_formats: string[];
    platform_metrics: Partial<PlatformMetrics>;
  };
};

/** --------------------------
 * seeded RNG (mulberry32)
 * -------------------------- */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickManyUnique<T>(rng: () => number, arr: T[], k: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  const kk = Math.max(0, Math.min(k, copy.length));
  for (let i = 0; i < kk; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** --------------------------
 * stan-style niche profiles
 * -------------------------- */
type NicheProfile = {
  niche: string;
  niche_weight: number; // affects sampling distribution
  audience_types: string[];
  topics: string[];
  products: string[];
  content_style_pool: string[];
  preferred_platforms: Platform[];
};

const NICHE_PROFILES: NicheProfile[] = [
  {
    niche: "fitness coaching",
    niche_weight: 12,
    audience_types: ["gym beginners", "weight loss", "busy professionals"],
    topics: ["fitness", "weight loss", "gym routines", "nutrition", "home workouts", "mindset"],
    products: ["programs", "coaching", "membership"],
    content_style_pool: ["before/after + routines", "high-energy motivation + workouts", "mythbusting + science-lite"],
    preferred_platforms: ["tiktok", "instagram", "youtube"],
  },
  {
    niche: "personal finance",
    niche_weight: 10,
    audience_types: ["young professionals", "students", "first job"],
    topics: ["budgeting", "saving", "investing", "credit cards", "debt payoff", "side hustles"],
    products: ["course", "newsletter", "templates", "coaching"],
    content_style_pool: ["educational breakdowns", "simple explainers + examples", "hot takes + lessons learned"],
    preferred_platforms: ["youtube", "tiktok", "x", "instagram"],
  },
  {
    niche: "beauty & skincare",
    niche_weight: 10,
    audience_types: ["women 18-34", "beauty shoppers", "skincare beginners"],
    topics: ["skincare", "acne", "routine", "product reviews", "beauty", "ingredients"],
    products: ["affiliate links", "digital guide", "brand collabs"],
    content_style_pool: ["ugc demos + reviews", "routine breakdowns + do/don't", "before/after + routines"],
    preferred_platforms: ["tiktok", "instagram", "youtube"],
  },
  {
    niche: "life coaching",
    niche_weight: 9,
    audience_types: ["self-improvement", "young adults", "people rebuilding habits"],
    topics: ["habits", "discipline", "confidence", "routine building", "mindset", "goal setting"],
    products: ["coaching", "workshops", "journaling guide"],
    content_style_pool: ["storytelling + lessons", "frameworks + actionable steps", "relatable stories + coping tips"],
    preferred_platforms: ["tiktok", "instagram", "youtube"],
  },
  {
    niche: "business coaching",
    niche_weight: 9,
    audience_types: ["solopreneurs", "coaches", "small business owners"],
    topics: ["offers", "positioning", "pricing", "sales calls", "client delivery", "content strategy"],
    products: ["coaching", "templates", "course"],
    content_style_pool: ["storytelling + frameworks", "case studies + how-tos", "tear-downs + rebuilds"],
    preferred_platforms: ["instagram", "tiktok", "youtube", "linkedin"],
  },
  {
    niche: "creator monetization",
    niche_weight: 8,
    audience_types: ["content creators", "solopreneurs", "side hustlers"],
    topics: ["creator economy", "funnels", "digital products", "audience growth", "brand deals", "offer design"],
    products: ["coaching", "templates", "toolkit"],
    content_style_pool: ["growth playbooks + revenue breakdowns", "case studies + how-tos", "frameworks + examples"],
    preferred_platforms: ["instagram", "tiktok", "x", "youtube"],
  },
  {
    niche: "ecommerce & marketing",
    niche_weight: 7,
    audience_types: ["store owners", "marketers", "side hustlers"],
    topics: ["shopify", "ads", "creative testing", "conversion rate optimization", "email marketing", "landing pages"],
    products: ["course", "ad swipe files", "templates"],
    content_style_pool: ["experiments + results", "ad tear-downs", "case studies + how-tos"],
    preferred_platforms: ["youtube", "tiktok", "instagram", "x"],
  },
  {
    niche: "ai productivity",
    niche_weight: 6,
    audience_types: ["founders", "operators", "automation builders"],
    topics: ["ai tools", "automation", "workflows", "prompting", "agents", "productivity"],
    products: ["prompt packs", "automation templates", "course", "newsletter"],
    content_style_pool: ["tool breakdowns + workflows", "tutorials + step-by-step", "build in public + ship logs"],
    preferred_platforms: ["x", "youtube", "linkedin", "tiktok"],
  },
  {
    niche: "real estate investing",
    niche_weight: 5,
    audience_types: ["first time investors", "side hustlers", "young professionals"],
    topics: ["real estate investing", "cash flow", "house hacking", "market analysis", "mortgages"],
    products: ["course", "mentorship", "newsletter"],
    content_style_pool: ["deal breakdowns + case studies", "educational breakdowns", "market updates + tips"],
    preferred_platforms: ["youtube", "instagram", "tiktok"],
  },
  {
    niche: "wellness & nutrition",
    niche_weight: 5,
    audience_types: ["busy professionals", "health conscious eaters", "fitness adjacent"],
    topics: ["meal prep", "high protein meals", "supplements", "nutrition basics", "healthy recipes"],
    products: ["meal plans", "recipe ebook", "membership"],
    content_style_pool: ["quick recipes + meal prep", "mythbusting + explainers", "routine + tips"],
    preferred_platforms: ["tiktok", "instagram", "youtube"],
  },
];

function weightedPickProfile(rng: () => number): NicheProfile {
  const total = NICHE_PROFILES.reduce((s, p) => s + p.niche_weight, 0);
  let roll = rng() * total;
  for (const p of NICHE_PROFILES) {
    roll -= p.niche_weight;
    if (roll <= 0) return p;
  }
  return NICHE_PROFILES[NICHE_PROFILES.length - 1];
}

/** --------------------------
 * platform behavior (ranges)
 * -------------------------- */
type PlatformBaseline = {
  followerRange: [number, number];
  viewRatioRange: [number, number]; // avg_views ≈ followers * ratio
  erRange: [number, number]; // engagement rate
  formatPool: string[];
};

const BASELINES: Record<Platform, PlatformBaseline> = {
  tiktok: {
    followerRange: [12000, 320000],
    viewRatioRange: [0.45, 1.35],
    erRange: [0.035, 0.085],
    formatPool: ["tiktok videos", "trends", "storytime clips", "tutorial clips", "day-in-the-life"],
  },
  instagram: {
    followerRange: [9000, 240000],
    viewRatioRange: [0.35, 1.05],
    erRange: [0.03, 0.075],
    formatPool: ["instagram reels", "instagram stories", "carousels", "before/after posts", "photo posts"],
  },
  youtube: {
    followerRange: [6000, 260000],
    viewRatioRange: [0.18, 0.75],
    erRange: [0.02, 0.06],
    formatPool: ["youtube videos", "shorts", "tutorials", "breakdowns", "vlogs"],
  },
  x: {
    followerRange: [3000, 140000],
    viewRatioRange: [0.15, 0.9],
    erRange: [0.015, 0.05],
    formatPool: ["threads", "short posts", "ship logs", "hot takes", "mini case studies"],
  },
  linkedin: {
    followerRange: [4000, 180000],
    viewRatioRange: [0.12, 0.7],
    erRange: [0.02, 0.055],
    formatPool: ["carousels", "framework posts", "short posts", "case studies", "lessons learned"],
  },
};

/** --------------------------
 * name generation
 * -------------------------- */
const FIRST = [
  "alex", "mia", "jordan", "sara", "daniel", "lena", "omar", "hannah", "marcus", "nina",
  "tyler", "eva", "ravi", "zoe", "leo", "noah", "aya", "sam", "chloe", "kai",
  "jules", "imani", "serena", "diego", "austin", "priya", "kevin", "fatima", "jonah", "maya",
];
const LAST = [
  "chen", "rivera", "price", "ng", "brooks", "morales", "patel", "park", "reed", "cole",
  "wong", "singh", "kim", "johnson", "garcia", "ali", "miller", "brown", "lopez", "clark",
  "harris", "khan", "wilson", "anderson", "taylor", "martinez", "thompson", "white", "lee", "young",
];

function slugifyName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** --------------------------
 * platform selection logic
 * -------------------------- */
function pickPlatforms(rng: () => number, profile: NicheProfile): Platform[] {
  // stan-style: mostly 2 platforms, sometimes 1 or 3
  const k = rng() < 0.12 ? 1 : rng() < 0.86 ? 2 : 3;

  // bias toward preferred platforms, but allow some randomness
  const pool = [...new Set([...profile.preferred_platforms, ...PLATFORMS_ALL()])];
  const preferred = profile.preferred_platforms;

  // start with 1 preferred always
  const out: Platform[] = [pickOne(rng, preferred)];

  while (out.length < k) {
    const p = rng() < 0.75 ? pickOne(rng, preferred) : pickOne(rng, pool);
    if (!out.includes(p)) out.push(p);
  }

  // mild rule: avoid linkedin + instagram only combo for non-biz niches
  if (
    out.length === 2 &&
    out.includes("linkedin") &&
    out.includes("instagram") &&
    !["business coaching", "ai productivity", "ecommerce & marketing"].includes(profile.niche)
  ) {
    // swap linkedin to tiktok or youtube
    out[out.indexOf("linkedin")] = rng() < 0.5 ? "tiktok" : "youtube";
  }

  return out;
}

function PLATFORMS_ALL(): Platform[] {
  return ["tiktok", "instagram", "youtube", "x", "linkedin"];
}

/** --------------------------
 * metric generation
 * -------------------------- */
function genPlatformMetric(rng: () => number, platform: Platform): { followers: number; avg_views: number; engagement_rate: number } {
  const b = BASELINES[platform];
  const followers = Math.floor(b.followerRange[0] + rng() * (b.followerRange[1] - b.followerRange[0]));

  // correlate views to followers with ratio range + noise
  const ratio = b.viewRatioRange[0] + rng() * (b.viewRatioRange[1] - b.viewRatioRange[0]);
  const noise = 0.85 + rng() * 0.35; // 0.85..1.20
  const avg_views = Math.max(500, Math.floor(followers * ratio * noise));

  const er = b.erRange[0] + rng() * (b.erRange[1] - b.erRange[0]);
  const engagement_rate = round3(er);

  return { followers, avg_views, engagement_rate };
}

function buildCreator(i: number, rng: () => number): Creator {
  const profile = weightedPickProfile(rng);
  const platforms = pickPlatforms(rng, profile);

  const name = `${pickOne(rng, FIRST)} ${pickOne(rng, LAST)}`;
  const audience_types = pickManyUnique(rng, profile.audience_types, clamp(2 + Math.floor(rng() * 2), 2, 3));
  const top_topics = pickManyUnique(rng, profile.topics, clamp(4 + Math.floor(rng() * 2), 4, 6));
  const products_sold = pickManyUnique(rng, profile.products, rng() < 0.65 ? 2 : 1);
  const content_style = pickOne(rng, profile.content_style_pool);

  const post_frequency_per_week = clamp(2 + Math.floor(rng() * 6), 2, 7);

  const platform_metrics: Partial<PlatformMetrics> = {};
  const content_formats: string[] = [];

  for (const p of platforms) {
    platform_metrics[p] = genPlatformMetric(rng, p);
    content_formats.push(pickOne(rng, BASELINES[p].formatPool));
  }

  // add 0-2 extra formats to make it feel less uniform
  if (rng() < 0.45) content_formats.push(pickOne(rng, ["carousels", "short posts", "tutorials", "case studies", "explainers"]));
  if (rng() < 0.18) content_formats.push(pickOne(rng, ["live q&a", "community posts", "email breakdowns", "behind the scenes"]));

  // estimated_engagement = average ER across chosen platforms (rounded)
  const ers = platforms.map((p) => platform_metrics[p]!.engagement_rate);
  const estimated_engagement = round3(ers.reduce((a, b) => a + b, 0) / ers.length);

  const id = `cr_${String(i).padStart(3, "0")}`;
  const link = `https://example.com/${slugifyName(name)}`;

  return {
    id,
    name,
    niche: profile.niche,
    platforms,
    audience_types,
    content_style,
    products_sold,
    sample_links: [link],
    estimated_engagement,
    metrics: {
      top_topics,
      post_frequency_per_week,
      content_formats,
      platform_metrics,
    },
  };
}

function generateCreators(count: number, seed = 42): Creator[] {
  const rng = mulberry32(seed);
  const out: Creator[] = [];
  for (let i = 1; i <= count; i++) out.push(buildCreator(i, rng));
  return out;
}

// ---- run ----
import fs from "fs";
import path from "path";

const creators = generateCreators(200, 1337);

const outPath = path.resolve("data/creators.seed.json");

// ensure folder exists
fs.mkdirSync(path.dirname(outPath), { recursive: true });

// write file
fs.writeFileSync(outPath, JSON.stringify(creators, null, 2), "utf8");

console.log(`✅ wrote ${creators.length} creators to ${outPath}`);
