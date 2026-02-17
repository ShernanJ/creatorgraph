/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Step = "idle" | "crawling" | "analyzing" | "done" | "error";

export default function RebuildDossierButton({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const busy = step === "crawling" || step === "analyzing";

  async function run() {
    setError(null);
    setStep("crawling");

    try {
      const crawl = await fetch("/api/crawl-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
        cache: "no-store",
      });

      const c = await crawl.json().catch(() => ({}));
      if (!crawl.ok) console.warn("crawl failed:", c);

      setStep("analyzing");

      const analyze = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
        cache: "no-store",
      });

      const a = await analyze.json();
      if (!analyze.ok) throw new Error(a?.error ?? "reanalyze failed");

      setStep("done");

      // refresh server component data
      router.refresh();

      // reset button after a moment
      setTimeout(() => setStep("idle"), 900);
    } catch (e: any) {
      setStep("error");
      setError(e?.message ?? "something went wrong");
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex rounded-xl bg-white/10 text-white px-4 py-3 font-medium ring-1 ring-white/15 disabled:opacity-60"
      >
        {step === "idle" && "rebuild dossier (crawl → analyze) ↻"}
        {step === "crawling" && "crawling…"}
        {step === "analyzing" && "analyzing…"}
        {step === "done" && "rebuilt ✓"}
        {step === "error" && "retry ↻"}
      </button>

      {busy && (
        <p className="text-xs text-white/60">
          this updates crawl sources + match topics. may take 10–30s.
        </p>
      )}

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
