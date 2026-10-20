import { createNote, link, updateNote, type Fields } from "../edit";
import { SUPERSEDED, SUPERSEDES, type Graph } from "../graph";
import { linkTargets, type Note } from "../parse";
import { fieldProblems } from "../validate";
import { idPattern } from "../schema";
import { linkTo, type Result } from "./shared";

const USAGE = "usage: lore new <type> <title> [--supersedes <note>]... [--link <field>=<note>]...";

// A `--link <field>=<note>` from the command line.
export type Link = { field: string; note: string };

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export async function runNew(g: Graph, args: string[], opts: { supersedes: string[]; links: Link[]; json: boolean }): Promise<Result> {
  const [typeName, ...words] = args;
  const title = words.join(" ").trim();
  if (!typeName || !title) return { code: 2, out: `lore new: ${USAGE}\n` };

  const { schema } = g.repo.config;
  const def = schema.find(typeName);
  if (!def) {
    const known = schema.types.map((t) => t.name).join(", ") || "none yet";
    return { code: 1, out: `lore new: type '${typeName}' is not in .lore/schema.yml (types: ${known})\n` };
  }
  if (!def.dir) return { code: 1, out: `lore new: ${def.name} has no dir in .lore/schema.yml\n` };

  const olds: Note[] = [];
  for (const ref of opts.supersedes) {
    const { note, error } = g.find(ref);
    if (!note) return { code: 1, out: `lore new: --supersedes ${error}\n` };
    if (note.status === SUPERSEDED) {
      return { code: 1, out: `lore new: ${note.stem} is already superseded by ${g.current(note).stem}\n` };
    }
    const allowed = note.def?.fields.status?.enum;
    if (allowed && !allowed.includes(SUPERSEDED)) {
      return { code: 1, out: `lore new: ${note.type} has no '${SUPERSEDED}' status, so ${note.stem} cannot be superseded\n` };
    }
    olds.push(note);
  }

  // Every link is checked before anything is written.
  const linked = new Map<string, string[]>();
  for (const { field, note: ref } of opts.links) {
    // Superseding also rewrites the old note, so it keeps its own flag.
    if (field === SUPERSEDES) return { code: 1, out: `lore new: --link cannot set ${SUPERSEDES}; use --supersedes <note>\n` };
    if (!def.fields[field]?.link) {
      const fields = Object.keys(def.fields).filter((f) => def.fields[f]!.link && f !== SUPERSEDES);
      return { code: 1, out: `lore new: '${field}' is not a link field of ${def.name} (link fields: ${fields.join(", ") || "none"})\n` };
    }
    const values = linked.get(field) ?? [];
    const value = linkTo(g, ref);
    if (!values.includes(value)) values.push(value);
    linked.set(field, values);
  }
  const fieldValues = new Map([...linked].map(([field, values]) => [field, def.fields[field]!.many || values.length > 1 ? values : values[0]!]));
  for (const [field, value] of fieldValues) {
    const [problem] = fieldProblems(g, def, field, value);
    if (problem) return { code: 1, out: `lore new: --link ${problem}\n` };
  }

  let stem = slugify(title) || "untitled";
  if (def.id) {
    const id = idPattern(def.id);
    const inType = g.notes.filter((n) => n.def === def);
    const next = Math.max(0, ...inType.map((n) => id.number(n.stem) ?? 0)) + 1;
    stem = `${id.format(next)}-${stem}`;
  }
  const path = `${def.dir}/${stem}.${def.format}`;
  const { tree } = g.repo;
  if (tree.exists(path)) return { code: 1, out: `lore new: ${path} already exists\n` };

  const fields: Fields = { type: def.name };
  const status = def.fields.status?.enum?.[0];
  if (status) fields.status = status;
  if (olds.length) fields[SUPERSEDES] = olds.map((o) => link(o.stem));
  for (const [field, value] of fieldValues) fields[field] = value;
  // What the old decisions governed, the new one now governs.
  const anchors = [...new Set(olds.flatMap((o) => o.anchors))];
  if (anchors.length) fields.anchors = anchors;

  const template = tree.read(`.lore/templates/${def.name}.${def.format}`);
  const body = template?.replaceAll("{{title}}", title) ?? `${def.format === "org" ? "*" : "#"} ${title}\n`;

  createNote(tree, path, fields, body);
  for (const old of olds) updateNote(tree, old.path, { status: SUPERSEDED, anchors: null });

  if (opts.json) {
    const pathOf = (v: string) => g.resolve(linkTargets(v)[0]!).note!.path;
    const links = Object.fromEntries([...linked].map(([field, values]) => [field, values.map(pathOf)]));
    return { code: 0, out: `${JSON.stringify({ path, superseded: olds.map((o) => o.path), links }, null, 2)}\n` };
  }
  const lines = [
    `created ${path}`,
    ...olds.map((o) => `marked ${o.path} superseded${o.anchors.length ? " and moved its anchors" : ""}`),
  ];
  return { code: 0, out: `${lines.join("\n")}\n` };
}
