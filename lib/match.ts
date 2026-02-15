type Creator = {
  id: string;
  niche: string;
  platforms: string[];
  audience_types: string[];
  content_style?: string | null;
  products_sold: string[];
  estimated_engagement?: number | null;
};

type Brand = {
  category?: string | null;
  target_audience: string[];
  goals: string[];
  preferred_platforms: string[];
};

function overlap(a: string[], b: string[]) {
  const A = new Set(a.map((s) => s.toLowerCase()));
  const B = new Set(b.map((s) => s.toLowerCase()));
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return A.size === 0 ? 0 : hit / A.size;
}

export function scoreMatch(brand: Brand, creator: Creator) {
  const nicheScore = brand.category ? (creator.niche.toLowerCase().includes(brand.category.toLowerCase()) ? 1 : 0.3) : 0.4;
  const platformScore = overlap(brand.preferred_platforms, creator.platforms);
  const audienceScore = overlap(brand.target_audience, creator.audience_types);

  const engagementBoost =
    creator.estimated_engagement != null
      ? Math.min(Math.max(creator.estimated_engagement / 0.05, 0.6), 1.2)
      : 0.9;

  // weights tuned for "instant relevance"
  const raw =
    nicheScore * 0.35 +
    platformScore * 0.25 +
    audienceScore * 0.30 +
    0.10; // baseline

  const score = Math.min(raw * engagementBoost, 1);

  const reasons: string[] = [];
  if (platformScore >= 0.5) reasons.push("platform alignment");
  if (audienceScore >= 0.3) reasons.push("audience fit");
  if (nicheScore >= 0.8) reasons.push("category/niche match");
  if ((creator.estimated_engagement ?? 0) >= 0.05) reasons.push("strong engagement");

  return { score: Number(score.toFixed(3)), reasons: reasons.slice(0, 3) };
}
