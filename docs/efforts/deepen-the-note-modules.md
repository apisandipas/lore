---
type: Effort
status: active
specs: ["[[lore-cli]]"]
frozen:
  docs/specs/lore-cli.md: 8ae622797434
---
# Deepen the note modules

## Approach

The three Strong candidates from the 2026-10-19 architecture review, plus the in-memory tree that makes them testable. The commands keep their behaviour; four bugs found by the review are fixed on the way, each with a test.

- **Tree.** Every read and write of the working tree goes through one adapter: list files, read, write, search. There are two: rg plus disk (production) and an in-memory map (tests). There is still no index (0003), and rg stays the production search (0001).
- **Note edits.** One module renders frontmatter and saves notes for `new`, `set`, `freeze` and `tick`. A value is written bare only when YAML reads it back as the same string, and quoted otherwise. That fixes frozen hashes like `123456789012` being read as numbers and then dropped.
- **Typed notes.** Graph attaches each note's schema type at load and resolves CLI references and `[[links]]` by one policy: an exact path wins over an ambiguous stem. check, new and set validate fields with the same function.
- **Plan.** One module owns which types are efforts and specs, what a note freezes, the spec hash, drift and shipped-and-changed. check, next and freeze ask it. The ranking stays in next (0005). The spec'd freeze default (every link field but `supersedes`) is kept.

## Tasks

- [x] Add the tree adapter (disk and memory); repo, graph and the writing commands go through it, with a memory-tree test helper and Graph-level tests for check's required-field and `many` errors
- [x] Exit 1, not 2, when a command fails unexpectedly (an unreadable schema.yml, rg missing), with tests
- [x] Add the note-editing module; new, set, freeze and tick write through it; delete frontmatter.ts; round-trip tests, including a frozen hash of all digits and `lore set <note> title=2024`
- [x] Graph attaches each note's schema type at load; commands compare types by it instead of lowercasing names
- [x] One resolution policy on Graph for CLI references and links (an exact path wins); findNote moves out of shared.ts; test `[[CONTEXT.md]]`
- [x] One field validator used by check, new and set; linkTarget and the duplicate link-type check go
- [ ] Add the plan module (efforts, specs, freeze targets, hash, drift, shipped-and-changed); check, next and freeze use it; specHash and frozenEntries leave freeze.ts; Graph-level tests for drift
- [ ] Update CONTEXT.md and anchors for the new modules; lore check and the tests pass
