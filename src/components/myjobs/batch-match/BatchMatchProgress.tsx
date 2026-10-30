"use client";
import { useState } from "react";
import Link from "next/link";
import { Loader, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  countBatchItems,
  type BatchMatchState,
} from "@/models/batchMatch.model";

type BatchMatchProgressProps = {
  state: BatchMatchState;
  onCancel: () => void;
  onClear: () => void;
};

export function BatchMatchProgress({
  state,
  onCancel,
  onClear,
}: BatchMatchProgressProps) {
  const [showDetails, setShowDetails] = useState(false);
  const counts = countBatchItems(state);
  const running = state.status === "running";
  const current = state.items.find((i) => i.status === "running");
  const problems = state.items.filter(
    (i) => i.status === "skipped" || i.status === "failed",
  );

  const summary = [
    `${counts.matched} matched`,
    counts.skipped && `${counts.skipped} skipped`,
    counts.failed && `${counts.failed} failed`,
    counts.cancelled && `${counts.cancelled} cancelled`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="mb-4 space-y-2 rounded-md border bg-muted/50 px-3 py-2 text-sm"
      data-testid="batch-match-progress"
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium">
          {running
            ? state.cancelRequested
              ? "Cancelling AI matching…"
              : `AI matching ${Math.min(counts.done + 1, counts.total)} of ${counts.total}`
            : state.status === "cancelled"
              ? "AI matching cancelled"
              : "AI matching finished"}
        </span>
        {running && current && !state.cancelRequested && (
          <span className="truncate text-muted-foreground">
            — {current.title}
            {current.company && ` @ ${current.company}`}
          </span>
        )}
        {!running && <span className="text-muted-foreground">{summary}</span>}
        <div className="ml-auto flex items-center gap-2">
          {!running && problems.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? "Hide details" : "Details"}
            </Button>
          )}
          {running ? (
            <Button
              size="sm"
              variant="outline"
              disabled={state.cancelRequested}
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Close AI matching summary"
              onClick={onClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {running && (
        <Progress
          value={(counts.done / Math.max(counts.total, 1)) * 100}
          className="h-1.5"
          aria-label="AI matching progress"
        />
      )}
      {running && (
        <p className="text-xs text-muted-foreground">
          Matching against {state.resumeTitle}. {summary}.
        </p>
      )}
      {showDetails && !running && (
        <ul className="space-y-1 text-xs">
          {problems.map((i) => (
            <li key={i.jobId}>
              <Link
                href={`/dashboard/myjobs/${i.jobId}`}
                className="font-medium hover:underline"
              >
                {i.title}
                {i.company && ` @ ${i.company}`}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                — {i.status}: {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
