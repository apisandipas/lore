import { basename } from "node:path";

export type Link = { target: string; line: number; field?: string };

export type Note = {
  path: string;
  stem: string;
  frontmatter: Record<string, unknown>;
  frontmatterError?: string;
  fieldLines: Record<string, number>;
  type?: string;
  status?: string;
  title: string;
  summary: string;
  aliases: string[];
  anchors: string[];
  links: Link[];
  checklist: { done: number; total: number };
  body: string;
};

// [[target]], [[target#heading]], [[target|label]]
const LINK = /\[\[([^\[\]|#\n]+)(?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]*)?\]\]/g;
const FENCE = /^\s*(```|~~~)/;
const CHECKBOX = /^\s*[-*+] \[([ xX])\]/;
const SUMMARY_MAX = 280;

export function linkTargets(text: string): string[] {
  return [...text.matchAll(LINK)].map((m) => m[1]!.trim());
}

export function parseNote(path: string, text: string): Note {
  const lines = text.split("\n");
  let frontmatter: Record<string, unknown> = {};
  let frontmatterError: string | undefined;
  const fieldLines: Record<string, number> = {};
  let bodyStart = 0;
  const links: Link[] = [];

  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) {
      bodyStart = end + 1;
      const fmLines = lines.slice(1, end);
      try {
        const parsed = Bun.YAML.parse(fmLines.join("\n"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        } else if (parsed != null) {
          frontmatterError = "frontmatter is not a mapping";
        }
      } catch (e) {
        frontmatterError = `unreadable frontmatter: ${(e as Error).message}`;
      }
      for (const [field, value] of Object.entries(frontmatter)) {
        const keyIndex = fmLines.findIndex((l) => l.startsWith(`${field}:`));
        const line = keyIndex >= 0 ? keyIndex + 2 : 1;
        fieldLines[field] = line;
        for (const s of strings(value)) {
          for (const target of linkTargets(s)) links.push({ target, line, field });
        }
      }
    }
  }

  const bodyLines = lines.slice(bodyStart);
  const checklist = { done: 0, total: 0 };
  let fenced = false;
  bodyLines.forEach((l, i) => {
    if (FENCE.test(l)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const box = CHECKBOX.exec(l);
    if (box) {
      checklist.total++;
      if (box[1] !== " ") checklist.done++;
    }
    for (const target of linkTargets(l.replace(/`[^`]*`/g, ""))) links.push({ target, line: bodyStart + i + 1 });
  });

  const stem = basename(path).replace(/\.md$/i, "");
  const heading = bodyLines.find((l) => /^#\s+/.test(l));
  return {
    path,
    stem,
    frontmatter,
    frontmatterError,
    fieldLines,
    type: str(frontmatter.type),
    status: str(frontmatter.status),
    title: str(frontmatter.title) ?? heading?.replace(/^#\s+/, "").trim() ?? stem,
    summary: str(frontmatter.summary) ?? firstParagraph(bodyLines),
    aliases: list(frontmatter.aliases),
    anchors: list(frontmatter.anchors),
    links,
    checklist,
    body: bodyLines.join("\n").trim(),
  };
}

// The first paragraph under a heading named `name`, at any level.
export function sectionSummary(body: string, name: string): string | undefined {
  const lines = body.split("\n");
  const heading = new RegExp(`^#{1,6}\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  const at = lines.findIndex((l) => heading.test(l.trim()));
  return at < 0 ? undefined : firstParagraph(lines.slice(at + 1)) || undefined;
}

function firstParagraph(lines: string[]): string {
  const para: string[] = [];
  let fenced = false;
  for (const l of lines) {
    if (FENCE.test(l)) {
      if (para.length) break;
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const t = l.trim();
    if (!t || t.startsWith("#")) {
      if (para.length) break;
      continue;
    }
    para.push(t);
  }
  const text = para.join(" ").replace(/\s+/g, " ");
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;
}

function list(v: unknown): string[] {
  if (typeof v === "string") return [v];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}
