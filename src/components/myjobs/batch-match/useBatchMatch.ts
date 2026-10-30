"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelBatchMatch,
  clearBatchMatch,
  getBatchMatchStatus,
  startBatchMatch,
} from "@/actions/job.actions";
import { toastError } from "@/lib/toast";
import type { BatchMatchState } from "@/models/batchMatch.model";

export const BATCH_POLL_MS = 2000;

/**
 * Follows the user's AI matching batch. It runs on the server, so this picks
 * up a batch started before the page was opened, polls while it runs, and
 * reports each score as it lands so the list can update the row in place
 * (a reload would reset the infinite scroll).
 */
export function useBatchMatch(onScores: (scores: Map<string, number>) => void) {
  const [state, setState] = useState<BatchMatchState | null>(null);
  const reported = useRef(new Set<string>());
  const onScoresRef = useRef(onScores);
  onScoresRef.current = onScores;

  const apply = useCallback((next: BatchMatchState | null) => {
    setState(next);
    if (!next) return;
    const fresh = new Map<string, number>();
    for (const item of next.items) {
      const key = `${next.id}:${item.jobId}`;
      if (item.status === "matched" && item.matchScore != null && !reported.current.has(key)) {
        reported.current.add(key);
        fresh.set(item.jobId, item.matchScore);
      }
    }
    if (fresh.size) onScoresRef.current(fresh);
  }, []);

  const refresh = useCallback(async () => {
    const res = await getBatchMatchStatus();
    if (res.success) apply(res.data);
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = state?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), BATCH_POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const start = useCallback(
    async (jobIds: string[], resumeId: string, skipScored: boolean) => {
      const res = await startBatchMatch({ jobIds, resumeId, skipScored });
      if (!res.success) {
        toastError(res.message);
        return false;
      }
      apply(res.data);
      return true;
    },
    [apply],
  );

  const cancel = useCallback(async () => {
    const res = await cancelBatchMatch();
    if (!res.success) toastError(res.message);
    await refresh();
  }, [refresh]);

  const clear = useCallback(async () => {
    const res = await clearBatchMatch();
    if (res.success) setState(null);
    else toastError(res.message);
  }, []);

  return { state, running, start, cancel, clear };
}
