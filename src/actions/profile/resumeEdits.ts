"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { resolveTag } from "@/lib/jobs/resolve";
import { blocksToHtml, summaryToHtml } from "@/lib/resumeEdits/html";
import {
  ApplyResumeEditsSchema,
  experienceKey,
  hasAnyEdit,
  type ApplyResumeEditsInput,
} from "@/models/resumeEdits";
import { requireUser } from "./shared";
import { copyResume } from "./resumeCopy";
import { deleteResumeById } from "./resume";

type ApplyResult =
  | { success: true; resumeId: string; resumeTitle: string; mode: "copy" | "in_place" }
  | { success: false; message: string };

/**
 * Applies a proposal from the agent's tailor_resume / update_resume card,
 * exactly as the card showed it. Called by the card's own buttons — the user's
 * click is the approval — so every id here is client-supplied and re-checked
 * against the session user.
 *
 * mode "copy" duplicates the resume first (copyResume) and edits the copy, and
 * when the proposal came from a job, links the copy to that job.
 */
export const applyResumeEdits = async (
  input: ApplyResumeEditsInput,
): Promise<ApplyResult> => {
  // Set once a copy exists, so a failed edit removes it rather than leaving a
  // half-tailored duplicate behind.
  let createdCopyId: string | undefined;
  try {
    const user = await requireUser();
    const parsed = ApplyResumeEditsSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Those changes are not valid." };
    const { resumeId, mode, jobId, copyTitle, edits } = parsed.data;
    if (!hasAnyEdit(edits)) return { success: false, message: "There are no changes to apply." };

    const source = await prisma.resume.findFirst({
      where: { id: resumeId, profile: { userId: user.id } },
      select: { id: true, title: true },
    });
    if (!source) return { success: false, message: "Resume not found." };

    const job = jobId
      ? await prisma.job.findFirst({ where: { id: jobId, userId: user.id }, select: { id: true } })
      : null;

    let targetId = source.id;
    let targetTitle = source.title;
    if (mode === "copy") {
      const copied = await copyResume(source.id, copyTitle ?? `${source.title} (tailored)`);
      if (!copied?.success) {
        return { success: false, message: copied?.message ?? "The copy could not be created." };
      }
      targetId = copied.data.id;
      targetTitle = copied.data.title;
      createdCopyId = targetId;
    }

    // Tags resolve outside the transaction, like the skills form does before
    // calling updateSkillsSection: resolveTag runs its own upsert.
    const skillRows = edits.skills
      ? await Promise.all(
          edits.skills.flatMap((c) =>
            c.skills.map(async (label) => ({
              tagId: (await resolveTag(label, user.id)).id,
              category: c.category || null,
            })),
          ),
        )
      : undefined;

    const target = await prisma.resume.findUniqueOrThrow({
      where: { id: targetId },
      select: {
        ContactInfo: { select: { id: true } },
        ResumeSections: {
          select: {
            id: true,
            sectionType: true,
            summaryId: true,
            workExperiences: {
              select: {
                id: true,
                Company: { select: { label: true } },
                jobTitle: { select: { label: true } },
              },
            },
          },
        },
      },
    });

    const experienceIds = new Map<string, string>();
    for (const s of target.ResumeSections) {
      for (const w of s.workExperiences) {
        experienceIds.set(experienceKey(w.Company.label, w.jobTitle.label), w.id);
      }
    }
    const skillsSection = target.ResumeSections.find((s) => s.sectionType === "skills");
    const summarySection = target.ResumeSections.find(
      (s) => s.sectionType === "summary" && s.summaryId,
    );

    await prisma.$transaction(async (tx) => {
      if (edits.headline) {
        if (!target.ContactInfo) throw new Error("This resume has no contact details to hold a headline.");
        await tx.contactInfo.update({
          where: { id: target.ContactInfo.id },
          data: { headline: edits.headline },
        });
      }

      if (edits.summary) {
        if (!summarySection?.summaryId) throw new Error("This resume has no summary section.");
        await tx.summary.update({
          where: { id: summarySection.summaryId },
          data: { content: summaryToHtml(edits.summary) },
        });
      }

      if (skillRows) {
        const sectionId =
          skillsSection?.id ??
          (
            await tx.resumeSection.create({
              data: { resumeId: targetId, sectionTitle: "Skills", sectionType: "skills" },
              select: { id: true },
            })
          ).id;
        await tx.skill.deleteMany({ where: { resumeSectionId: sectionId } });
        await tx.skill.createMany({
          data: skillRows.map((row, order) => ({ ...row, order, resumeSectionId: sectionId })),
        });
      }

      for (const e of edits.experiences ?? []) {
        const id = experienceIds.get(experienceKey(e.company, e.jobTitle));
        if (!id) throw new Error(`No experience entry for ${e.jobTitle} at ${e.company}.`);
        await tx.workExperience.update({
          where: { id },
          data: { description: blocksToHtml(e.paragraphs, e.bullets) },
        });
      }

      if (mode === "copy" && job) {
        await tx.job.update({ where: { id: job.id }, data: { resumeId: targetId } });
      }
    });

    revalidatePath("/dashboard/profile");
    revalidatePath(`/dashboard/profile/resume/${targetId}`);
    if (job) revalidatePath(`/dashboard/myjobs/${job.id}`);
    return { success: true, resumeId: targetId, resumeTitle: targetTitle, mode };
  } catch (error) {
    if (createdCopyId) {
      try {
        await deleteResumeById(createdCopyId);
      } catch {
        // Best effort: the user can delete a leftover copy from Profile.
      }
    }
    const res = handleError(error, "Failed to apply the resume changes.");
    return { success: false, message: res.message };
  }
};
