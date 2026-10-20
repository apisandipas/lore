import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { anchorSpecificity, SUPERSEDES, type Graph } from "../graph";
import type { Note } from "../parse";
import { openSession } from "../session";
import { label, type Result } from "./shared";

export type Match = { note: Note; rank: number; specificity: number; reasons: string[] };

// Lower rank wins: what the code says beats what notes claim, which beats
// directory context, which beats one hop of inference.
const CITED = 0;
const SYMBOL = 1;
const PATH = 2;
const CONTEXT_FILE = 3;
const LINKED = 4;

export function contextFor(g: Graph, files: string[]): Match[] {
  const matches = new Map<string, Match>();
  const many = files.length > 1;
  const add = (note: Note, rank: number, specificity: number, reason: string) => {
    const m = matches.get(note.path);
    if (!m) {
      matches.set(note.path, { note, rank, specificity, reasons: [reason] });
      return;
    }
    if (rank < m.rank || (rank === m.rank && specificity > m.specificity)) {
      m.rank = rank;
      m.specificity = specificity;
    }
    if (!m.reasons.includes(reason)) m.reasons.push(reason);
  };

  for (const file of files) {
    const where = many ? ` (${file})` : "";

    for (const c of g.citations) {
      if (c.file !== file) continue;
      const note = g.resolve(c.target).note;
      if (note) add(note, CITED, 0, `cited at ${basename(c.file)}:${c.line}`);
    }

    for (const note of g.notes) {
      for (const anchor of note.anchors) {
        if (!g.anchorMatches(anchor, file)) continue;
        if (anchor.startsWith("symbol:")) add(note, SYMBOL, 0, `uses ${anchor.slice(7)}${where}`);
        else add(note, PATH, anchorSpecificity(anchor), `anchor ${anchor}${where}`);
      }
    }

    for (let dir = dirname(file), depth = 1000; ; dir = dirname(dir), depth--) {
      const path = dir === "." ? "CONTEXT.md" : `${dir}/CONTEXT.md`;
      const note = g.byPath.get(path);
      if (note && path !== file) add(note, CONTEXT_FILE, depth, dir === "." ? "CONTEXT.md at the repo root" : `CONTEXT.md in ${dir}/`);
      if (dir === ".") break;
    }
  }

  for (const m of [...matches.values()]) {
    if (m.rank === CONTEXT_FILE) continue;
    for (const link of m.note.links) {
      // History is shown on its own line, not as a match.
      if (!link.field || link.field === SUPERSEDES) continue;
      const linked = g.resolve(link.target).note;
      if (linked && linked !== m.note) add(linked, LINKED, 0, `${link.field} of ${m.note.title}`);
    }
  }

  // A superseded note stands in for the decision now in force.
  for (const m of [...matches.values()]) {
    const now = g.current(m.note);
    if (now === m.note) continue;
    matches.delete(m.note.path);
    for (const reason of m.reasons) add(now, m.rank, m.specificity, `${reason} (via superseded ${m.note.stem})`);
  }

  return [...matches.values()].sort(
    (a, b) => a.rank - b.rank || b.specificity - a.specificity || a.note.path.localeCompare(b.note.path),
  );
}

export function repoRelative(g: Graph, cwd: string, arg: string): string | undefined {
  const rel = relative(g.repo.root, resolve(cwd, arg));
  return rel.startsWith("..") || isAbsolute(rel) ? undefined : rel;
}

// The text, and the notes that fit in the budget.
export function renderContext(
  g: Graph,
  files: string[],
  matches: Match[],
  opts: { full: boolean; budget: number },
): { out: string; shown: Note[] } {
  const count = matches.length === 1 ? "1 note" : `${matches.length} notes`;
  let out = `${files.join(", ")}: ${matches.length ? count : "no notes"}\n`;
  let omitted = 0;
  const shown: Note[] = [];
  for (const m of matches) {
    const body = opts.full && m.note.body ? `\n${indent(m.note.body)}\n` : "";
    const summary = m.note.summary ? `  ${m.note.summary}\n` : "";
    const history = g
      .supersedes(m.note)
      .map((old) => `  supersedes ${old.stem}: ${old.summary || old.title}\n`)
      .join("");
    const entry = `\n${label(m.note)}\n  ${m.note.path}\n  matched: ${m.reasons.join("; ")}\n${summary}${history}${body}`;
    // Roughly four characters per token.
    if ((out.length + entry.length) / 4 > opts.budget && out.includes("matched:")) {
      omitted++;
      continue;
    }
    out += entry;
    shown.push(m.note);
  }
  if (omitted) out += `\n${omitted} more ${omitted === 1 ? "note" : "notes"} omitted; raise --budget to see them\n`;
  return { out, shown };
}

// With a session, only notes that session has not been shown, or that changed
// since; nothing at all when there are none.
export function runContext(
  g: Graph,
  cwd: string,
  args: string[],
  opts: { full: boolean; json: boolean; budget: number; session?: string; forget: boolean },
): Result {
  const session = opts.session === undefined ? undefined : openSession(g.repo.root, opts.session);
  if (opts.forget) {
    if (!session) return { code: 2, out: "lore context: --forget needs --session <id>\n" };
    if (args.length) return { code: 2, out: "lore context: --forget takes no files\n" };
    session.forget();
    return { code: 0, out: "" };
  }
  if (!args.length) return { code: 2, out: "lore context: name at least one file\n" };
  const files: string[] = [];
  for (const arg of args) {
    const rel = repoRelative(g, cwd, arg);
    if (!rel) return { code: 2, out: `lore context: ${arg} is outside the repo at ${g.repo.root}\n` };
    files.push(rel);
  }
  let matches = contextFor(g, files);
  if (session) {
    matches = matches.filter((m) => session.unseen(m.note));
    if (!matches.length) return { code: 0, out: "" };
  }
  if (opts.json) {
    const notes = matches.map((m) => ({
      path: m.note.path,
      title: m.note.title,
      type: m.note.type ?? null,
      status: m.note.status ?? null,
      summary: m.note.summary,
      matched: m.reasons,
      supersedes: g.supersedes(m.note).map((o) => o.path),
      ...(opts.full ? { body: m.note.body } : {}),
    }));
    session?.saw(matches.map((m) => m.note));
    return { code: 0, out: `${JSON.stringify({ files, notes }, null, 2)}\n` };
  }
  const { out, shown } = renderContext(g, files, matches, opts);
  session?.saw(shown);
  return { code: 0, out };
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => (l ? `    ${l}` : l))
    .join("\n");
}
