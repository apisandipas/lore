import { link } from "./edit";
import type { Graph } from "./graph";
import { linkTargets, type Note } from "./parse";
import type { FieldDef, TypeDef } from "./schema";
import type { Value } from "./syntax";
import { fieldProblems } from "./validate";

// What `lore new` and `lore set` are about to write, from the field
// assignments they were given: checked whole before anything is written, so
// both commands agree on what a value may be and how it is written.

// One field's assignment: its values, and whether they add to the list already
// there (`+=`) or replace it.
export type Change = { field: string; add: boolean; values: string[] };

// A note's type, for a new note; or the note itself, whose values `+=` adds to.
export type Target = { def: TypeDef; note?: undefined } | { note: Note; def?: undefined };

// Fields any note may use, whatever its type.
const COMMON: Record<string, FieldDef> = {
  type: {},
  status: {},
  title: {},
  summary: {},
  aliases: { many: true },
  anchors: { many: true },
};

export function planChange(g: Graph, target: Target, changes: Change[]): { fields: Record<string, Value> } | { problem: string } {
  const def = target.note ? target.note.def : target.def;
  const fields = { ...COMMON, ...def?.fields };
  const { schema } = g.repo.config;
  const out: Record<string, Value> = {};

  for (const { field, add, values } of changes) {
    const spec = fields[field];
    if (!spec) {
      const of = target.note ? (target.note.type ?? "an untyped note") : def!.name;
      return { problem: `'${field}' is not a field of ${of} (fields: ${Object.keys(fields).join(", ")})` };
    }
    // A name that means one note is written as a link to it by name; any other
    // is written as given, for fieldProblems to report.
    const written = spec.link ? values.map((v) => link(g.resolve(v).note?.name ?? v)) : values;
    // One value given twice, or one note by two names, is still one value.
    if (!spec.many && (add || new Set(written).size > 1)) return { problem: `'${field}' takes one value, not a list` };
    if (field === "type" && schema.types.length && !schema.find(values[0]!)) return { problem: `type '${values[0]}' is not in .lore/schema.yml` };
    let list = written;
    if (add) {
      // An Org value can hold several links as text: [[a]] [[b]].
      const existing = toList(target.note?.frontmatter[field]).flatMap((v) => {
        const targets = spec.link ? linkTargets(v) : [];
        return targets.length > 1 ? targets.map(link) : [v];
      });
      // A link already there under another name for the same note is not added twice.
      const note = (s: string) => g.resolve(linkTargets(s)[0] ?? s).note;
      const same = (a: string, b: string) => a === b || (!!spec.link && !!note(a) && note(a) === note(b));
      list = [...existing, ...written.filter((w) => !existing.some((e) => same(e, w)))];
    }
    list = list.filter((v, i) => list.indexOf(v) === i);
    const value = spec.many ? list : list[0]!;
    if (def) {
      const [problem] = fieldProblems(g, def, field, value);
      if (problem) return { problem };
    }
    out[field] = value;
  }
  return { fields: out };
}

function toList(v: unknown): string[] {
  if (typeof v === "string") return [v];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
