import { CreateAutomationSchema } from "@/models/automation.schema";

const base = {
  name: "Test",
  resumeId: "550e8400-e29b-41d4-a716-446655440000",
  matchThreshold: 80,
  scheduleHour: 8,
};

describe("CreateAutomationSchema conditional validation", () => {
  it("rejects a retired job board", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "jsearch",
      keywords: "frontend",
      location: "Canada",
    });
    expect(result.success).toBe(false);
  });

  it("greenhouse requires at least one company", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "greenhouse",
      sourceConfig: { greenhouse: { companies: [] } },
    });
    expect(result.success).toBe(false);
  });

  it("greenhouse passes with one company and no keywords/location", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "greenhouse",
      sourceConfig: {
        greenhouse: {
          companies: [{ name: "Anthropic", token: "anthropic" }],
          targetTitles: ["Frontend Engineer"],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("greenhouse accepts topK within 1-50 and a saveUnanalyzed boolean", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "greenhouse",
      sourceConfig: {
        greenhouse: {
          companies: [{ name: "Anthropic", token: "anthropic" }],
          topK: 25,
          saveUnanalyzed: false,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("greenhouse keeps excludeTitles through validation", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "greenhouse",
      sourceConfig: {
        greenhouse: {
          companies: [{ name: "Anthropic", token: "anthropic" }],
          excludeTitles: ["Senior", "Staff"],
        },
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.sourceConfig?.greenhouse?.excludeTitles).toEqual([
      "Senior",
      "Staff",
    ]);
  });

  it("greenhouse rejects topK of 0", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "greenhouse",
      sourceConfig: {
        greenhouse: {
          companies: [{ name: "Anthropic", token: "anthropic" }],
          topK: 0,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("greenhouse rejects topK of 51", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "greenhouse",
      sourceConfig: {
        greenhouse: {
          companies: [{ name: "Anthropic", token: "anthropic" }],
          topK: 51,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("ashby requires at least one company", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "ashby",
      sourceConfig: { ashby: { companies: [] } },
    });
    expect(result.success).toBe(false);
  });

  it("ashby passes with one company", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "ashby",
      sourceConfig: {
        ashby: { companies: [{ name: "Ramp", token: "ramp" }] },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("CreateAutomationSchema: jobspy (search) board", () => {
  const jobspy = (cfg: Record<string, unknown>) =>
    CreateAutomationSchema.safeParse({ ...base, jobBoard: "jobspy", sourceConfig: { jobspy: cfg } });

  it("needs no companies: search terms are enough", () => {
    expect(jobspy({ searchTerms: ["Software Engineer"] }).success).toBe(true);
  });

  it("accepts target titles alone, which become the searches", () => {
    expect(jobspy({ targetTitles: ["Software Engineer"], excludeTitles: ["Senior"], remoteUsOnly: true }).success)
      .toBe(true);
  });

  it("rejects a search with neither search terms nor target titles", () => {
    const result = jobspy({ keywords: ["Python"] });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path).toEqual(["sourceConfig", "jobspy", "searchTerms"]);
  });

  it("rejects a missing jobspy config", () => {
    expect(CreateAutomationSchema.safeParse({ ...base, jobBoard: "jobspy" }).success).toBe(false);
  });

  it("caps searches at 20, whether from terms or titles", () => {
    const many = Array.from({ length: 21 }, (_, i) => `Title ${i}`);
    expect(jobspy({ searchTerms: many }).success).toBe(false);
    expect(jobspy({ targetTitles: many }).success).toBe(false);
    expect(jobspy({ searchTerms: many.slice(0, 20) }).success).toBe(true);
  });

  it.each([
    ["a non-Indeed site", { sites: ["linkedin"] }],
    ["hoursOld 0", { hoursOld: 0 }],
    ["hoursOld over 30 days", { hoursOld: 721 }],
    ["resultsPerTerm over 200", { resultsPerTerm: 201 }],
    ["a blank search term", { searchTerms: ["  "] }],
  ])("rejects %s", (_label, extra) => {
    expect(jobspy({ searchTerms: ["Software Engineer"], ...extra }).success).toBe(false);
  });

  it("still requires companies for a company board", () => {
    const result = CreateAutomationSchema.safeParse({
      ...base,
      jobBoard: "lever",
      sourceConfig: { lever: { companies: [] }, jobspy: { searchTerms: ["x"] } },
    });
    expect(result.success).toBe(false);
  });
});
