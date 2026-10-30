"use server";

import db from "@/lib/db";
import { requireUser } from "../shared";
import { automationLogger } from "@/lib/automation-logger";
import {
  matchStoredJob,
  storedMatchFailureMessage,
} from "@/lib/ai/jobMatch/matchStoredJob";
import { formatError } from "./shared";

// Runs an on-demand LLM match for an un-analyzed discovered job using the
// resume tied to its automation and the user's AI settings (no model picker —
// mirrors the automation runner). Upgrades matchData with analyzed: true.
export async function analyzeDiscoveredJob(jobId: string): Promise<{
  success: boolean;
  matchScore?: number;
  message?: string;
}> {
  try {
    const user = await requireUser();

    const job = await db.job.findFirst({
      where: { id: jobId, userId: user.id, automationId: { not: null } },
      include: { automation: { select: { resumeId: true } } },
    });

    if (!job) {
      return { success: false, message: "Discovered job not found" };
    }

    if (job.automationId && automationLogger.isRunning(job.automationId)) {
      return {
        success: false,
        message:
          "A run is in progress for this automation. Please wait until it completes before analyzing jobs.",
      };
    }

    const resumeId = job.automation?.resumeId;
    if (!resumeId) {
      return { success: false, message: "Automation resume is missing" };
    }

    // The Analyze button on a discovered job counts as Automations.
    const outcome = await matchStoredJob({
      userId: user.id,
      jobId,
      resumeId,
      feature: "automations",
    });
    if (outcome.status !== "ok") {
      return { success: false, message: storedMatchFailureMessage(outcome) };
    }
    return { success: true, matchScore: outcome.matchScore };
  } catch (error) {
    return formatError(error, "Failed to analyze discovered job");
  }
}
