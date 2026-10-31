import type {
  JobMatchRecommendation,
  JobMatchResult,
  JobMatchScores,
} from "@/models/ai.schemas";
import { stripThinking } from "@/lib/ai/stripThinking";
import { parseSalaryLine, SALARY_LINE_RE } from "@/lib/ai/jobMatch/salary";

// Isomorphic parser shared by the client stream util and the server-side
// automation runner. No `server-only`, no `fetch` — pure text -> result.

// Match greedily on digits (not {1,3}) so an out-of-range value like 1000 still
// parses — clamp() below brings it back into 0-100 rather than failing the
// whole line and dropping the score.
const SCORES_RE =
  /SCORES:\s*match=(\d+)\s+recommendation=(strong|good|partial|weak)/i;

const RECOMMENDATION_LABELS: Record<string, JobMatchRecommendation> = {
  strong: "strong match",
  good: "good match",
  partial: "partial match",
  weak: "weak match",
};

export function parseJobMatch(raw: string): JobMatchResult {
  const text = stripThinking(raw);
  const match = text.match(SCORES_RE);

  let scores: JobMatchScores | undefined;
  if (match) {
    const matchScore = Math.max(0, Math.min(100, Number(match[1])));
    scores = {
      matchScore,
      recommendation: RECOMMENDATION_LABELS[match[2].toLowerCase()],
    };
  }

  // Remove the scores line from the body. Before it has fully streamed, also
  // hide a leading partial "SCORES:" line so it doesn't flash in the markdown.
  let body = match
    ? text.replace(match[0], "")
    : text.replace(/^\s*SCORES:[^\n]*(\n|$)/i, "");
  // The salary line follows the scores line. It is hidden whether or not it
  // parses: a malformed or half-streamed one is noise in the write-up.
  const salary = parseSalaryLine(body);
  body = body.replace(/^\s+/, "").replace(SALARY_LINE_RE, "");
  body = body.replace(/^\s+/, "");

  return salary ? { scores, salary, body } : { scores, body };
}
