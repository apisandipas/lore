import { parseNote, type Note } from "./parse";
import type { Tree } from "./tree";

// Every write to a note goes through here: frontmatter fields and checkboxes.
// Bodies are never edited (see docs/specs/lore-cli.md, Out of scope).

// A frontmatter value: a scalar, a list, or a map of scalars. null removes the field.
export type Value = string | string[] | Record<string, string>;
export type Fields = Record<string, Value | null>;

// How a frontmatter field links to a note.
export function link(stem: string): string {
  return `[[${stem}]]`;
}

// Sets or removes each field in order, leaving the rest of the file alone. Text
// with no frontmatter gets one.
export function setFields(text: string, fields: Fields): string {
  for (const [field, value] of Object.entries(fields)) {
    text = value === null ? removeField(text, field) : setField(text, field, render(value));
  }
  return text;
}

export function createNote(tree: Tree, path: string, fields: Fields, body: string): void {
  tree.write(path, setFields(body, fields));
}

export function updateNote(tree: Tree, path: string, fields: Fields): void {
  tree.write(path, setFields(read(tree, path), fields));
}

// Ticks the first unchecked item and returns it with the checklist after.
export function tickNote(tree: Tree, path: string): { item: string; checklist: Note["checklist"] } | undefined {
  const text = read(tree, path);
  const { next: item, nextLine } = parseNote(path, text).checklist;
  if (item === undefined || nextLine === undefined) return undefined;
  const lines = text.split("\n");
  lines[nextLine - 1] = lines[nextLine - 1]!.replace("[ ]", "[x]");
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
