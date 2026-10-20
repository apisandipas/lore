# lore

A CLI that indexes typed Markdown notes and their links to code.

`src/main.ts` dispatches commands; `src/commands/` holds one file per command, and they stay thin. Underneath:

- `src/tree.ts`: the working tree, read, written and searched through one adapter: rg and the disk, or an in-memory map in tests. Nothing else touches the file system, apart from `lore init`.
- `src/repo.ts` reads `.lore/schema.yml` and lists files; `src/schema.ts` parses note types.
- `src/parse.ts` reads one note, Markdown or Org: the note model is shared, and a syntax per extension covers fields, headings, links, blocks and checkboxes. `src/graph.ts` builds the note graph: each note's schema type, link and name resolution (`resolve`, `find`), code citations, anchors and supersede chains.
- `src/validate.ts`: what is wrong with a field's value. `check` asks it of what notes hold, `new` and `set` of what they would write.
- `src/edit.ts`: every write to a note, frontmatter or `#+` fields and checkboxes, quoting values so they read back as written.
- `src/plan.ts`: efforts and specs, freezing, drift, and specs changed after their efforts shipped. `check`, `next` and `freeze` ask it; `next` keeps the ranking.

Tests build repos in memory with `memoryTree` (`test/graph.test.ts`); the fixtures under `test/fixtures/` cover the disk and rg.

Design notes live in `docs/`.
