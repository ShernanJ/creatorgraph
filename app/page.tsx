/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Step = "idle" | "crawling" | "analyzing" | "done" | "error";

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [step, setStep] = React.useState<Step>("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError("enter a brand website url");
      return;
    }

    try {
      // 1) analyze first to create the brand row (fast fallback path)
      // BUT we want crawl-first, so we:
      // - create brand via analyze (fetch)
      // - then crawl using brandId
      // - then re-analyze using brandId (brand_pages)
      //
      // in practice: this gives you immediate brandId + works even if crawl fails.

      setStep("analyzing");
      const analyze1 = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const a1 = await analyze1.json();
      if (!analyze1.ok) throw new Error(a1?.error ?? "analyze failed");

      const brandId = a1.brandId as string;

      // 2) crawl with playwright
      setStep("crawling");
      const crawl = await fetch("/api/crawl-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });

      // crawl can fail sometimes; we don't want to block the user
      const c1 = await crawl.json().catch(() => ({}));
      if (!crawl.ok) {
        console.warn("crawl failed:", c1);
      } else {
        // 3) re-analyze using brand_pages (better ontology + topics)
        setStep("analyzing");
        const analyze2 = await fetch("/api/analyze-brand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId }),
          cache: "no-store",
        });

        const a2 = await analyze2.json();
        if (!analyze2.ok) {
          console.warn("reanalyze failed:", a2);
        }
      }

      setStep("done");
      router.push(`/brand/${brandId}`);
    } catch (err: any) {
      setStep("error");
      setError(err?.message ?? "something went wrong");
    }
  }

  const isBusy = step === "crawling" || step === "analyzing";

  return (
    <main className="mx-auto max-w-2xl px-6 py-20 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold">creatorgraph</h1>
        <p className="text-white/70">
          paste a brand website → generate dossier → match creators → outreach
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://goodlifefitness.com"
          className="w-full rounded-2xl bg-white/5 ring-1 ring-white/15 px-4 py-3 outline-none"
          disabled={isBusy}
        />

        <button
          className="w-full rounded-2xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
          disabled={isBusy}
        >
          {step === "idle" && "analyze brand →"}
          {step === "crawling" && "crawling site…"}
          {step === "analyzing" && "analyzing…"}
          {step === "done" && "done →"}
          {step === "error" && "try again →"}
        </button>

        {isBusy && (
          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-white/80">
            {step === "crawling" && (
              <p>grabbing key pages (pricing, features, about, case studies)…</p>
            )}
            {step === "analyzing" && (
              <p>structuring a grounded brand dossier + creator-native match topics…</p>
            )}
            <p className="mt-2 text-white/50">
              this can take 10–30s on some sites.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-300">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
