import {
  normalizeJobUrl,
  jobDedupeKey,
  jobDedupeKeySets,
  dedupeJobs,
} from "@/lib/scraper/utils";

describe("normalizeJobUrl", () => {
  it("removes utm_source parameter", () => {
    const url = "https://example.com/job?utm_source=google&id=123";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job?id=123");
  });

  it("removes all UTM parameters", () => {
    const url =
      "https://example.com/job?utm_source=x&utm_medium=y&utm_campaign=z&utm_term=a&utm_content=b&id=1";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job?id=1");
  });

  it("removes fbclid parameter", () => {
    const url = "https://example.com/job?fbclid=abc123&title=dev";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job?title=dev");
  });

  it("removes gclid parameter", () => {
    const url = "https://example.com/job?gclid=xyz&role=swe";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job?role=swe");
  });

  it("removes msclkid parameter", () => {
    const url = "https://example.com/job?msclkid=abc&id=5";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job?id=5");
  });

  it("removes ref, source, tk, from, vjk parameters", () => {
    const url =
      "https://example.com/job?ref=email&source=board&tk=abc&from=search&vjk=xyz&id=1";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job?id=1");
  });

  it("returns clean URL when all params are tracking", () => {
    const url = "https://example.com/job?utm_source=google&fbclid=abc";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job");
  });

  it("preserves non-tracking parameters", () => {
    const url = "https://example.com/job?id=123&position=dev";
    expect(normalizeJobUrl(url)).toBe(
      "https://example.com/job?id=123&position=dev"
    );
  });

  it("preserves URL path and hash", () => {
    const url = "https://example.com/jobs/123#details?utm_source=x";
    const result = normalizeJobUrl(url);
    expect(result).toContain("/jobs/123");
  });

  it("returns original string for invalid URLs", () => {
    const invalid = "not-a-valid-url";
    expect(normalizeJobUrl(invalid)).toBe(invalid);
  });

  it("handles URL with no query parameters", () => {
    const url = "https://example.com/job/123";
    expect(normalizeJobUrl(url)).toBe("https://example.com/job/123");
  });

  it("removes the greenhouse gh_src tracking param but keeps gh_jid", () => {
    const url =
      "https://boards.greenhouse.io/acme/jobs/123?gh_src=abc&gh_jid=123";
    expect(normalizeJobUrl(url)).toBe(
      "https://boards.greenhouse.io/acme/jobs/123?gh_jid=123"
    );
  });

  it("strips a trailing slash from the path", () => {
    expect(normalizeJobUrl("https://example.com/jobs/123/")).toBe(
      "https://example.com/jobs/123"
    );
  });

  it("sorts query params so order does not matter", () => {
    expect(normalizeJobUrl("https://example.com/job?b=2&a=1")).toBe(
      "https://example.com/job?a=1&b=2"
    );
  });
});

describe("jobDedupeKey", () => {
  it("treats trailing slash, host case, and www as the same job", () => {
    const a = jobDedupeKey({ url: "https://www.example.com/jobs/1/" });
    const b = jobDedupeKey({ url: "https://Example.com/jobs/1" });
    expect(a).toBe(b);
  });

  it("treats differing tracking params as the same job", () => {
    const a = jobDedupeKey({ url: "https://ex.com/j/1?gh_src=x&gh_jid=1" });
    const b = jobDedupeKey({ url: "https://ex.com/j/1?gh_src=y&gh_jid=1" });
    expect(a).toBe(b);
  });

  it("falls back to a title/company/location key when url is missing", () => {
    const a = jobDedupeKey({
      title: "Software Engineer",
      company: "Acme",
      location: "Remote",
    });
    const b = jobDedupeKey({
      title: "Software Engineer",
      company: "Acme",
      location: "Remote",
    });
    expect(a).toBe(b);
    expect(a.startsWith("meta:")).toBe(true);
  });

  it("distinguishes different linkless jobs", () => {
    const a = jobDedupeKey({ title: "Engineer", company: "Acme" });
    const b = jobDedupeKey({ title: "Designer", company: "Acme" });
    expect(a).not.toBe(b);
  });

  it("folds a company legal suffix, matching resolveCompany's canonical value", () => {
    const a = jobDedupeKey({ title: "Engineer", company: "Acme Inc." });
    const b = jobDedupeKey({ title: "Engineer", company: "Acme" });
    expect(a).toBe(b);
  });

  it("folds diacritics in the meta key, matching entity resolution", () => {
    const a = jobDedupeKey({ title: "Engineer", company: "Acme", location: "São Paulo" });
    const b = jobDedupeKey({ title: "Engineer", company: "Acme", location: "Sao Paulo" });
    expect(a).toBe(b);
  });
});

