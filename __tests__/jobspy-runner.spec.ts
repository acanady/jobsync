import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const m = {
    automationRun: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    automation: { findUnique: vi.fn(), update: vi.fn() },
    resume: { findUnique: vi.fn() },
    userSettings: { findUnique: vi.fn() },
    job: { findMany: vi.fn(), create: vi.fn() },
    jobTitle: { findUnique: vi.fn(), create: vi.fn() },
    location: { findUnique: vi.fn(), create: vi.fn() },
    company: { findUnique: vi.fn(), create: vi.fn() },
    jobSource: { findUnique: vi.fn(), create: vi.fn() },
    jobStatus: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    jobStage: { create: vi.fn() },
    jobStageType: {
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(function () {
      return m;
    }),
  };
});

vi.mock("@/lib/scraper/greenhouse", () => ({
  searchGreenhouseJobs: vi.fn(),
}));

vi.mock("@/lib/scraper/lever", () => ({
  searchLeverJobs: vi.fn(),
}));

vi.mock("@/lib/scraper/ashby", () => ({
  searchAshbyJobs: vi.fn(),
}));

vi.mock("@/lib/api-key-resolver", () => ({
  resolveApiKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai/provider-registry.server", () => ({
  PROVIDER_VERIFIERS: { ollama: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock("ai", () => ({ generateText: vi.fn() }));

vi.mock("@/lib/notifications/record", () => ({
  recordRunNotifications: vi.fn(),
}));

vi.mock("@/lib/ai", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, getModel: vi.fn().mockResolvedValue({}) };
});

import { runAutomation } from "@/lib/scraper/runner";
import { searchGreenhouseJobs } from "@/lib/scraper/greenhouse";
import { searchLeverJobs } from "@/lib/scraper/lever";
import { generateText } from "ai";
import type { Automation } from "@/models/automation.model";

// A fake jobspy-service: the real client, mapper, filters, dedup and save run
// against it. Each test sets the jobs and errors it answers with.
function serviceJob(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    site: "indeed",
    searchTerm: "Software Engineer",
    title: "Software Engineer",
    company: "Acme",
    location: "Remote, USA",
    description: "<p>Python services</p>",
    url: `https://www.indeed.com/viewjob?jk=${id}`,
    boardUrl: `https://www.indeed.com/viewjob?jk=${id}`,
    postedDate: "2026-10-28",
    salary: { min: 120000, max: 150000, interval: "yearly", currency: "USD" },
    jobType: "fulltime",
    isRemote: true,
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
function serviceAnswers(body: unknown, status = 200) {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
}
const sentSearch = () => JSON.parse(fetchMock.mock.calls[0][1].body);

const jobspyAutomation: Automation = {
  id: "auto-jobspy",
  userId: "user1",
  name: "Indeed",
  jobBoard: "jobspy",
  keywords: "",
  location: "",
  sourceConfig: JSON.stringify({
    jobspy: {
      targetTitles: ["Software Engineer", "AI Engineer"],
      keywords: ["Python"],
      excludeTitles: ["Senior", "Staff"],
      remoteUsOnly: true,
      locations: [],
      strictLocation: false,
    },
  }),
  resumeId: "resume1",
  matchThreshold: 80,
  scheduleHour: 8,
  nextRunAt: null,
  lastRunAt: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("runAutomation (jobspy)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (prisma.automationRun.create as any).mockResolvedValue({ id: "run1" });
    (prisma.automationRun.update as any).mockResolvedValue({
      id: "run1",
      automationId: "auto-jobspy",
    });
    (prisma.automation.findUnique as any).mockResolvedValue({ scheduleHour: 8 });
    (prisma.automation.update as any).mockResolvedValue({});
    (prisma.userSettings.findUnique as any).mockResolvedValue(null);
    (prisma.resume.findUnique as any).mockResolvedValue({
      id: "resume1",
      title: "My Resume",
      ContactInfo: null,
      ResumeSections: [],
    });
    (prisma.job.findMany as any).mockResolvedValue([]);
    (prisma.job.create as any).mockResolvedValue({});
    (prisma.jobTitle.findUnique as any).mockResolvedValue({ id: "jt" });
    (prisma.location.findUnique as any).mockResolvedValue({ id: "loc" });
    (prisma.company.findUnique as any).mockResolvedValue({ id: "co" });
    (prisma.jobSource.findUnique as any).mockResolvedValue({ id: "src" });
    (prisma.jobStatus.findFirst as any).mockResolvedValue({ id: "st" });
    // Every saved job now gets its first current stage, which resolves the
    // status-named stage type through the same Prisma mock.
    (prisma.jobStatus.findUnique as any).mockResolvedValue({
      id: "st",
      label: "New",
    });
    (prisma.jobStageType.findUnique as any).mockResolvedValue({
      id: "stage-type-new",
      label: "New",
    });
    (prisma.jobStage.create as any).mockResolvedValue({ id: "stage-1" });

    (generateText as any).mockResolvedValue({
      text: "SCORES: match=90 recommendation=strong match\n\n## Summary\nGreat fit",
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("searches each target title remotely, then filters, dedupes and saves through the ATS pipeline", async () => {
    // A job already saved from Greenhouse that Indeed also lists.
    (prisma.job.findMany as any).mockResolvedValue([{
      id: "existing", jobUrl: "https://job-boards.greenhouse.io/globex/jobs/77",
      JobTitle: { label: "AI Engineer" }, Company: { label: "Globex" }, Location: { label: "Remote, USA" },
    }]);
    serviceAnswers({
      jobs: [
        serviceJob("keep"),
        serviceJob("senior", { title: "Senior Software Engineer" }),
        serviceJob("canada", { location: "Toronto, ON, Canada" }),
        serviceJob("dup", { title: "AI Engineer", company: "Globex, Inc.", searchTerm: "AI Engineer" }),
      ],
      errors: [],
    });

    const result = await runAutomation(jobspyAutomation);

    expect(sentSearch()).toEqual({
      searchTerms: ["Software Engineer", "AI Engineer"],
      sites: ["indeed"],
      location: "United States",
      isRemote: true,
      hoursOld: 26,
      resultsPerTerm: 100,
    });
    expect(searchGreenhouseJobs).not.toHaveBeenCalled();
    expect(searchLeverJobs).not.toHaveBeenCalled();
    expect(result.status).toBe("completed");
    expect(result.jobsSearched).toBe(4);
    expect(result.jobsDeduplicated).toBe(3); // the Globex listing matched the saved Greenhouse job
    expect(result.jobsSaved).toBe(1);

    const saved = (prisma.job.create as any).mock.calls.map((c: any) => c[0].data);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      jobUrl: "https://www.indeed.com/viewjob?jk=keep",
      salaryRange: "$120k–$150k/yr",
      workplaceType: "REMOTE",
      description: "<p>Python services</p>",
    });
    // Saved under the site it came from, not "Jobspy".
    const sourceLookups = (prisma.jobSource.findUnique as any).mock.calls.map((c: any) => c[0].where.value_createdBy.value);
    expect(sourceLookups).toEqual(["indeed"]);

    const funnel = JSON.parse((prisma.automationRun.update as any).mock.calls.at(-1)[0].data.funnelStats);
    expect(Object.fromEntries(funnel.map((s: any) => [s.key, s.count]))).toMatchObject({
      fetched: 4, dedup: 3, remoteUs: 2, titleFiltered: 1,
    });
  });

  it("uses explicit search terms when the automation has them", async () => {
    serviceAnswers({ jobs: [], errors: [] });
    await runAutomation({
      ...jobspyAutomation,
      sourceConfig: JSON.stringify({ jobspy: { targetTitles: ["Software Engineer"], searchTerms: ["Forward Deployed Engineer"] } }),
    });
    expect(sentSearch().searchTerms).toEqual(["Forward Deployed Engineer"]);
    expect(sentSearch().isRemote).toBe(false);
  });

  it("completes with errors when some searches fail", async () => {
    serviceAnswers({
      jobs: [serviceJob("keep")],
      errors: [{ site: "indeed", searchTerm: "AI Engineer", reason: "429 Too Many Requests" }],
    });
    const result = await runAutomation(jobspyAutomation);
    expect(result.status).toBe("completed_with_errors");
    expect(result.errorMessage).toBe("1 of 2 searches had errors");
    expect(result.jobsSaved).toBe(1);
  });

  it("counts a term with several reported problems once", async () => {
    serviceAnswers({
      jobs: [serviceJob("keep")],
      errors: [
        { site: "indeed", searchTerm: "AI Engineer", reason: "blocked" },
        { site: "indeed", searchTerm: "AI Engineer", reason: "retry failed" },
      ],
    });
    const result = await runAutomation(jobspyAutomation);
    expect(result.errorMessage).toBe("1 of 2 searches had errors");
  });

  it("keeps the jobs when every search reports a problem but some still returned jobs", async () => {
    serviceAnswers({
      jobs: [serviceJob("keep")],
      errors: [
        { site: "indeed", searchTerm: "Software Engineer", reason: "partial page" },
        { site: "indeed", searchTerm: "AI Engineer", reason: "429 Too Many Requests" },
      ],
    });
    const result = await runAutomation(jobspyAutomation);
    expect(result.status).toBe("completed_with_errors");
    expect(result.errorMessage).toBe("2 of 2 searches had errors");
    expect(result.jobsSaved).toBe(1);
  });

  it("cancelling the run aborts the in-flight JobSpy request", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        requestSignal = init.signal ?? undefined;
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
          controller.abort();
        });
      }),
    );
    const result = await runAutomation(jobspyAutomation, controller.signal);
    expect(requestSignal?.aborted).toBe(true);
    expect(result.status).toBe("cancelled");
  });

  it("fails the run when the JobSpy service is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await runAutomation(jobspyAutomation);
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("All 2 searches failed");
    expect(prisma.job.create).not.toHaveBeenCalled();
  });

  it("fails cleanly with no_search_terms when there is nothing to search", async () => {
    vi.stubGlobal("fetch", (fetchMock = vi.fn()));
    const result = await runAutomation({
      ...jobspyAutomation,
      sourceConfig: JSON.stringify({ jobspy: { keywords: ["Python"] } }),
    });
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("no_search_terms");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
