// Shared by the batch runner (server) and the jobs page progress strip.

export const BATCH_MATCH_MAX_JOBS = 100;

export type BatchMatchItemStatus =
  | "pending"
  | "running"
  | "matched"
  | "skipped"
  | "failed"
  | "cancelled";

export interface BatchMatchItem {
  jobId: string;
  title: string;
  company: string;
  status: BatchMatchItemStatus;
  matchScore?: number;
  message?: string;
}

export interface BatchMatchState {
  id: string;
  resumeId: string;
  resumeTitle: string;
  status: "running" | "completed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  cancelRequested: boolean;
  items: BatchMatchItem[];
}

export interface BatchMatchSetup {
  total: number;
  // Already carry an AI match (a pre-rank-only automation score doesn't count).
  scoredCount: number;
  resumes: { id: string; title: string }[];
  suggestedResumeId: string | null;
}

export function countBatchItems(state: BatchMatchState) {
  const count = (s: BatchMatchItemStatus) =>
    state.items.filter((i) => i.status === s).length;
  return {
    total: state.items.length,
    matched: count("matched"),
    skipped: count("skipped"),
    failed: count("failed"),
    cancelled: count("cancelled"),
    done: state.items.filter(
      (i) => i.status !== "pending" && i.status !== "running",
    ).length,
  };
}
