// Converts between the resume editor's TipTap HTML and the plain paragraphs /
// bullets that resume edits are expressed in. TipTap's output is a small,
// regular subset (p, ul/ol > li > p, strong/em), so this stays regex-based.

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&amp;": "&", // last, so it never manufactures another entity
};

function decode(text: string): string {
  let out = text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  for (const [entity, char] of Object.entries(ENTITIES)) out = out.split(entity).join(char);
  return out;
}

function toText(html: string): string {
  return decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// A paragraph some importers use as a fake bullet: "·       Did a thing".
const GLYPH_BULLET = /^[·•▪◦‣∙*-]\s*/;

export function htmlToBlocks(html: string): { paragraphs: string[]; bullets: string[] } {
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  if (!html?.trim()) return { paragraphs, bullets };

  if (!/<[a-z][^>]*>/i.test(html)) {
    for (const raw of html.split(/\n+/)) {
      const t = raw.trim();
      if (!t) continue;
      if (GLYPH_BULLET.test(t)) bullets.push(t.replace(GLYPH_BULLET, "").trim());
      else paragraphs.push(t);
    }
    return { paragraphs, bullets };
  }

  for (const li of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = toText(li[1]);
    if (t) bullets.push(t);
  }
  const outside = html.replace(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  for (const p of outside.matchAll(/<(p|h[1-6]|div)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = toText(p[2]);
    if (!t) continue;
    if (GLYPH_BULLET.test(t)) bullets.push(t.replace(GLYPH_BULLET, "").trim());
    else paragraphs.push(t);
  }
  return { paragraphs, bullets };
}

export function htmlToPlainText(html: string): string {
  const { paragraphs, bullets } = htmlToBlocks(html);
  return [...paragraphs, ...bullets.map((b) => `- ${b}`)].join("\n\n");
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function blocksToHtml(paragraphs: string[] | undefined, bullets: string[]): string {
  const ps = (paragraphs ?? []).map((p) => `<p>${escape(p)}</p>`).join("");
  const list = bullets.length
    ? `<ul>${bullets.map((b) => `<li><p>${escape(b)}</p></li>`).join("")}</ul>`
    : "";
  return ps + list;
}

export function summaryToHtml(summary: string): string {
  return summary
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p.replace(/\s*\n\s*/g, " "))}</p>`)
    .join("");
}
