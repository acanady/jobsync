import { buildTailorResumeTool } from "@/lib/agent/tools/tailorResume";
import { buildUpdateResumeTool } from "@/lib/agent/tools/updateResume";
import { resolveJobForAgent } from "@/lib/agent/jobLookup";
import { resolveResumeForAgent } from "@/lib/agent/resumeLookup";
import { preprocessJob } from "@/lib/ai/tools/preprocessing-job";
import { RESUME_TAILOR_SYSTEM_PROMPT } from "@/lib/ai/prompts/resume-tailor";
import { updateResumeSettled } from "@/models/agent.model";

vi.mock("@/lib/agent/jobLookup", () => ({ resolveJobForAgent: vi.fn() }));
vi.mock("@/lib/agent/resumeLookup", () => ({ resolveResumeForAgent: vi.fn() }));
vi.mock("@/lib/ai/tools/preprocessing-job", () => ({ preprocessJob: vi.fn() }));

const streamText = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: (...args: unknown[]) => streamText(...(args as [])) };
});

const findJob = resolveJobForAgent as unknown as ReturnType<typeof vi.fn>;
const findResume = resolveResumeForAgent as unknown as ReturnType<typeof vi.fn>;
const preJob = preprocessJob as unknown as ReturnType<typeof vi.fn>;

function textStreamOf(chunks: string[], finishReason: unknown = "stop") {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    finishReason: Promise.resolve(finishReason),
  };
}

const RESUME = {
  id: "r1",
  title: "Software Dev Resume",
  ContactInfo: { headline: "Engineer" },
  ResumeSections: [
    {
      sectionType: "skills",
      skills: [
        { order: 0, category: "Languages", Tag: { label: "Python" } },
        { order: 1, category: "Languages", Tag: { label: "C++" } },
      ],
    },
    {
      sectionType: "experience",
      workExperiences: [
        {
          Company: { label: "Cisco Systems Inc" },
          jobTitle: { label: "Software Engineer II" },
          startDate: new Date("2025-05-01"),
          description: "<ul><li><p>Built a client</p></li></ul>",
        },
      ],
    },
  ],
};

const TAILORED = [
  "## Headline",
  "Systems Integration Engineer",
  "## Skills",
  "### Languages",
  "- C++",
  "- Python",
  "- Rust",
  "## Experience: Cisco Systems Inc | Software Engineer II",
  "- Built a high-throughput REST client",
  "## Notes",
  "- Led with systems work.",
].join("\n");

const writer = { write: vi.fn(), merge: vi.fn(), onError: undefined };
const ctx = (overrides: Record<string, unknown> = {}) => ({
  userId: "session-user",
  pageJobId: "job-1",
  model: { id: "fake-model" } as any,
  provider: "ollama",
  modelName: "qwen3.5:9b",
  writer: writer as any,
  guard: { running: false, elapsedMs: 0 },
  ...overrides,
});
const execute = (agentTool: any, input: any) =>
  agentTool.execute(input, { toolCallId: "call-1", messages: [] });

