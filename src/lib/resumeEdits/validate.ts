import {
  experienceKey,
  type ResumeEdits,
  type ResumeSkillCategory,
  type ResumeSnapshot,
} from "@/models/resumeEdits";

const sameList = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sameSkills = (a: ResumeSkillCategory[], b: ResumeSkillCategory[]) =>
  a.length === b.length &&
  a.every((c, i) => c.category === b[i].category && sameList(c.skills, b[i].skills));

/**
 * Fits proposed edits to the resume they target: entries are matched to real
 * ones (and take their exact labels), no-op changes are dropped, and anything
 * that cannot be placed is reported rather than silently applied.
 *
 * existingSkillsOnly is tailor_resume's guard against invented experience: a
 * tailored resume may reorder, regroup or omit skills, never add one. Edits
 * the user dictates through update_resume may add skills.
 */
export function fitEditsToSnapshot(
  proposed: ResumeEdits,
  snapshot: ResumeSnapshot,
  opts: { existingSkillsOnly: boolean },
): { edits: ResumeEdits; warnings: string[] } {
  const warnings: string[] = [];
  const edits: ResumeEdits = {};

  if (proposed.headline && proposed.headline !== snapshot.headline) {
    edits.headline = proposed.headline;
  }

  if (proposed.summary) {
    if (!snapshot.hasSummarySection) {
      warnings.push("The resume has no summary section, so the proposed summary was left out.");
    } else if (proposed.summary !== snapshot.summary) {
      edits.summary = proposed.summary;
    }
  }

  if (proposed.skills) {
    const existing = new Map<string, string>();
    for (const c of snapshot.skills) for (const s of c.skills) existing.set(s.toLowerCase(), s);

    const seen = new Set<string>();
    const dropped: string[] = [];
    const fitted: ResumeSkillCategory[] = [];
    for (const c of proposed.skills) {
      const skills: string[] = [];
      for (const raw of c.skills) {
        const key = raw.toLowerCase();
        if (seen.has(key)) continue;
        const known = existing.get(key);
        if (opts.existingSkillsOnly && !known) {
          dropped.push(raw);
          continue;
        }
        seen.add(key);
        skills.push(known ?? raw);
      }
      if (skills.length) fitted.push({ category: c.category.trim(), skills });
    }
    if (dropped.length) {
      warnings.push(
        `Left out skills that aren't on the resume: ${dropped.join(", ")}. Add them yourself if you have them.`,
      );
    }
    if (fitted.length && !sameSkills(fitted, snapshot.skills)) edits.skills = fitted;
  }

  if (proposed.experiences) {
    const byKey = new Map(snapshot.experiences.map((e) => [experienceKey(e.company, e.jobTitle), e]));
    const fitted: NonNullable<ResumeEdits["experiences"]> = [];
    const done = new Set<string>();
    for (const e of proposed.experiences) {
      const key = experienceKey(e.company, e.jobTitle);
      const target = byKey.get(key);
      if (!target) {
        warnings.push(`No experience entry matches "${e.jobTitle}" at ${e.company}, so its changes were left out.`);
        continue;
      }
      if (done.has(key)) continue;
      done.add(key);
      const paragraphs = e.paragraphs ?? [];
      if (sameList(paragraphs, target.paragraphs) && sameList(e.bullets, target.bullets)) continue;
      fitted.push({
        company: target.company,
        jobTitle: target.jobTitle,
        paragraphs,
        bullets: e.bullets,
      });
    }
    if (fitted.length) edits.experiences = fitted;
  }

  return { edits, warnings };
}
