import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    job: { findMany: vi.fn() },
    resume: { findMany: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/actions/shared", () => ({ requireUser: vi.fn(async () => ({ id: "user-1" })) }));
const svc = vi.hoisted(() => ({ isRunning: vi.fn(() => false), start: vi.fn(), get: vi.fn(), cancel: vi.fn(), clear: vi.fn() }));
vi.mock("@/lib/jobs/batchMatch", () => ({ batchMatch: svc }));

import {
  getBatchMatchSetup,
  startBatchMatch,
  getBatchMatchStatus,
  cancelBatchMatch,
} from "@/actions/job/batchMatch";
import { BATCH_MATCH_MAX_JOBS } from "@/models/batchMatch.model";

const db = prisma as any;
const analyzed = (resumeId: string) => JSON.stringify({ analyzed: true, resumeId });
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  automationId: null,
  matchScore: null,
  matchData: null,
  resumeId: null,
  automation: null,
  JobTitle: { label: `T-${id}` },
  Company: { label: `C-${id}` },
  ...extra,
});

describe("batch match actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    svc.isRunning.mockReturnValue(false);
    db.resume.findMany.mockResolvedValue([
      { id: "res-a", title: "A" },
      { id: "res-b", title: "B" },
    ]);
    db.user.findUnique.mockResolvedValue({ defaultResumeId: "res-b" });
    db.resume.findFirst.mockResolvedValue({ id: "res-a", title: "A" });
    svc.start.mockImplementation(() => ({ ok: true, state: { id: "batch" } }));
  });

  describe("getBatchMatchSetup", () => {
    it("suggests the resume most jobs already use and counts AI-matched jobs", async () => {
      db.job.findMany.mockResolvedValue([
        row("1", { matchScore: 80, matchData: analyzed("res-a") }),
        row("2", { automation: { resumeId: "res-a" }, matchScore: 30, matchData: JSON.stringify({ analyzed: false }) }),
        row("3", { resumeId: "res-b" }),
      ]);
      const res = await getBatchMatchSetup(["1", "2", "3"]);
      expect(res).toEqual({
        success: true,
        data: {
          total: 3,
          scoredCount: 1, // the pre-rank-only score doesn't count
          resumes: [{ id: "res-a", title: "A" }, { id: "res-b", title: "B" }],
          suggestedResumeId: "res-a",
        },
      });
      expect(db.job.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["1", "2", "3"] }, userId: "user-1" });
      expect(db.resume.findMany.mock.calls[0][0].where).toEqual({ profile: { userId: "user-1" } });
    });

    it("falls back to the default resume, ignoring resumes the user doesn't have", async () => {
      db.job.findMany.mockResolvedValue([row("1", { resumeId: "someone-elses" })]);
      const res = await getBatchMatchSetup(["1"]);
      expect(res.success && res.data.suggestedResumeId).toBe("res-b");
    });

    it.each([
      [[], /at least one/],
      [Array.from({ length: BATCH_MATCH_MAX_JOBS + 1 }, (_, i) => `${i}`), /at most/],
      [[1, 2], /Invalid/],
    ])("rejects a bad selection", async (ids, msg) => {
      const res = await getBatchMatchSetup(ids as any);
      expect(res.success).toBe(false);
      expect(!res.success && res.message).toMatch(msg);
    });
  });

  describe("startBatchMatch", () => {
    it("starts with the user's jobs in selection order, skipping AI-matched ones", async () => {
      db.job.findMany.mockResolvedValue([
        row("1"),
        row("2", { matchScore: 90, matchData: analyzed("res-a") }),
        row("3", { automationId: "auto-1", matchScore: 20, matchData: JSON.stringify({ analyzed: false }) }),
      ]);
      const res = await startBatchMatch({ jobIds: ["3", "2", "1", "3"], resumeId: "res-a", skipScored: true });
      expect(res.success).toBe(true);
      expect(db.resume.findFirst.mock.calls[0][0].where).toEqual({ id: "res-a", profile: { userId: "user-1" } });
      expect(db.job.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["3", "2", "1"] }, userId: "user-1" });
      expect(svc.start).toHaveBeenCalledWith({
        userId: "user-1",
        resumeId: "res-a",
        resumeTitle: "A",
        jobs: [
          { jobId: "3", title: "T-3", company: "C-3", automationId: "auto-1" },
          { jobId: "1", title: "T-1", company: "C-1", automationId: null },
        ],
      });
    });

    it("re-matches scored jobs when skipScored is off", async () => {
      db.job.findMany.mockResolvedValue([row("2", { matchScore: 90, matchData: analyzed("res-a") })]);
      await startBatchMatch({ jobIds: ["2"], resumeId: "res-a", skipScored: false });
      expect(svc.start.mock.calls[0][0].jobs).toHaveLength(1);
    });

    it("says so when every job is already matched", async () => {
      db.job.findMany.mockResolvedValue([row("2", { matchScore: 90, matchData: analyzed("res-a") })]);
      const res = await startBatchMatch({ jobIds: ["2"], resumeId: "res-a", skipScored: true });
      expect(res).toEqual({ success: false, message: "Every selected job already has an AI match" });
      expect(svc.start).not.toHaveBeenCalled();
    });

    it("refuses another user's resume", async () => {
      db.resume.findFirst.mockResolvedValue(null);
      const res = await startBatchMatch({ jobIds: ["1"], resumeId: "res-x", skipScored: true });
      expect(res).toEqual({ success: false, message: "Resume not found" });
      expect(db.job.findMany).not.toHaveBeenCalled();
    });

    it("refuses while a batch is running", async () => {
      svc.isRunning.mockReturnValue(true);
      const res = await startBatchMatch({ jobIds: ["1"], resumeId: "res-a", skipScored: true });
      expect(res).toEqual({ success: false, message: "A batch is already matching" });
    });
  });

  it("status and cancel act on the signed-in user's batch", async () => {
    svc.get.mockReturnValue(null);
    svc.cancel.mockReturnValue(true);
    expect(await getBatchMatchStatus()).toEqual({ success: true, data: null });
    expect(await cancelBatchMatch()).toEqual({ success: true, data: true });
    expect(svc.get).toHaveBeenCalledWith("user-1");
    expect(svc.cancel).toHaveBeenCalledWith("user-1");
  });
});
