/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

export default function CreatorPage({
  params,
}: {
  params: { creatorId: string };
}) {
  const sp = useSearchParams();
  const brandId = sp.get("brandId");

  const [loading, setLoading] = React.useState(false);
  const [pitch, setPitch] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  async function onGenerate() {
    if (!brandId) {
      setErr("missing brandId");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/generate-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, creatorId: params.creatorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "failed to generate");
      setPitch(data.pitch);
    } catch (e: any) {
      setErr(e?.message ?? "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-6">
      <h1 className="text-2xl font-semibold">generate outreach</h1>

      <button
        onClick={onGenerate}
        disabled={loading}
        className="rounded-xl bg-white text-black px-4 py-3 font-medium disabled:opacity-50"
      >
        {loading ? "generating..." : "generate pitch"}
      </button>

      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      {pitch ? (
        <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 space-y-2">
          <p className="text-sm text-white/60">email body</p>
          <pre className="whitespace-pre-wrap text-white/85">{pitch}</pre>
        </div>
      ) : null}
    </main>
  );
}
