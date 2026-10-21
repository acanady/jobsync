import { stripThinking } from "@/lib/ai/stripThinking";
import type { ResumeEdits } from "@/models/resumeEdits";

const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;

// Parses the resume-tailor prompt's markdown back into edits. Lenient about
// spacing and bullet glyphs; strict about headings, since those are what say
// where each line belongs. Unknown sections are ignored.
export function parseTailoredResume(raw: string): { edits: ResumeEdits; notes: string[] } {
  const text = stripThinking(raw)
    .replace(/^```[a-z]*\s*$/gim, "")
    .replace(/\r\n/g, "\n");

  const sections: { heading: string; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    const h = /^##\s+(?!#)(.+?)\s*$/.exec(line);
    if (h) sections.push({ heading: h[1].trim(), lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(line);
  }

  const edits: ResumeEdits = {};
  const notes: string[] = [];
  const nonEmpty = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);

  for (const { heading, lines } of sections) {
    const key = heading.toLowerCase();
    if (key === "headline") {
      const first = nonEmpty(lines)[0];
      if (first) edits.headline = first.replace(BULLET, "").trim();
    } else if (key === "summary") {
      const body = lines.join("\n").trim();
      if (body) edits.summary = body;
    } else if (key === "skills") {
      const categories: NonNullable<ResumeEdits["skills"]> = [];
      for (const l of nonEmpty(lines)) {
        const cat = /^###\s+(.+)$/.exec(l);
        if (cat) {
          categories.push({ category: cat[1].trim(), skills: [] });
        } else if (BULLET.test(l)) {
          if (!categories.length) categories.push({ category: "", skills: [] });
          // A model sometimes lists a category's skills on one comma line.
          for (const s of l.replace(BULLET, "").split(/\s*,\s*/)) {
            if (s.trim()) categories[categories.length - 1].skills.push(s.trim());
          }
        }
      }
      const filled = categories.filter((c) => c.skills.length);
      if (filled.length) edits.skills = filled;
    } else if (key.startsWith("experience:")) {
      const label = heading.slice("experience:".length).trim();
      const sep = label.indexOf("|");
      if (sep < 0) continue;
      const company = label.slice(0, sep).trim();
      // Drop a trailing "(dates)" if the model echoed the input heading.
      const jobTitle = label.slice(sep + 1).replace(/\s*\([^)]*\)\s*$/, "").trim();
      const paragraphs: string[] = [];
      const bullets: string[] = [];
      for (const l of nonEmpty(lines)) {
        if (BULLET.test(l)) bullets.push(l.replace(BULLET, "").trim());
        else if (!bullets.length) paragraphs.push(l);
      }
      if (company && jobTitle && bullets.length) {
        (edits.experiences ??= []).push({ company, jobTitle, paragraphs, bullets });
      }
    } else if (key === "notes") {
      for (const l of nonEmpty(lines)) notes.push(l.replace(BULLET, "").trim());
    }
  }
  return { edits, notes };
}
