---
type: Decision
status: accepted
anchors: [flake.nix]
---
# Nix package from day one

## Context
Hooks and skills will assume `lore` is on PATH on every host, including the Mac.

## Decision
Package with a flake from the first commit: copy `src/` to the store and wrap `bun run --no-install`, with `ripgrep` on the wrapper's PATH. Bundled files are imported, never read by path, so they resolve from the store and from a compiled binary alike.

## Consequences
`--no-install` makes a missing import fail instead of Bun auto-installing it. No `--compile` on NixOS; its output is dynamically linked.
