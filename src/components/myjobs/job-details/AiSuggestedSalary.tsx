import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatSuggestedSalary } from "@/lib/ai/jobMatch/salary";
import type { JobMatchData, SuggestedSalary } from "@/models/ai.schemas";

// matchData is stored JSON (and can arrive by backup import), so the shape
// is checked rather than trusted.
function readSalary(value: unknown): SuggestedSalary | null {
  const s = value as Partial<SuggestedSalary> | null | undefined;
  if (!s || typeof s !== "object") return null;
  if (typeof s.low !== "number" || typeof s.high !== "number") return null;
  if (typeof s.currency !== "string") return null;
  if (s.period !== "year" && s.period !== "hour") return null;
  if (s.basis !== "posted" && s.basis !== "estimated") return null;
  return s as SuggestedSalary;
}

/** Shown only once the job has an AI match; the caller decides that. */
export function AiSuggestedSalary({ matchData }: { matchData: JobMatchData }) {
  const salary = readSalary(matchData.suggestedSalary);

  return (
    <div className="mt-6 pt-4 border-t" data-testid="ai-suggested-salary">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        AI Suggested Salary
      </p>
      {salary ? (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">
              {formatSuggestedSalary(salary)}
            </span>
            <Badge variant="outline">
              {salary.basis === "posted" ? "Within posted range" : "Estimated"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {salary.basis === "posted"
              ? "A target inside the posting's pay range, based on how well you fit."
              : "The posting lists no pay, so this is the AI's estimate for the role, level and location. Treat it as a starting point, not market data."}
            {matchData.resumeTitle && ` Matched against ${matchData.resumeTitle}.`}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          No suggestion for this match. Matches made before salary
          suggestions don&apos;t have one; run the AI match again to get one.
        </p>
      )}
    </div>
  );
}
