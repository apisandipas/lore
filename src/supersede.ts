import { link, updateNote } from "./edit";
import type { Graph } from "./graph";
import type { Note } from "./parse";
import type { Tree } from "./tree";

// Superseding: a note whose `supersedes` field links to another replaces it,
// and the old one is never edited again (see lore:0006). What may be
// superseded, what superseding writes, how the chain reads, and what must then
// hold are all here; new, set, check, show and context ask.

export const SUPERSEDES = "supersedes";
export const SUPERSEDED = "superseded";

// The notes this one's `supersedes` field links to.
export function supersedes(g: Graph, note: Note): Note[] {
  return note.links.filter((l) => l.field === SUPERSEDES).flatMap((l) => g.resolve(l.target).note ?? []);
}

// The notes whose `supersedes` field links to this one.
export function supersededBy(g: Graph, note: Note): Note[] {
  return g.notes.filter((n) => supersedes(g, n).includes(note));
}

// Follows supersededBy to the note in force now.
export function current(g: Graph, note: Note): Note {
  const seen = new Set<Note>();
  let at = note;
  while (!seen.has(at)) {
    seen.add(at);
    const next = supersededBy(g, at)[0];
    if (!next) break;
    at = next;
  }
  return at;
}

// Every note in this one's supersede chain, newest first. Branches (one note
// superseding two) are flattened in walk order.
export function history(g: Graph, note: Note): Note[] {
  const out: Note[] = [];
  const walk = (n: Note) => {
    if (out.includes(n)) return;
    out.push(n);
    supersedes(g, n).forEach(walk);
  };
  walk(current(g, note));
  return out.includes(note) ? out : [note];
}

// Whether an assignment would supersede: only `lore new --supersedes` does
// that, since it also rewrites the old note.
export function superseding(field: string, values: string[]): boolean {
  return field === SUPERSEDES || (field === "status" && values.includes(SUPERSEDED));
}

// The fields a new note gets for superseding these: links to them, and what
// they governed, which it now governs. Checked before anything is written.
export function planSupersede(g: Graph, olds: Note[]): { fields: { supersedes?: string[]; anchors?: string[] } } | { problem: string } {
  for (const old of olds) {
    if (old.status === SUPERSEDED) return { problem: `${old.name} is already superseded by ${current(g, old).name}` };
    const allowed = old.def?.fields.status?.enum;
    if (allowed && !allowed.includes(SUPERSEDED)) {
      return { problem: `${old.type} has no '${SUPERSEDED}' status, so ${old.name} cannot be superseded` };
    }
  }
  if (!olds.length) return { fields: {} };
  const anchors = [...new Set(olds.flatMap((o) => o.anchors))];
  return { fields: { supersedes: olds.map((o) => link(o.name)), ...(anchors.length ? { anchors } : {}) } };
}

// Marks the old notes superseded; their anchors moved to the new one.
export function markSuperseded(tree: Tree, olds: Note[]): void {
  for (const old of olds) updateNote(tree, old.path, { status: SUPERSEDED, anchors: null });
}
