import { join } from "node:path";
import { setField, yamlString } from "../frontmatter";
import { SUPERSEDED, SUPERSEDES, type Graph } from "../graph";
import { linkTargets } from "../parse";
import type { FieldDef } from "../schema";
import { findNote, linkTarget, type Result } from "./shared";

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
const BARE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

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

  const { note, error } = findNote(g, ref);
  if (!note) return { code: 1, out: `lore set: ${error}\n` };
  const { schema } = g.repo.config;
  const fields = { ...COMMON, ...schema.find(note.type)?.fields };
  const fail = (message: string): Result => ({ code: 1, out: `lore set: ${note.path}: ${message}\n` });

  // Every assignment is checked before anything is written.
  const yaml: [string, string, string[]][] = [];
  for (const { field, add, values } of changes.values()) {
    // Superseding also rewrites the old note, so it keeps its own command.
    if (field === SUPERSEDES || (field === "status" && values.includes(SUPERSEDED))) {
      return fail(`supersede with lore new <type> <title> --supersedes ${note.stem}`);
    }
    const def = fields[field];
    if (!def) return fail(`'${field}' is not a field of ${note.type ?? "an untyped note"} (fields: ${Object.keys(fields).join(", ")})`);
    if (!def.many && (values.length > 1 || add)) return fail(`${field} takes one value`);

    const written: string[] = [];
    for (const value of values) {
      if (def.enum && !def.enum.includes(value)) return fail(`'${field}' cannot be '${value}'; expected one of ${def.enum.join(", ")}`);
      if (field === "type" && schema.types.length && !schema.find(value)) return fail(`type '${value}' is not in .lore/schema.yml`);
      if (def.link) {
        const target = linkTarget(g, field, def.link, value);
        if (!target.note) return fail(target.error!);
        written.push(`[[${target.note.stem}]]`);
      } else written.push(value);
    }

    let list = written;
    if (add) {
      const existing = toList(note.frontmatter[field]);
      // A link already there under another name for the same note is not added twice.
      const same = (a: string, b: string) =>
        a === b || (!!def.link && g.resolve(linkTargets(a)[0] ?? a).note === g.resolve(linkTargets(b)[0] ?? b).note);
      list = [...existing, ...written.filter((w) => !existing.some((e) => same(e, w)))];
    }
    list = list.filter((v, i) => list.indexOf(v) === i);
    const render = (v: string) => (!def.link && BARE.test(v) ? v : yamlString(v));
    yaml.push([field, def.many ? `[${list.map(render).join(", ")}]` : render(list[0]!), list]);
  }

  const file = Bun.file(join(g.repo.root, note.path));
  let text = await file.text();
  for (const [field, value] of yaml) text = setField(text, field, value);
  await Bun.write(file, text);

  if (opts.json) {
    const set = Object.fromEntries(yaml.map(([field, , list]) => [field, fields[field]!.many ? list : list[0]]));
    return { code: 0, out: `${JSON.stringify({ path: note.path, set }, null, 2)}\n` };
  }
  return { code: 0, out: `updated ${note.path}\n${yaml.map(([field, value]) => `  ${field}: ${value}`).join("\n")}\n` };
}

function toList(v: unknown): string[] {
  if (typeof v === "string") return [v];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
