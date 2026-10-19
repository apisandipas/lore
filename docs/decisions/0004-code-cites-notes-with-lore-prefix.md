---
type: Decision
status: accepted
anchors: [src/graph.ts]
---
# Code cites notes with `lore:`, not double brackets

## Context
Notes link to each other Obsidian-style with double brackets. In code, double brackets collide with bash tests and Lua long strings, so lore could not tell a citation from syntax and would have to ignore anything unresolved.

## Decision
Code cites a note as `lore:<name>` (for example `// see lore:0004-code-cites-notes-with-lore-prefix`). Notes keep double-bracket links.

## Consequences
`lore check` can report every citation that does not resolve.
