import { join } from "node:path";
import type { Graph } from "../graph";
import { parseNote } from "../parse";
import { findNote, type Result } from "./shared";

export async function runTick(g: Graph, args: string[], opts: { json: boolean }): Promise<Result> {
  const [ref] = args;
  if (!ref || args.length > 1) return { code: 2, out: "lore tick: name exactly one note\n" };
  const { note, error } = findNote(g, ref);
  if (!note) return { code: 1, out: `lore tick: ${error}\n` };

  const { next: ticked, nextLine, total } = note.checklist;
  if (ticked === undefined || nextLine === undefined) {
    return { code: 1, out: `lore tick: ${note.path}: ${total ? `all ${total} items are already done` : "no checklist"}\n` };
  }
  const file = Bun.file(join(g.repo.root, note.path));
  const lines = (await file.text()).split("\n");
  lines[nextLine - 1] = lines[nextLine - 1]!.replace("[ ]", "[x]");
  const text = lines.join("\n");
  await Bun.write(file, text);

  const after = parseNote(note.path, text).checklist;
  if (opts.json) return { code: 0, out: `${JSON.stringify({ path: note.path, ticked, next: after.next ?? null }, null, 2)}\n` };
  const rest = after.next === undefined ? `all ${after.total} items done` : `next: ${after.next}  (${after.done} of ${after.total} done)`;
  return { code: 0, out: `ticked ${note.path}: ${ticked}\n${rest}\n` };
}
