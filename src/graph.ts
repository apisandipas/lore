import { basename } from "node:path";
import { anchors, type Anchor } from "./anchor";
import { openRepo, type Repo } from "./repo";
import { qualify, resolver, type Named, type Resolution } from "./names";
import { NOTE_FILE, parseNote, sectionSummary, type Link, type Note } from "./parse";
import { typeForPath } from "./schema";
import type { Tree } from "./tree";

export type Citation = { file: string; line: number; target: string };
export type Backlink = { from: Note; link: Link };
// A link or citation a new note would make ambiguous, and the note it meant.
export type Shadowed = { file: string; line: number; target: string; was: Note };

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

  const names = resolver(notes, notesDir);
  const { resolve, find } = names;

  const citations = tree
    .search(CITATION)
    .map((h) => ({ file: h.file, line: h.line, target: h.text.slice("lore:".length) }))
    .filter((c) => fileSet.has(c.file) && !isNoteFile(c.file))
    // rg searches in parallel; sorted, every command sees them in one order.
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));

  const shadowedBy = (note: Named): Shadowed[] => {
    const after = names.adding(note);
    const sites = [...notes.flatMap((n) => n.links.map((l) => ({ file: n.path, line: l.line, target: l.target }))), ...citations];
    return sites.flatMap((site) => {
      const was = resolve(site.target).note;
      return was && after.resolve(site.target).note !== was ? [{ ...site, was }] : [];
    });
  };

  const anchor = anchors({ tree, files: repo.files, isNoteFile });

  const backlinks = (note: Note): Backlink[] =>
    notes.flatMap((from) => from.links.filter((link) => resolve(link.target).note === note).map((link) => ({ from, link })));

  const isA = (note: Note, type: string): boolean => {
    const def = schema.find(type);
    return def ? note.def === def : note.type?.toLowerCase() === type.toLowerCase();
  };

  return { repo, notes, byPath, citations, isNoteFile, resolve, find, shadowedBy, backlinks, anchor, isA };
}
