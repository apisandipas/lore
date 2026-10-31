import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Graph } from "../graph";
import { graphPage, githubUrl } from "../graph-page";
import { graphData } from "../graph-page/data";
import type { Command, Result } from "./shared";

export function runGraph(g: Graph, args: string[], opts: { cwd: string; out?: string; depth?: string; open: boolean; json: boolean }): Result {
  if (args.length > 1) return { code: 2, out: "lore graph: name at most one note\n" };
  const depth = opts.depth === undefined ? 2 : Number(opts.depth);
  if (!Number.isInteger(depth) || depth < 1) return { code: 2, out: `lore graph: --depth takes a whole number of links, 1 or more, not '${opts.depth}'\n` };
  if (opts.depth !== undefined && !args.length) return { code: 2, out: "lore graph: --depth needs a note to count links from\n" };
  let focus;
  if (args[0]) {
    const { note, error } = g.find(args[0]);
    if (!note) return { code: 1, out: `lore graph: ${error}\n` };
    focus = { name: note.name, depth };
  }

  const data = graphData(g, { url: repoUrl(g.repo.root) });
  if (opts.json) return { code: 0, out: `${JSON.stringify(data, null, 2)}\n` };
  const file = opts.out ? resolve(opts.cwd, opts.out) : resolve(tmpdir(), "lore-graph.html");
  try {
    writeFileSync(file, graphPage(data, focus));
  } catch (e) {
    return { code: 1, out: `lore graph: ${(e as Error).message}\n` };
  }
  if (opts.open) openInBrowser(file);
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

function openInBrowser(file: string) {
  const cmd = process.platform === "darwin" ? ["open", file] : process.platform === "win32" ? ["cmd", "/c", "start", "", file] : ["xdg-open", file];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" }).unref();
  } catch {
    // No opener: the path is printed either way.
  }
}

export const command: Command = {
  name: "graph",
  flags: { out: { type: "string" }, depth: { type: "string" }, open: { type: "boolean", default: false } },
  run: (g, { cwd, args, flags, json }) =>
    runGraph(g, args, { cwd, out: flags.out as string | undefined, depth: flags.depth as string | undefined, open: flags.open as boolean, json }),
};
