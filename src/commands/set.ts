import { planChange, type Change } from "../change";
import { updateNote } from "../edit";
import type { Graph } from "../graph";
import { SUPERSEDED, SUPERSEDES } from "../supersede";
import { render } from "../syntax/markdown";
import type { Result } from "./shared";

const USAGE = "usage: lore set <note> <field>=<value>... (or <field>+=<value> on a list field)";
const ASSIGNMENT = /^([A-Za-z_][\w-]*)(\+?=)(.+)$/;

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
  const fail = (message: string): Result => ({ code: 1, out: `lore set: ${note.path}: ${message}\n` });

  // Superseding also rewrites the old note, so it keeps its own command.
  for (const { field, values } of changes.values()) {
    if (field === SUPERSEDES || (field === "status" && values.includes(SUPERSEDED))) {
      return fail(`supersede with lore new <type> <title> --supersedes ${note.name}`);
    }
  }
  // Every assignment is checked before anything is written.
  const plan = planChange(g, { note }, [...changes.values()]);
  if ("problem" in plan) return fail(plan.problem);
  const set = plan.fields;
  updateNote(g.repo.tree, note.path, set);

  if (opts.json) return { code: 0, out: `${JSON.stringify({ path: note.path, set }, null, 2)}\n` };
  const lines = Object.entries(set).map(([field, value]) => `  ${field}: ${render(value)}`);
  return { code: 0, out: `updated ${note.path}\n${lines.join("\n")}\n` };
}
