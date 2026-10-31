---
type: Effort
status: active
specs: ["[[spec/lore-cli]]"]
issue: https://github.com/apisandipas/lore/issues/3
frozen:
  docs/specs/lore-cli.md: 070fd8a2df57
---
# Note syntax

Each note syntax, Markdown and Org, reads and writes itself in one module, so a value reads back as written without two files having to agree (#3). No behaviour changes.

## Approach

`src/syntax/` holds the `Syntax` interface, `syntaxOf(path)`, and one adapter per format. An adapter reads its header once, returning the fields, each field's line span and where the body starts; `parseNote` takes field lines from it and `setField`/`removeField` splice by it. `tick(line)` uses the same checkbox pattern reading does. The Markdown adapter owns YAML rendering; Org decides YAML-or-text with one test for both directions. `parse.ts` keeps the Note model and the body walk (summaries, checklist counting), which are the same for every syntax. `edit.ts` keeps only what touches the tree: `createNote`, `updateNote`, `tickNote`. `lore set` still prints values as YAML.

## Tasks

- [x] Move `Syntax`, `markdown` and `org` from parse.ts into `src/syntax/` (index, markdown, org) unchanged; parse.ts reads through `syntaxOf`; tests pass
- [x] One header reader per adapter returning field line spans; parse takes `fieldLines` from it; field line numbers in `check` output unchanged, with a test of a multi-line list field
- [ ] Each adapter writes: `setField`, `removeField`, `tick`, rendering moved from edit.ts and Org's YAML-or-text rule shared with reading; edit.ts calls them and loses `setFields`, `frontmatterEnd`, `fieldSpan`, `orgHeader`, `orgScalar`; round-trip tests per syntax replace the `setFields` tests (all-digit hash, `title=2024`, quoted keys, maps, Org `[[a]] [[b]]` lists, removing a multi-line field, a file with no header)
- [ ] CONTEXT.md describes `src/syntax/`; `lore check` and the tests pass
