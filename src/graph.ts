import { basename, join } from "node:path";
import { readFileSync } from "node:fs";
import { openRepo, rg, type Repo } from "./repo";
import { parseNote, sectionSummary, type Link, type Note } from "./parse";
import { typeForPath } from "./schema";

export type Citation = { file: string; line: number; target: string };
export type Resolution = { note?: Note; candidates: Note[] };
export type Backlink = { from: Note; link: Link };

export type Graph = {
  repo: Repo;
  notes: Note[];
  byPath: Map<string, Note>;
  citations: Citation[];
  isNoteFile(file: string): boolean;
  resolve(target: string): Resolution;
  backlinks(note: Note): Backlink[];
  anchorFiles(anchor: string): string[];
  // Notes whose `supersedes` field links to this one, and the ones it links to.
  supersededBy(note: Note): Note[];
  supersedes(note: Note): Note[];
  // Follows supersededBy to the decision in force now.
  current(note: Note): Note;
};

export const SUPERSEDES = "supersedes";
export const SUPERSEDED = "superseded";
// Statuses from the schema `lore init` writes. A project that renames them
// edits its skills too, so check and next read these names rather than guessing.
export const DRAFT = "draft";
export const ACTIVE = "active";
export const DONE = "done";
export const RETIRED = "retired";

// Code cites notes as lore:<name> rather than double brackets; see lore:0004.
const CITATION = String.raw`\blore:[A-Za-z0-9_./-]*[A-Za-z0-9_]`;
const CITATION_LINE = /^(.+?):(\d+):lore:(.+)$/;
const GLOB_CHAR = /[*?[{]/;

export async function loadGraph(cwd: string): Promise<Graph> {
  const repo = await openRepo(cwd);
  const notesDir = repo.config.notes;
  const fileSet = new Set(repo.files);

  const isNoteFile = (f: string) =>
    f.endsWith(".md") && (notesDir === "." || f.startsWith(`${notesDir}/`) || basename(f) === "CONTEXT.md");

  const { schema } = repo.config;
  const notes = repo.files
    .filter(isNoteFile)
    .map((f) => {
      const note = parseNote(f, readFileSync(join(repo.root, f), "utf8"));
      // A note in a type's directory has that type unless it names another.
      note.type ??= typeForPath(schema, f)?.name;
      const section = schema.find(note.type)?.summary;
      if (section && note.frontmatter.summary === undefined) note.summary = sectionSummary(note.body, section) ?? note.summary;
      return note;
    });
  const byPath = new Map(notes.map((n) => [n.path, n]));

  const keyOf = (s: string) => s.trim().replace(/^\.\//, "").replace(/\.md$/i, "").toLowerCase();
  const relToNotes = (p: string) => (notesDir !== "." && p.startsWith(`${notesDir}/`) ? p.slice(notesDir.length + 1) : p);

  const resolve = (target: string): Resolution => {
    const t = keyOf(target);
    let candidates = notes.filter(
      (n) =>
        keyOf(n.path) === t ||
        keyOf(relToNotes(n.path)) === t ||
        n.stem.toLowerCase() === t ||
        n.aliases.some((a) => keyOf(a) === t),
    );
    // An id alone ("0007", "D-12") names the note whose filename starts with it.
    if (!candidates.length && /\d$/.test(t)) candidates = notes.filter((n) => n.stem.toLowerCase().startsWith(`${t}-`));
    return { note: candidates.length === 1 ? candidates[0] : undefined, candidates };
  };

  const citations = rg(repo.root, ["-n", "-o", "--no-heading", "--with-filename", "--hidden", "--glob", "!.git/", "-e", CITATION])
    .flatMap((l) => {
      const m = CITATION_LINE.exec(l);
      return m ? [{ file: m[1]!, line: Number(m[2]), target: m[3]! }] : [];
    })
    .filter((c) => fileSet.has(c.file) && !isNoteFile(c.file));

  const anchorCache = new Map<string, string[]>();
  const anchorFiles = (anchor: string): string[] => {
    const cached = anchorCache.get(anchor);
    if (cached) return cached;
    let found: string[];
    if (anchor.startsWith("symbol:")) {
      const name = anchor.slice("symbol:".length).trim();
      found = name
        ? rg(repo.root, ["-l", "-w", "-F", "--hidden", "--glob", "!.git/", "-e", name])
            .filter((f) => fileSet.has(f) && !isNoteFile(f))
            .sort()
        : [];
    } else {
      const pattern = anchor.trim().replace(/^\.\//, "").replace(/\/$/, "");
      if (GLOB_CHAR.test(pattern)) {
        const glob = new Bun.Glob(pattern);
        found = repo.files.filter((f) => glob.match(f));
      } else {
        found = repo.files.filter((f) => f === pattern || f.startsWith(`${pattern}/`));
      }
    }
    anchorCache.set(anchor, found);
    return found;
  };

  const backlinks = (note: Note): Backlink[] =>
    notes.flatMap((from) => from.links.filter((link) => resolve(link.target).note === note).map((link) => ({ from, link })));

  const supersedes = (note: Note): Note[] =>
    note.links.filter((l) => l.field === SUPERSEDES).flatMap((l) => resolve(l.target).note ?? []);
  const supersededBy = (note: Note): Note[] => notes.filter((n) => supersedes(n).includes(note));
  const current = (note: Note): Note => {
    const seen = new Set<Note>();
    let at = note;
    while (!seen.has(at)) {
      seen.add(at);
      const next = supersededBy(at)[0];
      if (!next) break;
      at = next;
    }
    return at;
  };

  return { repo, notes, byPath, citations, isNoteFile, resolve, backlinks, anchorFiles, supersedes, supersededBy, current };
}

// How narrowly a path anchor targets code: the literal prefix before any glob.
export function anchorSpecificity(anchor: string): number {
  const pattern = anchor.trim().replace(/^\.\//, "").replace(/\/$/, "");
  const i = pattern.search(GLOB_CHAR);
  return i < 0 ? pattern.length + 1 : i;
}
