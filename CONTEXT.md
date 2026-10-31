# lore

A CLI that indexes typed Markdown notes and their links to code.

`src/main.ts` dispatches commands; `src/commands/` holds one file per command, and they stay thin. Underneath:

- `src/tree.ts`: the working tree, read, written and searched through one adapter: rg and the disk, or an in-memory map in tests. Nothing else touches the file system, apart from `lore init`.
- `src/repo.ts` reads `.lore/schema.yml` and lists files; `src/schema.ts` parses note types.
- `src/syntax/` holds one adapter per note syntax, Markdown and Org, each reading and writing its own header (fields and their lines), headings, links, blocks and checkboxes. Whatever a syntax writes, it reads back as the same value; `test/syntax.test.ts` checks that round trip for both.
- `src/parse.ts` reads one note into the shared note model through its syntax: title, summary, links and checklist. `src/graph.ts` builds the note graph: each note's schema type, link and name resolution (`resolve`, `find`), code citations, anchors and supersede chains.
- `src/validate.ts`: what is wrong with a field's value. `check` asks it of what notes hold, `new` and `set` of what they would write.
- `src/edit.ts`: every write to a note, frontmatter or `#+` fields and checkboxes, read from and saved to the tree; the syntax does the text.
- `src/plan.ts`: efforts and specs, freezing, drift, and specs changed after their efforts shipped. `check`, `next` and `freeze` ask it; `next` keeps the ranking.

Tests build repos in memory with `memoryTree` (`test/graph.test.ts`); the fixtures under `test/fixtures/` cover the disk and rg.

`editors/emacs/lore.el` is the Emacs front end: it only runs `lore ... --json` and keeps no index of its own; its ERT tests (`lore-test.el`) run against a real repo in a temp directory.

Design notes live in `docs/`.
