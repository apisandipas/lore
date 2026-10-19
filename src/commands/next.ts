import { ACTIVE, DONE, DRAFT, RETIRED, SUPERSEDED, type Graph } from "../graph";
import type { Note } from "../parse";
import type { TypeDef } from "../schema";
import { frozenEntries, specHash } from "./freeze";
import { label, type Result } from "./shared";

// The skill that takes each step; see lore:0008-workflow-skills-and-lore-next.
export type Skill = "lore-spec" | "lore-plan" | "lore-build" | "lore-ship";
export type Step = { skill: Skill; note: Note; reason: string; item?: string };

// Efforts are the types that freeze something; what they freeze are specs.
function workflowTypes(g: Graph): { efforts: Set<TypeDef>; specs: string[] } {
  const efforts = new Set(g.repo.config.schema.types.filter((t) => t.freeze?.length));
  const specs = [...efforts].flatMap((t) => t.freeze!.flatMap((f) => t.fields[f]?.link ?? []));
  return { efforts, specs };
}

// Every effort on the spec is done, and none was frozen against its current text.
function shippedAndChanged(spec: Note, efforts: Note[]): boolean {
  if (!efforts.every((e) => e.status === DONE)) return false;
  const hash = specHash(spec);
  return !efforts.some((e) => frozenEntries(e).some(([path, h]) => path === spec.path && h === hash));
}

export function nextSteps(g: Graph): Step[] | undefined {
  const { efforts, specs } = workflowTypes(g);
  if (!efforts.size) return undefined;

  // Lower ranks first; within a rank, active efforts before planned ones.
  const ranked: { rank: number; active?: boolean; step: Step }[] = [];
  // Each spec's efforts, open or done.
  const planned = new Map<Note, Note[]>();

  for (const note of g.notes) {
    if (!note.def || !efforts.has(note.def)) continue;
    const fields = note.def.freeze!;
    const linked = note.links.filter((l) => l.field && fields.includes(l.field)).flatMap((l) => g.resolve(l.target).note ?? []);
    for (const spec of linked) planned.set(spec, [...(planned.get(spec) ?? []), note]);
    if (note.status === DONE) continue;

    const active = note.status === ACTIVE;
    const drifted = frozenEntries(note).filter(([path, hash]) => {
      const spec = g.byPath.get(path);
      return !spec || specHash(spec) !== hash;
    });
    const { done, total, next } = note.checklist;
    if (drifted.length) {
      const what = drifted.map(([path]) => path).join(", ");
      ranked.push({ rank: 0, active, step: { skill: "lore-plan", note, reason: `${what} changed since it was planned` } });
    } else if (total && done === total) {
      ranked.push({ rank: 1, active, step: { skill: "lore-ship", note, reason: `all ${total} items done` } });
    } else if (!frozenEntries(note).length || !total) {
      const reason = total ? "planned but not frozen" : "no checklist yet";
      ranked.push({ rank: 3, active, step: { skill: "lore-plan", note, reason } });
    } else {
      ranked.push({ rank: 2, active, step: { skill: "lore-build", note, reason: `${done} of ${total} done`, item: next } });
    }
  }

  for (const note of g.notes) {
    if (!specs.some((s) => g.isA(note, s))) continue;
    if (note.status === RETIRED || note.status === SUPERSEDED) continue;
    if (!note.status || note.status === DRAFT) {
      ranked.push({ rank: 5, step: { skill: "lore-spec", note, reason: `${note.status ?? "unstatused"} spec` } });
    } else if (!planned.has(note)) {
      ranked.push({ rank: 4, step: { skill: "lore-plan", note, reason: `${note.status} spec with no effort` } });
    } else if (shippedAndChanged(note, planned.get(note)!)) {
      ranked.push({ rank: 4, step: { skill: "lore-plan", note, reason: "spec changed since its efforts shipped" } });
    }
  }

  return ranked.sort((a, b) => a.rank - b.rank || Number(!!b.active) - Number(!!a.active) || a.step.note.path.localeCompare(b.step.note.path)).map((r) => r.step);
}

export function runNext(g: Graph, opts: { json: boolean }): Result {
  const steps = nextSteps(g);
  if (!steps) {
    return { code: 1, out: "lore next: no type in .lore/schema.yml sets freeze, so there is no effort to follow\n" };
  }
  if (opts.json) {
    const data = steps.map(({ skill, note, reason, item }) => ({
      skill,
      path: note.path,
      title: note.title,
      type: note.type ?? null,
      status: note.status ?? null,
      reason,
      ...(item ? { item } : {}),
    }));
    return { code: 0, out: `${JSON.stringify({ steps: data }, null, 2)}\n` };
  }

  const [first, ...rest] = steps;
  if (!first) return { code: 0, out: "nothing in progress; start a spec with lore-spec\n" };
  const lines = [`next: ${first.skill} ${first.note.path}`, `  ${label(first.note)}`, `  ${first.reason}`];
  if (first.item) lines.push(`  next item: ${first.item}`);
  if (rest.length) {
    const width = Math.max(...rest.map((s) => s.skill.length));
    lines.push("", "then:", ...rest.map((s) => `  ${s.skill.padEnd(width)}  ${s.note.path}  ${s.reason}`));
  }
  return { code: 0, out: `${lines.join("\n")}\n` };
}
