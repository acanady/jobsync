import type { Resume } from "@/models/profile.model";
import type { ResumeSkillCategory, ResumeSnapshot } from "@/models/resumeEdits";
import { htmlToBlocks, htmlToPlainText } from "./html";

function monthYear(value?: Date | string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// The editable parts of a loaded resume (resumeDetailInclude shape), in the
// edits' own vocabulary. Multiple sections of one type are flattened in order.
export function snapshotResume(resume: Resume): ResumeSnapshot {
  const sections = resume.ResumeSections ?? [];

  const summarySection = sections.find((s) => s.sectionType === "summary");
  const summaryHtml = summarySection?.summary?.content;

  const skills: ResumeSkillCategory[] = [];
  for (const section of sections.filter((s) => s.sectionType === "skills")) {
    const ordered = [...(section.skills ?? [])].sort((a, b) => a.order - b.order);
    for (const skill of ordered) {
      const label = skill.Tag?.label?.trim();
      if (!label) continue;
      const category = skill.category?.trim() ?? "";
      const last = skills[skills.length - 1];
      if (last && last.category === category) last.skills.push(label);
      else skills.push({ category, skills: [label] });
    }
  }

  const experiences: ResumeSnapshot["experiences"] = [];
  for (const section of sections.filter((s) => s.sectionType === "experience")) {
    for (const w of section.workExperiences ?? []) {
      const { paragraphs, bullets } = htmlToBlocks(w.description ?? "");
      const start = monthYear(w.startDate);
      const end = w.endDate ? monthYear(w.endDate) : "Present";
      experiences.push({
        company: w.Company?.label ?? "",
        jobTitle: w.jobTitle?.label ?? "",
        paragraphs,
        bullets,
        dates: start ? `${start} – ${end}` : undefined,
      });
    }
  }

  return {
    headline: resume.ContactInfo?.headline || undefined,
    summary: summaryHtml ? htmlToPlainText(summaryHtml) : undefined,
    hasSummarySection: Boolean(summarySection?.summary),
    skills,
    experiences,
  };
}

// The snapshot as the text a model reads: labelled so its answer can name each
// part back exactly (company and job title are how edits find their entry).
export function snapshotToPromptText(snapshot: ResumeSnapshot): string {
  const out: string[] = [];
  out.push(`## Headline\n${snapshot.headline ?? "(none)"}`);
  if (snapshot.hasSummarySection) out.push(`## Summary\n${snapshot.summary ?? ""}`);
  out.push(
    "## Skills\n" +
      (snapshot.skills.length
        ? snapshot.skills
            .map((c) => `### ${c.category || "Skills"}\n${c.skills.map((s) => `- ${s}`).join("\n")}`)
            .join("\n")
        : "(none)"),
  );
  for (const e of snapshot.experiences) {
    out.push(
      [
        `## Experience: ${e.company} | ${e.jobTitle}${e.dates ? ` (${e.dates})` : ""}`,
        ...(e.paragraphs ?? []),
        ...e.bullets.map((b) => `- ${b}`),
      ].join("\n"),
    );
  }
  return out.join("\n\n");
}
