// Automation types and interfaces

export type AutomationStatus = "active" | "paused";
export type AutomationRunStatus =
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "completed_with_errors"
  | "blocked"
  | "rate_limited"
  | "cancelled";
export type DiscoveryStatus = "new" | "accepted" | "dismissed";
export type JobBoard = "greenhouse" | "lever" | "ashby";
// Sources that search by keyword instead of watching a list of companies.
// JobSpy is the fork's sidecar (jobspy-service/) scraping Indeed.
export type SearchBoard = "jobspy";
// Every source an automation can run on.
export type AutomationBoard = JobBoard | SearchBoard;

export interface GreenhouseCompany {
  name: string;
  token: string;
}

export interface GreenhouseSourceConfig {
  companies: GreenhouseCompany[];
  targetTitles?: string[];
  keywords?: string[];
  excludeTitles?: string[];
  locations?: string[];
  strictLocation?: boolean;
  remoteUsOnly?: boolean;
  topK?: number;
  saveUnanalyzed?: boolean;
}

export type LeverHost = "default" | "eu";

export interface LeverCompany {
  name: string;
  token: string;
  host?: LeverHost; // absent/"default" = the common case
}

// Field-identical to Greenhouse except `companies` carries the extra `host`.
export interface LeverSourceConfig
  extends Omit<GreenhouseSourceConfig, "companies"> {
  companies: LeverCompany[];
}

// Ashby has a single global host, so its company entries are the plain
// {name, token} shape — no `host`, unlike Lever.
export interface AshbyCompany {
  name: string;
  token: string;
}

export interface AshbySourceConfig
  extends Omit<GreenhouseSourceConfig, "companies"> {
  companies: AshbyCompany[];
}

export interface SourceConfig {
  greenhouse?: GreenhouseSourceConfig;
  lever?: LeverSourceConfig;
  ashby?: AshbySourceConfig;
  jobspy?: JobSpySourceConfig;
}

export type JobSpySite = "indeed";

// No companies: one JobSpy search per term. The targeting fields (titles,
// keywords, exclusions, locations, remote-US, topK) are the ATS ones and run
// through the same pipeline after the search.
export interface JobSpySourceConfig
  extends Omit<GreenhouseSourceConfig, "companies"> {
  // What to search Indeed for; when absent, the target titles are used.
  searchTerms?: string[];
  sites?: JobSpySite[];
  location?: string; // e.g. "United States"
  hoursOld?: number; // only postings this recent
  resultsPerTerm?: number;
}

// Plain, dependency-free board list. Do NOT import this from ats/registry.ts
// (that pulls the network-calling search fns into client bundles). Both the
// client-imported schema and the scheduler import it here.
export const ATS_BOARDS: JobBoard[] = ["greenhouse", "lever", "ashby"];
export const SEARCH_BOARDS: SearchBoard[] = ["jobspy"];
// What the scheduler runs. ATS_BOARDS stays the company-board list (the
// Companies page and board pickers iterate it).
export const AUTOMATION_BOARDS: AutomationBoard[] = [...ATS_BOARDS, ...SEARCH_BOARDS];
export function isSearchBoard(board: string): board is SearchBoard {
  return (SEARCH_BOARDS as string[]).includes(board);
}

// Display names, safe for client components (ats/registry.ts is server-only).
export const AUTOMATION_BOARD_LABELS: Record<AutomationBoard, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  jobspy: "Indeed (JobSpy)",
};

// A retired board's raw value is shown as-is.
export function automationBoardLabel(board: string): string {
  return Object.hasOwn(AUTOMATION_BOARD_LABELS, board)
    ? AUTOMATION_BOARD_LABELS[board as AutomationBoard]
    : board;
}

// Boards that used to exist and were removed. Their Automation rows stay in
// the database; the UI marks them retired and only offers pause/delete.
export const RETIRED_BOARDS = ["jsearch"];
export function isRetiredBoard(board: string): boolean {
  return RETIRED_BOARDS.includes(board);
}

export interface Automation {
  id: string;
  userId: string;
  name: string;
  jobBoard: AutomationBoard;
  keywords: string;
  location: string;
  sourceConfig?: string | null;
  resumeId: string;
  matchThreshold: number;
  scheduleHour: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  status: AutomationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationWithResume extends Automation {
  resume: {
    id: string;
    title: string;
  };
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  jobsSearched: number;
  jobsDeduplicated: number;
  jobsProcessed: number;
  jobsMatched: number;
  jobsSaved: number;
  status: AutomationRunStatus;
  errorMessage: string | null;
  blockedReason: string | null;
  funnelStats: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface DiscoveredJob {
  id: string;
  userId: string;
  automationId: string;
  automation?: {
    id: string;
    name: string;
  };
  jobUrl: string | null;
  description: string;
  jobType: string;
  workplaceType?: string | null;
  createdAt: Date;
  jobTitleId: string;
  companyId: string;
  locationId: string | null;
  matchScore: number;
  matchData: string | null;
  discoveryStatus: DiscoveryStatus;
  discoveredAt: Date;
  JobTitle: { label: string };
  Company: { label: string };
  Location?: { label: string } | null;
}

export interface ScrapedJobData {
  title: string;
  company: string;
  location: string;
  description: string;
  sourceUrl: string;
  sourceBoard: AutomationBoard;
  // The job site a search source found it on ("Indeed"), used as the job's
  // Source instead of the board name.
  sourceSite?: string;
  salaryRange?: string;
  employmentType?: string;
  isRemote?: boolean;
  workplaceType?: string;
}
