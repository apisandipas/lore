import type { Graph } from "../graph";
import { freeze } from "../plan";
import type { Result } from "./shared";

export async function runFreeze(g: Graph, args: string[], opts: { json: boolean }): Promise<Result> {
  const [ref] = args;
  if (!ref || args.length > 1) return { code: 2, out: "lore freeze: name exactly one note\n" };
  const { note, error } = g.find(ref);
  if (!note) return { code: 1, out: `lore freeze: ${error}\n` };

  const result = freeze(g, note);
  if ("error" in result) return { code: 1, out: `lore freeze: ${result.error}\n` };
  const { frozen } = result;

  if (opts.json) return { code: 0, out: `${JSON.stringify({ path: note.path, frozen }, null, 2)}\n` };
  return { code: 0, out: `froze ${note.path} against:\n${frozen.map((f) => `  ${f.path} ${f.hash}`).join("\n")}\n` };
}
