import { planChange, type Change } from "../change";
import { createNote, type Fields } from "../edit";
import { qualify, type Graph } from "../graph";
import { markSuperseded, planSupersede, superseding, SUPERSEDES } from "../supersede";
import { linkTargets, type Note } from "../parse";
import { idPattern } from "../schema";
import type { Result } from "./shared";

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
    olds.push(note);
  }
  const superseded = planSupersede(g, olds);
  if ("problem" in superseded) return { code: 1, out: `lore new: ${superseded.problem}\n` };

  // Every link is checked before anything is written.
  const changes = new Map<string, Change>();
  for (const { field, note: ref } of opts.links) {
    // Superseding also rewrites the old note, so it keeps its own flag.
    if (superseding(field, [ref])) return { code: 1, out: `lore new: --link cannot set ${SUPERSEDES}; use --supersedes <note>\n` };
    if (!def.fields[field]?.link) {
      const fields = Object.keys(def.fields).filter((f) => def.fields[f]!.link && f !== SUPERSEDES);
      return { code: 1, out: `lore new: '${field}' is not a link field of ${def.name} (link fields: ${fields.join(", ") || "none"})\n` };
    }
    const change = changes.get(field) ?? { field, add: false, values: [] };
    change.values.push(ref);
    changes.set(field, change);
  }
  const plan = planChange(g, { def }, [...changes.values()]);
  if ("problem" in plan) return { code: 1, out: `lore new: --link ${plan.problem}\n` };
  const linked = plan.fields;

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
  // Anchors go last, after the links.
  const { anchors, ...links } = superseded.fields;
  Object.assign(fields, links, linked, anchors ? { anchors } : {});

  const template = tree.read(`.lore/templates/${def.name}.${def.format}`);
  const body = template?.replaceAll("{{title}}", title) ?? `${def.format === "org" ? "*" : "#"} ${title}\n`;

  // Names that meant one note now mean two. Found before writing, while they
  // still resolve; check reports them from now on.
  const clashes = g.shadowedBy({ path, stem, name: qualify(def.name, stem), aliases: [] }).map((c) => ({ ...c, at: `${c.file}:${c.line}` }));

  createNote(tree, path, fields, body);
  markSuperseded(tree, olds);

  if (opts.json) {
    const pathOf = (v: string) => g.resolve(linkTargets(v)[0]!).note!.path;
    const links = Object.fromEntries(Object.entries(linked).map(([field, value]) => [field, (Array.isArray(value) ? value : [value as string]).map(pathOf)]));
    return { code: 0, out: `${JSON.stringify({ path, superseded: olds.map((o) => o.path), links, ambiguous: clashes.map((c) => ({ at: c.at, target: c.target, name: c.was!.name })) }, null, 2)}\n` };
  }
  const lines = [
    `created ${path}`,
    ...olds.map((o) => `marked ${o.path} superseded${o.anchors.length ? " and moved its anchors" : ""}`),
  ];
  if (clashes.length) {
    lines.push(`'${stem}' now names two notes; these meant ${clashes[0]!.was!.name}, so name it that way:`);
    for (const c of clashes) lines.push(`  ${c.at}: '${c.target}' → ${c.was!.name}`);
  }
  return { code: 0, out: `${lines.join("\n")}\n` };
}
