import { basename } from "node:path";
import { anchors, type Anchor } from "./anchor";
import { openRepo, type Repo } from "./repo";
import { NOTE_FILE, parseNote, sectionSummary, type Link, type Note } from "./parse";
import { typeForPath } from "./schema";
import type { Tree } from "./tree";

export type Citation = { file: string; line: number; target: string };
export type Resolution = { note?: Note; candidates: Note[] };
export type Backlink = { from: Note; link: Link };
// A link or citation a new note would make ambiguous, and the note it meant.
export type Shadowed = { file: string; line: number; target: string; was: Note };
// What resolution reads of a note, so a note not written yet can be asked about.
export type Named = Pick<Note, "path" | "stem" | "name" | "aliases">;

export type Graph = {
  repo: Repo;
  notes: Note[];
  byPath: Map<string, Note>;
  citations: Citation[];
  isNoteFile(file: string): boolean;
  // A link target or a name from the command line: a path, a qualified name
  // (spec/auth, decision/0002), a filename, an alias, or a number prefix. An exact path wins over an ambiguous name.
  resolve(target: string): Resolution;
  // The links and citations that name one note now and would name two once
  // this note exists: found by resolution itself, before the note is written.
  shadowedBy(note: Named): Shadowed[];
  // resolve, with an error saying why nothing or too much matched.
  find(ref: string): { note?: Note; error?: string };
  backlinks(note: Note): Backlink[];
  // An anchor, parsed once: its kind, the files it governs, whether it covers one.
  anchor(text: string): Anchor;
  // Whether a note is of the named type, however either is capitalised.
  isA(note: Note, type: string): boolean;
};

// Statuses from the schema `lore init` writes. A project that renames them
// edits its skills too, so check and next read these names rather than guessing.
export const DRAFT = "draft";
export const ACTIVE = "active";
export const DONE = "done";
export const RETIRED = "retired";

// Code cites notes as lore:<name> rather than double brackets; see lore:0004.
const CITATION = String.raw`\blore:[A-Za-z0-9_./-]*[A-Za-z0-9_]`;

export function loadGraph(tree: Tree): Graph {
  const repo = openRepo(tree);
  const notesDir = repo.config.notes;
  const fileSet = new Set(repo.files);

  const isNoteFile = (f: string) =>
    NOTE_FILE.test(f) && (notesDir === "." || f.startsWith(`${notesDir}/`) || basename(f) === "CONTEXT.md");

  const { schema } = repo.config;
  const notes = repo.files
    .filter(isNoteFile)
    .map((f) => {
      const note = parseNote(f, tree.read(f) ?? "");
      // A note in a type's directory has that type unless it names another.
      note.def = note.type ? schema.find(note.type) : typeForPath(schema, f);
      if (note.def) note.type = note.def.name;
      if (note.type) note.name = qualify(note.type, note.stem);
      const section = note.def?.summary;
      if (section && note.frontmatter.summary === undefined) note.summary = sectionSummary(note.path, note.body, section) ?? note.summary;
      return note;
    });
  const byPath = new Map(notes.map((n) => [n.path, n]));

  const keyOf = (s: string) => s.trim().replace(/^\.\//, "").replace(NOTE_FILE, "").toLowerCase();
  const relToNotes = (p: string) => (notesDir !== "." && p.startsWith(`${notesDir}/`) ? p.slice(notesDir.length + 1) : p);

  // Resolution among a pool of notes: the graph's own, or those plus one to come.
  const resolveIn = <N extends Named>(pool: N[], target: string): { note?: N; candidates: N[] } => {
    const t = keyOf(target);
    let candidates = pool.filter(
      (n) =>
        keyOf(n.path) === t ||
        keyOf(relToNotes(n.path)) === t ||
        n.stem.toLowerCase() === t ||
        n.name.toLowerCase() === t ||
        n.aliases.some((a) => keyOf(a) === t),
    );
    // An id alone ("0007", "D-12") names the note whose filename starts with it.
    if (!candidates.length && /\d$/.test(t)) candidates = pool.filter((n) => n.stem.toLowerCase().startsWith(`${t}-`) || n.name.toLowerCase().startsWith(`${t}-`));
    const path = target.trim().replace(/^\.\//, "");
    const exact = candidates.length > 1 ? candidates.find((n) => n.path === path) : undefined;
    if (exact) return { note: exact, candidates: [exact] };
    return { note: candidates.length === 1 ? candidates[0] : undefined, candidates };
  };
  const resolve = (target: string): Resolution => resolveIn(notes, target);

  const find = (ref: string): { note?: Note; error?: string } => {
    const r = resolve(ref);
    if (r.note) return { note: r.note };
    if (r.candidates.length > 1) {
      return { error: `'${ref}' matches ${r.candidates.length} notes:\n${r.candidates.map((n) => (n.name === n.stem ? `  ${n.path}` : `  ${n.name}  ${n.path}`)).join("\n")}` };
    }
    return { error: `no note matches '${ref}'` };
  };

  const citations = tree
    .search(CITATION)
    .map((h) => ({ file: h.file, line: h.line, target: h.text.slice("lore:".length) }))
    .filter((c) => fileSet.has(c.file) && !isNoteFile(c.file));

  const shadowedBy = (note: Named): Shadowed[] =>
    [...notes.flatMap((n) => n.links.map((l) => ({ file: n.path, line: l.line, target: l.target }))), ...citations].flatMap((site) => {
      const was = resolve(site.target).note;
      return was && resolveIn<Named>([...notes, note], site.target).note !== was ? [{ ...site, was }] : [];
    });

  const anchor = anchors({ tree, files: repo.files, isNoteFile });

  const backlinks = (note: Note): Backlink[] =>
    notes.flatMap((from) => from.links.filter((link) => resolve(link.target).note === note).map((link) => ({ from, link })));

  const isA = (note: Note, type: string): boolean => {
    const def = schema.find(type);
    return def ? note.def === def : note.type?.toLowerCase() === type.toLowerCase();
  };

  return { repo, notes, byPath, citations, isNoteFile, resolve, find, shadowedBy, backlinks, anchor, isA };
}

// The names of several notes, for saying which ones a name could mean; paths
// where names do not tell them apart, as for two CONTEXT.md files.
export function names(notes: Note[]): string {
  const all = notes.map((n) => (notes.some((o) => o !== n && o.name === n.name) ? n.path : n.name));
  return all.length > 1 ? `${all.slice(0, -1).join(", ")} and ${all.at(-1)}` : (all[0] ?? "");
}

// A typed note's name: its type, lowercased, then its stem, as in spec/due-dates.
export function qualify(type: string, stem: string): string {
  return `${type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${stem}`;
}
