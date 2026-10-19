---
type: Decision
status: accepted
anchors: [src/commands/new.ts, src/commands/check.ts]
---
# Decisions are superseded, never edited or deleted

## Context
On a long project, knowing what was believed, when, and why it changed is as important as the current answer. It also stops agents re-proposing rejected approaches.

## Decision
A changed decision gets a new Decision note that supersedes the old one. `lore new Decision --supersedes <id>` writes both sides. `lore context` shows the current decision with one line of history; `lore show` walks the whole chain; `lore check` enforces that the chain is consistent and that no code cites or anchors to a superseded decision.

## Consequences
The decisions folder only grows. The type is called Decision rather than ADR, which is jargon.
