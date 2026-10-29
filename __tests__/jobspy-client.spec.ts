import { searchJobSpy, jobSpyServiceUrl } from "@/lib/scraper/jobspy";
import { formatSalary, mapJobSpyJob } from "@/lib/scraper/jobspy/mapper";
import type { JobSpyJob, JobSpySearch } from "@/lib/scraper/jobspy/types";

const search: JobSpySearch = {
  searchTerms: ["Software Engineer", "AI Engineer"],
  sites: ["indeed"],
  location: "United States",
  isRemote: true,
  hoursOld: 26,
  resultsPerTerm: 100,
};

function serviceJob(over: Partial<JobSpyJob> = {}): JobSpyJob {
  return {
    id: "in-1",
    site: "indeed",
    searchTerm: "Software Engineer",
    title: " Software Engineer ",
    company: "Acme",
    location: "San Francisco, CA, USA",
    description: "<p>Build</p>",
    url: "https://job-boards.greenhouse.io/acme/jobs/1",
    boardUrl: "https://www.indeed.com/viewjob?jk=1",
    postedDate: "2026-10-27",
    salary: { min: 120000, max: 150000, interval: "yearly", currency: "USD" },
    jobType: "fulltime",
    isRemote: true,
    ...over,
  };
}

function respond(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchJobSpy", () => {
  it("posts the search to the service and maps its jobs and errors", async () => {
    const fetchMock = respond({
      jobs: [serviceJob()],
      errors: [{ site: "indeed", searchTerm: "AI Engineer", reason: "429 Too Many Requests" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchJobSpy(search);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://jobspy:8000/scrape");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(search);
    expect(result.errors).toEqual([{ token: "AI Engineer", reason: "429 Too Many Requests" }]);
    expect(result.jobs).toEqual([
      {
        title: "Software Engineer",
        company: "Acme",
        location: "San Francisco, CA, USA",
        description: "<p>Build</p>",
        url: "https://job-boards.greenhouse.io/acme/jobs/1",
        postedDate: "2026-10-27",
        salary: "$120k–$150k/yr",
        employmentType: "fulltime",
        isRemote: true,
        workplaceType: "REMOTE",
        site: "Indeed",
      },
    ]);
  });

  it("uses JOBSPY_SERVICE_URL when set, without a trailing slash", async () => {
    vi.stubEnv("JOBSPY_SERVICE_URL", "http://localhost:18000/");
    const fetchMock = respond({ jobs: [], errors: [] });
    vi.stubGlobal("fetch", fetchMock);
    await searchJobSpy(search);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:18000/scrape");
    expect(jobSpyServiceUrl()).toBe("http://localhost:18000");
  });

  it("fails every term when the service can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await searchJobSpy(search);
    expect(result.jobs).toEqual([]);
    expect(result.errors.map((e) => e.token)).toEqual(["Software Engineer", "AI Engineer"]);
    expect(result.errors[0].reason).toMatch(/not reachable/);
  });

  it("fails every term on a non-200 response", async () => {
    vi.stubGlobal("fetch", respond({ detail: "bad" }, 422));
    const result = await searchJobSpy(search);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toBe("the JobSpy service returned 422");
  });

  it.each([
    ["non-JSON", () => vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 200 }))],
    ["wrong shape", () => respond({ results: [] })],
  ])("fails every term on a %s body", async (_label, make) => {
    vi.stubGlobal("fetch", make());
    const result = await searchJobSpy(search);
    expect(result.jobs).toEqual([]);
    expect(result.errors[0].reason).toMatch(/unreadable/);
  });

  it("rethrows when the run itself is cancelled", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException("aborted", "AbortError"));
      }),
    );
    await expect(searchJobSpy(search, controller.signal)).rejects.toThrow("aborted");
  });
});

describe("mapJobSpyJob", () => {
  it("leaves workplaceType unset for a job Indeed doesn't mark remote", () => {
    const job = mapJobSpyJob(serviceJob({ isRemote: false }));
    expect(job.workplaceType).toBeUndefined();
    expect(job.isRemote).toBe(false);
  });

  it("drops nulls to undefined", () => {
    const job = mapJobSpyJob(serviceJob({ postedDate: null, jobType: null, isRemote: null, salary: null }));
    expect(job.postedDate).toBeUndefined();
    expect(job.employmentType).toBeUndefined();
    expect(job.isRemote).toBeUndefined();
    expect(job.salary).toBeUndefined();
  });

  it("keeps an unknown site's own name", () => {
    expect(mapJobSpyJob(serviceJob({ site: "bayt" })).site).toBe("bayt");
  });
});

describe("formatSalary", () => {
  it.each([
    [{ min: 120000, max: 150000, interval: "yearly", currency: "USD" }, "$120k–$150k/yr"],
    [{ min: 60200, max: 75500, interval: "yearly", currency: "USD" }, "$60.2k–$75.5k/yr"],
    [{ min: 45, max: 45, interval: "hourly", currency: "USD" }, "$45/hr"],
    [{ min: 32.5, max: null, interval: "hourly", currency: null }, "from $32.50/hr"],
    [{ min: null, max: 9000, interval: "monthly", currency: "USD" }, "up to $9k/mo"],
    [{ min: 50000, max: 60000, interval: "yearly", currency: "cad" }, "50k–60k/yr CAD"],
    [{ min: 100000, max: 120000, interval: null, currency: "USD" }, "$100k–$120k"],
  ])("formats %j as %s", (salary, expected) => {
    expect(formatSalary(salary)).toBe(expected);
  });

  it("returns undefined without amounts", () => {
    expect(formatSalary(null)).toBeUndefined();
    expect(formatSalary({ min: null, max: null, interval: "yearly", currency: "USD" })).toBeUndefined();
  });
});
