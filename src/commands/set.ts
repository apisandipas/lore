import { link, render, updateNote, type Fields } from "../edit";
import { fieldProblems } from "../validate";
import { SUPERSEDED, SUPERSEDES, type Graph } from "../graph";
import { linkTargets } from "../parse";
import type { FieldDef } from "../schema";
import { linkTo, type Result } from "./shared";

const USAGE = "usage: lore set <note> <field>=<value>... (or <field>+=<value> on a list field)";
const ASSIGNMENT = /^([A-Za-z_][\w-]*)(\+?=)(.+)$/;
// Fields any note may use, whatever its type.
const COMMON: Record<string, FieldDef> = {
  type: {},
  status: {},
  title: {},
  summary: {},
  aliases: { many: true },
  anchors: { many: true },
};

type Change = { field: string; add: boolean; values: string[] };

export async function runSet(g: Graph, args: string[], opts: { json: boolean }): Promise<Result> {
  const [ref, ...assignments] = args;
  if (!ref || !assignments.length) return { code: 2, out: `lore set: ${USAGE}\n` };

  // Group assignments by field, keeping the order they were given.
  const changes = new Map<string, Change>();
  for (const arg of assignments) {
    const m = ASSIGNMENT.exec(arg);
    if (!m || !m[3]!.trim()) return { code: 2, out: `lore set: '${arg}' is not <field>=<value>\n${USAGE}\n` };
    const [, field, op, value] = m as unknown as [string, string, string, string];
    const change = changes.get(field) ?? { field, add: true, values: [] };
    if (op === "=") change.add = false;
    change.values.push(value.trim());
    changes.set(field, change);
  }

  const { note, error } = g.find(ref);
  if (!note) return { code: 1, out: `lore set: ${error}\n` };
  const { schema } = g.repo.config;
  const fields = { ...COMMON, ...note.def?.fields };
  const fail = (message: string): Result => ({ code: 1, out: `lore set: ${note.path}: ${message}\n` });

  // Every assignment is checked before anything is written.
  const updates: Fields = {};
  const set: Record<string, string | string[]> = {};
  for (const { field, add, values } of changes.values()) {
    // Superseding also rewrites the old note, so it keeps its own command.
    if (field === SUPERSEDES || (field === "status" && values.includes(SUPERSEDED))) {
      return fail(`supersede with lore new <type> <title> --supersedes ${note.stem}`);
    }
    const def = fields[field];
    if (!def) return fail(`'${field}' is not a field of ${note.type ?? "an untyped note"} (fields: ${Object.keys(fields).join(", ")})`);
    if (!def.many && (values.length > 1 || add)) return fail(`'${field}' takes one value, not a list`);

    if (field === "type" && schema.types.length && !schema.find(values[0]!)) return fail(`type '${values[0]}' is not in .lore/schema.yml`);
    const written = def.link ? values.map((v) => linkTo(g, v)) : values;

    let list = written;
    if (add) {
      // An Org value can hold several links as text: [[a]] [[b]].
      const existing = toList(note.frontmatter[field]).flatMap((v) => {
        const targets = def.link ? linkTargets(v) : [];
        return targets.length > 1 ? targets.map(link) : [v];
      });
      // A link already there under another name for the same note is not added twice.
      const target = (s: string) => g.resolve(linkTargets(s)[0] ?? s).note;
      const same = (a: string, b: string) => a === b || (!!def.link && !!target(a) && target(a) === target(b));
      list = [...existing, ...written.filter((w) => !existing.some((e) => same(e, w)))];
    }
    list = list.filter((v, i) => list.indexOf(v) === i);
    const value = def.many ? list : list[0]!;
    if (note.def) {
      const [problem] = fieldProblems(g, note.def, field, value);
      if (problem) return fail(problem);
    }
    set[field] = updates[field] = value;
  }

  updateNote(g.repo.tree, note.path, updates);

  if (opts.json) return { code: 0, out: `${JSON.stringify({ path: note.path, set }, null, 2)}\n` };
  const lines = Object.entries(set).map(([field, value]) => `  ${field}: ${render(value)}`);
  return { code: 0, out: `updated ${note.path}\n${lines.join("\n")}\n` };
}

function toList(v: unknown): string[] {
  if (typeof v === "string") return [v];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
