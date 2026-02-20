/* eslint-disable @typescript-eslint/no-explicit-any */
import { nanoid } from "nanoid";
import { q } from "@/lib/db";
import type {
  IdentityRawAccount,
  IdentityResolutionInput,
  IdentityResolutionResult,
  IdentityResolutionStats,
} from "./types";

const SOCIAL_DOMAINS = new Set([
  "x.com",
  "twitter.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "stan.store",
]);

const EXCLUDED_DISCOVERY_DOMAINS = new Set([
  "google.com",
  "serpapi.com",
  "gstatic.com",
  "ytimg.com",
]);

function initStats(): IdentityResolutionStats {
  return {
    processed: 0,
    createdIdentities: 0,
    mergedByStanSlug: 0,
    mergedByPersonalDomain: 0,
    mergedByCrossLink: 0,
    alreadyLinked: 0,
    queuedCandidates: 0,
  };
}

function normalizeDomain(raw: string | null): string | null {
  if (!raw) return null;
  const host = raw.toLowerCase().replace(/^www\./, "").trim();
  if (!host || !host.includes(".")) return null;
  return host;
}

function urlHost(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    return normalizeDomain(new URL(rawUrl).hostname);
  } catch {
    return null;
  }
}

function extractUrlsFromText(input: string): string[] {
  return Array.from(
    new Set(
      (input.match(/https?:\/\/[^\s)]+/gi) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""))
    )
  );
}

function extractStanSlugFromText(input: string): string | null {
  const m = input.match(/stan\.store\/([a-zA-Z0-9._-]+)/i);
  if (!m?.[1]) return null;
  return m[1].toLowerCase();
}

function extractPersonalDomainFromText(input: string): string | null {
  const urls = extractUrlsFromText(input);
  for (const u of urls) {
    const h = urlHost(u);
    if (!h || SOCIAL_DOMAINS.has(h) || EXCLUDED_DISCOVERY_DOMAINS.has(h)) continue;
    return h;
  }

  const bare = input.match(/\b([a-z0-9-]+\.[a-z]{2,})(?:\/[^\s]*)?/i);
  if (!bare?.[1]) return null;
  const host = normalizeDomain(bare[1]);
  if (!host || SOCIAL_DOMAINS.has(host) || EXCLUDED_DISCOVERY_DOMAINS.has(host)) return null;
  return host;
}

function resolveCrossLinks(account: IdentityRawAccount): {
  stanSlug: string | null;
  personalDomain: string | null;
} {
  const chunks = [
    account.title ?? "",
    account.snippet ?? "",
    typeof account.raw === "string" ? account.raw : JSON.stringify(account.raw ?? {}),
  ].join("\n");

  return {
    stanSlug: extractStanSlugFromText(chunks),
    personalDomain: extractPersonalDomainFromText(chunks),
  };
}

async function findIdentityByStanSlug(stanSlug: string) {
  const rows = await q<{ id: string }>(
    `select id from creator_identities where canonical_stan_slug=$1 limit 1`,
    [stanSlug]
  );
  return rows[0]?.id ?? null;
}

async function findIdentityByDomain(domain: string) {
  const rows = await q<{ id: string }>(
    `select id from creator_identities where canonical_personal_domain=$1 limit 1`,
    [domain]
  );
  return rows[0]?.id ?? null;
}

async function createIdentity(args: {
  stanSlug?: string | null;
  personalDomain?: string | null;
}) {
  const id = `ci_${nanoid(10)}`;
  try {
    await q(
      `insert into creator_identities (id, canonical_stan_slug, canonical_personal_domain)
       values ($1,$2,$3)`,
      [id, args.stanSlug ?? null, args.personalDomain ?? null]
    );
    return id;
  } catch (err: any) {
    if (String(err?.code) !== "23505") throw err;

    if (args.stanSlug) {
      const existing = await findIdentityByStanSlug(args.stanSlug);
      if (existing) return existing;
    }
    if (args.personalDomain) {
      const existing = await findIdentityByDomain(args.personalDomain);
      if (existing) return existing;
    }

    throw err;
  }
}

async function linkAccount(args: {
  identityId: string;
  account: IdentityRawAccount;
  linkageReason: string;
  personalDomain: string | null;
}) {
  await q(
    `insert into creator_identity_accounts (
       id, creator_identity_id, raw_account_id, platform, handle,
       normalized_profile_url, source_url, stan_slug, personal_domain, linkage_reason
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (raw_account_id) do nothing`,
    [
      `cia_${nanoid(10)}`,
      args.identityId,
      args.account.id,
      args.account.platform ?? null,
      args.account.handle ?? null,
      args.account.normalized_profile_url ?? null,
      args.account.source_url,
      args.account.stan_slug ?? null,
      args.personalDomain ?? null,
      args.linkageReason,
    ]
  );
}

