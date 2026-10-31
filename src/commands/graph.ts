import type { Graph } from "../graph";
import { graphData } from "../graph-page/data";
import type { Command, Result } from "./shared";

export function runGraph(g: Graph, opts: { json: boolean }): Result {
  const data = graphData(g, { url: null });
  if (opts.json) return { code: 0, out: `${JSON.stringify(data, null, 2)}\n` };
  return { code: 1, out: "lore graph: only --json for now\n" };
}

export const command: Command = {
  name: "graph",
  flags: { out: { type: "string" }, depth: { type: "string" }, open: { type: "boolean", default: false } },
  run: (g, { json }) => runGraph(g, { json }),
};
