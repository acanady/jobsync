"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { requireUser } from "../shared";
import { batchMatch } from "@/lib/jobs/batchMatch";
import {
  BATCH_MATCH_MAX_JOBS,
  type BatchMatchSetup,
  type BatchMatchState,
} from "@/models/batchMatch.model";

type Result<T> = { success: true; data: T } | { success: false; message: string };

const fail = (error: unknown, msg: string) =>
  handleError(error, msg) as { success: false; message: string };

// A job counts as scored only once an AI match ran: automation jobs saved
// below the top-K carry a pre-rank score with analyzed: false.
function hasAiMatch(job: { matchScore: number | null; matchData: string | null }) {
  if (job.matchScore == null) return false;
  try {
    return JSON.parse(job.matchData ?? "{}").analyzed !== false;
  } catch {
    return true;
  }
}

function checkIds(jobIds: unknown): string[] | string {
  if (!Array.isArray(jobIds) || jobIds.some((id) => typeof id !== "string")) {
    return "Invalid job selection";
  }
  const ids = [...new Set(jobIds as string[])];
  if (ids.length === 0) return "Select at least one job";
  if (ids.length > BATCH_MATCH_MAX_JOBS) {
    return `Select at most ${BATCH_MATCH_MAX_JOBS} jobs per batch`;
  }
  return ids;
}

/** What the batch dialog needs: resumes, a suggested one, and counts. */
export async function getBatchMatchSetup(
  jobIds: string[],
): Promise<Result<BatchMatchSetup>> {
  try {
    const user = await requireUser();
    const ids = checkIds(jobIds);
    if (typeof ids === "string") return { success: false, message: ids };

    const [jobs, resumes, owner] = await Promise.all([
      prisma.job.findMany({
        where: { id: { in: ids }, userId: user.id },
        select: {
          matchScore: true,
          matchData: true,
          resumeId: true,
          automation: { select: { resumeId: true } },
        },
      }),
      prisma.resume.findMany({
        where: { profile: { userId: user.id } },
        select: { id: true, title: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { defaultResumeId: true },
      }),
    ]);

    // The resume most selected jobs were matched or found with, else the
    // user's default, else the most recently updated.
    const known = new Set(resumes.map((r) => r.id));
    const votes = new Map<string, number>();
    for (const job of jobs) {
      let id = job.automation?.resumeId ?? job.resumeId;
      try {
        id = JSON.parse(job.matchData ?? "{}").resumeId ?? id;
      } catch {}
      if (id && known.has(id)) votes.set(id, (votes.get(id) ?? 0) + 1);
    }
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const fallback =
      owner?.defaultResumeId && known.has(owner.defaultResumeId)
        ? owner.defaultResumeId
        : (resumes[0]?.id ?? null);

    return {
      success: true,
      data: {
        total: jobs.length,
        scoredCount: jobs.filter(hasAiMatch).length,
        resumes,
        suggestedResumeId: top ?? fallback,
      },
    };
  } catch (error) {
    return fail(error, "Failed to prepare AI matching.");
  }
}

export async function startBatchMatch(input: {
  jobIds: string[];
  resumeId: string;
  skipScored: boolean;
}): Promise<Result<BatchMatchState>> {
  try {
    const user = await requireUser();
    const ids = checkIds(input?.jobIds);
    if (typeof ids === "string") return { success: false, message: ids };
    if (batchMatch.isRunning(user.id)) {
      return { success: false, message: "A batch is already matching" };
    }

    const resume = await prisma.resume.findFirst({
      where: { id: input.resumeId, profile: { userId: user.id } },
      select: { id: true, title: true },
    });
    if (!resume) return { success: false, message: "Resume not found" };

    const found = await prisma.job.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: {
        id: true,
        automationId: true,
        matchScore: true,
        matchData: true,
        JobTitle: { select: { label: true } },
        Company: { select: { label: true } },
      },
    });
    // In the order they were selected, which is the list's order.
    const byId = new Map(found.map((j) => [j.id, j]));
    const jobs = ids
      .map((id) => byId.get(id))
      .filter((j) => j !== undefined)
      .filter((j) => !input.skipScored || !hasAiMatch(j));

    if (jobs.length === 0) {
      return {
        success: false,
        message: found.length
          ? "Every selected job already has an AI match"
          : "No jobs found",
      };
    }

    const started = batchMatch.start({
      userId: user.id,
      resumeId: resume.id,
      resumeTitle: resume.title,
      jobs: jobs.map((j) => ({
        jobId: j.id,
        title: j.JobTitle?.label ?? "Untitled job",
        company: j.Company?.label ?? "",
        automationId: j.automationId,
      })),
    });
    if (!started.ok) {
      return { success: false, message: "A batch is already matching" };
    }
    return { success: true, data: started.state };
  } catch (error) {
    return fail(error, "Failed to start AI matching.");
  }
}

export async function getBatchMatchStatus(): Promise<
  Result<BatchMatchState | null>
> {
  try {
    const user = await requireUser();
    return { success: true, data: batchMatch.get(user.id) };
  } catch (error) {
    return fail(error, "Failed to read AI matching progress.");
  }
}

export async function cancelBatchMatch(): Promise<Result<boolean>> {
  try {
    const user = await requireUser();
    return { success: true, data: batchMatch.cancel(user.id) };
  } catch (error) {
    return fail(error, "Failed to cancel AI matching.");
  }
}

export async function clearBatchMatch(): Promise<Result<boolean>> {
  try {
    const user = await requireUser();
    return { success: true, data: batchMatch.clear(user.id) };
  } catch (error) {
    return fail(error, "Failed to clear AI matching.");
  }
}
