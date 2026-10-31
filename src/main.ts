#!/usr/bin/env bun
// Bundled files are imported, never read by path, so they resolve from a
// read-only Nix store path and inside a `bun build --compile` binary alike.
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { COMMANDS } from "./commands";
import type { Result } from "./commands/shared";
import { loadGraph } from "./graph";
import { diskTree, type Tree } from "./tree";
import help from "./templates/help.txt" with { type: "text" };

// `at` is a directory on disk, or a tree to run against (tests use memory).
export async function run(
  argv: string[],
  at: string | Tree = process.cwd(),
): Promise<Result> {
  const cwd = typeof at === "string" ? at : at.root;
  const [name, ...rest] = argv;
  switch (name) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return { code: 0, out: help };
    case "version":
    case "--version":
      return { code: 0, out: `${pkg.version}\n` };
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) return { code: 2, out: `lore: unknown command '${name}'\n\n${help}` };

  // Only the flags this command takes, and --json, which every command takes.
  const options = { ...command.flags, json: { type: "boolean", default: false } } as const;
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options });
  } catch (e) {
    const err = e as Error & { code?: string };
    const flag = err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? /'([^']+)'/.exec(err.message)?.[1] : undefined;
    const takes = Object.keys(options).map((f) => `--${f}`).join(", ");
    return { code: 2, out: `lore ${name}: ${flag ? `${name} takes no ${flag} (flags: ${takes})` : err.message}\n` };
  }
  const { values, positionals } = parsed;
  const input = { cwd, args: positionals, flags: values, json: values.json as boolean };

  if (command.graph === false) return command.run(input);
  let g;
  try {
    g = loadGraph(typeof at === "string" ? diskTree(at) : at);
  } catch (e) {
    // The repo could not be read (schema.yml unparseable, rg missing): a
    // failure, not a usage error.
    return { code: 1, out: `lore ${name}: ${(e as Error).message}\n` };
  }
  return command.run(g, input);
}

if (import.meta.main) {
  try {
    const { code, out } = await run(process.argv.slice(2));
    (code === 2 ? process.stderr : process.stdout).write(out);
    process.exit(code);
  } catch (e) {
    process.stderr.write(`lore: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
