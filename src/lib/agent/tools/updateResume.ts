import "server-only";

import { tool } from "ai";
import { AGENT_TOOL_DESCRIPTIONS } from "@/lib/agent/prompt";
import { AgentUpdateResumeSchema } from "@/models/agent.schema";
import { resolveResumeForAgent } from "@/lib/agent/resumeLookup";
import { snapshotResume } from "@/lib/resumeEdits/snapshot";
import { fitEditsToSnapshot } from "@/lib/resumeEdits/validate";
import { hasAnyEdit } from "@/models/resumeEdits";
import type { AgentUpdateResumeResult } from "@/models/agent.model";

/**
 * Proposes edits the user dictated ("change my headline to…"). Like
 * tailor_resume it writes nothing: the card applies the fitted edits on a
 * button press. userId and pageResumeId are closure parameters — the IDOR
 * boundary shared by every tool.
 */
export function buildUpdateResumeTool(userId: string, pageResumeId?: string) {
  return tool({
    description: AGENT_TOOL_DESCRIPTIONS.update_resume,
    inputSchema: AgentUpdateResumeSchema,
    // No needsApproval: the proposal card is the approval, and nothing is
    // written until one of its buttons is pressed.
    execute: async (raw): Promise<AgentUpdateResumeResult> => {
      const lookup = await resolveResumeForAgent(userId, {
        title: raw?.resumeTitle,
        pageResumeId,
      });
      if (lookup.status === "no_resumes") return { status: "no_resumes" };
      if (lookup.status === "needs_selection") {
        return { status: "needs_selection", resumes: lookup.resumes };
      }

      const resume = lookup.resume;
      const before = snapshotResume(resume);
      const { edits, warnings } = fitEditsToSnapshot(raw.edits, before, {
        existingSkillsOnly: false,
      });
      if (!hasAnyEdit(edits)) {
        return {
          status: "no_changes",
          resumeTitle: resume.title,
          warnings: warnings.length ? warnings : ["Those changes match what the resume already says."],
        };
      }

      return {
        status: "ok",
        proposal: {
          resumeId: resume.id!,
          resumeTitle: resume.title,
          edits,
          before,
          warnings,
        },
      };
    },
  });
}