describe("dedupeJobs", () => {
  it("removes duplicates within the batch", () => {
    const jobs = [
      { title: "A", company: "X", location: "R", url: "https://ex.com/1" },
      { title: "A", company: "X", location: "R", url: "https://ex.com/1?ref=y" },
    ];
    expect(dedupeJobs(jobs, new Set())).toHaveLength(1);
  });

  it("removes jobs already saved (existing keys)", () => {
    const jobs = [
      { title: "A", company: "X", location: "R", url: "https://ex.com/1" },
    ];
    const existing = new Set([jobDedupeKey(jobs[0])]);
    expect(dedupeJobs(jobs, existing)).toHaveLength(0);
  });

  it("dedups linkless jobs by metadata", () => {
    const jobs = [
      { title: "A", company: "X", location: "R", url: "" },
      { title: "A", company: "X", location: "R", url: "" },
      { title: "B", company: "X", location: "R", url: "" },
    ];
    expect(dedupeJobs(jobs, new Set())).toHaveLength(2);
  });

  it("keeps genuinely distinct jobs", () => {
    const jobs = [
      { title: "A", company: "X", location: "R", url: "https://ex.com/1" },
      { title: "B", company: "Y", location: "R", url: "https://ex.com/2" },
    ];
    expect(dedupeJobs(jobs, new Set())).toHaveLength(2);
  });
});

describe("jobDedupeKey: one key per ATS posting", () => {
  const same = (a: string, b: string) => expect(jobDedupeKey({ url: a })).toBe(jobDedupeKey({ url: b }));
  const differ = (a: string, b: string) => expect(jobDedupeKey({ url: a })).not.toBe(jobDedupeKey({ url: b }));

  it("folds every Greenhouse URL form for one posting", () => {
    const key = jobDedupeKey({ url: "https://job-boards.greenhouse.io/acme/jobs/4703011006" });
    expect(key).toBe("url:greenhouse:4703011006");
    for (const variant of [
      "https://boards.greenhouse.io/acme/jobs/4703011006?gh_jid=4703011006",
      "https://job-boards.eu.greenhouse.io/acme/jobs/4703011006",
      "https://boards.greenhouse.io/embed/job_app?for=acme&token=4703011006",
      // a company careers page carrying Greenhouse's id
      "https://www.acme.com/careers/open-roles?gh_jid=4703011006",
      // what an Indeed grnh.se link resolves to
      "https://job-boards.greenhouse.io/acme/jobs/4703011006?gh_src=q661morm9us",
    ]) {
      expect(jobDedupeKey({ url: variant })).toBe(key);
    }
  });

  it("keeps different Greenhouse postings apart", () => {
    differ("https://job-boards.greenhouse.io/acme/jobs/1", "https://job-boards.greenhouse.io/acme/jobs/2");
  });

  it("folds Lever's /apply suffix, EU host and id case", () => {
    const id = "41c56241-9a9c-473f-a5a2-b11000aa0c23";
    same(`https://jobs.lever.co/shieldai/${id}`, `https://jobs.lever.co/shieldai/${id}/apply`);
    same(`https://jobs.lever.co/shieldai/${id}`, `https://jobs.eu.lever.co/shieldai/${id.toUpperCase()}`);
    differ(`https://jobs.lever.co/shieldai/${id}`, "https://jobs.lever.co/shieldai/51c56241-9a9c-473f-a5a2-b11000aa0c23");
  });

  it("folds Ashby's /application suffix", () => {
    const id = "0b4a5c7e-1234-4f6a-9e1b-2c3d4e5f6a7b";
    same(`https://jobs.ashbyhq.com/acme/${id}`, `https://jobs.ashbyhq.com/acme/${id}/application`);
  });

  it("falls back to the plain URL key when the id isn't a real board id", () => {
    expect(jobDedupeKey({ url: "https://job-boards.greenhouse.io/acme/jobs/abc" })).toBe(
      "url:job-boards.greenhouse.io/acme/jobs/abc",
    );
    expect(jobDedupeKey({ url: "https://jobs.lever.co/acme/not-a-uuid" })).toBe(
      "url:jobs.lever.co/acme/not-a-uuid",
    );
    expect(jobDedupeKey({ url: "https://ex.com/careers?gh_jid=abc" })).toBe("url:ex.com/careers?gh_jid=abc");
    expect(jobDedupeKey({ url: "https://jobs.ashbyhq.com/acme/careers" })).toBe(
      "url:jobs.ashbyhq.com/acme/careers",
    );
  });

  it("does not treat a lookalike host as an ATS", () => {
    expect(jobDedupeKey({ url: "https://jobs.lever.co.evil.example/acme/41c56241-9a9c-473f-a5a2-b11000aa0c23" }))
      .not.toMatch(/^url:lever:/);
    expect(jobDedupeKey({ url: "https://notboards.greenhouse.io.example/acme/jobs/1" }))
      .not.toMatch(/^url:greenhouse:/);
  });
});

