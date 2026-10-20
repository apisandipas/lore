---
type: Effort
status: done
specs: ["[[lore-cli]]"]
frozen:
  docs/specs/lore-cli.md: a917e65c82f3
---
# Context sessions

Show an agent each governing note once per session, and again only when it changes, so the Claude Code hook can run before every edit without repeating itself.

## Approach

`lore context --session <id>` filters its matches through a small record of what that session was shown, kept in the temp directory rather than the repo (a record of one session, not an index; see [[0003]]). The record keys each note by a hash of its title, status and body, and only notes that fit the budget count as shown. `--forget` clears it, which the hook runs when Claude Code compacts the conversation. The hook itself stays a thin adapter in `hooks/`.

## Tasks

- [x] `src/session.ts`: the per-session record, with `unseen`, `saw` and `forget`
- [x] `lore context --session <id>` and `--forget`, printing nothing when every note was shown; tests for repeats, changes, budget and `--json`
- [x] Hook: use the session, forget on compaction, run from the file's directory, and skip files outside a lore repo
- [x] Help, README and spec updated
