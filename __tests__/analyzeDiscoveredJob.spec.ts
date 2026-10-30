import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({ default: { job: { findFirst: vi.fn() } } }));
vi.mock("@/actions/shared", () => ({ requireUser: vi.fn(async () => ({ id: "user-1" })) }));
const isRunning = vi.fn(() => false);
vi.mock("@/lib/automation-logger", () => ({
  automationLogger: { isRunning: (id: string) => isRunning(id) },
}));
const matchStoredJob = vi.fn();
vi.mock("@/lib/ai/jobMatch/matchStoredJob", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/jobMatch/matchStoredJob")>();
  return { ...actual, matchStoredJob: (...a: unknown[]) => matchStoredJob(...a) };
});

import { analyzeDiscoveredJob } from "@/actions/automation/analyze";

const db = prisma as any;
const discovered = { id: "job-1", automationId: "auto-1", automation: { resumeId: "res-1" } };

describe("analyzeDiscoveredJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.job.findFirst.mockResolvedValue(discovered);
  });

  it("matches against the automation's resume, counted as Automations", async () => {
    matchStoredJob.mockResolvedValue({ status: "ok", matchScore: 77 });
    expect(await analyzeDiscoveredJob("job-1")).toEqual({ success: true, matchScore: 77 });
    expect(matchStoredJob).toHaveBeenCalledWith({
      userId: "user-1",
      jobId: "job-1",
      resumeId: "res-1",
      feature: "automations",
    });
    expect(db.job.findFirst.mock.calls[0][0].where).toEqual({
      id: "job-1",
      userId: "user-1",
      automationId: { not: null },
    });
  });

  it("refuses while the job's automation is running", async () => {
    isRunning.mockReturnValueOnce(true);
    const res = await analyzeDiscoveredJob("job-1");
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/run is in progress/);
    expect(matchStoredJob).not.toHaveBeenCalled();
  });

  it("refuses when the automation has no resume", async () => {
    db.job.findFirst.mockResolvedValue({ ...discovered, automation: { resumeId: null } });
    expect(await analyzeDiscoveredJob("job-1")).toEqual({ success: false, message: "Automation resume is missing" });
  });

  it("turns an engine failure into a message", async () => {
    matchStoredJob.mockResolvedValue({ status: "no_score" });
    expect(await analyzeDiscoveredJob("job-1")).toEqual({ success: false, message: "AI did not return a match score" });
  });
});
