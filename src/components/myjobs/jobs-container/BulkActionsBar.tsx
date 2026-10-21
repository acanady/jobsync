"use client";
import { useState } from "react";
import { EyeOff, Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteAlertDialog } from "@/components/DeleteAlertDialog";

type BulkActionsBarProps = {
  selectedCount: number;
  // Selected jobs found by an automation — the only ones that can be dismissed.
  dismissableCount: number;
  onDismiss: () => void;
  onDelete: () => void;
  onClear: () => void;
};

const plural = (n: number) => `${n} job${n === 1 ? "" : "s"}`;

export function BulkActionsBar({
  selectedCount,
  dismissableCount,
  onDismiss,
  onDelete,
  onClear,
}: BulkActionsBarProps) {
  const [confirm, setConfirm] = useState<"dismiss" | "delete" | null>(null);
  const skipped = selectedCount - dismissableCount;

  return (
    <>
      <div
        className="mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm"
        data-testid="jobs-bulk-actions"
      >
        <span className="font-medium">{selectedCount} selected</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={dismissableCount === 0}
            title={
              dismissableCount === 0
                ? "Only jobs found by an automation can be dismissed"
                : "Hide these jobs and stop automations adding them again"
            }
            onClick={() => setConfirm("dismiss")}
          >
            <EyeOff className="mr-2 h-4 w-4" />
            Dismiss
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirm("delete")}
          >
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      <DeleteAlertDialog
        pageTitle="jobs"
        open={confirm === "dismiss"}
        onOpenChange={(open) => !open && setConfirm(null)}
        onDelete={onDismiss}
        alertTitle={`Dismiss ${plural(dismissableCount)}?`}
        alertDescription={
          <>
            <p>
              Dismissed jobs are hidden from this list, and automations won&apos;t
              add them again. They stay listed under their automation, where
              you can accept them back.
            </p>
            {skipped > 0 && (
              <p className="mt-2">
                {plural(skipped)} you added yourself will be skipped; only jobs
                found by an automation can be dismissed.
              </p>
            )}
          </>
        }
        actionLabel="Dismiss"
        actionVariant="default"
      />
      <DeleteAlertDialog
        pageTitle="jobs"
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        onDelete={onDelete}
        alertTitle={`Delete ${plural(selectedCount)}?`}
        alertDescription={
          <>
            <p>
              This permanently deletes the selected jobs, with their notes and
              history. It cannot be undone.
            </p>
            {dismissableCount > 0 && (
              <p className="mt-2">
                Jobs found by an automation can be added again on a later run
                while they&apos;re still posted. To keep them out, dismiss them
                instead.
              </p>
            )}
          </>
        }
      />
    </>
  );
}
