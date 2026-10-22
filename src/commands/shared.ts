import type { Graph } from "../graph";
import { link } from "../edit";
import type { Note } from "../parse";

export type Result = { code: number; out: string };

export function label(note: Note): string {
  const tags = [note.type, note.status].filter(Boolean).join(", ");
  return tags ? `${note.title}  (${tags})` : note.title;
}

// A name from the command line as a link value: [[type/stem]] when it names one
// note, otherwise as given, for fieldProblems to report.
export function linkTo(g: Graph, ref: string): string {
  return link(g.resolve(ref).note?.name ?? ref);
}