describe("tailor_resume agent tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findJob.mockResolvedValue({
      status: "ok",
      job: {
        id: "job-1",
        resumeId: "r1",
        descriptionCompleteness: "full",
        JobTitle: { label: "Integration Engineer" },
        Company: { label: "Acme" },
      },
    });
    findResume.mockResolvedValue({ status: "ok", resume: RESUME, source: "page", ambiguousTitle: false });
    preJob.mockResolvedValue({ success: true, data: { normalizedText: "Job: Integration Engineer" } });
    streamText.mockReturnValue(textStreamOf([TAILORED]));
  });

  it("never asks for approval and never writes: the card applies", () => {
    expect(buildTailorResumeTool(ctx()).needsApproval).toBeUndefined();
  });

  it("uses the session user and page job, never model input", async () => {
    await execute(buildTailorResumeTool(ctx()), { userId: "attacker", jobId: "other" });
    expect(findJob).toHaveBeenCalledWith("session-user", "job-1");
    expect(findResume).toHaveBeenCalledWith("session-user", expect.objectContaining({ pageResumeId: "r1" }));
  });

  it("returns a fitted proposal, dropping skills the resume does not have", async () => {
    const out = await execute(buildTailorResumeTool(ctx()), { requests: "lead with C++" });
    expect(out.status).toBe("ok");
    expect(out.proposal).toMatchObject({
      resumeId: "r1",
      job: { id: "job-1", title: "Integration Engineer", company: "Acme" },
      edits: {
        headline: "Systems Integration Engineer",
        skills: [{ category: "Languages", skills: ["C++", "Python"] }],
        experiences: [{ company: "Cisco Systems Inc", bullets: ["Built a high-throughput REST client"] }],
      },
      notes: ["Led with systems work."],
    });
    expect(out.proposal.warnings.join(" ")).toContain("Rust");
    const args = streamText.mock.calls[0][0];
    expect(args.system).toBe(RESUME_TAILOR_SYSTEM_PROMPT);
    expect(args.prompt).toContain("lead with C++");
  });

  it("reports no_job without generating", async () => {
    findJob.mockResolvedValue({ status: "no_job" });
    expect(await execute(buildTailorResumeTool(ctx()), {})).toEqual({ status: "no_job" });
    expect(streamText).not.toHaveBeenCalled();
  });

  it("reports an unparseable generation as no_changes", async () => {
    streamText.mockReturnValue(textStreamOf(["Sorry, I can't help with that."]));
    const out = await execute(buildTailorResumeTool(ctx()), {});
    expect(out.status).toBe("no_changes");
  });

  it("reports an interrupted generation as generation_failed", async () => {
    streamText.mockReturnValue(textStreamOf([TAILORED], "length"));
    const out = await execute(buildTailorResumeTool(ctx()), {});
    expect(out.status).toBe("generation_failed");
  });
});

describe("update_resume agent tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findResume.mockResolvedValue({ status: "ok", resume: RESUME, source: "page", ambiguousTitle: false });
  });

  it("proposes dictated edits, allowing new skills", async () => {
    const out = await execute(buildUpdateResumeTool("session-user", "r1"), {
      edits: {
        headline: "New headline",
        skills: [{ category: "Languages", skills: ["Python", "C++", "Bash"] }],
      },
    });
    expect(findResume).toHaveBeenCalledWith("session-user", { title: undefined, pageResumeId: "r1" });
    expect(out.status).toBe("ok");
    expect(out.proposal.edits).toEqual({
      headline: "New headline",
      skills: [{ category: "Languages", skills: ["Python", "C++", "Bash"] }],
    });
  });

  it("says when nothing would change", async () => {
    const out = await execute(buildUpdateResumeTool("session-user"), {
      edits: { headline: "Engineer" },
    });
    expect(out).toMatchObject({ status: "no_changes", resumeTitle: "Software Dev Resume" });
  });

  it("passes a selection request through", async () => {
    findResume.mockResolvedValue({ status: "needs_selection", resumes: [{ id: "a", title: "A" }] });
    const out = await execute(buildUpdateResumeTool("session-user"), { edits: { headline: "x" } });
    expect(out.status).toBe("needs_selection");
  });
});

describe("updateResumeSettled", () => {
  it("ends the turn only once a valid call produced its card", () => {
    expect(updateResumeSettled({ toolCalls: [{ toolName: "update_resume", invalid: true }] })).toBe(false);
    expect(updateResumeSettled({ toolCalls: [{ toolName: "update_resume" }] })).toBe(false);
    expect(
      updateResumeSettled({
        toolCalls: [{ toolName: "update_resume" }],
        toolResults: [{ toolName: "update_resume" }],
      }),
    ).toBe(true);
    expect(updateResumeSettled({ toolCalls: [{ toolName: "get_resume" }] })).toBe(false);
  });
});
