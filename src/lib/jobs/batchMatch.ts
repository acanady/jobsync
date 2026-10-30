import "server-only";

import { automationLogger } from "@/lib/automation-logger";
import {
  matchStoredJob,
  storedMatchFailureMessage,
  type StoredMatchOutcome,
} from "@/lib/ai/jobMatch/matchStoredJob";
import type {
  BatchMatchItem,
  BatchMatchState,
} from "@/models/batchMatch.model";

export interface BatchMatchJob {
  jobId: string;
  title: string;
  company: string;
  automationId: string | null;
}

export interface StartBatchInput {
  userId: string;
  resumeId: string;
  resumeTitle: string;
  jobs: BatchMatchJob[];
}

type Matcher = typeof matchStoredJob;

// The AI is likely down or misconfigured after this many failures in a row;
// the rest of the batch is skipped instead of failing one by one.
export const MAX_CONSECUTIVE_FAILURES = 3;
const RETENTION_MS = 1000 * 60 * 60;

interface Entry {
  state: BatchMatchState;
  controller: AbortController;
  automationIds: (string | null)[];
}

/**
 * One batch per user, matched one job at a time — a local model serializes
 * on the GPU anyway, and back to back keeps the chat usable alongside it.
 * State is in memory: a restart ends the batch, but every job matched before
 * it keeps its saved score.
 */
export class BatchMatchService {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly matcher: Matcher = matchStoredJob,
    private readonly isAutomationRunning: (id: string) => boolean = (id) =>
      automationLogger.isRunning(id),
  ) {}

  get(userId: string): BatchMatchState | null {
    const entry = this.entries.get(userId);
    return entry ? structuredClone(entry.state) : null;
  }

  isRunning(userId: string): boolean {
    return this.entries.get(userId)?.state.status === "running";
  }

  /** Starts the batch and returns at once; the matching runs on. */
  start(
    input: StartBatchInput,
  ): { ok: true; state: BatchMatchState } | { ok: false; reason: "busy" } {
    if (this.isRunning(input.userId)) return { ok: false, reason: "busy" };
    const entry = this.create(input);
    void this.process(entry, input.userId);
    return { ok: true, state: structuredClone(entry.state) };
  }

  /** start() that resolves once the batch has finished — for tests. */
  async runToEnd(input: StartBatchInput): Promise<BatchMatchState> {
    if (this.isRunning(input.userId)) throw new Error("busy");
    const entry = this.create(input);
    await this.process(entry, input.userId);
    return structuredClone(entry.state);
  }

  cancel(userId: string): boolean {
    const entry = this.entries.get(userId);
    if (!entry || entry.state.status !== "running") return false;
    entry.state.cancelRequested = true;
    entry.controller.abort();
    return true;
  }

  /** Forgets a finished batch so its summary stops showing. */
  clear(userId: string): boolean {
    if (this.isRunning(userId)) return false;
    return this.entries.delete(userId);
  }

  private create(input: StartBatchInput): Entry {
    const entry: Entry = {
      controller: new AbortController(),
      automationIds: input.jobs.map((j) => j.automationId),
      state: {
        id: crypto.randomUUID(),
        resumeId: input.resumeId,
        resumeTitle: input.resumeTitle,
        status: "running",
        startedAt: new Date().toISOString(),
        cancelRequested: false,
        items: input.jobs.map(
          (j): BatchMatchItem => ({
            jobId: j.jobId,
            title: j.title,
            company: j.company,
            status: "pending",
          }),
        ),
      },
    };
    this.entries.set(input.userId, entry);
    return entry;
  }

  private async process(entry: Entry, userId: string): Promise<void> {
    const { state, controller } = entry;
    let failuresInRow = 0;

    for (const [i, item] of state.items.entries()) {
      if (controller.signal.aborted) {
        item.status = "cancelled";
        continue;
      }
      if (failuresInRow >= MAX_CONSECUTIVE_FAILURES) {
        item.status = "skipped";
        item.message = "Stopped after repeated AI errors";
        continue;
      }
      const automationId = entry.automationIds[i];
      if (automationId && this.isAutomationRunning(automationId)) {
        item.status = "skipped";
        item.message = "Its automation is running";
        continue;
      }

      item.status = "running";
      let outcome: StoredMatchOutcome;
      try {
        outcome = await this.matcher({
          userId,
          jobId: item.jobId,
          resumeId: state.resumeId,
          feature: "job_match",
          surface: "batch",
          signal: controller.signal,
        });
      } catch (error) {
        outcome = {
          status: "failed",
          message: error instanceof Error ? error.message : "AI matching failed",
        };
      }

      switch (outcome.status) {
        case "ok":
          item.status = "matched";
          item.matchScore = outcome.matchScore;
          failuresInRow = 0;
          break;
        case "aborted":
          item.status = "cancelled";
          break;
        case "job_not_found":
          item.status = "skipped";
          item.message = "The job was deleted";
          break;
        case "unreadable":
          item.status = "skipped";
          item.message = storedMatchFailureMessage(outcome);
          break;
        default:
          item.status = "failed";
          item.message = storedMatchFailureMessage(outcome);
          failuresInRow++;
      }
    }

    state.status = state.cancelRequested ? "cancelled" : "completed";
    state.finishedAt = new Date().toISOString();

    // Forget the summary after a while unless a newer batch replaced it.
    setTimeout(() => {
      if (this.entries.get(userId) === entry) this.entries.delete(userId);
    }, RETENTION_MS).unref?.();
  }
}

// One instance on globalThis, like automationLogger: Next can load this
// module into more than one route bundle, and the cancel action must reach
// the instance that is running the batch.
const globalForBatch = globalThis as typeof globalThis & {
  batchMatchGlobal?: BatchMatchService;
};

export const batchMatch =
  globalForBatch.batchMatchGlobal ?? new BatchMatchService();

globalForBatch.batchMatchGlobal = batchMatch;
