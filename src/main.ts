#!/usr/bin/env bun
// Bundled files are imported, never read by path, so they resolve from a
// read-only Nix store path and inside a `bun build --compile` binary alike.
import { parseArgs } from "node:util";
import pkg from "../package.json" with { type: "json" };
import { runCheck } from "./commands/check";
import { runContext } from "./commands/context";
import { runFreeze } from "./commands/freeze";
import { runInit } from "./commands/init";
import { runList } from "./commands/list";
import { runNew, type Link } from "./commands/new";
import { runNext } from "./commands/next";
import { runSet } from "./commands/set";
import type { Result } from "./commands/shared";
import { runShow } from "./commands/show";
import { runTick } from "./commands/tick";
import { loadGraph } from "./graph";
import { diskTree, type Tree } from "./tree";
import help from "./templates/help.txt" with { type: "text" };

const DEFAULT_BUDGET = 4000;

// `at` is a directory on disk, or a tree to run against (tests use memory).
export async function run(
  argv: string[],
  at: string | Tree = process.cwd(),
): Promise<Result> {
  const cwd = typeof at === "string" ? at : at.root;
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
    case "init":
    case "tick":
    case "set":
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
        link: { type: "string", multiple: true, default: [] },
      },
    });
  } catch (e) {
    return { code: 2, out: `lore ${command}: ${(e as Error).message}\n` };
  }
  const { values, positionals } = parsed;
  const budget =
    values.budget === undefined ? DEFAULT_BUDGET : Number(values.budget);
  if (!Number.isInteger(budget) || budget <= 0)
    return {
      code: 2,
      out: `lore ${command}: --budget takes a positive number\n`,
    };
  const links: Link[] = [];
  for (const value of values.link) {
    const m = /^([^=\s]+)=(.+)$/.exec(value);
    if (!m)
      return {
        code: 2,
        out: `lore ${command}: --link takes <field>=<note>, not '${value}'\n`,
      };
    links.push({ field: m[1]!, note: m[2]!.trim() });
  }

  // init writes the .lore/ that loading a graph would read.
  if (command === "init") return runInit(cwd, { json: values.json });
  const g = loadGraph(typeof at === "string" ? diskTree(at) : at);
  switch (command) {
    case "context":
      return runContext(g, cwd, positionals, {
        full: values.full,
        json: values.json,
        budget,
      });
    case "show":
      return runShow(g, positionals, { json: values.json });
    case "list":
      return runList(g, {
        type: values.type,
        summaries: values.summaries,
        json: values.json,
      });
    case "check":
      return runCheck(g, { json: values.json });
    case "new":
      return runNew(g, positionals, {
        supersedes: values.supersedes,
        links,
        json: values.json,
      });
    case "freeze":
      return runFreeze(g, positionals, { json: values.json });
    case "next":
      return runNext(g, { json: values.json });
    case "tick":
      return runTick(g, positionals, { json: values.json });
    case "set":
      return runSet(g, positionals, { json: values.json });
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
