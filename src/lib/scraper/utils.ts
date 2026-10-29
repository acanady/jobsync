import type { ScraperError } from "./types";
import { canonicalizeEntityValue } from "@/lib/jobs/canonicalize";

// Allowlist for ATS board tokens (shared by every ATS provider). Rejects
// path/query injection before the token is interpolated into a fetch URL.
export const ATS_TOKEN_REGEX = /^[a-z0-9][a-z0-9_-]{1,79}$/;

// Human-readable reason for a per-board fetch failure. Shared by both ATS
// providers so the runner logs a consistent label.
export function errorReason(error: ScraperError): string {
  switch (error.type) {
    case "blocked":
      return error.reason;
    case "rate_limited":
      return "rate limited";
    case "network":
    case "parse":
      return error.message;
  }
}

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "fbclid",
  "gclid",
  "msclkid",
  "tk",
  "from",
  "vjk",
  "gh_src",
];

// Normalizes a URL for storage/clicking: only touches things that never change
// which resource the URL points to (tracking params, fragment, param order,
// trailing slash). Deliberately keeps host/protocol/www intact so the stored
// link stays valid.
export function normalizeJobUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    TRACKING_PARAMS.forEach((param) => {
      parsed.searchParams.delete(param);
    });
    parsed.searchParams.sort();
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// Greenhouse, Lever and Ashby each give a posting a globally unique id, but
// the same posting reaches JobSync under several URLs: boards. vs
// job-boards.greenhouse.io, the EU hosts, a company careers page carrying
// ?gh_jid=, Lever's /apply suffix, and the links job sites like Indeed hand
// out. Keying these by board + id makes every variant one job.
const GREENHOUSE_HOST = /^(job-)?boards(\.eu)?\.greenhouse\.io$/;
const LEVER_HOST = /^jobs(\.eu)?\.lever\.co$/;
const ASHBY_HOST = /^jobs\.ashbyhq\.com$/;
const ATS_KEY = /^(greenhouse|lever|ashby):/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function atsPostingKey(parsed: URL, host: string): string | null {
  const segments = parsed.pathname.split("/").filter(Boolean);
  const ghJid = parsed.searchParams.get("gh_jid");
  // ?gh_jid= is Greenhouse's id on any host, including company careers pages.
  if (ghJid && /^\d+$/.test(ghJid)) return `greenhouse:${ghJid}`;
  if (GREENHOUSE_HOST.test(host)) {
    // /{board}/jobs/{id}, or the embed form ?for={board}&token={id}
    const jobsAt = segments.indexOf("jobs");
    const id = jobsAt >= 0 ? segments[jobsAt + 1] : parsed.searchParams.get("token");
    return id && /^\d+$/.test(id) ? `greenhouse:${id}` : null;
  }
  if (LEVER_HOST.test(host)) {
    // /{company}/{uuid} or /{company}/{uuid}/apply
    return segments[1] && UUID.test(segments[1]) ? `lever:${segments[1].toLowerCase()}` : null;
  }
  if (ASHBY_HOST.test(host)) {
    // /{org}/{uuid} or /{org}/{uuid}/application
    return segments[1] && UUID.test(segments[1]) ? `ashby:${segments[1].toLowerCase()}` : null;
  }
  return null;
}

// Aggressive canonical form used only as a dedup comparison key (never stored
// or clicked), so it can safely fold host case and a leading "www.".
function urlDedupeKey(url: string): string {
  try {
    const parsed = new URL(normalizeJobUrl(url));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return atsPostingKey(parsed, host) ?? `${host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

interface DedupableJob {
  url?: string | null;
  title?: string;
  company?: string;
  location?: string;
}

// Uses the same canonicalization as entity resolution (resolve.ts) — in
// particular the company legal-suffix stripping — so two postings that
// resolve to the same Company/JobTitle/Location record also dedupe as the
// same job.
function metaDedupeKey(job: DedupableJob): string {
  const meta = [
    canonicalizeEntityValue(job.title ?? ""),
    canonicalizeEntityValue(job.company ?? "", { stripLegalSuffix: true }),
    canonicalizeEntityValue(job.location ?? ""),
  ].join("|");
  return `meta:${meta}`;
}

// A job's primary key: its URL when it has one, else a title/company/location
// signature (otherwise linkless jobs re-add every run). Single-URL lookups
// (add_job, find_job) compare on this.
export function jobDedupeKey(job: DedupableJob): string {
  const url = job.url?.trim();
  if (url) return `url:${urlDedupeKey(url)}`;
  return metaDedupeKey(job);
}

// The keys a job is registered under (`own`) and the keys that, if already
// registered by another job, make it a duplicate (`probes`). A URL-bearing
// job is matched on its URL, and also on its title/company/location
// signature, because one posting found on Indeed and on the employer's ATS
// carries two unrelated URLs.
//
// The signature never merges two ATS postings: their board ids are
// authoritative, and about 2% of real Greenhouse postings share a title and
// location with a different opening. So ATS jobs register the signature only
// as `any`, job-site jobs also as `loose`, and an ATS job probes only `loose`
// — it matches a job-site listing, never another ATS id.
//
// Linkless jobs keep their single meta: key, unchanged.
export function jobDedupeKeySets(job: DedupableJob): { own: string[]; probes: string[] } {
  const primary = jobDedupeKey(job);
  if (!primary.startsWith("url:") || !job.title?.trim() || !job.company?.trim()) {
    return { own: [primary], probes: [primary] };
  }
  const signature = metaDedupeKey(job).slice("meta:".length);
  const fromAts = ATS_KEY.test(primary.slice("url:".length));
  const any = `sig-any:${signature}`;
  const loose = `sig-loose:${signature}`;
  return fromAts
    ? { own: [primary, any], probes: [primary, loose] }
    : { own: [primary, any, loose], probes: [primary, any] };
}

// Removes jobs already saved (existingKeys) and collapses duplicates within the
// batch itself, matching on any of a job's keys. Every automation source
// path runs through here.
// Accepts any key lookup with `.has` so callers can pass a Set or the
// getExistingJobDedupeMap Map directly.
export function dedupeJobs<T extends DedupableJob>(
  jobs: T[],
  existingKeys: { has(key: string): boolean },
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const job of jobs) {
    const { own, probes } = jobDedupeKeySets(job);
    if (probes.some((key) => existingKeys.has(key) || seen.has(key))) continue;
    own.forEach((key) => seen.add(key));
    result.push(job);
  }
  return result;
}
