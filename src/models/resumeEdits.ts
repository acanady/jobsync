import { z } from "zod";

// Structured, partial edits to one resume. Shared by the agent's tailor_resume
// and update_resume tools (which propose them) and applyResumeEdits (which
// writes them once the user picks a button on the proposal card). Every field
// is optional: an absent field leaves that part of the resume untouched.
//
// Experiences are addressed by company + job title, never by id, so the same
// edits apply to the original resume or to a fresh copy of it (a copy's rows
// get new ids). Section titles, dates, companies, education and contact
// details are deliberately out of reach.

const line = (max: number) => z.string().trim().min(1).max(max);

export const ResumeSkillCategorySchema = z.object({
  category: z
    .string()
    .trim()
    .max(100)
    .describe("Category heading, e.g. 'Programming Languages'. Empty string for an uncategorised group."),
  skills: z.array(line(100)).min(1).max(60).describe("Skill names in display order."),
});

export const ResumeExperienceEditSchema = z.object({
  company: line(200).describe("The company exactly as it appears on the resume."),
  jobTitle: line(200).describe("The job title exactly as it appears on the resume."),
  paragraphs: z
    .array(line(600))
    .max(5)
    .optional()
    .describe("Short lines shown above the bullets, e.g. 'Techstack: Python | Docker'. Omit to keep none."),
  bullets: z.array(line(600)).min(1).max(20).describe("The bullet points, in order, without bullet characters."),
});

export const ResumeEditsSchema = z.object({
  headline: line(300).optional().describe("The headline under the name on the resume."),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .optional()
    .describe("The summary section's text; paragraphs separated by a blank line. Only applies if the resume has a summary section."),
  skills: z
    .array(ResumeSkillCategorySchema)
    .min(1)
    .max(20)
    .optional()
    .describe("The complete new skills section, every category and skill in order. It replaces the existing skills section."),
  experiences: z
    .array(ResumeExperienceEditSchema)
    .min(1)
    .max(20)
    .optional()
    .describe("Only the experience entries whose description changes; each replaces that entry's description."),
});

export type ResumeEdits = z.infer<typeof ResumeEditsSchema>;
export type ResumeSkillCategory = z.infer<typeof ResumeSkillCategorySchema>;
export type ResumeExperienceEdit = z.infer<typeof ResumeExperienceEditSchema>;

// The editable parts of a resume as they are now, in the same shape as the
// edits so a card can lay "before" and "after" side by side.
export type ResumeSnapshot = {
  headline?: string;
  summary?: string;
  hasSummarySection: boolean;
  skills: ResumeSkillCategory[];
  experiences: (ResumeExperienceEdit & { dates?: string })[];
};

// What tailor_resume and update_resume return to the model AND the card. The
// card applies `edits` verbatim through applyResumeEdits — the model never has
// to copy them again — and shows `before` beside them.
export type ResumeEditProposal = {
  resumeId: string;
  resumeTitle: string;
  // Set when the proposal was tailored to a job: a tailored copy is titled
  // after it and linked to it.
  job?: { id: string; title: string; company: string };
  edits: ResumeEdits;
  before: ResumeSnapshot;
  // Things the app dropped or could not place, said plainly on the card.
  warnings: string[];
  // tailor_resume's short rationale; empty for update_resume.
  notes?: string[];
};

export const RESUME_EDIT_APPLY_MODES = ["copy", "in_place"] as const;
export type ResumeEditApplyMode = (typeof RESUME_EDIT_APPLY_MODES)[number];

export const ApplyResumeEditsSchema = z.object({
  resumeId: z.string().min(1),
  mode: z.enum(RESUME_EDIT_APPLY_MODES),
  jobId: z.string().min(1).optional(),
  copyTitle: z.string().trim().min(1).max(200).optional(),
  edits: ResumeEditsSchema,
});

export type ApplyResumeEditsInput = z.infer<typeof ApplyResumeEditsSchema>;

export function hasAnyEdit(edits: ResumeEdits): boolean {
  return Boolean(
    edits.headline || edits.summary || edits.skills?.length || edits.experiences?.length,
  );
}

// Company + title, case- and whitespace-insensitive: how an experience edit
// finds its row in the original and in a copy alike.
export function experienceKey(company: string, jobTitle: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(company)}\u0000${norm(jobTitle)}`;
}
