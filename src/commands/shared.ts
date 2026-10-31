import type { ParseArgsOptionsConfig } from "node:util";
import type { Graph } from "../graph";
import type { Note } from "../parse";

export type Result = { code: number; out: string };

// What a command is given: the positionals, the values of the flags it
// declares, and --json, which every command takes.
export type Input = { cwd: string; args: string[]; flags: Record<string, string | boolean | string[] | undefined>; json: boolean };

// A command: its name, the flags it takes, and how it runs. main.ts parses
// argv with these flags only, so a flag reaches only the command that takes it.
export type Command = { name: string; flags: ParseArgsOptionsConfig } & (
  | { graph?: true; run(g: Graph, input: Input): Result | Promise<Result> }
  // Runs without loading the graph: init writes the .lore/ a graph would read.
  | { graph: false; run(input: Input): Result | Promise<Result> }
);

// A note as every --json output gives it, the fields front ends rely on;
// commands add their own beside these.
export function noteJson(note: Note): { path: string; name: string; title: string; type: string | null; status: string | null } {
  return { path: note.path, name: note.name, title: note.title, type: note.type ?? null, status: note.status ?? null };
}

export function label(note: Note): string {
  const tags = [note.type, note.status].filter(Boolean).join(", ");
  return tags ? `${note.title}  (${tags})` : note.title;
}
