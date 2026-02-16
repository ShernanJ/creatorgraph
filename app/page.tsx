/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  
  async function onAnalyze() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }), // or website
      });
  
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "failed");
  
      router.push(`/brand/${data.brandId}`);
    } catch (e: any) {
      setErr(e?.message ?? "something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">stan for brands (mvp)</h1>
        <p className="text-white/70">
          paste a brand url → auto-build campaign profile → match creators →
          generate outreach
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-sm text-white/70">brand website</label>
        <input
          className="w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-white/25"
          placeholder="https://brand.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <button
          onClick={onAnalyze}
          disabled={loading}
          className="rounded-xl bg-white text-black px-4 py-3 font-medium disabled:opacity-50"
        >
          {loading ? "analyzing…" : "analyze brand"}
        </button>

        {loading && (
          <div className="mt-3 text-sm opacity-80">
            fetching site → extracting → generating profile…
          </div>
        )}

        {err && (
          <div className="mt-3 text-sm text-red-400">
            {err}
          </div>
        )}


      </div>
    </main>
  );
}
