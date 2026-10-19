#!/usr/bin/env bun
// Bundled files are imported, never read by path, so they resolve from a
// read-only Nix store path and inside a `bun build --compile` binary alike.
import { parseArgs } from "node:util";
import help from "./templates/help.txt" with { type: "text" };
import pkg from "../package.json" with { type: "json" };
import { loadGraph } from "./graph";
import { runCheck } from "./commands/check";
import { runContext } from "./commands/context";
import { runFreeze } from "./commands/freeze";
import { runList } from "./commands/list";
import { runNew } from "./commands/new";
import { runNext } from "./commands/next";
import { runShow } from "./commands/show";
import type { Result } from "./commands/shared";

const DEFAULT_BUDGET = 4000;

export async function run(argv: string[], cwd = process.cwd()): Promise<Result> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return { code: 0, out: help };
    case "version":
    case "--version":
      return { code: 0, out: `${pkg.version}\n` };
    case "context":
    case "show":
    case "list":
    case "check":
    case "new":
    case "freeze":
    case "next":
      break;
    default:
      return { code: 2, out: `lore: unknown command '${command}'\n\n${help}` };
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        json: { type: "boolean", default: false },
        full: { type: "boolean", default: false },
        budget: { type: "string" },
        type: { type: "string" },
        summaries: { type: "boolean", default: false },
        supersedes: { type: "string", multiple: true, default: [] },
      },
    });
  } catch (e) {
    return { code: 2, out: `lore ${command}: ${(e as Error).message}\n` };
  }
  const { values, positionals } = parsed;
  const budget = values.budget === undefined ? DEFAULT_BUDGET : Number(values.budget);
  if (!Number.isInteger(budget) || budget <= 0) return { code: 2, out: `lore ${command}: --budget takes a positive number\n` };

  const g = await loadGraph(cwd);
  switch (command) {
    case "context":
      return runContext(g, cwd, positionals, { full: values.full, json: values.json, budget });
    case "show":
      return runShow(g, positionals, { json: values.json });
    case "list":
      return runList(g, { type: values.type, summaries: values.summaries, json: values.json });
    case "check":
      return runCheck(g, { json: values.json });
    case "new":
      return runNew(g, positionals, { supersedes: values.supersedes, json: values.json });
    case "freeze":
      return runFreeze(g, positionals, { json: values.json });
    case "next":
      return runNext(g, { json: values.json });
  }
}

if (import.meta.main) {
  try {
    const { code, out } = await run(process.argv.slice(2));
    (code === 2 ? process.stderr : process.stdout).write(out);
    process.exit(code);
  } catch (e) {
    process.stderr.write(`lore: ${(e as Error).message}\n`);
    process.exit(2);
  }
}
