export const brandProfilePrompt = (url: string, pageText: string) => `
you are a brand profiler for creator partnerships.

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
  "raw_summary": string
}

rules:
- return only valid json (no markdown, no comments)
- if unknown, make a best guess but keep it conservative
- keep arrays <= 8 items each
- prefer these platforms when relevant: ["instagram","tiktok","linkedin","x","youtube"]

url: ${url}

website text:
${pageText.slice(0, 12000)}
`.trim();
