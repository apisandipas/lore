import { basename } from "node:path";
import type { TypeDef } from "./schema";
import { syntaxOf, type Syntax } from "./syntax";
import { markdown } from "./syntax/markdown";

export type Link = { target: string; line: number; field?: string };

export type Note = {
  path: string;
  stem: string;
  // What lore calls the note: `type/stem` once the graph knows its type, else the stem.
  name: string;
  frontmatter: Record<string, unknown>;
  frontmatterError?: string;
  fieldLines: Record<string, number>;
  type?: string;
  // The schema type, attached by the graph; `type` is then its exact name.
  def?: TypeDef;
  status?: string;
  title: string;
  summary: string;
  aliases: string[];
  anchors: string[];
  links: Link[];
  // `next` is the text of the first unchecked item, `nextLine` its line in the file.
  checklist: { done: number; total: number; next?: string; nextLine?: number };
  body: string;
};

// A note file: Markdown or Org (see src/syntax).
export const NOTE_FILE = /\.(md|org)$/i;

const SUMMARY_MAX = 280;

// The link targets in a field value: [[name]] in either syntax.
export function linkTargets(text: string): string[] {
  return markdown.links(text, "");
}

export function parseNote(path: string, text: string): Note {
  const syntax = syntaxOf(path);
  const lines = text.split("\n");
  const { fields: frontmatter, error: frontmatterError, fieldLines, bodyStart } = syntax.header(lines);
  const links: Link[] = [];
  for (const [field, value] of Object.entries(frontmatter)) {
    for (const s of strings(value)) {
      for (const target of linkTargets(s)) links.push({ target, line: fieldLines[field] ?? 1, field });
    }
  }

  const bodyLines = lines.slice(bodyStart);
  const checklist: Note["checklist"] = { done: 0, total: 0 };
  let fenced = false;
  bodyLines.forEach((l, i) => {
    if (syntax.fence.test(l)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const box = syntax.checkbox.exec(l);
    if (box) {
      checklist.total++;
      if (box[1] === "x" || box[1] === "X") checklist.done++;
      else if (checklist.next === undefined) {
        checklist.next = box[2]!.trim();
        checklist.nextLine = bodyStart + i + 1;
      }
    }
    for (const target of syntax.links(l, path)) links.push({ target, line: bodyStart + i + 1 });
  });

  const stem = basename(path).replace(NOTE_FILE, "");
  const heading = bodyLines.map(syntax.title).find((t) => t !== undefined);
  return {
    path,
    stem,
    name: stem,
    frontmatter,
    frontmatterError,
    fieldLines,
    type: str(frontmatter.type),
    status: str(frontmatter.status),
    title: str(frontmatter.title) ?? heading ?? stem,
    summary: str(frontmatter.summary) ?? firstParagraph(syntax, bodyLines),
    aliases: list(frontmatter.aliases),
    anchors: list(frontmatter.anchors),
    links,
    checklist,
    body: bodyLines.join("\n").trim(),
  };
}

// The first paragraph under a heading named `name`, at any level.
export function sectionSummary(path: string, body: string, name: string): string | undefined {
  const syntax = syntaxOf(path);
  const lines = body.split("\n");
  const at = lines.findIndex((l) => syntax.heading(l, name));
  return at < 0 ? undefined : firstParagraph(syntax, lines.slice(at + 1)) || undefined;
}

function firstParagraph(syntax: Syntax, lines: string[]): string {
  const para: string[] = [];
  let fenced = false;
  for (const l of lines) {
    if (syntax.fence.test(l)) {
      if (para.length) break;
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const t = l.trim();
    if (!t || syntax.breaks(t)) {
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