describe("dedupeJobs across sources", () => {
  const gh = (id: number, over: Record<string, string> = {}) => ({
    title: "Software Engineer", company: "Acme", location: "Remote, USA",
    url: `https://job-boards.greenhouse.io/acme/jobs/${id}`, ...over,
  });
  const indeed = (jk: string, over: Record<string, string> = {}) => ({
    title: "Software Engineer", company: "Acme, Inc.", location: "Remote, USA",
    url: `https://www.indeed.com/viewjob?jk=${jk}`, ...over,
  });
  const existingFrom = (...jobs: Array<ReturnType<typeof gh>>) =>
    new Set(jobs.flatMap((j) => jobDedupeKeySets(j).own));

  it("drops an Indeed listing of a job already saved from Greenhouse", () => {
    expect(dedupeJobs([indeed("a1")], existingFrom(gh(1)))).toEqual([]);
  });

  it("drops a Greenhouse posting already saved from an Indeed listing", () => {
    expect(dedupeJobs([gh(1)], existingFrom(indeed("a1")))).toEqual([]);
  });

  it("collapses an Indeed listing and its ATS posting in the same batch", () => {
    expect(dedupeJobs([gh(1), indeed("a1")], new Set())).toEqual([gh(1)]);
    expect(dedupeJobs([indeed("a1"), gh(1)], new Set())).toEqual([indeed("a1")]);
  });

  it("never merges two different ATS postings on title/company/location", () => {
    expect(dedupeJobs([gh(1), gh(2)], new Set())).toHaveLength(2);
    expect(dedupeJobs([gh(2)], existingFrom(gh(1)))).toEqual([gh(2)]);
  });

  it("collapses two Indeed listings of the same title/company/location", () => {
    expect(dedupeJobs([indeed("a1"), indeed("b2")], new Set())).toEqual([indeed("a1")]);
  });

  it("keeps jobs whose title or location differ", () => {
    expect(dedupeJobs([indeed("a1", { location: "Austin, TX, USA" })], existingFrom(gh(1)))).toHaveLength(1);
    expect(dedupeJobs([indeed("a1", { title: "Backend Engineer" })], existingFrom(gh(1)))).toHaveLength(1);
  });

  it("does not match on a signature when title or company is missing", () => {
    expect(jobDedupeKeySets(indeed("a1", { company: "" }))).toEqual({
      own: ["url:indeed.com/viewjob?jk=a1"],
      probes: ["url:indeed.com/viewjob?jk=a1"],
    });
  });

  it("leaves linkless jobs on their single meta key", () => {
    const linkless = { title: "Software Engineer", company: "Acme", location: "Remote, USA" };
    expect(jobDedupeKeySets(linkless)).toEqual({ own: [jobDedupeKey(linkless)], probes: [jobDedupeKey(linkless)] });
    expect(dedupeJobs([linkless], existingFrom(gh(1)))).toHaveLength(1);
  });
});
