import { basename, dirname, normalize } from "node:path";
import type { TypeDef } from "./schema";

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

// Notes are Markdown or Org. The note model is the same; only the syntax for
// fields, headings, links, blocks and checkboxes differs.
export const NOTE_FILE = /\.(md|org)$/i;

export function isOrg(path: string): boolean {
  return /\.org$/i.test(path);
}

type Header = { fields: Record<string, unknown>; error?: string; fieldLines: Record<string, number>; bodyStart: number };

type Syntax = {
  header(lines: string[]): Header;
  // A top heading's text, for the title; undefined when the line is not one.
  title(line: string): string | undefined;
  // Whether a line is a heading named `name`, at any level.
  heading(line: string, name: string): boolean;
  // Lines that end a paragraph and are never part of a summary.
  breaks(trimmed: string): boolean;
  // Opens or closes a block whose lines are not prose (code, examples).
  fence: RegExp;
  checkbox: RegExp;
  links(line: string, notePath: string): string[];
};

// [[target]], [[target#heading]], [[target|label]]
const MD_LINK = /\[\[([^\[\]|#\n]+)(?:#[^\[\]|\n]*)?(?:\|[^\[\]\n]*)?\]\]/g;
// [[target]], [[target][label]]
const ORG_LINK = /\[\[([^\[\]\n]+)\](?:\[[^\[\]\n]*\])?\]/g;
export const ORG_KEYWORD = /^#\+([\w-]+):[ \t]*(.*)$/;
const SUMMARY_MAX = 280;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const markdown: Syntax = {
  header(lines) {
    const fieldLines: Record<string, number> = {};
    if (lines[0]?.trim() !== "---") return { fields: {}, fieldLines, bodyStart: 0 };
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end < 0) return { fields: {}, fieldLines, bodyStart: 0 };
    const fmLines = lines.slice(1, end);
    let fields: Record<string, unknown> = {};
    let error: string | undefined;
    try {
      const parsed = Bun.YAML.parse(fmLines.join("\n"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) fields = parsed as Record<string, unknown>;
      else if (parsed != null) error = "frontmatter is not a mapping";
    } catch (e) {
      error = `unreadable frontmatter: ${(e as Error).message}`;
    }
    for (const field of Object.keys(fields)) {
      const at = fmLines.findIndex((l) => l.startsWith(`${field}:`));
      fieldLines[field] = at >= 0 ? at + 2 : 1;
    }
    return { fields, error, fieldLines, bodyStart: end + 1 };
  },
  title: (line) => (/^#\s+/.test(line) ? line.replace(/^#\s+/, "").trim() : undefined),
  heading: (line, name) => new RegExp(`^#{1,6}\\s+${escape(name)}\\s*$`, "i").test(line.trim()),
  breaks: (t) => t.startsWith("#"),
  fence: /^\s*(```|~~~)/,
  checkbox: /^\s*[-*+] \[([ xX])\]\s*(.*)$/,
  links: (line) => [...line.replace(/`[^`]*`/g, "").matchAll(MD_LINK)].map((m) => m[1]!.trim()),
};

const org: Syntax = {
  // The #+key: lines at the top, before anything else. A value in brackets or
  // quotes is YAML (a list, a map, a quoted string); anything else, links
  // included, is text.
  header(lines) {
    const fields: Record<string, unknown> = {};
    const fieldLines: Record<string, number> = {};
    let error: string | undefined;
    let i = 0;
    for (; i < lines.length; i++) {
      if (!lines[i]!.trim()) continue;
      const m = ORG_KEYWORD.exec(lines[i]!);
      if (!m) break;
      const key = m[1]!.toLowerCase();
      fieldLines[key] = i + 1;
      try {
        fields[key] = orgValue(m[2]!.trim());
      } catch (e) {
        error ??= `unreadable #+${m[1]}: ${(e as Error).message}`;
      }
    }
    return { fields, error, fieldLines, bodyStart: i };
  },
  title: (line) => /^\*+\s+(.*)$/.exec(line)?.[1]!.replace(/\s+:[\w@#%:]+:\s*$/, "").trim(),
  heading: (line, name) => new RegExp(`^\\*+\\s+${escape(name)}\\s*$`, "i").test(line.trim()),
  breaks: (t) => t.startsWith("#") || /^\*+\s/.test(t) || /^:[\w-]+:/.test(t),
  fence: /^\s*#\+(begin|end)_\w+/i,
  checkbox: /^\s*(?:[-+]|\d+[.)])\s+\[([ xX-])\]\s*(.*)$/,
  links(line, notePath) {
    return [...line.matchAll(ORG_LINK)].flatMap((m) => {
      const target = m[1]!.trim().replace(/::.*$/, "");
      if (/^file:/i.test(target)) {
        // As Org reads it: relative to the note, unless it is absolute.
        const path = target.slice("file:".length);
        const resolved = path.startsWith("/") ? path : normalize(`${dirname(notePath)}/${path}`);
        return resolved && !resolved.startsWith("../") ? [resolved] : [];
      }
      // URLs and other link types, headings in this file (*, #), coderefs.
      if (!target || /^[a-z][\w+.-]*:/i.test(target) || /^[*#(]/.test(target)) return [];
      return [target];
    });
  },
};

function orgValue(text: string): unknown {
  if (!/^[\[{"']/.test(text) || text.startsWith("[[")) return text;
  return (Bun.YAML.parse(`v: ${text}`) as { v: unknown }).v;
}

function syntaxOf(path: string): Syntax {
  return isOrg(path) ? org : markdown;
}

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
