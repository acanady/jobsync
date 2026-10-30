"use client";
import { useEffect, useState } from "react";
import { Loader, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBatchMatchSetup } from "@/actions/job.actions";
import type { BatchMatchSetup } from "@/models/batchMatch.model";

const plural = (n: number) => `${n} job${n === 1 ? "" : "s"}`;

type BatchMatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobIds: string[];
  onStart: (resumeId: string, skipScored: boolean) => Promise<boolean>;
};

export function BatchMatchDialog({
  open,
  onOpenChange,
  jobIds,
  onStart,
}: BatchMatchDialogProps) {
  const [setup, setSetup] = useState<BatchMatchSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [skipScored, setSkipScored] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setSetup(null);
    setError(null);
    setSkipScored(true);
    getBatchMatchSetup(jobIds).then((res) => {
      if (!live) return;
      if (res.success) {
        setSetup(res.data);
        setResumeId(res.data.suggestedResumeId ?? "");
      } else {
        setError(res.message);
      }
    });
    return () => {
      live = false;
    };
    // Loaded once per opening; the selection can't change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toMatch = setup
    ? skipScored
      ? setup.total - setup.scoredCount
      : setup.total
    : 0;

  const submit = async () => {
    setStarting(true);
    const ok = await onStart(resumeId, skipScored);
    setStarting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>AI match {plural(jobIds.length)}</DialogTitle>
          <DialogDescription>
            Each job is matched against the resume one after another. It keeps
            running if you leave this page, and each score is saved as soon as
            its job finishes.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!setup && !error && (
          <Loader className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        )}

        {setup && setup.resumes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add a resume in Profile first — jobs are matched against one.
          </p>
        )}

        {setup && setup.resumes.length > 0 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Resume</Label>
              <Select value={resumeId} onValueChange={setResumeId}>
                <SelectTrigger aria-label="Resume">
                  <SelectValue placeholder="Choose a resume" />
                </SelectTrigger>
                <SelectContent>
                  {setup.resumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="batch-skip-scored">
                  Skip jobs that already have an AI match
                </Label>
                <p className="text-sm text-muted-foreground">
                  {setup.scoredCount === 0
                    ? "None of the selected jobs has one yet."
                    : `${plural(setup.scoredCount)} already ${setup.scoredCount === 1 ? "has" : "have"} one. Turn this off to match ${setup.scoredCount === 1 ? "it" : "them"} again and replace the score.`}
                </p>
              </div>
              <Switch
                id="batch-skip-scored"
                checked={skipScored}
                onCheckedChange={setSkipScored}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!setup || !resumeId || toMatch === 0 || starting}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {toMatch === 0 && setup ? "Nothing to match" : `Match ${plural(toMatch)}`}
            {starting && <Loader className="ml-2 h-4 w-4 spinner" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
