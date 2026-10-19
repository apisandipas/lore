import type { Graph } from "../graph";
import type { Note } from "../parse";

export type Result = { code: number; out: string };

// "a Spec", "an Effort".
export function a(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

export function label(note: Note): string {
  const tags = [note.type, note.status].filter(Boolean).join(", ");
  return tags ? `${note.title}  (${tags})` : note.title;
}

// A note named for a link field: exactly one note, of the type the field links to.
export function linkTarget(g: Graph, field: string, link: string, ref: string): { note?: Note; error?: string } {
  const { note, error } = g.find(ref);
  if (!note) return { error: `${field}: ${error}` };
  if (!g.isA(note, link)) {
    return { error: `${field}: ${note.stem} is ${a(note.type ?? "untyped note")}; ${field} links to ${a(link)}` };
  }
  return { note };
}
