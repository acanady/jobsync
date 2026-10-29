import type { JobBoard, SearchBoard } from "@/models/automation.model";
import type { JobDetails } from "../types";
import type { JobSpySearch } from "../jobspy/types";

// `host` is optional and Lever-only (Greenhouse ignores it); it's persisted
// once a company is resolved so runtime fetches never re-probe regions.
export type AtsHost = "default" | "eu";

export interface AtsProvider {
  id: JobBoard;
  label: string; // display name shown in the wizard/detail UI
  // Fetch a watchlist with bounded concurrency + per-token isolation.
  search(
    companies: { name: string; token: string; host?: AtsHost }[],
  ): Promise<{
    jobs: JobDetails[];
    errors: { token: string; reason: string }[];
  }>;
}

// A source that searches by keyword (JobSpy) rather than fetching company
// boards. Errors are keyed by search term in `token`, matching AtsProvider.
export interface SearchProvider {
  id: SearchBoard;
  label: string;
  search(
    search: JobSpySearch,
    signal?: AbortSignal,
  ): Promise<{
    jobs: JobDetails[];
    errors: { token: string; reason: string }[];
  }>;
}

// What an automation run fetches from: company boards or a search.
export type RunSource =
  | { kind: "boards"; provider: AtsProvider }
  | { kind: "search"; provider: SearchProvider };
