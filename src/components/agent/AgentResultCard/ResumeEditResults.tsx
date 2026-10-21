"use client";

import { NoResumesNotice } from "@/components/agent/AgentResultCard/NoResumesNotice";
import { ResumeSelectionPrompt } from "@/components/agent/AgentResultCard/ResumeSelectionPrompt";
import { ResumeEditProposalCard } from "@/components/agent/AgentResultCard/ResumeEditProposalCard";
import type {
  AgentTailorResumeResult,
  AgentUpdateResumeResult,
} from "@/models/agent.model";

function NoChanges({ resumeTitle, warnings }: { resumeTitle: string; warnings: string[] }) {
  return (
    <div className="space-y-1 text-sm">
      <p>
        No changes to propose for <strong>{resumeTitle}</strong>.
      </p>
      <ul className="list-disc pl-5 text-xs text-muted-foreground">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function TailorResumeResult({
  output,
  proposalId,
}: {
  output: AgentTailorResumeResult;
  proposalId: string;
}) {
  switch (output.status) {
    case "ok":
      return <ResumeEditProposalCard proposal={output.proposal} proposalId={proposalId} />;
    case "no_changes":
      return <NoChanges resumeTitle={output.resumeTitle} warnings={output.warnings} />;
    case "no_job":
      return (
        <p className="text-sm">
          Open the job you want the resume tailored to first — I tailor to the
          job you&apos;re looking at.
        </p>
      );
    case "no_description":
      return (
        <p className="text-sm">
          <strong>{output.jobTitle}</strong> has no real description yet. Add the
          posting and I can tailor a resume to it.
        </p>
      );
    case "no_resumes":
      return <NoResumesNotice />;
    case "needs_selection":
      return (
        <ResumeSelectionPrompt
          prompt="Which resume should I tailor?"
          resumes={output.resumes}
          messageFor={(title) => `Tailor my resume "${title}" to this job`}
        />
      );
    case "unreadable":
      return (
        <p className="text-sm">
          Couldn&apos;t read <strong>{output.title}</strong> — {output.reason}
        </p>
      );
    case "generation_failed":
      return (
        <p className="text-sm">
          Couldn&apos;t tailor a resume for <strong>{output.jobTitle}</strong> —{" "}
          {output.reason}
        </p>
      );
  }
}

export function UpdateResumeResult({
  output,
  proposalId,
}: {
  output: AgentUpdateResumeResult;
  proposalId: string;
}) {
  switch (output.status) {
    case "ok":
      return <ResumeEditProposalCard proposal={output.proposal} proposalId={proposalId} />;
    case "no_changes":
      return <NoChanges resumeTitle={output.resumeTitle} warnings={output.warnings} />;
    case "no_resumes":
      return <NoResumesNotice />;
    case "needs_selection":
      return (
        <ResumeSelectionPrompt
          prompt="Which resume should I change?"
          resumes={output.resumes}
          messageFor={(title) => `Make those changes to my resume "${title}"`}
        />
      );
  }
}
