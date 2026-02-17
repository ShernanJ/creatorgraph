/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { q } from "@/lib/db";

import { chromium } from "playwright";

function normalizeUrl(u: string) {
  let url = u.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function sameHost(a: string, b: string) {
  try {
    return new URL(a).host.replace(/^www\./, "") === new URL(b).host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function cleanText(s: string) {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPageText(page: any) {
  // remove scripts/styles and get visible-ish text
  const text = await page.evaluate(() => {
    const kill = (sel: string) => document.querySelectorAll(sel).forEach((n) => n.remove());
    kill("script"); kill("style"); kill("noscript");

    // prefer main content if present
    const main = document.querySelector("main") || document.body;
    return main?.innerText || document.body?.innerText || "";
  });

  const title = await page.title().catch(() => "");
  return { title, text: cleanText(String(text || "")) };
}

async function discoverLinks(page: any, baseUrl: string) {
  // pick internal links that look like high-signal pages
  const hrefs: string[] = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    return anchors.map((a) => a.getAttribute("href") || "").filter(Boolean);
  });

  const allowHints = [
    "pricing",
    "features",
    "product",
    "solutions",
    "customers",
    "case",
    "stories",
    "about",
    "company",
    "blog",
    "partners",
    "enterprise",
    "careers",
    "contact",
  ];

  const out: string[] = [];
  for (const h of hrefs) {
    try {
      const abs = new URL(h, baseUrl).toString();
      if (!sameHost(abs, baseUrl)) continue;
      const path = new URL(abs).pathname.toLowerCase();

      // keep it tight: only “interesting” pages, and avoid junk
      if (path === "/" || path.includes("#")) continue;
      if (/(privacy|terms|legal|cookie|sitemap|rss|login|signup|auth)/.test(path)) continue;

      const isInteresting = allowHints.some((k) => path.includes(k));
      if (isInteresting) out.push(abs);
    } catch {}
  }

  // de-dupe + cap
  return Array.from(new Set(out)).slice(0, 8);
}

export async function POST(req: Request) {
  const { brandId } = await req.json();

  const [brand] = await q<any>(`select * from brands where id=$1`, [brandId]);
  if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });

  const startUrl = normalizeUrl(brand.website);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; CreatorGraphCrawler/1.0; +https://example.com)",
  });

  const page = await context.newPage();

  // crawl plan: homepage + discovered links
  const toVisit: string[] = [startUrl];
  const visited = new Set<string>();

  const saved: Array<{ url: string; title: string; chars: number }> = [];

  try {
    // 1) visit homepage
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(800); // small settle for JS sites

    const discovered = await discoverLinks(page, startUrl);
    toVisit.push(...discovered);

    // 2) visit each selected page (cap)
    for (const url of toVisit.slice(0, 6)) {
      if (visited.has(url)) continue;
      visited.add(url);

      // skip if already saved for this brand
      const exists = await q<any>(
        `select 1 from brand_pages where brand_id=$1 and url=$2 limit 1`,
        [brandId, url]
      );
      if (exists?.length) continue;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(500);

        const { title, text } = await extractPageText(page);
        const clipped = text.slice(0, 35_000); // don’t store novels

        if (clipped.length < 400) continue; // too empty, ignore

        await q(
          `insert into brand_pages (id, brand_id, url, title, text, html_len)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (brand_id, url) do nothing`,
          [`bp_${nanoid(10)}`, brandId, url, title || null, clipped, clipped.length]
        );

        saved.push({ url, title: title || "", chars: clipped.length });
      } catch {
        // ignore per-page failures for MVP
      }
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  return NextResponse.json({
    brandId,
    startUrl,
    pages_saved: saved.length,
    saved,
  });
}
