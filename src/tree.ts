import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// One match of a search: the file, its 1-based line, and the matched text.
export type Hit = { file: string; line: number; text: string };

// The working tree lore reads and writes. Paths are relative to the root, with
// forward slashes. There are two adapters: the disk, searched with rg, and an
// in-memory map for tests. Neither keeps an index (see lore:0003).
export type Tree = {
  root: string;
  // Every file, sorted, without .git/.
  files(): string[];
  read(path: string): string | undefined;
  exists(path: string): boolean;
  write(path: string, text: string): void;
  // Every match of a regular expression; `fixed` takes it literally and
  // `word` matches whole words only.
  search(pattern: string, opts?: { fixed?: boolean; word?: boolean }): Hit[];
};

// A pattern matched as a whole word, as `rg -w` reads one: letters and digits
// of any script, marks and connectors are word characters. The memory tree
// searches with it, and symbol anchors test one file with it.
export function wordRegExp(source: string, flags = ""): RegExp {
  return new RegExp(`(?<!${WORD_CHAR})(?:${source})(?!${WORD_CHAR})`, `${flags}u`);
}

// Text as a pattern that matches it literally.
export function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD_CHAR = String.raw`[\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control}]`;

// The repo root is the nearest directory holding `.lore/`, stopping at the git
// root so a stray `.lore/` above the repo is never picked up.
export function findRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".lore"))) return dir;
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

export function diskTree(cwd: string): Tree {
  const root = findRoot(cwd);
  const abs = (path: string) => join(root, path);
  const HIT = /^(.+?):(\d+):(.*)$/;
  return {
    root,
    files: () => rg(root, ["--files", "--hidden", "--glob", "!.git/"]).sort(),
    read: (path) => (existsSync(abs(path)) ? readFileSync(abs(path), "utf8") : undefined),
    exists: (path) => existsSync(abs(path)),
    write: (path, text) => {
      mkdirSync(dirname(abs(path)), { recursive: true });
      writeFileSync(abs(path), text);
    },
    search: (pattern, opts = {}) =>
      rg(root, [
        "-n",
        "-o",
        "--no-heading",
        "--with-filename",
        "--hidden",
        "--glob",
        "!.git/",
        ...(opts.fixed ? ["-F"] : []),
        ...(opts.word ? ["-w"] : []),
        "-e",
        pattern,
      ]).flatMap((l) => {
        const m = HIT.exec(l);
        return m ? [{ file: m[1]!, line: Number(m[2]), text: m[3]! }] : [];
      }),
  };
}

// A tree held in memory, for tests: { "docs/a.md": "..." }.
export function memoryTree(files: Record<string, string>, root = "/memory"): Tree {
  const map = new Map(Object.entries(files));
  return {
    root,
    files: () => [...map.keys()].filter((f) => !f.startsWith(".git/")).sort(),
    read: (path) => map.get(path),
    exists: (path) => map.has(path) || [...map.keys()].some((f) => f.startsWith(`${path.replace(/\/$/, "")}/`)),
    write: (path, text) => void map.set(path, text),
    search: (pattern, opts = {}) => {
      const source = opts.fixed ? literal(pattern) : pattern;
      const re = opts.word ? wordRegExp(source, "g") : new RegExp(source, "g");
      const hits: Hit[] = [];
      for (const file of [...map.keys()].sort()) {
        map
          .get(file)!
          .split("\n")
          .forEach((text, i) => {
            for (const m of text.matchAll(re)) hits.push({ file, line: i + 1, text: m[0] });
          });
      }
      return hits;
    },
  };
}

function rg(root: string, args: string[]): string[] {
  let proc;
  try {
    // The live env, so PATH is looked up as it is now rather than at startup.
    proc = Bun.spawnSync(["rg", ...args], { cwd: root, env: process.env, stdout: "pipe", stderr: "pipe" });
  } catch {
    throw new Error("lore needs ripgrep (rg) on PATH");
  }
  // rg exits 1 when nothing matched.
  if (proc.exitCode === 1) return [];
  if (proc.exitCode !== 0) throw new Error(`rg ${args.join(" ")} failed: ${proc.stderr.toString().trim()}`);
  return proc.stdout.toString().split("\n").filter(Boolean);
}
