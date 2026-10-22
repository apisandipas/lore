import { names, type Graph } from "./graph";
import { linkTargets } from "./parse";
import type { TypeDef } from "./schema";

// "a Spec", "an Effort".
export function a(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

// What is wrong with a frontmatter value for one of a type's fields. check asks
// this of what notes hold; new and set ask it of what they are about to write,
// so all three agree. Fields the type does not define are not its business.
export function fieldProblems(g: Graph, def: TypeDef, field: string, value: unknown): string[] {
  const spec = def.fields[field];
  if (!spec) return [];
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
    return spec.required ? [`${def.name} needs '${field}'`] : [];
  }
  const problems: string[] = [];
  if (Array.isArray(value) && !spec.many) problems.push(`'${field}' takes one value, not a list`);
  const values = Array.isArray(value) ? value : [value];
  if (spec.enum) {
    for (const v of values) {
      if (!spec.enum.includes(String(v))) problems.push(`'${field}' is '${v}'; expected one of ${spec.enum.join(", ")}`);
    }
  }
  if (spec.link) {
    for (const v of values) {
      const targets = typeof v === "string" ? linkTargets(v) : [];
      if (!targets.length) problems.push(`'${field}' should link with [[name]]`);
      for (const t of targets) {
        const r = g.resolve(t);
        if (!r.note) {
          const why = r.candidates.length > 1 ? `matches ${names(r.candidates)}` : "matches no note";
          problems.push(`'${field}' links to '${t}', which ${why}`);
        } else if (!g.isA(r.note, spec.link)) {
          problems.push(`'${field}' links to ${r.note.name}, ${a(r.note.type ?? "untyped note")}; expected ${a(spec.link)}`);
        }
      }
    }
  }
  return problems;
}
