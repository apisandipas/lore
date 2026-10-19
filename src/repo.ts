import { parseSchema, type Schema } from "./schema";
import type { Tree } from "./tree";

export type Config = { notes: string; ignore: string[]; schema: Schema };
export type Repo = { root: string; tree: Tree; config: Config; files: string[] };

export function loadConfig(tree: Tree): Config {
  const text = tree.read(".lore/schema.yml");
  const raw = text === undefined ? {} : Bun.YAML.parse(text);
  const data = (raw ?? {}) as Record<string, unknown>;
  const notes = typeof data.notes === "string" ? data.notes.replace(/^\.\/|\/$/g, "") || "." : "docs";
  const ignore = Array.isArray(data.ignore) ? data.ignore.filter((g): g is string => typeof g === "string") : [];
  return { notes, ignore, schema: parseSchema(data.types) };
}

// No index (see docs/decisions/0003): every call lists the working tree afresh.
export function openRepo(tree: Tree): Repo {
  const config = loadConfig(tree);
  const ignore = config.ignore.map((g) => new Bun.Glob(g));
  const files = tree.files().filter((f) => !ignore.some((g) => g.match(f)));
  return { root: tree.root, tree, config, files };
}
