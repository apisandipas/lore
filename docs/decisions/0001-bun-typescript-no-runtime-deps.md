---
type: Decision
status: accepted
anchors: [src/**, package.json]
---
# Bun and TypeScript, no runtime dependencies

## Context
lore is maintained by one TypeScript developer and called often by agents. Go would give a smaller binary and faster startup, but agent calls already sit inside multi-second tool round-trips.

## Decision
Write lore in TypeScript on Bun. Use Bun built-ins (`Bun.YAML`, `Bun.Glob`, file I/O) and `rg` instead of npm packages. Dev-only dependencies (`@types/bun`, `typescript`) are fine.

## Consequences
The installed package has nothing to fetch. A `bun build --compile` binary is 50-100MB if we ever ship one outside Nix.
