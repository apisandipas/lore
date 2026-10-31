import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Graph } from "../graph";
import { graphPage, githubUrl } from "../graph-page";
import { graphData } from "../graph-page/data";
import type { Command, Result } from "./shared";

export function runGraph(g: Graph, opts: { cwd: string; out?: string; json: boolean }): Result {
  const data = graphData(g, { url: repoUrl(g.repo.root) });
  if (opts.json) return { code: 0, out: `${JSON.stringify(data, null, 2)}\n` };
  const file = opts.out ? resolve(opts.cwd, opts.out) : resolve(tmpdir(), "lore-graph.html");
  try {
    writeFileSync(file, graphPage(data));
  } catch (e) {
    return { code: 1, out: `lore graph: ${(e as Error).message}\n` };
  }
  return { code: 0, out: `${file}\n` };
}

// The GitHub URL of the repo's files at the current branch, if origin is on GitHub.
function repoUrl(root: string): string | null {
  const git = (...args: string[]) => {
    try {
      const p = Bun.spawnSync(["git", "-C", root, ...args], { stderr: "ignore" });
      return p.success ? p.stdout.toString().trim() : "";
    } catch {
      return "";
    }
  };
  return githubUrl(git("remote", "get-url", "origin"), git("branch", "--show-current"));
}

export const command: Command = {
  name: "graph",
  flags: { out: { type: "string" }, depth: { type: "string" }, open: { type: "boolean", default: false } },
  run: (g, { cwd, flags, json }) => runGraph(g, { cwd, out: flags.out as string | undefined, json }),
};
