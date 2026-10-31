import "server-only";

import { generateText } from "ai";
import db from "@/lib/db";
import { getModel } from "@/lib/ai/providers";
import {
  JOB_MATCH_SYSTEM_PROMPT,
  buildJobMatchPrompt,
} from "@/lib/ai/prompts/job-match";
import { parseJobMatch } from "@/lib/ai/jobMatch/parse";
import { preprocessResume } from "@/lib/ai/tools/preprocessing";
import { preprocessJob } from "@/lib/ai/tools/preprocessing-job";
import { startAiCall } from "@/lib/aiUsage/tracker";
import { resumeDetailInclude } from "@/lib/jobs/resumeDetailInclude";
import {
  getDefaultModelForProvider,
  getUserAiSettings,
} from "@/lib/scraper/automation-run/aiSettings";
import { APP_CONSTANTS } from "@/lib/constants";
import {
  genAiRequestAttrs,
  genAiResponseAttrs,
  inputSizeAttrs,
  SURFACES,
  withSpan,
} from "@/lib/telemetry";
import type { AiUsageFeature } from "@/models/aiUsage.model";

export type StoredMatchOutcome =
  | { status: "ok"; matchScore: number }
  | { status: "job_not_found" }
  | { status: "resume_not_found" }
  | { status: "unreadable"; what: "job" | "resume" }
  | { status: "no_score" }
  | { status: "aborted" }
  | { status: "failed"; message: string };

export function storedMatchFailureMessage(
  outcome: Exclude<StoredMatchOutcome, { status: "ok" }>,
): string {
  switch (outcome.status) {
    case "job_not_found":
      return "Job not found";
    case "resume_not_found":
      return "Resume not found";
    case "unreadable":
      return outcome.what === "job"
        ? "The job description is missing or too short to match"
        : "The resume is missing or too short to match";
    case "no_score":
      return "AI did not return a match score";
    case "aborted":
      return "Matching was cancelled";
    case "failed":
      return outcome.message;
  }
}

export interface MatchStoredJobInput {
  userId: string;
  jobId: string;
  resumeId: string;
  // Which AI usage bucket the call counts toward.
  feature: AiUsageFeature;
  // Stored on matchData.surface; omitted keeps whatever the row had.
  surface?: string;
  signal?: AbortSignal;
}

/**
 * Matches one saved job against one resume and stores the score — the
 * Analyze button's match, with no session: every read and the write are
 * scoped by userId, so the background batch can call it after the request
 * that started it has ended. A failure of any kind leaves the row untouched.
 */
export async function matchStoredJob(
  input: MatchStoredJobInput,
): Promise<StoredMatchOutcome> {
  const { userId, jobId, resumeId, feature, surface, signal } = input;
  try {
    const [job, resume] = await Promise.all([
      db.job.findFirst({
        where: { id: jobId, userId },
        include: { JobTitle: true, Company: true, Location: true },
      }),
      db.resume.findFirst({
        where: { id: resumeId, profile: { userId } },
        include: resumeDetailInclude,
      }),
    ]);
    if (!job) return { status: "job_not_found" };
    if (!resume) return { status: "resume_not_found" };

    // Prisma's shapes are structurally what the preprocessors read but not
    // nominally the model types — the same cast getResumeById's `any` makes.
    const [resumePre, jobPre] = await Promise.all([
      preprocessResume(resume as never),
      preprocessJob(job as never),
    ]);
    if (!jobPre.success) return { status: "unreadable", what: "job" };
    if (!resumePre.success) return { status: "unreadable", what: "resume" };

    const ai = await getUserAiSettings(userId);
    const modelName = ai.model || getDefaultModelForProvider(ai.provider);
    const model = await getModel(ai.provider, modelName, userId);
    const promptText = buildJobMatchPrompt(
      resumePre.data.normalizedText,
      jobPre.data.normalizedText,
    );

    const timeout = AbortSignal.timeout(APP_CONSTANTS.AI_JOB_MATCH_TIMEOUT_MS);
    const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

    const result = await withSpan(
      "automation.analyze",
      {
        ...genAiRequestAttrs({
          provider: ai.provider,
          model: modelName,
          temperature: 0.3,
          numCtx: APP_CONSTANTS.AI_OLLAMA_NUM_CTX,
          surface: SURFACES.JOB_MATCH,
          system: JOB_MATCH_SYSTEM_PROMPT,
          prompt: promptText,
        }),
        ...inputSizeAttrs({
          resumeChars: resumePre.data.normalizedText.length,
          jobChars: jobPre.data.normalizedText.length,
        }),
        "jobsync.user_id": userId,
        "jobsync.job_id": jobId,
      },
      async (span) => {
        const tracker = startAiCall({
          userId,
          feature,
          provider: ai.provider,
          model: modelName,
        });
        let generated;
        try {
          generated = await generateText({
            model,
            system: JOB_MATCH_SYSTEM_PROMPT,
            prompt: promptText,
            temperature: 0.3,
            abortSignal,
          });
        } catch (error) {
          void tracker.finish({ error, abortedBy: abortSignal });
          throw error;
        }
        void tracker.finish({
          usage: generated.totalUsage,
          finishReason: generated.finishReason,
        });
        span.setAttrs(
          genAiResponseAttrs({
            usage: generated.totalUsage,
            finishReason: generated.finishReason,
            text: generated.text,
          }),
        );
        return generated;
      },
    );

    const { scores, salary, body } = parseJobMatch(result.text);
    if (!scores) return { status: "no_score" };

    let previous: Record<string, unknown> = {};
    try {
      previous = JSON.parse(job.matchData ?? "{}");
    } catch {
      previous = {};
    }

    // Merged, not replaced: an automation job keeps its prerank fields.
    const matchData = JSON.stringify({
      ...previous,
      matchScore: scores.matchScore,
      recommendation: scores.recommendation,
      body,
      // Undefined drops a suggestion left by an earlier match.
      suggestedSalary: salary,
      resumeId,
      resumeTitle: resume.title,
      matchedAt: new Date().toISOString(),
      provider: ai.provider,
      model: modelName,
      ...(surface ? { surface } : {}),
      analyzed: true,
    });

    await db.job.update({
      where: { id: jobId, userId },
      data: { matchScore: scores.matchScore, matchData },
    });

    return { status: "ok", matchScore: scores.matchScore };
  } catch (error) {
    if (signal?.aborted) return { status: "aborted" };
    if (error instanceof Error && error.name === "TimeoutError") {
      return { status: "failed", message: "The AI took too long to respond" };
    }
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "AI matching failed",
    };
  }
}
