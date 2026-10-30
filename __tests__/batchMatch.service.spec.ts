vi.mock("@/lib/ai/jobMatch/matchStoredJob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/jobMatch/matchStoredJob")>();
  return { ...actual, matchStoredJob: vi.fn() };
});

import { BatchMatchService, MAX_CONSECUTIVE_FAILURES } from "@/lib/jobs/batchMatch";
import { countBatchItems } from "@/models/batchMatch.model";

const job = (n: number, automationId: string | null = null) => ({
  jobId: `job-${n}`,
  title: `Title ${n}`,
  company: `Co ${n}`,
  automationId,
});
const input = (jobs: ReturnType<typeof job>[]) => ({
  userId: "user-1",
  resumeId: "res-1",
  resumeTitle: "Main",
  jobs,
});

describe("BatchMatchService", () => {
  it("matches jobs one at a time, in order, with the batch's resume", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const matcher = vi.fn(async ({ jobId }: { jobId: string }) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(jobId);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { status: "ok" as const, matchScore: 70 };
    });
    const svc = new BatchMatchService(matcher as any, () => false);

    const state = await svc.runToEnd(input([job(1), job(2), job(3)]));

    expect(order).toEqual(["job-1", "job-2", "job-3"]);
    expect(maxInFlight).toBe(1);
    expect(matcher.mock.calls[0][0]).toMatchObject({
      userId: "user-1",
      resumeId: "res-1",
      feature: "job_match",
      surface: "batch",
    });
    expect(state.status).toBe("completed");
    expect(state.items.map((i) => [i.status, i.matchScore])).toEqual([
      ["matched", 70],
      ["matched", 70],
      ["matched", 70],
    ]);
  });

  it("maps outcomes to skipped and failed with messages", async () => {
    const outcomes = [
      { status: "job_not_found" },
      { status: "unreadable", what: "job" },
      { status: "no_score" },
      { status: "ok", matchScore: 55 },
    ];
    const matcher = vi.fn(async () => outcomes.shift());
    const state = await new BatchMatchService(matcher as any, () => false).runToEnd(
      input([job(1), job(2), job(3), job(4)]),
    );
    expect(state.items.map((i) => i.status)).toEqual(["skipped", "skipped", "failed", "matched"]);
    expect(state.items[0].message).toMatch(/deleted/);
    expect(state.items[1].message).toMatch(/description/);
    expect(state.items[2].message).toMatch(/score/);
    expect(countBatchItems(state)).toMatchObject({ matched: 1, skipped: 2, failed: 1, done: 4 });
  });

  it("skips a job whose automation is running without calling the AI", async () => {
    const matcher = vi.fn(async () => ({ status: "ok" as const, matchScore: 60 }));
    const svc = new BatchMatchService(matcher as any, (id) => id === "auto-busy");
    const state = await svc.runToEnd(input([job(1, "auto-busy"), job(2, "auto-idle")]));
    expect(state.items[0]).toMatchObject({ status: "skipped", message: "Its automation is running" });
    expect(matcher).toHaveBeenCalledTimes(1);
    expect(state.items[1].status).toBe("matched");
  });

  it("stops calling the AI after repeated failures", async () => {
    const matcher = vi.fn(async () => ({ status: "failed" as const, message: "fetch failed" }));
    const jobs = Array.from({ length: MAX_CONSECUTIVE_FAILURES + 2 }, (_, i) => job(i));
    const state = await new BatchMatchService(matcher as any, () => false).runToEnd(input(jobs));
    expect(matcher).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILURES);
    expect(state.items.at(-1)).toMatchObject({ status: "skipped", message: "Stopped after repeated AI errors" });
  });

  it("a success resets the failure streak", async () => {
    const seq = ["failed", "failed", "ok", "failed", "failed", "ok"];
    const matcher = vi.fn(async () =>
      seq.shift() === "ok" ? { status: "ok", matchScore: 1 } : { status: "failed", message: "x" },
    );
    const state = await new BatchMatchService(matcher as any, () => false).runToEnd(
      input(Array.from({ length: 6 }, (_, i) => job(i))),
    );
    expect(matcher).toHaveBeenCalledTimes(6);
    expect(countBatchItems(state).matched).toBe(2);
  });

  it("treats a thrown matcher error as a failed job and carries on", async () => {
    const matcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "ok", matchScore: 90 });
    const state = await new BatchMatchService(matcher, () => false).runToEnd(input([job(1), job(2)]));
    expect(state.items[0]).toMatchObject({ status: "failed", message: "boom" });
    expect(state.items[1].status).toBe("matched");
  });

  it("cancel aborts the job in flight and marks the rest cancelled", async () => {
    // Never finishes on its own: only the abort settles it.
    const matcher = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => resolve({ status: "aborted" }));
        }),
    );
    const svc = new BatchMatchService(matcher as any, () => false);
    const started = svc.start(input([job(1), job(2), job(3)]));
    expect(started.ok).toBe(true);
    await vi.waitFor(() => expect(matcher).toHaveBeenCalledTimes(1));

    expect(svc.start(input([job(9)]))).toEqual({ ok: false, reason: "busy" });
    expect(svc.get("user-1")?.items[0].status).toBe("running");
    expect(svc.cancel("user-1")).toBe(true);

    await vi.waitFor(() => expect(svc.get("user-1")?.status).toBe("cancelled"));
    expect(svc.get("user-1")?.items.map((i) => i.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(matcher).toHaveBeenCalledTimes(1);
  });

  it("keeps batches per user, returns copies, and clears only finished ones", async () => {
    let release!: () => void;
    const matcher = vi.fn(
      () => new Promise((r) => (release = () => r({ status: "ok", matchScore: 1 }))),
    );
    const svc = new BatchMatchService(matcher as any, () => false);
    svc.start(input([job(1)]));
    expect(svc.get("user-2")).toBeNull();
    expect(svc.cancel("user-2")).toBe(false);
    expect(svc.clear("user-1")).toBe(false);

    svc.get("user-1")!.items[0].status = "failed";
    expect(svc.get("user-1")!.items[0].status).not.toBe("failed");

    await vi.waitFor(() => expect(matcher).toHaveBeenCalled());
    release();
    await vi.waitFor(() => expect(svc.get("user-1")?.status).toBe("completed"));
    expect(svc.clear("user-1")).toBe(true);
    expect(svc.get("user-1")).toBeNull();
  });
});
