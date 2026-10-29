import { APP_CONSTANTS } from "@/lib/constants";
import type { JobDetails } from "../types";
import type { JobSpyResponse, JobSpySearch } from "./types";
import { mapJobSpyJob } from "./mapper";

const DEFAULT_SERVICE_URL = "http://jobspy:8000";

export function jobSpyServiceUrl(): string {
  return (process.env.JOBSPY_SERVICE_URL || DEFAULT_SERVICE_URL).replace(/\/+$/, "");
}

export type JobSpySearchResult = {
  jobs: JobDetails[];
  // `token` is the search term, so the runner reports failed searches the
  // way it reports unreachable company boards.
  errors: { token: string; reason: string }[];
};

function allFailed(search: JobSpySearch, reason: string): JobSpySearchResult {
  return { jobs: [], errors: search.searchTerms.map((token) => ({ token, reason })) };
}

/**
 * One call to the jobspy-service sidecar, which runs every search term and
 * reports the ones that failed. A service that can't be reached fails every
 * term with the same reason, which the runner turns into a failed run.
 * An abort from `signal` propagates as an AbortError, like the ATS fetches.
 */
export async function searchJobSpy(
  search: JobSpySearch,
  signal?: AbortSignal,
): Promise<JobSpySearchResult> {
  const timeout = AbortSignal.timeout(APP_CONSTANTS.JOBSPY_REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${jobSpyServiceUrl()}/scrape`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(search),
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    const reason = timeout.aborted
      ? "the JobSpy service took too long to respond"
      : "the JobSpy service is not reachable — is the jobspy container running?";
    return allFailed(search, reason);
  }

  if (!res.ok) {
    return allFailed(search, `the JobSpy service returned ${res.status}`);
  }

  let body: JobSpyResponse;
  try {
    body = await res.json();
  } catch {
    return allFailed(search, "the JobSpy service sent an unreadable response");
  }
  if (!Array.isArray(body?.jobs) || !Array.isArray(body?.errors)) {
    return allFailed(search, "the JobSpy service sent an unreadable response");
  }

  return {
    jobs: body.jobs.map(mapJobSpyJob),
    errors: body.errors.map((e) => ({ token: e.searchTerm, reason: e.reason })),
  };
}
