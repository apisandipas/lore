---
type: Effort
status: active
specs: ["[[spec/lore-cli]]"]
issue: https://github.com/apisandipas/lore/issues/12
frozen:
  docs/specs/lore-cli.md: 070fd8a2df57
---
# Command flags

Each command declares the flags it takes, so a flag reaches only the command that takes it and a flag it does not take is a usage error (#12).

## Approach

Each command file exports a `command`: its name, its flags in `parseArgs` form, whether it needs the graph (all but `init`), and `run(ctx)` with the graph, cwd, positionals, flag values and `json`. `src/commands/index.ts` lists them. `main.ts` looks the command up, adds `--json`, the flag every command takes, parses argv with that command's flags only, loads the graph when asked (a failure still exits 1), and runs it. A command checks its own flag values (context's `--budget`, new's `--link`) with the messages it gives today. A flag a command does not take is exit 2: `lore show: show takes no --budget (flags: --json)`. `help.txt` stays hand-written; a test keeps it naming exactly the flags each command declares.

## Tasks

- [ ] Every command exports a `command` declaration; `src/commands/index.ts` lists them; `main.ts` dispatches through it, parsing only that command's flags and adding `--json`; context checks `--budget` and new parses `--link` themselves; tests pass
- [ ] A flag a command does not take is exit 2 naming the flags it does take, with tests for `show --budget 0`, `list --supersedes x` and `init --link x`, and one per command
- [ ] A test that `help.txt` names under each command exactly the flags it declares; the site's command overview says a flag a command does not take is an error; CONTEXT.md describes the command declarations; `lore check` and the tests pass
