/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Step = "idle" | "crawling" | "analyzing" | "done" | "error";
type PreviewStatus = "idle" | "checking" | "valid" | "invalid";

type Preview = {
  status: PreviewStatus;
  normalized?: string;
  host?: string;
  favicon?: string;
  reachable?: boolean | null;
  reason?: string;
};

function useDebounced<T>(value: T, delay = 450) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [step, setStep] = React.useState<Step>("idle");
  const [error, setError] = React.useState<string | null>(null);

  // --- preflight preview state (no scraping) ---
  const [preview, setPreview] = React.useState<Preview>({ status: "idle" });
  const debouncedUrl = useDebounced(url, 450);

  React.useEffect(() => {
    const v = debouncedUrl.trim();
    if (!v) {
      setPreview({ status: "idle" });
      return;
    }

    let cancelled = false;

    (async () => {
      setPreview({ status: "checking" });

      try {
        const res = await fetch("/api/preview-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: v }),
        });

        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok || !data?.ok) {
          setPreview({
            status: "invalid",
            reason: data?.reason ?? "invalid_url",
          });
          return;
        }

        const reach = data?.reachability ?? {};

        setPreview({
          status: "valid",
          normalized: data.normalized,
          host: data.host,
          favicon: data.favicon,
          reachable: typeof reach.reachable === "boolean" ? reach.reachable : null,
          reason: reach.note,
        });

        
      } catch {
        if (cancelled) return;
        setPreview({ status: "invalid", reason: "network_error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // use normalized preview url if available
    const normalized = preview.normalized ?? "";
    if (!normalized || preview.status !== "valid") {
      setError("enter a valid brand website url");
      return;
    }

    try {
      // 1) analyze first to create the brand row (fast fallback path)
      setStep("analyzing");
      const analyze1 = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
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
  const canContinue = !isBusy && preview.status === "valid";


  const headline =
    step === "idle"
      ? "What’s your brand website?"
      : step === "crawling"
      ? "Crawling your site…"
      : step === "analyzing"
      ? "Analyzing…"
      : step === "done"
      ? "Done."
      : "Something went wrong";

  const sub =
    step === "idle"
      ? "Paste a brand URL — I’ll generate a grounded brand dossier and creator-native match angles."
      : step === "crawling"
      ? "grabbing key pages (pricing, features, about, case studies)…"
      : step === "analyzing"
      ? "structuring a grounded brand dossier + creator-native match topics…"
      : step === "done"
      ? "redirecting you to the dossier…"
      : "try again, or paste a different url";

  return (
    <main className="min-h-screen w-full bg-[#2c2f3a] text-white">
      {/* subtle vignette + gradients */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1100px_650px_at_50%_40%,rgba(110,120,255,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_100%,rgba(130,70,255,0.10),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_400px_at_0%_0%,rgba(255,255,255,0.05),transparent_55%)]" />
      </div>

      {/* top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <Image
            src="/Stan-Lee-Agent.png"
            alt="Stan Lee Agent"
            width={28}
            height={28}
            priority
            className="select-none drop-shadow-[0_0_30px_rgba(108,92,255,0.45)]"
          />
          <span className="text-base font-semibold tracking-tight">
            Stan Lee
          </span>
          <span className="text-sm text-white/60">by CreatorGraph</span>
        </div>

        <button
          type="button"
          aria-label="Close"
          className="rounded-full p-2 text-white/60 hover:text-white hover:bg-white/5"
          onClick={() => {
            setUrl("");
            setError(null);
            setPreview({ status: "idle" });
            setStep("idle");
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {/* center */}
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-24 pt-10 text-center">
        {/* hero mascot */}
        <div className="relative mb-8">
          <div className="absolute inset-0 -z-10 flex items-center justify-center">
            <div className="h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(108,92,255,0.25),transparent_70%)] blur-2xl" />
          </div>
          <Image
            src="/Stan-Lee-Agent.png"
            alt="Stan Lee Agent"
            width={150}
            height={150}
            priority
            className="select-none drop-shadow-[0_0_60px_rgba(108,92,255,0.50)]"
          />
        </div>

        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {headline}
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
          {sub}
        </p>

        <form onSubmit={onSubmit} className="mt-10 w-full max-w-xl">

          {/* input */}
        <div className="relative">
          {/* left icon slot: favicon / loader / default */}
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
              {preview.status === "valid" && preview.favicon ? (
                <Image
                  src={preview.favicon}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] rounded-sm"
                />
              ) : preview.status === "checking" ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#6c5cff]" />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="text-white/80"
                >
                  <path
                    d="M12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9-9 4.03-9 9 4.03 9 9 9Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 12h18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 3a15.3 15.3 0 0 1 0 18a15.3 15.3 0 0 1 0-18Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </div>

  {/* right pill: status */}
  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
    {preview.status === "valid" && (
      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/15">
        {preview.reachable === true && (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            <span className="text-emerald-200">verified</span>
          </>
        )}

        {preview.reachable === false && (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-300" />
            <span className="text-amber-200">blocked</span>
          </>
        )}

        {preview.reachable === null && (
          <>
            <span className="h-2 w-2 rounded-full bg-white/40" />
            <span className="text-white/70">ok</span>
          </>
        )}
      </div>
    )}

    {preview.status === "checking" && (
      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/15 text-white/70">
        checking…
      </div>
    )}

    {preview.status === "invalid" && (
      <div className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-xs ring-1 ring-red-400/30 text-red-200">
        invalid
      </div>
    )}
  </div>

  <input
    value={url}
    onChange={(e) => {
      setUrl(e.target.value);
      setError(null);
      if (step !== "idle") setStep("idle");
    }}
    placeholder="https://stan.store"
    disabled={isBusy}
    className={[
      "w-full rounded-2xl bg-white/5 px-4 py-4 pl-16 pr-24",
      "ring-1 ring-white/15 outline-none",
      "placeholder:text-white/35",
      "focus:ring-2 focus:ring-[#6c5cff]/70",
      "disabled:opacity-60",
    ].join(" ")}
  />
</div>


          {/* preview strip */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-white/60">
              {preview.status === "idle" && (
                <span className="text-white/35">paste a brand website to validate</span>
              )}

              {preview.status === "checking" && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#6c5cff]" />
                  checking…
                </span>
              )}


              {preview.status === "invalid" && (
                <span className="inline-flex items-center gap-2 text-red-300">
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                  {preview.reason === "unreachable"
                    ? "site not reachable"
                    : "not a valid url"}
                </span>
              )}
            </div>

            {preview.status === "valid" && preview.normalized && (
              <span className="hidden sm:inline text-white/35">
                {preview.normalized}
              </span>
            )}
          </div>

          {/* button */}
          <button
            disabled={!canContinue}
            className={[
              "mt-5 w-full rounded-full px-6 py-4 font-semibold",
              "bg-[#6c5cff] text-white",
              "hover:bg-[#5f50ff] active:scale-[0.99]",
              "disabled:opacity-50 disabled:hover:bg-[#6c5cff] disabled:active:scale-100",
              "transition",
            ].join(" ")}
          >
            {step === "idle" && "Continue"}
            {step === "crawling" && "Crawling…"}
            {step === "analyzing" && "Analyzing…"}
            {step === "done" && "Continue"}
            {step === "error" && "Try again"}
          </button>

          {/* helper + error */}
          {isBusy && (
            <p className="mt-4 text-sm text-white/45">
              this can take 10–30s on some sites.
            </p>
          )}

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        </form>
      </section>
    </main>
  );
}
