"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyResumeEdits } from "@/actions/profile.actions";
import {
  experienceKey,
  type ResumeEditApplyMode,
  type ResumeEditProposal,
} from "@/models/resumeEdits";

type Outcome =
  | { kind: "applied"; mode: ResumeEditApplyMode; resumeId: string; resumeTitle: string }
  | { kind: "discarded" };

// Remembered per proposal so a reopened conversation does not offer to apply
// the same card twice. Browser-local and best-effort: storage may be blocked.
function storageKey(id: string) {
  return `jobsync.resumeEditProposal.${id}`;
}
function readOutcome(id: string): Outcome | null {
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as Outcome) : null;
  } catch {
    return null;
  }
}
function writeOutcome(id: string, outcome: Outcome) {
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(outcome));
  } catch {
    // Not remembering is harmless; the card still shows the outcome now.
  }
}

function BeforeAfter({ before, after }: { before?: string; after: string }) {
  return (
    <div className="space-y-1">
      {before ? (
        <p className="text-muted-foreground line-through decoration-muted-foreground/50">{before}</p>
      ) : (
        <p className="text-muted-foreground italic">(empty)</p>
      )}
      <p>{after}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 border-t pt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function ResumeEditProposalCard({
  proposal,
  proposalId,
}: {
  proposal: ResumeEditProposal;
  proposalId: string;
}) {
  const { edits, before, job } = proposal;
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingMode, setPendingMode] = useState<ResumeEditApplyMode | null>(null);
  const [copyTitle, setCopyTitle] = useState(
    job
      ? `${proposal.resumeTitle} — ${job.company ? `${job.company} ` : ""}${job.title}`
      : `${proposal.resumeTitle} (edited)`,
  );

  useEffect(() => setOutcome(readOutcome(proposalId)), [proposalId]);

  const settle = (next: Outcome) => {
    writeOutcome(proposalId, next);
    setOutcome(next);
  };

  const apply = (mode: ResumeEditApplyMode) => {
    setError(null);
    setPendingMode(mode);
    startTransition(async () => {
      const res = await applyResumeEdits({
        resumeId: proposal.resumeId,
        mode,
        jobId: job?.id,
        copyTitle: mode === "copy" ? copyTitle.trim() || undefined : undefined,
        edits,
      });
      setPendingMode(null);
      if (res.success) {
        settle({ kind: "applied", mode, resumeId: res.resumeId, resumeTitle: res.resumeTitle });
      } else {
        setError(res.message);
      }
    });
  };

  const beforeExperience = new Map(
    before.experiences.map((e) => [experienceKey(e.company, e.jobTitle), e]),
  );
  const beforeSkills = new Set(before.skills.flatMap((c) => c.skills.map((s) => s.toLowerCase())));
  const afterSkills = new Set(
    (edits.skills ?? []).flatMap((c) => c.skills.map((s) => s.toLowerCase())),
  );
  const removedSkills = edits.skills
    ? before.skills.flatMap((c) => c.skills).filter((s) => !afterSkills.has(s.toLowerCase()))
    : [];

  return (
    <div className="space-y-3 text-sm">
      <p>
        Proposed changes to <strong>{proposal.resumeTitle}</strong>
        {job ? (
          <>
            {" "}for <strong>{job.title}</strong>
            {job.company ? ` at ${job.company}` : ""}
          </>
        ) : null}
        . Nothing is saved until you choose below.
      </p>

      {proposal.warnings.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-sm border border-amber-500/40 bg-amber-500/10 py-2 pl-6 pr-2 text-xs text-amber-800 dark:text-amber-300">
          {proposal.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {edits.headline && (
        <Section title="Headline">
          <BeforeAfter before={before.headline} after={edits.headline} />
        </Section>
      )}

      {edits.summary && (
        <Section title="Summary">
          <BeforeAfter before={before.summary} after={edits.summary} />
        </Section>
      )}

      {edits.skills && (
        <Section title="Skills">
          {edits.skills.map((c) => (
            <p key={c.category || "_"}>
              {c.category ? <span className="font-medium">{c.category}: </span> : null}
              {c.skills.map((s, i) => (
                <span key={s}>
                  {i > 0 ? ", " : ""}
                  <span className={beforeSkills.has(s.toLowerCase()) ? undefined : "font-semibold text-emerald-700 dark:text-emerald-400"}>
                    {s}
                  </span>
                </span>
              ))}
            </p>
          ))}
          {removedSkills.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Removed: <span className="line-through">{removedSkills.join(", ")}</span>
            </p>
          )}
        </Section>
      )}

      {edits.experiences?.map((e) => {
        const prev = beforeExperience.get(experienceKey(e.company, e.jobTitle));
        return (
          <Section key={experienceKey(e.company, e.jobTitle)} title={`${e.jobTitle} · ${e.company}`}>
            {e.paragraphs?.map((p) => (
              <p key={p} className="text-muted-foreground">{p}</p>
            ))}
            <ul className="list-disc space-y-1 pl-5">
              {e.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {prev && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Show current bullets</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {prev.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </details>
            )}
          </Section>
        );
      })}

      {proposal.notes && proposal.notes.length > 0 && (
        <details className="border-t pt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Why these changes</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {proposal.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="border-t pt-3">
        {outcome?.kind === "applied" ? (
          <p className="text-sm">
            {outcome.mode === "copy" ? "Saved as " : "Updated "}
            <Link href={`/dashboard/profile/resume/${outcome.resumeId}`} className="font-medium underline">
              {outcome.resumeTitle}
            </Link>
            {outcome.mode === "copy" && job ? " and linked it to this job." : "."}
          </p>
        ) : outcome?.kind === "discarded" ? (
          <p className="text-sm text-muted-foreground">Discarded — nothing was changed.</p>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground" htmlFor={`copy-title-${proposalId}`}>
              Title for a tailored copy
            </label>
            <Input
              id={`copy-title-${proposalId}`}
              value={copyTitle}
              onChange={(e) => setCopyTitle(e.target.value)}
              maxLength={200}
              disabled={pending}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => apply("copy")} disabled={pending}>
                {pendingMode === "copy" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save as tailored copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => apply("in_place")} disabled={pending}>
                {pendingMode === "in_place" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update this resume
              </Button>
              <Button size="sm" variant="ghost" onClick={() => settle({ kind: "discarded" })} disabled={pending}>
                Discard
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
