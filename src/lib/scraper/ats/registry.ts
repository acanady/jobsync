import type { AutomationBoard, JobBoard, SearchBoard } from "@/models/automation.model";
import { searchGreenhouseJobs } from "../greenhouse";
import { searchJobSpy } from "../jobspy";
import { searchLeverJobs } from "../lever";
import { searchAshbyJobs } from "../ashby";
import type { AtsProvider, RunSource, SearchProvider } from "./types";

// Server-only: imports the real network-calling search fns (fetch, p-limit).
// Never import this from client-bundled code — use ATS_BOARDS from
// automation.model.ts for the plain, dependency-free board list.
export const ATS_PROVIDERS: Partial<Record<JobBoard, AtsProvider>> = {
  greenhouse: {
    id: "greenhouse",
    label: "Greenhouse",
    search: searchGreenhouseJobs,
  },
  lever: { id: "lever", label: "Lever", search: searchLeverJobs },
  ashby: { id: "ashby", label: "Ashby", search: searchAshbyJobs },
};

export const SEARCH_PROVIDERS: Record<SearchBoard, SearchProvider> = {
  jobspy: { id: "jobspy", label: "Indeed (JobSpy)", search: searchJobSpy },
};

// The run source for an automation's board, or undefined for a board that no
// longer exists (a retired one left on an old row).
export function runSourceFor(board: string): RunSource | undefined {
  // Own keys only: the value comes from the database, and "toString" would
  // otherwise find Object.prototype's.
  if (Object.hasOwn(SEARCH_PROVIDERS, board)) {
    return { kind: "search", provider: SEARCH_PROVIDERS[board as SearchBoard] };
  }
  if (Object.hasOwn(ATS_PROVIDERS, board)) {
    const ats = ATS_PROVIDERS[board as JobBoard];
    if (ats) return { kind: "boards", provider: ats };
  }
  return undefined;
}

export function boardLabel(board: AutomationBoard | string): string {
  return runSourceFor(board)?.provider.label ?? board;
}
