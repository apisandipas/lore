import { ACTIVE, DONE, DRAFT, RETIRED, type Graph } from "../graph";
import { SUPERSEDED } from "../supersede";
import type { Note } from "../parse";
import { drift, frozen, plans } from "../plan";
import { label, noteJson, type Command, type Result } from "./shared";

// The skill that takes each step; see lore:0008-workflow-skills-and-lore-next.
export type Skill = "lore-spec" | "lore-plan" | "lore-build" | "lore-ship";
export type Step = { skill: Skill; note: Note; reason: string; item?: string };

export function nextSteps(g: Graph): Step[] | undefined {
  const p = plans(g);
  if (!p) return undefined;

  // Lower ranks first; within a rank, active efforts before planned ones.
  const ranked: { rank: number; active?: boolean; step: Step }[] = [];

  for (const note of p.efforts) {
    if (note.status === DONE) continue;
    const active = note.status === ACTIVE;
    const drifted = drift(g, note);
    const { done, total, next } = note.checklist;
    if (drifted.length) {
      const what = drifted.map((d) => d.path).join(", ");
      ranked.push({ rank: 0, active, step: { skill: "lore-plan", note, reason: `${what} changed since it was planned` } });
    } else if (total && done === total) {
      ranked.push({ rank: 1, active, step: { skill: "lore-ship", note, reason: `all ${total} items done` } });
    } else if (!frozen(note).length || !total) {
      const reason = total ? "planned but not frozen" : "no checklist yet";
      ranked.push({ rank: 3, active, step: { skill: "lore-plan", note, reason } });
    } else {
      ranked.push({ rank: 2, active, step: { skill: "lore-build", note, reason: `${done} of ${total} done`, item: next } });
    }
  }

  for (const note of p.specs) {
    if (note.status === RETIRED || note.status === SUPERSEDED) continue;
    if (!note.status || note.status === DRAFT) {
      ranked.push({ rank: 5, step: { skill: "lore-spec", note, reason: `${note.status ?? "unstatused"} spec` } });
    } else if (!p.effortsOf(note).length) {
      ranked.push({ rank: 4, step: { skill: "lore-plan", note, reason: `${note.status} spec with no effort` } });
    } else if (p.shippedAndChanged(note)) {
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
      ...noteJson(note),
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

export const command: Command = { name: "next", flags: {}, run: (g, { json }) => runNext(g, { json }) };
