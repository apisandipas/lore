import type { Graph } from "../graph";
import { label, noteJson, type Command, type Result } from "./shared";

export function runList(g: Graph, opts: { type?: string; summaries: boolean; json: boolean }): Result {
  const notes = g.notes.filter((n) => !opts.type || g.isA(n, opts.type));
  if (opts.json) {
    const data = notes.map((n) => ({
      ...noteJson(n),
      ...(opts.summaries ? { summary: n.summary } : {}),
    }));
    return { code: 0, out: `${JSON.stringify(data, null, 2)}\n` };
  }
  if (!notes.length) return { code: 0, out: opts.type ? `no ${opts.type} notes\n` : "no notes\n" };
  const lines = notes.map((n) => {
    const head = `${n.path}  ${label(n)}`;
    return opts.summaries && n.summary ? `${head}\n  ${n.summary}` : head;
  });
  return { code: 0, out: `${lines.join(opts.summaries ? "\n\n" : "\n")}\n` };
}

export const command: Command = {
  name: "list",
  flags: { type: { type: "string" }, summaries: { type: "boolean", default: false } },
  run: (g, { flags, json }) => runList(g, { type: flags.type as string | undefined, summaries: flags.summaries as boolean, json }),
};
