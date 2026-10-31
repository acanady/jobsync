import { parseJobMatch } from "@/lib/ai/jobMatch/parse";
import {
  formatSuggestedSalary,
  parseSalaryLine,
  SALARY_LINE_INSTRUCTIONS,
  SALARY_LINE_SPEC,
} from "@/lib/ai/jobMatch/salary";
import { JOB_MATCH_SYSTEM_PROMPT, buildJobMatchPrompt } from "@/lib/ai/prompts/job-match";
import {
  AUTOMATION_JOB_MATCH_SYSTEM_PROMPT,
  buildAutomationJobMatchPrompt,
} from "@/lib/ai/prompts/automation-match";
import { buildMatchDirective } from "@/lib/mcp/tools/matchDirective";
import { convertJobToText } from "@/lib/ai/tools/preprocessing-job";

const SCORES = "SCORES: match=82 recommendation=good";
const SALARY = "SALARY: low=135000 high=150000 currency=USD period=year basis=posted";

describe("parseSalaryLine", () => {
  it("reads a well-formed line", () => {
    expect(parseSalaryLine(SALARY)).toEqual({
      low: 135000,
      high: 150000,
      currency: "USD",
      period: "year",
      basis: "posted",
    });
  });

  it("tolerates commas, $, k suffixes, case and short period names", () => {
    expect(parseSalaryLine("salary: low=$120,000 high=140k currency=usd period=yr basis=Estimated")).toEqual({
      low: 120000,
      high: 140000,
      currency: "USD",
      period: "year",
      basis: "estimated",
    });
    expect(parseSalaryLine("SALARY: low=55 high=70 currency=USD period=hr basis=posted")?.period).toBe("hour");
  });

  it.each([
    ["inverted", "SALARY: low=150000 high=120000 currency=USD period=year basis=posted"],
    ["too low for a year", "SALARY: low=120 high=150 currency=USD period=year basis=posted"],
    ["too high for an hour", "SALARY: low=90000 high=120000 currency=USD period=hour basis=posted"],
    ["absurdly wide", "SALARY: low=20000 high=500000 currency=USD period=year basis=estimated"],
    ["missing basis", "SALARY: low=120000 high=150000 currency=USD period=year"],
    ["placeholders", SALARY_LINE_SPEC],
  ])("drops a %s line", (_, line) => {
    expect(parseSalaryLine(line)).toBeUndefined();
  });
});

describe("parseJobMatch with a salary line", () => {
  it("returns the salary and hides the line from the body", () => {
    const { scores, salary, body } = parseJobMatch(`${SCORES}\n${SALARY}\n\n## Summary\nStrong fit`);
    expect(scores?.matchScore).toBe(82);
    expect(salary?.low).toBe(135000);
    expect(body).toBe("## Summary\nStrong fit");
  });

  it("finds it after a blank line, or before the scores line", () => {
    expect(parseJobMatch(`${SCORES}\n\n${SALARY}\n\nBody`)).toMatchObject({ body: "Body", salary: { high: 150000 } });
    expect(parseJobMatch(`${SALARY}\n${SCORES}\n\nBody`)).toMatchObject({ body: "Body", scores: { matchScore: 82 } });
  });

  it("hides a malformed or half-streamed salary line without a salary", () => {
    const streaming = parseJobMatch(`${SCORES}\nSALARY: low=1350`);
    expect(streaming.body).toBe("");
    expect(streaming.salary).toBeUndefined();
    const bad = parseJobMatch(`${SCORES}\nSALARY: unknown\n\nBody`);
    expect(bad).toEqual({ scores: { matchScore: 82, recommendation: "good match" }, body: "Body" });
  });

  it("leaves a match without a salary line as before", () => {
    expect(parseJobMatch(`${SCORES}\n\nBody`)).toEqual({
      scores: { matchScore: 82, recommendation: "good match" },
      body: "Body",
    });
  });

  it("only strips a line that starts with SALARY:", () => {
    const { body } = parseJobMatch(`${SCORES}\n\n## Summary\nThe SALARY: field is blank in the posting.`);
    expect(body).toContain("The SALARY: field is blank");
  });
});

describe("formatSuggestedSalary", () => {
  it.each([
    [{ low: 135000, high: 150000, currency: "USD", period: "year" }, "$135k–$150k/yr"],
    [{ low: 65, high: 80, currency: "USD", period: "hour" }, "$65–$80/hr"],
    [{ low: 90000, high: 110000, currency: "EUR", period: "year" }, "€90k–€110k/yr"],
    [{ low: 120000, high: 140000, currency: "AUD", period: "year" }, "AUD 120k–140k/yr"],
  ])("formats %o", (s, out) => {
    expect(formatSuggestedSalary({ basis: "posted", ...(s as any) })).toBe(out);
  });
});

describe("prompts ask for the salary line", () => {
  it("in-app and automation system prompts carry the shared instructions after the scores line", () => {
    for (const prompt of [JOB_MATCH_SYSTEM_PROMPT, AUTOMATION_JOB_MATCH_SYSTEM_PROMPT]) {
      expect(prompt).toContain(SALARY_LINE_INSTRUCTIONS);
      expect(prompt.indexOf("SCORES: match=")).toBeLessThan(prompt.indexOf(SALARY_LINE_SPEC));
    }
    expect(SALARY_LINE_INSTRUCTIONS).toMatch(/basis=posted/);
    expect(SALARY_LINE_INSTRUCTIONS).toMatch(/basis=estimated/);
  });

  it("user prompts ask for it second", () => {
    expect(buildJobMatchPrompt("r", "j")).toMatch(/salary line second/);
    expect(buildAutomationJobMatchPrompt("r", "j")).toMatch(/salary line second/);
  });

  it("the MCP directive asks external agents for it", () => {
    const directive = buildMatchDirective("job-1", "res-1", "resume", "full", "add");
    expect(directive).toContain(SALARY_LINE_SPEC);
    expect(directive).toContain("SCORES line + SALARY line + markdown body");
  });
});

describe("match input", () => {
  it("includes the job's saved salary range", async () => {
    const text = await convertJobToText({
      description: "Build things",
      JobTitle: { label: "Engineer" },
      Company: { label: "Acme" },
      Location: null,
      salaryRange: "$120k–$150k/yr",
    } as any);
    expect(text).toContain("Salary Range: $120k–$150k/yr\nDescription:");
    const none = await convertJobToText({
      description: "Build things",
      JobTitle: { label: "Engineer" },
      Company: { label: "Acme" },
      Location: null,
      salaryRange: null,
    } as any);
    expect(none).not.toContain("Salary Range");
  });
});
