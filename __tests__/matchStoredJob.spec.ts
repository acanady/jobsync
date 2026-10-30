import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    job: { findFirst: vi.fn(), update: vi.fn() },
    resume: { findFirst: vi.fn() },
  },
}));
const generateText = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: (...a: unknown[]) => generateText(...a) };
});
vi.mock("@/lib/ai/providers", () => ({ getModel: vi.fn(async () => ({ id: "m" })) }));
const preprocessResume = vi.fn();
const preprocessJob = vi.fn();
vi.mock("@/lib/ai/tools/preprocessing", () => ({
  preprocessResume: (...a: unknown[]) => preprocessResume(...a),
}));
vi.mock("@/lib/ai/tools/preprocessing-job", () => ({
  preprocessJob: (...a: unknown[]) => preprocessJob(...a),
}));
vi.mock("@/lib/scraper/automation-run/aiSettings", () => ({
  getUserAiSettings: async () => ({ provider: "ollama", model: undefined }),
  getDefaultModelForProvider: () => "qwen3.5:9b",
}));
const finish = vi.fn();
const startAiCall = vi.fn((..._a: unknown[]) => ({ finish }));
vi.mock("@/lib/aiUsage/tracker", () => ({
  startAiCall: (...a: unknown[]) => startAiCall(...a),
}));

import {
  matchStoredJob,
  storedMatchFailureMessage,
} from "@/lib/ai/jobMatch/matchStoredJob";

const db = prisma as any;
const SCORED = "SCORES: match=82 recommendation=good\n\nStrong fit.";
const input = {
  userId: "user-1",
  jobId: "job-1",
  resumeId: "res-1",
  feature: "job_match" as const,
};

function setup({ matchData = null as string | null } = {}) {
  db.job.findFirst.mockResolvedValue({ id: "job-1", matchData });
  db.resume.findFirst.mockResolvedValue({ id: "res-1", title: "Main resume" });
  preprocessResume.mockResolvedValue({ success: true, data: { normalizedText: "resume" } });
  preprocessJob.mockResolvedValue({ success: true, data: { normalizedText: "job" } });
}

describe("matchStoredJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it("scopes both reads by user and stores a merged, analyzed match", async () => {
    setup({ matchData: JSON.stringify({ prerankScore: 0.4, analyzed: false, matchScore: 0 }) });
    generateText.mockResolvedValue({ text: SCORED, totalUsage: {}, finishReason: "stop" });

    const out = await matchStoredJob({ ...input, surface: "batch" });

    expect(db.job.findFirst.mock.calls[0][0].where).toEqual({ id: "job-1", userId: "user-1" });
    expect(db.resume.findFirst.mock.calls[0][0].where).toEqual({ id: "res-1", profile: { userId: "user-1" } });
    expect(out).toEqual({ status: "ok", matchScore: 82 });
    const { where, data } = db.job.update.mock.calls[0][0];
    expect(where).toEqual({ id: "job-1", userId: "user-1" });
    expect(data.matchScore).toBe(82);
    const saved = JSON.parse(data.matchData);
    expect(saved).toMatchObject({
      prerankScore: 0.4,
      analyzed: true,
      matchScore: 82,
      body: expect.stringContaining("Strong fit."),
      resumeId: "res-1",
      resumeTitle: "Main resume",
      provider: "ollama",
      model: "qwen3.5:9b",
      surface: "batch",
    });
    expect(startAiCall).toHaveBeenCalledWith({ userId: "user-1", feature: "job_match", provider: "ollama", model: "qwen3.5:9b" });
  });

  it("keeps the row's surface when none is given", async () => {
    setup({ matchData: JSON.stringify({ surface: "chat" }) });
    generateText.mockResolvedValue({ text: SCORED, totalUsage: {}, finishReason: "stop" });
    expect((await matchStoredJob(input)).status).toBe("ok");
    expect(JSON.parse(db.job.update.mock.calls[0][0].data.matchData).surface).toBe("chat");
  });

  it.each([
    ["job_not_found", () => db.job.findFirst.mockResolvedValue(null)],
    ["resume_not_found", () => db.resume.findFirst.mockResolvedValue(null)],
    ["unreadable", () => preprocessJob.mockResolvedValue({ success: false })],
  ])("returns %s without calling the AI or writing", async (status, arrange) => {
    arrange();
    const out = await matchStoredJob(input);
    expect(out.status).toBe(status);
    expect(generateText).not.toHaveBeenCalled();
    expect(db.job.update).not.toHaveBeenCalled();
  });

  it("names which side was unreadable", async () => {
    preprocessResume.mockResolvedValue({ success: false });
    expect(await matchStoredJob(input)).toEqual({ status: "unreadable", what: "resume" });
  });

  it("writes nothing when the AI returns no scores line", async () => {
    generateText.mockResolvedValue({ text: "no scores here", totalUsage: {}, finishReason: "stop" });
    expect(await matchStoredJob(input)).toEqual({ status: "no_score" });
    expect(db.job.update).not.toHaveBeenCalled();
  });

  it("reports a provider error as failed, writing nothing", async () => {
    generateText.mockRejectedValue(new Error("fetch failed"));
    expect(await matchStoredJob(input)).toEqual({ status: "failed", message: "fetch failed" });
    expect(db.job.update).not.toHaveBeenCalled();
  });

  it("reports aborted when the caller's signal fired, and passes it to the AI", async () => {
    const controller = new AbortController();
    generateText.mockImplementation(async ({ abortSignal }: { abortSignal: AbortSignal }) => {
      controller.abort();
      expect(abortSignal.aborted).toBe(true);
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    expect(await matchStoredJob({ ...input, signal: controller.signal })).toEqual({ status: "aborted" });
    expect(db.job.update).not.toHaveBeenCalled();
  });

  it("gives every failure a readable message", () => {
    expect(storedMatchFailureMessage({ status: "unreadable", what: "job" })).toMatch(/job description/);
    expect(storedMatchFailureMessage({ status: "failed", message: "boom" })).toBe("boom");
  });
});
