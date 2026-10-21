"use client";

import { getToolName, type ToolUIPart } from "ai";
import { AddJobResult } from "./AddJobResult";
import { GetResumeResult } from "./GetResumeResult";
import { ReviewResumeResult } from "./ReviewResumeResult";
import { MatchJobResult } from "./MatchJobResult";
import { CoverLetterResult } from "./CoverLetterResult";
import { TailorResumeResult, UpdateResumeResult } from "./ResumeEditResults";
import type {
  AgentAddJobResult,
  AgentCoverLetterResult,
  AgentGetResumeResult,
  AgentMatchJobResult,
  AgentReviewResumeResult,
  AgentTailorResumeResult,
  AgentUpdateResumeResult,
} from "@/models/agent.model";

export function AgentResultCard({ part }: { part: ToolUIPart }) {
  if (part.state === "output-denied") {
    return (
      <div className="rounded-sm border p-3 text-sm text-muted-foreground">
        Cancelled — nothing was saved.
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-sm border p-3 text-sm">
        That could not be completed. Try asking again.
      </div>
    );
  }

  if (part.state !== "output-available") return null;

  const toolName = getToolName(part);
  const body =
    toolName === "add_job" ? (
      <AddJobResult
        output={part.output as AgentAddJobResult}
        input={(part.input ?? {}) as Record<string, unknown>}
      />
    ) : toolName === "get_resume" ? (
      <GetResumeResult output={part.output as AgentGetResumeResult} />
    ) : toolName === "review_resume" ? (
      <ReviewResumeResult output={part.output as AgentReviewResumeResult} />
    ) : toolName === "match_job" ? (
      <MatchJobResult output={part.output as AgentMatchJobResult} />
    ) : toolName === "generate_cover_letter" ? (
      <CoverLetterResult output={part.output as AgentCoverLetterResult} />
    ) : toolName === "tailor_resume" ? (
      <TailorResumeResult
        output={part.output as AgentTailorResumeResult}
        proposalId={part.toolCallId}
      />
    ) : toolName === "update_resume" ? (
      <UpdateResumeResult
        output={part.output as AgentUpdateResumeResult}
        proposalId={part.toolCallId}
      />
    ) : null;

  return <div className="rounded-sm border p-3">{body}</div>;
}
