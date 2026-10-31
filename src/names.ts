import { NOTE_FILE, type Note } from "./parse";

// How notes are named and found (see lore:0012). A typed note is named by its
// type and filename, spec/due-dates; a target names a note by that name, its
// path (from the repo or the notes directory), its filename, an alias, or a
// number its filename starts with. An exact path wins over an ambiguous name.

// What naming reads of a note, so a note not written yet can be asked about.
export type Named = Pick<Note, "path" | "stem" | "name" | "aliases">;
export type Resolution<N extends Named = Note> = { note?: N; candidates: N[] };

export type Resolver<N extends Named> = {
  resolve(target: string): Resolution<N>;
  // resolve, with an error saying why nothing or too much matched.
  find(ref: string): { note?: N; error?: string };
  // The same notes and one more, as they would resolve once it exists.
  adding(note: Named): Resolver<Named>;
};

export function resolver<N extends Named>(notes: N[], notesDir: string): Resolver<N> {
  const keyOf = (s: string) => s.trim().replace(/^\.\//, "").replace(NOTE_FILE, "").toLowerCase();
  const relToNotes = (p: string) => (notesDir !== "." && p.startsWith(`${notesDir}/`) ? p.slice(notesDir.length + 1) : p);

  const resolve = (target: string): Resolution<N> => {
    const t = keyOf(target);
    let candidates = notes.filter(
      (n) =>
        keyOf(n.path) === t ||
        keyOf(relToNotes(n.path)) === t ||
        n.stem.toLowerCase() === t ||
        n.name.toLowerCase() === t ||
        n.aliases.some((a) => keyOf(a) === t),
    );
    // An id alone ("0007", "D-12") names the note whose filename starts with it.
    if (!candidates.length && /\d$/.test(t)) candidates = notes.filter((n) => n.stem.toLowerCase().startsWith(`${t}-`) || n.name.toLowerCase().startsWith(`${t}-`));
    const path = target.trim().replace(/^\.\//, "");
    const exact = candidates.length > 1 ? candidates.find((n) => n.path === path) : undefined;
    if (exact) return { note: exact, candidates: [exact] };
    return { note: candidates.length === 1 ? candidates[0] : undefined, candidates };
  };

  const find = (ref: string): { note?: N; error?: string } => {
    const r = resolve(ref);
    if (r.note) return { note: r.note };
    if (r.candidates.length > 1) {
      return { error: `'${ref}' matches ${r.candidates.length} notes:\n${r.candidates.map((n) => (n.name === n.stem ? `  ${n.path}` : `  ${n.name}  ${n.path}`)).join("\n")}` };
    }
    return { error: `no note matches '${ref}'` };
  };

  return { resolve, find, adding: (note) => resolver<Named>([...notes, note], notesDir) };
}

// A typed note's name: its type, lowercased, then its stem, as in spec/due-dates.
export function qualify(type: string, stem: string): string {
  return `${type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${stem}`;
}

// The names of several notes, for saying which ones a name could mean; paths
// where names do not tell them apart, as for two CONTEXT.md files.
export function names(notes: Named[]): string {
  const all = notes.map((n) => (notes.some((o) => o !== n && o.name === n.name) ? n.path : n.name));
  return all.length > 1 ? `${all.slice(0, -1).join(", ")} and ${all.at(-1)}` : (all[0] ?? "");
}