async function queueCandidate(args: {
  account: IdentityRawAccount;
  reason: string;
  candidateIdentityId?: string | null;
  confidence?: number;
  meta?: unknown;
}) {
  await q(
    `insert into identity_merge_candidates (
       id, raw_account_id, discovery_run_id, candidate_identity_id, reason, confidence, meta
     )
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)
     on conflict (raw_account_id) do update set
       candidate_identity_id = excluded.candidate_identity_id,
       reason = excluded.reason,
       confidence = excluded.confidence,
       meta = excluded.meta`,
    [
      `imc_${nanoid(10)}`,
      args.account.id,
      args.account.discovery_run_id,
      args.candidateIdentityId ?? null,
      args.reason,
      args.confidence ?? 0.5,
      JSON.stringify(args.meta ?? {}),
    ]
  );
}

async function findCandidateByHandle(account: IdentityRawAccount) {
  if (!account.handle) return null;
  const rows = await q<{ creator_identity_id: string }>(
    `select creator_identity_id
     from creator_identity_accounts
     where handle=$1 and platform<>$2
     order by created_at desc
     limit 1`,
    [account.handle, account.platform ?? "unknown"]
  );
  return rows[0]?.creator_identity_id ?? null;
}

async function fetchAccounts(input: IdentityResolutionInput): Promise<IdentityRawAccount[]> {
  const params: any[] = [];
  let where = "";

  if (input.discoveryRunId) {
    params.push(input.discoveryRunId);
    where = `where ra.discovery_run_id=$${params.length}`;
  }

  params.push(input.limit ?? 500);
  const limitRef = `$${params.length}`;

  return q<IdentityRawAccount>(
    `select
       ra.id, ra.discovery_run_id, ra.source_url, ra.normalized_profile_url,
       ra.platform, ra.handle, ra.stan_slug, ra.title, ra.snippet, ra.raw
     from raw_accounts ra
     left join creator_identity_accounts cia on cia.raw_account_id = ra.id
     ${where}${where ? " and" : "where"} cia.raw_account_id is null
     order by ra.created_at asc
     limit ${limitRef}`,
    params
  );
}

export async function resolveIdentities(
  input: IdentityResolutionInput = {}
): Promise<IdentityResolutionResult> {
  const stats = initStats();
  const accounts = await fetchAccounts(input);

  for (const account of accounts) {
    stats.processed += 1;

    const cross = resolveCrossLinks(account);
    const directStanSlug = account.stan_slug?.toLowerCase() ?? null;
    const crossStanSlug = cross.stanSlug?.toLowerCase() ?? null;
    const directDomain = extractPersonalDomainFromText(account.source_url);
    const crossDomain = cross.personalDomain;

    const stanSlug = directStanSlug ?? crossStanSlug;
    const personalDomain = directDomain ?? crossDomain;

    let identityId: string | null = null;
    let linkageReason = "";

    if (stanSlug) {
      identityId = await findIdentityByStanSlug(stanSlug);
      if (!identityId) {
        identityId = await createIdentity({ stanSlug, personalDomain: personalDomain ?? null });
        stats.createdIdentities += 1;
      }
      linkageReason = directStanSlug ? "stan_slug" : "cross_link_stan_slug";
      if (directStanSlug) stats.mergedByStanSlug += 1;
      else stats.mergedByCrossLink += 1;
    } else if (personalDomain) {
      identityId = await findIdentityByDomain(personalDomain);
      if (!identityId) {
        identityId = await createIdentity({ personalDomain });
        stats.createdIdentities += 1;
      }
      linkageReason = directDomain ? "personal_domain" : "cross_link_personal_domain";
      if (directDomain) stats.mergedByPersonalDomain += 1;
      else stats.mergedByCrossLink += 1;
    }

    if (identityId) {
      await linkAccount({
        identityId,
        account,
        linkageReason,
        personalDomain: personalDomain ?? null,
      });
      continue;
    }

    const candidateIdentityId = await findCandidateByHandle(account);
    await queueCandidate({
      account,
      reason: "missing deterministic anchor (stan_slug/personal_domain/cross-link)",
      candidateIdentityId,
      confidence: candidateIdentityId ? 0.55 : 0.3,
      meta: { handle: account.handle, platform: account.platform },
    });
    stats.queuedCandidates += 1;
  }

  const alreadyLinkedRows = await q<{ c: number }>(
    `select count(*)::int as c
     from raw_accounts ra
     join creator_identity_accounts cia on cia.raw_account_id = ra.id
     ${input.discoveryRunId ? "where ra.discovery_run_id=$1" : ""}`,
    input.discoveryRunId ? [input.discoveryRunId] : []
  );
  stats.alreadyLinked = alreadyLinkedRows[0]?.c ?? 0;

  return {
    discoveryRunId: input.discoveryRunId ?? null,
    stats,
  };
}
