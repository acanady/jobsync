import { applyResumeEdits } from "@/actions/profile.actions";
import { copyResume } from "@/actions/profile/resumeCopy";
import { deleteResumeById } from "@/actions/profile/resume";
import { resolveTag } from "@/lib/jobs/resolve";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient() as any;

vi.mock("@prisma/client", () => {
  const m: any = {
    resume: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn() },
    job: { findFirst: vi.fn(), update: vi.fn() },
    contactInfo: { update: vi.fn() },
    summary: { update: vi.fn() },
    resumeSection: { create: vi.fn() },
    skill: { deleteMany: vi.fn(), createMany: vi.fn() },
    workExperience: { update: vi.fn() },
  };
  m.$transaction = vi.fn((fn: any) => fn(m));
  return { PrismaClient: vi.fn(function () { return m; }) };
});
vi.mock("@/utils/user.utils", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/profile/resumeCopy", () => ({ copyResume: vi.fn() }));
vi.mock("@/actions/profile/resume", () => ({ deleteResumeById: vi.fn() }));
vi.mock("@/lib/jobs/resolve", () => ({ resolveTag: vi.fn() }));

const TARGET = (id: string) => ({
  ContactInfo: { id: `ci-${id}` },
  ResumeSections: [
    { id: `skills-${id}`, sectionType: "skills", summaryId: null, workExperiences: [] },
    {
      id: `exp-${id}`,
      sectionType: "experience",
      summaryId: null,
      workExperiences: [
        { id: `we-${id}`, Company: { label: "Cisco Systems Inc" }, jobTitle: { label: "Software Engineer II" } },
      ],
    },
  ],
});

const edits = {
  headline: "New headline",
  skills: [{ category: "Languages", skills: ["Python", "Bash"] }],
  experiences: [
    { company: "cisco systems inc", jobTitle: "Software Engineer II", paragraphs: ["Techstack: Python"], bullets: ["Did <x>"] },
  ],
};

describe("applyResumeEdits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue({ id: "user-1" });
    prisma.resume.findFirst.mockResolvedValue({ id: "r1", title: "Main" });
    prisma.resume.findUniqueOrThrow.mockImplementation(({ where }: any) => Promise.resolve(TARGET(where.id)));
    prisma.job.findFirst.mockResolvedValue({ id: "job-1" });
    (resolveTag as any).mockImplementation((label: string) => Promise.resolve({ id: `tag-${label}` }));
  });

  it("updates the resume in place, scoped to the session user", async () => {
    const res = await applyResumeEdits({ resumeId: "r1", mode: "in_place", edits });

    expect(res).toEqual({ success: true, resumeId: "r1", resumeTitle: "Main", mode: "in_place" });
    expect(prisma.resume.findFirst.mock.calls[0][0].where).toEqual({ id: "r1", profile: { userId: "user-1" } });
    expect(prisma.contactInfo.update).toHaveBeenCalledWith({ where: { id: "ci-r1" }, data: { headline: "New headline" } });
    expect(prisma.skill.deleteMany).toHaveBeenCalledWith({ where: { resumeSectionId: "skills-r1" } });
    expect(prisma.skill.createMany).toHaveBeenCalledWith({
      data: [
        { tagId: "tag-Python", category: "Languages", order: 0, resumeSectionId: "skills-r1" },
        { tagId: "tag-Bash", category: "Languages", order: 1, resumeSectionId: "skills-r1" },
      ],
    });
    expect(prisma.workExperience.update).toHaveBeenCalledWith({
      where: { id: "we-r1" },
      data: { description: "<p>Techstack: Python</p><ul><li><p>Did &lt;x&gt;</p></li></ul>" },
    });
    expect(copyResume).not.toHaveBeenCalled();
    expect(prisma.job.update).not.toHaveBeenCalled();
  });

  it("edits a copy and links it to the job in copy mode", async () => {
    (copyResume as any).mockResolvedValue({ success: true, data: { id: "r2", title: "Main — Acme" } });

    const res = await applyResumeEdits({
      resumeId: "r1",
      mode: "copy",
      jobId: "job-1",
      copyTitle: "Main — Acme",
      edits,
    });

    expect(res).toEqual({ success: true, resumeId: "r2", resumeTitle: "Main — Acme", mode: "copy" });
    expect(copyResume).toHaveBeenCalledWith("r1", "Main — Acme");
    expect(prisma.contactInfo.update).toHaveBeenCalledWith({ where: { id: "ci-r2" }, data: { headline: "New headline" } });
    expect(prisma.workExperience.update.mock.calls[0][0].where).toEqual({ id: "we-r2" });
    expect(prisma.job.findFirst.mock.calls[0][0].where).toEqual({ id: "job-1", userId: "user-1" });
    expect(prisma.job.update).toHaveBeenCalledWith({ where: { id: "job-1" }, data: { resumeId: "r2" } });
  });

  it("removes the copy if applying the edits fails", async () => {
    (copyResume as any).mockResolvedValue({ success: true, data: { id: "r2", title: "Copy" } });
    prisma.workExperience.update.mockRejectedValueOnce(new Error("boom"));

    const res = await applyResumeEdits({ resumeId: "r1", mode: "copy", edits });

    expect(res).toEqual({ success: false, message: "boom" });
    expect(deleteResumeById).toHaveBeenCalledWith("r2");
  });

  it("refuses a resume the user does not own", async () => {
    prisma.resume.findFirst.mockResolvedValue(null);
    const res = await applyResumeEdits({ resumeId: "theirs", mode: "in_place", edits });
    expect(res).toEqual({ success: false, message: "Resume not found." });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid or empty edits", async () => {
    expect((await applyResumeEdits({ resumeId: "r1", mode: "in_place", edits: {} })).success).toBe(false);
    expect(
      (await applyResumeEdits({ resumeId: "r1", mode: "sideways" as any, edits })).success,
    ).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an experience that is not on the resume", async () => {
    const res = await applyResumeEdits({
      resumeId: "r1",
      mode: "in_place",
      edits: { experiences: [{ company: "Nowhere", jobTitle: "Dev", bullets: ["x"] }] },
    });
    expect(res.success).toBe(false);
  });
});
