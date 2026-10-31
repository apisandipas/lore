import { updateNote } from "./edit";
import { DONE, type Graph } from "./graph";
import { SUPERSEDES } from "./supersede";
import type { Link, Note } from "./parse";

// An effort's plan against its specs: which notes are efforts and specs, what
// an effort freezes, and whether those specs have moved since. check, next and
// freeze ask here. Freezing itself: see lore:0007-efforts-freeze-spec-versions.

export type Frozen = { path: string; hash: string };
export type Drift = { path: string; gone: boolean };

// Hashes the body only, so a status flip in frontmatter is not drift.
export function specHash(note: Note): string {
  return new Bun.CryptoHasher("sha256").update(note.body).digest("hex").slice(0, 12);
}

// What an effort was last frozen against.
export function frozen(note: Note): Frozen[] {
  const map = note.frontmatter.frozen;
  if (!map || typeof map !== "object" || Array.isArray(map)) return [];
  return Object.entries(map).flatMap(([path, hash]) => (typeof hash === "string" ? [{ path, hash }] : []));
}

// Frozen specs that changed or went. A done effort's frozen versions are
// history, so it has none; lore next reports the change on the spec instead.
export function drift(g: Graph, note: Note): Drift[] {
  if (note.status === DONE) return [];
  return frozen(note).flatMap(({ path, hash }): Drift[] => {
    const spec = g.byPath.get(path);
    if (!spec) return [{ path, gone: true }];
    return specHash(spec) === hash ? [] : [{ path, gone: false }];
  });
}

// The links a note freezes: its type's `freeze` fields, or every link field
// but supersedes when the type names none.
function freezeLinks(note: Note): Link[] {
  const fields = note.def?.freeze;
  return note.links.filter((l) => l.field && l.field !== SUPERSEDES && (!fields || fields.includes(l.field)));
}

// Records the hash of each note the effort freezes.
export function freeze(g: Graph, note: Note): { frozen: Frozen[] } | { error: string } {
  const targets: Note[] = [];
  for (const link of freezeLinks(note)) {
    const target = g.resolve(link.target).note;
    if (!target) return { error: `${note.path}:${link.line}: '${link.target}' matches no single note` };
    if (!targets.includes(target)) targets.push(target);
  }
  if (!targets.length) {
    const fields = note.def?.freeze;
    return { error: `${note.path} links no notes${fields ? ` in ${fields.join(", ")}` : ""}` };
  }
  const result = targets.map((t) => ({ path: t.path, hash: specHash(t) }));
  updateNote(g.repo.tree, note.path, { frozen: Object.fromEntries(result.map((f) => [f.path, f.hash])) });
  return { frozen: result };
}

export type Plans = {
  // Every effort, in note order.
  efforts: Note[];
  // Every note of a type an effort freezes, in note order.
  specs: Note[];
  // The specs an effort is planned against.
  specsOf(effort: Note): Note[];
  // The efforts planned against a spec, open or done.
  effortsOf(spec: Note): Note[];
  // Every effort on the spec is done, and none was frozen against its current text.
  shippedAndChanged(spec: Note): boolean;
};

// Efforts are the types that set `freeze`; specs are the types those fields
// link to. Undefined when no type sets freeze.
export function plans(g: Graph): Plans | undefined {
  const effortTypes = g.repo.config.schema.types.filter((t) => t.freeze?.length);
  if (!effortTypes.length) return undefined;
  const specTypes = effortTypes.flatMap((t) => t.freeze!.flatMap((f) => t.fields[f]?.link ?? []));

  const efforts = g.notes.filter((n) => n.def && effortTypes.includes(n.def));
  const specs = g.notes.filter((n) => specTypes.some((s) => g.isA(n, s)));
  const specsOf = (effort: Note) => [...new Set(freezeLinks(effort).flatMap((l) => g.resolve(l.target).note ?? []))];
  const effortsOf = (spec: Note) => efforts.filter((e) => specsOf(e).includes(spec));
  const shippedAndChanged = (spec: Note) => {
    const on = effortsOf(spec);
    if (!on.length || !on.every((e) => e.status === DONE)) return false;
    const hash = specHash(spec);
    return !on.some((e) => frozen(e).some((f) => f.path === spec.path && f.hash === hash));
  };
  return { efforts, specs, specsOf, effortsOf, shippedAndChanged };
}
