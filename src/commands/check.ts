import { names, SUPERSEDED, type Graph } from "../graph";
import type { Note } from "../parse";
import { drift } from "../plan";
import { fieldProblems } from "../validate";
import type { Result } from "./shared";

export type Problem = { file: string; line: number; message: string };

export function checkGraph(g: Graph): Problem[] {
  const problems: Problem[] = [];
  const target = (t: string, candidates: Note[]) =>
    candidates.length > 1 ? `'${t}' is ambiguous: it matches ${names(candidates)}` : `'${t}' matches no note`;

  for (const note of g.notes) {
    const at = (line: number, message: string) => problems.push({ file: note.path, line, message });
    if (note.frontmatterError) at(1, note.frontmatterError);
    for (const link of note.links) {
      // Links in the type's link fields are checked with the rest of the field.
      if (link.field && note.def?.fields[link.field]?.link) continue;
      const r = g.resolve(link.target);
      if (!r.note) at(link.line, `${link.field ? `${link.field} link` : "link"} ${target(link.target, r.candidates)}`);
    }
    for (const anchor of note.anchors) {
      if (!g.anchor(anchor).files().length) at(fieldLine(note, "anchors"), `anchor '${anchor}' matches no files`);
    }
    checkSchema(g, note, at);
    checkSuperseding(g, note, at);
    checkFrozen(g, note, at);
  }

  for (const c of g.citations) {
    const r = g.resolve(c.target);
    if (!r.note) {
      problems.push({ file: c.file, line: c.line, message: `citation ${target(`lore:${c.target}`, r.candidates)}` });
    } else if (r.note.status === SUPERSEDED) {
      const now = g.current(r.note);
      const advice = now === r.note ? "" : `; cite lore:${now.name} instead`;
      problems.push({ file: c.file, line: c.line, message: `cites superseded '${r.note.name}'${advice}` });
    }
  }

  return problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

type At = (line: number, message: string) => void;

function checkSchema(g: Graph, note: Note, at: At) {
  const { schema } = g.repo.config;
  if (!schema.types.length || !note.type) return;
  const { def } = note;
  if (!def) {
    at(fieldLine(note, "type"), `type '${note.type}' is not in .lore/schema.yml`);
    return;
  }
  for (const field of Object.keys(def.fields)) {
    for (const message of fieldProblems(g, def, field, note.frontmatter[field])) at(fieldLine(note, field), message);
  }
}

function checkSuperseding(g: Graph, note: Note, at: At) {
  if (note.status === SUPERSEDED) {
    const successors = g.supersededBy(note);
    if (!successors.length) at(fieldLine(note, "status"), "superseded, but no note supersedes it");
    if (note.anchors.length) {
      const to = successors[0] ? ` to ${g.current(note).name}` : "";
      at(fieldLine(note, "anchors"), `superseded note still anchors code; move its anchors${to}`);
    }
  }
  for (const old of g.supersedes(note)) {
    if (old.status !== SUPERSEDED) {
      at(fieldLine(note, "supersedes"), `supersedes ${old.name}, but ${old.name} is ${old.status ?? "missing a status"}`);
    }
  }
}

function checkFrozen(g: Graph, note: Note, at: At) {
  for (const { path, gone } of drift(g, note)) {
    const message = gone ? `frozen ${path} no longer exists` : `${path} changed since this was frozen; review the plan, then run lore freeze ${note.name}`;
    at(fieldLine(note, "frozen"), message);
  }
}

// The line of a frontmatter key, or 1 when the key is absent.
function fieldLine(note: Note, field: string): number {
  return note.links.find((l) => l.field === field)?.line ?? note.fieldLines[field] ?? 1;
}

export function runCheck(g: Graph, opts: { json: boolean }): Result {
  const problems = checkGraph(g);
  const code = problems.length ? 1 : 0;
  if (opts.json) return { code, out: `${JSON.stringify({ problems }, null, 2)}\n` };
  const notes = g.notes.length === 1 ? "1 note" : `${g.notes.length} notes`;
  const citations = g.citations.length === 1 ? "1 citation" : `${g.citations.length} citations`;
  if (!problems.length) return { code, out: `${notes}, ${citations}: no problems\n` };
  const lines = problems.map((p) => `${p.file}:${p.line}: ${p.message}`);
  const count = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
  return { code, out: `${lines.join("\n")}\n\n${notes}, ${citations}: ${count}\n` };
}
