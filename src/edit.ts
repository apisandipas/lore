import { parseNote, type Note } from "./parse";
import { syntaxOf, type Value } from "./syntax";
import type { Tree } from "./tree";

// Every write to a note goes through here: frontmatter fields and checkboxes,
// in Markdown or Org, each written by its syntax (src/syntax). Bodies are never
// edited (see docs/specs/lore-cli.md, Out of scope).

// null removes the field.
export type Fields = Record<string, Value | null>;

// How a frontmatter field links to a note.
export function link(name: string): string {
  return `[[${name}]]`;
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
  lines[nextLine - 1] = syntaxOf(path).tick(lines[nextLine - 1]!);
  const after = lines.join("\n");
  tree.write(path, after);
  return { item, checklist: parseNote(path, after).checklist };
}

// Sets or removes each field in order.
function setFields(text: string, fields: Fields, path: string): string {
  const syntax = syntaxOf(path);
  for (const [field, value] of Object.entries(fields)) {
    text = value === null ? syntax.removeField(text, field) : syntax.setField(text, field, value);
  }
  return text;
}

function read(tree: Tree, path: string): string {
  const text = tree.read(path);
  if (text === undefined) throw new Error(`${path} does not exist`);
  return text;
}
