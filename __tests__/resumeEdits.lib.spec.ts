import { htmlToBlocks, blocksToHtml, summaryToHtml, htmlToPlainText } from "@/lib/resumeEdits/html";
import { parseTailoredResume } from "@/lib/resumeEdits/parseTailored";
import { fitEditsToSnapshot } from "@/lib/resumeEdits/validate";
import { snapshotResume, snapshotToPromptText } from "@/lib/resumeEdits/snapshot";
import { ResumeEditsSchema, type ResumeSnapshot } from "@/models/resumeEdits";
import type { Resume } from "@/models/profile.model";

describe("resume edit HTML helpers", () => {
  it("reads TipTap paragraphs and list items", () => {
    expect(
      htmlToBlocks(
        "<p><strong>Techstack:</strong> Python &amp; Go</p><ul><li><p>Built &lt;APIs&gt;</p></li><li><p>Shipped</p></li></ul>",
      ),
    ).toEqual({ paragraphs: ["Techstack: Python & Go"], bullets: ["Built <APIs>", "Shipped"] });
  });

  it("treats glyph-prefixed paragraphs from imports as bullets", () => {
    expect(htmlToBlocks("<p>·&nbsp;&nbsp;&nbsp; Did a thing.</p><p>• Another</p>")).toEqual({
      paragraphs: [],
      bullets: ["Did a thing.", "Another"],
    });
  });

  it("reads plain text with line bullets", () => {
    expect(htmlToBlocks("Intro line\n- one\n- two")).toEqual({
      paragraphs: ["Intro line"],
      bullets: ["one", "two"],
    });
  });

  it("escapes when writing HTML back", () => {
    expect(blocksToHtml(["A & B"], ["<script>x</script>"])).toBe(
      "<p>A &amp; B</p><ul><li><p>&lt;script&gt;x&lt;/script&gt;</p></li></ul>",
    );
    expect(blocksToHtml(undefined, [])).toBe("");
  });

  it("splits summaries into paragraphs on blank lines", () => {
    expect(summaryToHtml("First line\ncontinues.\n\nSecond.")).toBe(
      "<p>First line continues.</p><p>Second.</p>",
    );
    expect(htmlToPlainText("<p>One</p><p>Two</p>")).toBe("One\n\nTwo");
  });
});

const resume = {
  title: "Main",
  ContactInfo: { headline: "Engineer" },
  ResumeSections: [
    {
      sectionType: "skills",
      skills: [
        { order: 1, category: "Languages", Tag: { label: "Java" } },
        { order: 0, category: "Languages", Tag: { label: "Python" } },
        { order: 2, category: "Tools", Tag: { label: "Docker" } },
      ],
    },
    {
      sectionType: "experience",
      workExperiences: [
        {
          Company: { label: "Cisco Systems Inc" },
          jobTitle: { label: "Software Engineer II" },
          startDate: new Date("2025-05-01T12:00:00Z"),
          endDate: null,
          description: "<p>Techstack: Python</p><ul><li><p>Built a client</p></li></ul>",
        },
      ],
    },
  ],
} as unknown as Resume;

describe("snapshotResume", () => {
  it("collects headline, ordered skill categories and experiences", () => {
    const snap = snapshotResume(resume);
    expect(snap.headline).toBe("Engineer");
    expect(snap.hasSummarySection).toBe(false);
    expect(snap.skills).toEqual([
      { category: "Languages", skills: ["Python", "Java"] },
      { category: "Tools", skills: ["Docker"] },
    ]);
    expect(snap.experiences[0]).toMatchObject({
      company: "Cisco Systems Inc",
      jobTitle: "Software Engineer II",
      paragraphs: ["Techstack: Python"],
      bullets: ["Built a client"],
    });
    expect(snap.experiences[0].dates).toMatch(/2025 – Present$/);
    expect(snapshotToPromptText(snap)).toContain(
      "## Experience: Cisco Systems Inc | Software Engineer II",
    );
  });
});

