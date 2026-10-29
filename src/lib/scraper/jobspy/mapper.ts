import type { JobDetails } from "../types";
import type { JobSpyJob, JobSpySalary } from "./types";

const SITE_LABELS: Record<string, string> = {
  indeed: "Indeed",
  linkedin: "LinkedIn",
  glassdoor: "Glassdoor",
  zip_recruiter: "ZipRecruiter",
};

const INTERVAL_SUFFIX: Record<string, string> = {
  yearly: "/yr",
  monthly: "/mo",
  weekly: "/wk",
  daily: "/day",
  hourly: "/hr",
};

function money(amount: number, symbol: string): string {
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${symbol}${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${symbol}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

// "$120k–$150k/yr", "$45/hr", "from $90k/yr". Non-USD amounts carry their
// currency code, since the symbol would be a guess.
export function formatSalary(salary: JobSpySalary | null): string | undefined {
  if (!salary || (salary.min == null && salary.max == null)) return undefined;
  const usd = !salary.currency || salary.currency.toUpperCase() === "USD";
  const symbol = usd ? "$" : "";
  const code = usd ? "" : ` ${salary.currency!.toUpperCase()}`;
  const suffix = salary.interval ? (INTERVAL_SUFFIX[salary.interval] ?? "") : "";
  const { min, max } = salary;
  let range: string;
  if (min != null && max != null && min !== max) range = `${money(min, symbol)}–${money(max, symbol)}`;
  else if (min != null && max != null) range = money(min, symbol);
  else if (min != null) range = `from ${money(min, symbol)}`;
  else range = `up to ${money(max!, symbol)}`;
  return `${range}${suffix}${code}`;
}

export function siteLabel(site: string): string {
  return SITE_LABELS[site] ?? site;
}

export function mapJobSpyJob(job: JobSpyJob): JobDetails {
  return {
    title: job.title.trim(),
    company: job.company.trim(),
    location: job.location,
    description: job.description,
    // The employer's posting when Indeed had it (with grnh.se links already
    // resolved by the service), so dedup can match the ATS job.
    url: job.url,
    postedDate: job.postedDate ?? undefined,
    salary: formatSalary(job.salary),
    employmentType: job.jobType ?? undefined,
    isRemote: job.isRemote ?? undefined,
    // Indeed's remote flag is about the role; its location is often the
    // company's office ("San Francisco, CA, USA"). Marking it REMOTE lets the
    // remote-US filter judge the country from that location instead of
    // dropping it for not saying "remote".
    workplaceType: job.isRemote ? "REMOTE" : undefined,
    site: siteLabel(job.site),
  };
}
