---
type: Decision
status: accepted
anchors: [src/repo.ts, src/graph.ts]
---
# No index: scan the repo on every call

## Context
An index has to be kept in sync, copied between worktrees, and can serve stale results. A few hundred notes plus an `rg` over the code takes milliseconds.

## Decision
Every command rebuilds the graph from the working tree. No cache, no index, no state outside the repo.

## Consequences
Results are never stale and worktrees need no setup. If a repo grows large enough for this to be slow, add a cache then, keyed on file mtimes.