describe("parseTailoredResume", () => {
  const md = [
    "<think>planning</think>",
    "## Headline",
    "Systems Integration Engineer | Secret Clearance",
    "",
    "## Skills",
    "### Networking",
    "- TCP/IP, UDP",
    "### Languages",
    "- Python",
    "* C++",
    "",
    "## Experience: Cisco Systems Inc | Software Engineer II (May 2025 – Present)",
    "Techstack: Python | Docker",
    "- Containerized services.",
    "1. Built a REST client.",
    "",
    "## Experience: Missing pipe",
    "- ignored",
    "",
    "## Notes",
    "- Led with networking.",
  ].join("\n");

  it("parses every section the prompt asks for", () => {
    const { edits, notes } = parseTailoredResume(md);
    expect(edits.headline).toBe("Systems Integration Engineer | Secret Clearance");
    expect(edits.skills).toEqual([
      { category: "Networking", skills: ["TCP/IP", "UDP"] },
      { category: "Languages", skills: ["Python", "C++"] },
    ]);
    expect(edits.experiences).toEqual([
      {
        company: "Cisco Systems Inc",
        jobTitle: "Software Engineer II",
        paragraphs: ["Techstack: Python | Docker"],
        bullets: ["Containerized services.", "Built a REST client."],
      },
    ]);
    expect(notes).toEqual(["Led with networking."]);
    expect(ResumeEditsSchema.safeParse(edits).success).toBe(true);
  });

  it("returns nothing for text with no recognised sections", () => {
    expect(parseTailoredResume("Sure! Here is your resume.").edits).toEqual({});
  });
});

describe("fitEditsToSnapshot", () => {
  const snapshot: ResumeSnapshot = {
    headline: "Engineer",
    hasSummarySection: false,
    skills: [{ category: "Languages", skills: ["Python", "C++"] }],
    experiences: [
      { company: "Cisco Systems Inc", jobTitle: "Software Engineer II", paragraphs: [], bullets: ["Old"] },
    ],
  };

  it("drops invented skills when tailoring and keeps the resume's own spelling", () => {
    const { edits, warnings } = fitEditsToSnapshot(
      { skills: [{ category: "Core", skills: ["python", "Rust", "C++"] }] },
      snapshot,
      { existingSkillsOnly: true },
    );
    expect(edits.skills).toEqual([{ category: "Core", skills: ["Python", "C++"] }]);
    expect(warnings.join(" ")).toContain("Rust");
  });

  it("allows new skills for dictated edits", () => {
    const { edits } = fitEditsToSnapshot(
      { skills: [{ category: "Languages", skills: ["Python", "C++", "Rust"] }] },
      snapshot,
      { existingSkillsOnly: false },
    );
    expect(edits.skills?.[0].skills).toEqual(["Python", "C++", "Rust"]);
  });

  it("matches experiences loosely, takes exact labels, and reports unknown ones", () => {
    const { edits, warnings } = fitEditsToSnapshot(
      {
        experiences: [
          { company: "cisco systems inc", jobTitle: "software  engineer ii", bullets: ["New"] },
          { company: "Nowhere", jobTitle: "Dev", bullets: ["x"] },
        ],
      },
      snapshot,
      { existingSkillsOnly: true },
    );
    expect(edits.experiences).toEqual([
      { company: "Cisco Systems Inc", jobTitle: "Software Engineer II", paragraphs: [], bullets: ["New"] },
    ]);
    expect(warnings).toHaveLength(1);
  });

  it("drops no-op changes and summaries the resume has no section for", () => {
    const { edits, warnings } = fitEditsToSnapshot(
      {
        headline: "Engineer",
        summary: "New summary",
        experiences: [{ company: "Cisco Systems Inc", jobTitle: "Software Engineer II", bullets: ["Old"] }],
      },
      snapshot,
      { existingSkillsOnly: true },
    );
    expect(edits).toEqual({});
    expect(warnings[0]).toContain("no summary section");
  });
});
