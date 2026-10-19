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

// A note named on the command line: a link target, or a path to the file.
export function findNote(g: Graph, ref: string): { note?: Note; error?: string } {
  const r = g.resolve(ref);
  if (r.note) return { note: r.note };
  const byPath = g.byPath.get(ref.replace(/^\.\//, ""));
  if (byPath) return { note: byPath };
  if (r.candidates.length > 1) {
    return { error: `'${ref}' matches ${r.candidates.length} notes:\n${r.candidates.map((n) => `  ${n.path}`).join("\n")}` };
  }
  return { error: `no note matches '${ref}'` };
}

// A note named for a link field: exactly one note, of the type the field links to.
export function linkTarget(g: Graph, field: string, link: string, ref: string): { note?: Note; error?: string } {
  const { note, error } = findNote(g, ref);
  if (!note) return { error: `${field}: ${error}` };
  if (note.type?.toLowerCase() !== link.toLowerCase()) {
    return { error: `${field}: ${note.stem} is ${a(note.type ?? "untyped note")}; ${field} links to ${a(link)}` };
  }
  return { note };
}
