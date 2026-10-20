import { isOrg, ORG_KEYWORD, parseNote, type Note } from "./parse";
import type { Tree } from "./tree";

// Every write to a note goes through here: frontmatter fields and checkboxes,
// in Markdown or Org. Bodies are never edited (see docs/specs/lore-cli.md, Out
// of scope).

// A frontmatter value: a scalar, a list, or a map of scalars. null removes the field.
export type Value = string | string[] | Record<string, string>;
export type Fields = Record<string, Value | null>;

// How a frontmatter field links to a note.
export function link(stem: string): string {
  return `[[${stem}]]`;
}

// Sets or removes each field in order, leaving the rest of the file alone. Text
// with no frontmatter gets one. `path` picks the syntax: Org for .org.
export function setFields(text: string, fields: Fields, path = ""): string {
  const org = isOrg(path);
  for (const [field, value] of Object.entries(fields)) {
    if (org) text = value === null ? removeOrgField(text, field) : setOrgField(text, field, renderOrg(value));
    else text = value === null ? removeField(text, field) : setField(text, field, render(value));
  }
  return text;
}

export function createNote(tree: Tree, path: string, fields: Fields, body: string): void {
  tree.write(path, setFields(body, fields, path));
}

export function updateNote(tree: Tree, path: string, fields: Fields): void {
  tree.write(path, setFields(read(tree, path), fields, path));
}

// Ticks the first unchecked item and returns it with the checklist after.
export function tickNote(tree: Tree, path: string): { item: string; checklist: Note["checklist"] } | undefined {
  const text = read(tree, path);
  const { next: item, nextLine } = parseNote(path, text).checklist;
  if (item === undefined || nextLine === undefined) return undefined;
  const lines = text.split("\n");
  // Org reads only an upper-case X as done, and [-] is a started item.
  lines[nextLine - 1] = lines[nextLine - 1]!.replace(/\[[ -]\]/, isOrg(path) ? "[X]" : "[x]");
  const after = lines.join("\n");
  tree.write(path, after);
  return { item, checklist: parseNote(path, after).checklist };
}

// The YAML for a value: inline, or a block starting with a newline for a map.
export function render(value: Value): string {
  if (typeof value === "string") return scalar(value);
  if (Array.isArray(value)) return `[${value.map((v) => scalar(v, true)).join(", ")}]`;
  return Object.entries(value)
    .map(([k, v]) => `\n  ${key(k)}: ${scalar(v)}`)
    .join("");
}

// A string is written bare only when YAML reads it back as the same string, so
// "123456789012" or "true" stays a string.
function scalar(s: string, inList = false): string {
  try {
    const back = (Bun.YAML.parse(`v: ${inList ? `[${s}]` : s}`) as { v: unknown }).v;
    if (inList ? Array.isArray(back) && back.length === 1 && back[0] === s : back === s) return s;
  } catch {}
  return JSON.stringify(s);
}

// An Org #+ value. Text is written as it is; it is quoted only when it would
// otherwise read as YAML, or lose its spaces. A list of links is written the
// way Org reads links, one after another.
function renderOrg(value: Value): string {
  if (typeof value === "string") return orgScalar(value);
  if (Array.isArray(value)) {
    if (value.length && value.every((v) => /^\[\[[^\[\]]+\]\]$/.test(v))) return value.join(" ");
    return `[${value.map((v) => scalar(v, true)).join(", ")}]`;
  }
  return `{${Object.entries(value)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(", ")}}`;
}

function orgScalar(s: string): string {
  const yaml = /^[\[{"']/.test(s) && !s.startsWith("[[");
  return yaml || s !== s.trim() || s.includes("\n") || !s ? JSON.stringify(s) : s;
}

// The #+ lines at the top, as [start, end): blank lines among them count.
function orgHeader(lines: string[]): number {
  let end = 0;
  for (let i = 0; i < lines.length; i++) {
    if (ORG_KEYWORD.test(lines[i]!)) end = i + 1;
    else if (lines[i]!.trim()) break;
  }
  return end;
}

function orgFieldLine(lines: string[], field: string): number {
  const end = orgHeader(lines);
  return lines.findIndex((l, i) => i < end && ORG_KEYWORD.exec(l)?.[1]!.toLowerCase() === field.toLowerCase());
}

function setOrgField(text: string, field: string, value: string): string {
  const lines = text.split("\n");
  const at = orgFieldLine(lines, field);
  if (at >= 0) {
    // Keep the key as the file spells it: #+TITLE stays upper case.
    lines[at] = `#+${ORG_KEYWORD.exec(lines[at]!)![1]}: ${value}`;
    return lines.join("\n");
  }
  const end = orgHeader(lines);
  lines.splice(end, 0, `#+${field}: ${value}`);
  return lines.join("\n");
}

function removeOrgField(text: string, field: string): string {
  const lines = text.split("\n");
  const at = orgFieldLine(lines, field);
  if (at >= 0) lines.splice(at, 1);
  return lines.join("\n");
}

function key(k: string): string {
  try {
    const back = Bun.YAML.parse(`${k}: x`) as Record<string, unknown>;
    if (Object.keys(back).length === 1 && k in back) return k;
  } catch {}
  return JSON.stringify(k);
}

function read(tree: Tree, path: string): string {
  const text = tree.read(path);
  if (text === undefined) throw new Error(`${path} does not exist`);
  return text;
}

// `value` is YAML: inline ("superseded") or a block that starts with a newline.
function setField(text: string, field: string, value: string): string {
  const entry = `${field}:${value.startsWith("\n") ? "" : " "}${value}`.split("\n");
  const lines = text.split("\n");
  const end = frontmatterEnd(lines);
  if (end < 0) return ["---", ...entry, "---", ...lines].join("\n");
  const [start, stop] = fieldSpan(lines, end, field);
  if (start < 0) return [...lines.slice(0, end), ...entry, ...lines.slice(end)].join("\n");
  return [...lines.slice(0, start), ...entry, ...lines.slice(stop)].join("\n");
}

function removeField(text: string, field: string): string {
  const lines = text.split("\n");
  const end = frontmatterEnd(lines);
  const [start, stop] = end < 0 ? [-1, -1] : fieldSpan(lines, end, field);
  if (start < 0) return text;
  return [...lines.slice(0, start), ...lines.slice(stop)].join("\n");
}

// The line of the closing fence, or -1 when there is no frontmatter.
function frontmatterEnd(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  return lines.findIndex((l, i) => i > 0 && l.trim() === "---");
}

// A field's lines: its key line, and the indented lines and unindented list
// items that continue its value.
function fieldSpan(lines: string[], end: number, field: string): [number, number] {
  const start = lines.findIndex((l, i) => i > 0 && i < end && l.startsWith(`${field}:`));
  if (start < 0) return [-1, -1];
  let stop = start + 1;
  while (stop < end && /^(\s|- )/.test(lines[stop]!)) stop++;
  return [start, stop];
}
