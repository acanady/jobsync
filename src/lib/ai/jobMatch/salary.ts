import type { SuggestedSalary } from "@/models/ai.schemas";

// Isomorphic like parse.ts: the prompts, the parser and the job page share it.

export const SALARY_LINE_SPEC =
  "SALARY: low=<number> high=<number> currency=<ISO code> period=<year|hour> basis=<posted|estimated>";

// One instruction block for every prompt that asks for the line, so the
// in-app, automation and MCP matches suggest salaries the same way.
export const SALARY_LINE_INSTRUCTIONS = `The SECOND line MUST be the salary line, in this exact format:

${SALARY_LINE_SPEC}

It is the pay range this candidate should target for this job:
- If the job description states a pay range, use basis=posted and choose a target range inside the posted range: toward the top for a strong match, toward the bottom for a weak one.
- If it states no pay, use basis=estimated and estimate the typical range for this role, seniority and location (US remote if none is given), adjusted for the candidate's level.
- Write whole numbers with no commas, symbols or "k" (e.g. low=135000 high=150000). Use period=hour only when the job pays hourly.`;

const SALARY_RE =
  /^[ \t]*SALARY:\s*low=\$?([\d,.]+)(k?)\s+high=\$?([\d,.]+)(k?)\s+currency=([A-Za-z]{3})\s+period=(year|yr|annual|hour|hr)\s+basis=(posted|estimated)\b[^\n]*/im;

// Any line starting SALARY:, complete or still streaming.
export const SALARY_LINE_RE = /^[ \t]*SALARY:[^\n]*(\n|$)/im;

const BOUNDS = {
  year: { min: 10_000, max: 2_000_000 },
  hour: { min: 5, max: 2_000 },
};

function amount(digits: string, k: string): number {
  const n = Number(digits.replace(/,/g, ""));
  return Math.round(k ? n * 1000 : n);
}

/** Reads the SALARY line, or undefined when it is missing or implausible. */
export function parseSalaryLine(text: string): SuggestedSalary | undefined {
  const m = text.match(SALARY_RE);
  if (!m) return undefined;
  const period = m[6].toLowerCase().startsWith("h") ? "hour" : "year";
  const low = amount(m[1], m[2]);
  const high = amount(m[3], m[4]);
  const { min, max } = BOUNDS[period];
  if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
  if (low < min || high > max || low > high || high > low * 4) return undefined;
  return {
    low,
    high,
    currency: m[5].toUpperCase(),
    period,
    basis: m[7].toLowerCase() as SuggestedSalary["basis"],
  };
}

const SYMBOLS: Record<string, string> = { USD: "$", CAD: "CA$", EUR: "€", GBP: "£" };

function short(n: number, period: SuggestedSalary["period"]): string {
  if (period === "hour") return String(Math.round(n));
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

/** "$135k–$150k/yr", "$65–$80/hr", "AUD 120k–140k/yr". */
export function formatSuggestedSalary(s: SuggestedSalary): string {
  const sym = SYMBOLS[s.currency];
  const unit = s.period === "hour" ? "/hr" : "/yr";
  const lo = short(s.low, s.period);
  const hi = short(s.high, s.period);
  const range = sym ? `${sym}${lo}–${sym}${hi}` : `${s.currency} ${lo}–${hi}`;
  return `${range}${unit}`;
}
