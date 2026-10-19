import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseSchema, type Schema } from "./schema";

export type Config = { notes: string; ignore: string[]; schema: Schema };
export type Repo = { root: string; config: Config; files: string[] };

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

export async function loadConfig(root: string): Promise<Config> {
  const file = Bun.file(join(root, ".lore", "schema.yml"));
  const raw = (await file.exists()) ? Bun.YAML.parse(await file.text()) : {};
  const data = (raw ?? {}) as Record<string, unknown>;
  const notes = typeof data.notes === "string" ? data.notes.replace(/^\.\/|\/$/g, "") || "." : "docs";
  const ignore = Array.isArray(data.ignore) ? data.ignore.filter((g): g is string => typeof g === "string") : [];
  return { notes, ignore, schema: parseSchema(data.types) };
}

// No index (see docs/decisions/0003): every call lists the working tree afresh.
export async function openRepo(cwd: string): Promise<Repo> {
  const root = findRoot(cwd);
  const config = await loadConfig(root);
  const ignore = config.ignore.map((g) => new Bun.Glob(g));
  const files = rg(root, ["--files", "--hidden", "--glob", "!.git/"])
    .filter((f) => !ignore.some((g) => g.match(f)))
    .sort();
  return { root, config, files };
}

export function rg(root: string, args: string[]): string[] {
  let proc;
  try {
    proc = Bun.spawnSync(["rg", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  } catch {
    throw new Error("lore needs ripgrep (rg) on PATH");
  }
  // rg exits 1 when nothing matched.
  if (proc.exitCode === 1) return [];
  if (proc.exitCode !== 0) throw new Error(`rg ${args.join(" ")} failed: ${proc.stderr.toString().trim()}`);
  return proc.stdout.toString().split("\n").filter(Boolean);
}
