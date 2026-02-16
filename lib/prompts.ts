export const brandProfilePrompt = (url: string, pageText: string) => `
you are a brand profiler for creator partnership intelligence systems.

given a brand website url and extracted text, produce STRICT json only matching this schema:

{
  "name": string,
  "website": string,
  "category": string,
  "target_audience": string[],
  "goals": string[],
  "preferred_platforms": string[],
  "budget_range": "500-2k" | "2k-10k" | "10k+",
  "campaign_angles": string[],
  "match_topics": string[],
  "raw_summary": string
}

FIELD DEFINITIONS:

campaign_angles:
- marketing messaging angles the brand would use in campaigns
- may include abstract concepts like motivation, promotions, awareness, community, lifestyle

match_topics:
- concrete creator content topics
- must be specific and practical
- should sound like real social media post ideas
- avoid abstract marketing language
- use creator-native phrasing

GOOD match_topics examples:
- gym workout routines
- weight loss transformations
- beginner fitness plans
- skincare morning routines
- before and after results
- nutrition for fat loss
- home workout challenges

BAD match_topics examples:
- brand awareness
- wellness tips
- community engagement
- lifestyle inspiration

RULES:
- return only valid json (no markdown, no comments)
- ground outputs in the website content
- keep arrays <= 8 items each
- prefer these platforms when relevant: ["instagram","tiktok","linkedin","x","youtube"]
- if uncertain, infer conservatively from evidence

URL:
${url}

WEBSITE TEXT:
${pageText.slice(0, 12000)}
`.trim();
