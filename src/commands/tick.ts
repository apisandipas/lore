import type { Graph } from "../graph";
import { tickNote } from "../edit";
import { type Result } from "./shared";

export async function runTick(g: Graph, args: string[], opts: { json: boolean }): Promise<Result> {
  const [ref] = args;
  if (!ref || args.length > 1) return { code: 2, out: "lore tick: name exactly one note\n" };
  const { note, error } = g.find(ref);
  if (!note) return { code: 1, out: `lore tick: ${error}\n` };

  const { next: ticked, total } = note.checklist;
  if (ticked === undefined) {
    return { code: 1, out: `lore tick: ${note.path}: ${total ? `all ${total} items are already done` : "no checklist"}\n` };
  }
  const after = tickNote(g.repo.tree, note.path)!.checklist;
  if (opts.json) return { code: 0, out: `${JSON.stringify({ path: note.path, ticked, next: after.next ?? null }, null, 2)}\n` };
  const rest = after.next === undefined ? `all ${after.total} items done` : `next: ${after.next}  (${after.done} of ${after.total} done)`;
  return { code: 0, out: `ticked ${note.path}: ${ticked}\n${rest}\n` };
}
