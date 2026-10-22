import "server-only";

import { tool, type LanguageModel, type UIMessageStreamWriter } from "ai";
import { TEMPERATURES } from "@/lib/ai/config";
import { APP_CONSTANTS } from "@/lib/constants";
import { AGENT_TOOL_DESCRIPTIONS } from "@/lib/agent/prompt";
import { AgentTailorResumeSchema } from "@/models/agent.schema";
import { resolveJobForAgent } from "@/lib/agent/jobLookup";
import { resolveResumeForAgent } from "@/lib/agent/resumeLookup";
import { preprocessJob } from "@/lib/ai/tools/preprocessing-job";
import {
  RESUME_TAILOR_SYSTEM_PROMPT,
  buildResumeTailorPrompt,
} from "@/lib/ai/prompts/resume-tailor";
import { snapshotResume, snapshotToPromptText } from "@/lib/resumeEdits/snapshot";
import { parseTailoredResume } from "@/lib/resumeEdits/parseTailored";
import { fitEditsToSnapshot } from "@/lib/resumeEdits/validate";
import { hasAnyEdit } from "@/models/resumeEdits";
import { extractMatchGuidance } from "@/lib/ai/coverLetter/matchGuidance";
import {
  runNestedGeneration,
  type NestedGenerationGuard,
} from "@/lib/agent/nestedGeneration";
import type { AgentTailorResumeResult } from "@/models/agent.model";

type TailorResumeContext = {
  userId: string;
  pageJobId?: string;
  model: LanguageModel;
  provider: string;
  modelName: string;
  writer: UIMessageStreamWriter;
  guard: NestedGenerationGuard;
};

/**
 * The fourth generation surface wearing a tool's clothes. It proposes and never
 * writes: the parsed, fitted edits go to a card whose buttons apply them
 * through applyResumeEdits, so what is written is exactly what was shown.
 * userId and pageJobId are closure parameters — the same IDOR boundary as the
 * other tools.
 */
export function buildTailorResumeTool(ctx: TailorResumeContext) {
  return tool({
    description: AGENT_TOOL_DESCRIPTIONS.tailor_resume,
    inputSchema: AgentTailorResumeSchema,
    // No needsApproval: nothing is written here. The proposal card is the
    // approval step, and it applies only on a button press.
    execute: async (raw, { toolCallId, abortSignal }): Promise<AgentTailorResumeResult> => {
      const jobLookup = await resolveJobForAgent(ctx.userId, ctx.pageJobId);
      if (jobLookup.status === "no_job") return { status: "no_job" };

      const job = jobLookup.job;
      const jobTitle = job.JobTitle?.label ?? "this job";
      const company = job.Company?.label ?? "";
      if (job.descriptionCompleteness === "title-only") {
        return { status: "no_description", jobTitle };
      }

      const resumeLookup = await resolveResumeForAgent(ctx.userId, {
        title: raw?.resumeTitle,
        pageResumeId: job.resumeId ?? undefined,
      });
      if (resumeLookup.status === "no_resumes") return { status: "no_resumes" };
      if (resumeLookup.status === "needs_selection") {
        return { status: "needs_selection", resumes: resumeLookup.resumes };
      }
      const resume = resumeLookup.resume;

      const jobPre = await preprocessJob(job);
      if (!jobPre.success) {
        return {
          status: "unreadable",
          what: "job",
          title: jobTitle,
          reason: "Its description may be too short or missing. Add the full posting and try again.",
        };
      }

      const before = snapshotResume(resume);
      if (!before.experiences.length && !before.skills.length) {
        return {
          status: "unreadable",
          what: "resume",
          title: resume.title,
          reason: "It has no experience or skills to tailor. Fill it in under Profile → Resumes and try again.",
        };
      }
      const resumeText = snapshotToPromptText(before);

      const generation = await runNestedGeneration({
        model: ctx.model,
        userId: ctx.userId,
        system: RESUME_TAILOR_SYSTEM_PROMPT,
        // A saved match analysis, when there is one, steers emphasis the same
        // way it steers the cover letter.
        prompt: buildResumeTailorPrompt(
          resumeText,
          jobPre.data.normalizedText,
          raw?.requests,
          extractMatchGuidance(job.matchData),
        ),
        temperature: TEMPERATURES.FEEDBACK,
        numCtx: APP_CONSTANTS.AI_OLLAMA_NUM_CTX,
        timeoutMs: APP_CONSTANTS.AI_RESUME_REVIEW_TIMEOUT_MS,
        writer: ctx.writer,
        toolCallId,
        abortSignal,
        guard: ctx.guard,
        label: "tailor_resume",
        provider: ctx.provider,
        modelName: ctx.modelName,
        attrs: {
          "jobsync.input.resume_chars": resumeText.length,
          "jobsync.input.job_chars": jobPre.data.normalizedText.length,
        },
      });
      if (generation.status === "busy") {
        return {
          status: "generation_failed",
          jobTitle,
          reason: "Another analysis is already running — ask for this one once it finishes.",
        };
      }
      if (generation.status === "incomplete") {
        return {
          status: "generation_failed",
          jobTitle,
          reason: "The tailoring stopped before it finished, so there is nothing to apply.",
        };
      }
      if (generation.status === "failed") {
        return {
          status: "generation_failed",
          jobTitle,
          reason: "The tailored resume could not be generated. Try again in a moment.",
        };
      }

      const parsed = parseTailoredResume(generation.text);
      const { edits, warnings } = fitEditsToSnapshot(parsed.edits, before, {
        existingSkillsOnly: true,
      });
      if (!hasAnyEdit(edits)) {
        return {
          status: "no_changes",
          resumeTitle: resume.title,
          warnings: warnings.length
            ? warnings
            : ["The suggestions came back identical to the resume, or in a shape the app couldn't read."],
        };
      }

      return {
        status: "ok",
        proposal: {
          resumeId: resume.id!,
          resumeTitle: resume.title,
          job: { id: job.id, title: jobTitle, company },
          edits,
          before,
          warnings,
          notes: parsed.notes,
        },
      };
    },
  });
}
