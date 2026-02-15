/* eslint-disable @typescript-eslint/no-explicit-any */
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export function getGroq() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("missing GROQ_API_KEY");
  }
  return groq;
}

type GroqTextOptions = {
  system?: string;
  model?: string;
  temperature?: number;
  maxCompletionTokens?: number;
  retries?: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function groqText(prompt: string, opts: GroqTextOptions = {}) {
  const client = getGroq();

  const model = opts.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  const system = opts.system ?? "you output exactly what the user asks for.";
  const temperature = opts.temperature ?? 0.2;
  const max_completion_tokens = opts.maxCompletionTokens ?? 1200;
  const retries = opts.retries ?? 2;

  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature,
        max_completion_tokens,
      });

      const text = res.choices?.[0]?.message?.content ?? "";
      return text.trim();
    } catch (err: any) {
      lastErr = err;

      // groq-sdk errors vary; this is a safe-ish check
      const status = err?.status ?? err?.response?.status;
      const retryable =
        status === 429 || (typeof status === "number" && status >= 500);

      if (!retryable || attempt === retries) break;

      // simple backoff: 300ms, 600ms, 1200ms...
      await sleep(300 * 2 ** attempt);
    }
  }

  throw lastErr ?? new Error("groqText failed");
}
