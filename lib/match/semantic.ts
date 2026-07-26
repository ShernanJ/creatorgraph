type ConceptRule = {
  concept: string;
  aliases: string[];
};

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bskin care\b/g, "skincare"],
  [/\be[\s-]?commerce\b/g, "ecommerce"],
  [/\buser generated content\b/g, "ugc"],
  [/\bcontent creators\b/g, "creator"],
  [/\bcreators\b/g, "creator"],
  [/\binfluencers\b/g, "influencer"],
  [/\bsmall businesses\b/g, "small business"],
  [/\bai tools\b/g, "ai productivity"],
  [/\bcreator economy\b/g, "creator monetization"],
];

const CONCEPT_RULES: ConceptRule[] = [
  {
    concept: "ai_productivity",
    aliases: ["ai productivity", "ai tools", "automation", "workflow automation", "productivity"],
  },
  {
    concept: "beauty_skincare",
    aliases: ["beauty", "skincare", "skin care", "acne", "hydrating", "makeup", "cosmetics"],
  },
  {
    concept: "business_coaching",
    aliases: ["business coaching", "entrepreneurship", "founder", "operator", "consulting"],
  },
  {
    concept: "creator_monetization",
    aliases: [
      "creator monetization",
      "creator economy",
      "digital products",
      "brand deals",
      "creator store",
      "audience growth",
    ],
  },
  {
    concept: "ecommerce_marketing",
    aliases: [
      "ecommerce",
      "ecommerce marketing",
      "shopify",
      "brand owner",
      "ads",
      "ad creative",
      "conversion rate",
      "ugc",
      "creator content",
      "content production",
    ],
  },
  {
    concept: "fitness",
    aliases: ["fitness", "gym", "workout", "training", "fat loss", "weight loss", "strength"],
  },
  {
    concept: "wellness_nutrition",
    aliases: [
      "wellness",
      "nutrition",
      "healthy cooking",
      "gut health",
      "meal prep",
      "meal plan",
      "mental wellness",
      "supplements",
    ],
  },
  {
    concept: "finance",
    aliases: ["personal finance", "money", "budgeting", "saving", "debt payoff", "investing"],
  },
  {
    concept: "real_estate",
    aliases: ["real estate", "property", "rental", "airbnb", "house hacking"],
  },
  {
    concept: "life_coaching",
    aliases: ["life coaching", "self improvement", "confidence", "habits", "mindset"],
  },
  {
    concept: "creator_audience",
    aliases: ["creator", "influencer", "ugc creator", "content creator"],
  },
  {
    concept: "business_audience",
    aliases: ["founder", "brand owner", "small business", "entrepreneur", "ecommerce founder"],
  },
  {
    concept: "consumer_audience",
    aliases: ["women", "men", "young adults", "students", "parents", "consumers"],
  },
];

export function normalizePhrase(value: string) {
  let normalized = String(value ?? "").trim().toLowerCase();
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ");
}

export function tokenizePhrase(value: string) {
  return normalizePhrase(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => {
      if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
      if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
        return token.slice(0, -1);
      }
      return token;
    });
}

export function uniqNormalizedPhrases(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizePhrase(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function conceptSet(value: string) {
  const normalized = normalizePhrase(value);
  const tokens = new Set(tokenizePhrase(value));
  const concepts = new Set<string>();

  for (const rule of CONCEPT_RULES) {
    for (const alias of rule.aliases) {
      const normalizedAlias = normalizePhrase(alias);
      if (!normalizedAlias) continue;
      if (normalized === normalizedAlias || normalized.includes(normalizedAlias)) {
        concepts.add(rule.concept);
        break;
      }

      const aliasTokens = tokenizePhrase(alias);
      if (aliasTokens.length && aliasTokens.every((token) => tokens.has(token))) {
        concepts.add(rule.concept);
        break;
      }
    }
  }

  return concepts;
}

export function phraseSimilarity(a: string, b: string) {
  const normalizedA = normalizePhrase(a);
  const normalizedB = normalizePhrase(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.84;

  const aa = new Set(tokenizePhrase(a));
  const bb = new Set(tokenizePhrase(b));
  if (!aa.size || !bb.size) return 0;

  let intersection = 0;
  for (const token of aa) {
    if (bb.has(token)) intersection += 1;
  }

  const union = aa.size + bb.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const overlap = intersection / Math.max(1, Math.min(aa.size, bb.size));

  const conceptsA = conceptSet(normalizedA);
  const conceptsB = conceptSet(normalizedB);
  let conceptScore = 0;
  for (const concept of conceptsA) {
    if (conceptsB.has(concept)) {
      conceptScore = 0.72;
      break;
    }
  }

  return Math.max(jaccard, overlap * 0.82, conceptScore);
}
