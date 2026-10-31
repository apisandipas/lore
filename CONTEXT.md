# lore

A CLI that indexes typed Markdown notes and their links to code.

`src/main.ts` dispatches commands; `noteJson` in `src/commands/shared.ts` is the note every `--json` output gives, so front ends can rely on its fields; `src/commands/` holds one file per command, and they stay thin. Each exports a `command` declaring its name, the flags it takes and whether it needs the graph; `src/commands/index.ts` lists them, and `main.ts` parses argv with that command's flags and `--json` only. `help.txt` is written by hand; a test keeps it naming each command's flags. Underneath:

- `src/tree.ts`: the working tree, read, written and searched through one adapter: rg and the disk, or an in-memory map in tests. Nothing else touches the repo's files; `lore init` writes `.lore/` through it too, and reads `~` only to look for installed skills.
- `src/repo.ts` reads `.lore/schema.yml` and lists files; `src/schema.ts` parses note types.
- `src/syntax/` holds one adapter per note syntax, Markdown and Org, each reading and writing its own header (fields and their lines), headings, links, blocks and checkboxes. Whatever a syntax writes, it reads back as the same value; `test/syntax.test.ts` checks that round trip for both.
- `src/parse.ts` reads one note into the shared note model through its syntax: title, summary, links and checklist. `src/graph.ts` builds the note graph: each note's schema type, code citations and anchors, and asks `src/names.ts` to resolve links and names (`resolve`, `find`, and `shadowedBy` for a note not written yet).
- `src/names.ts`: how notes are named and found, after lore:decision/0012: `qualify` names a typed note `type/stem`, and a `resolver` over plain notes resolves a target, says why one did not resolve, and resolves as if one more note existed. Tested with plain notes, no tree.
- `src/anchor.ts`: what an anchor is (path, glob or `symbol:`), the files it governs, whether it covers one file, and how specific it is. Graph hands them out with `anchor(text)`; listing a symbol's files uses rg, testing one file a pattern that reads words as `rg -w` does (`wordRegExp` in `src/tree.ts`).
- `src/validate.ts`: what is wrong with a field's value. `check` asks it of what notes hold, `new` and `set` of what they would write.
- `src/change.ts`: `planChange`, the fields `new` and `set` are about to write, from their assignments: which fields a note may take, one value or a list, names written as `[[type/stem]]` links, `+=` merged without a note twice, every value validated before anything is written. The commands keep only the rules of their own flags.
- `src/edit.ts`: every write to a note, frontmatter or `#+` fields and checkboxes, read from and saved to the tree; the syntax does the text.
- `src/supersede.ts`: superseding, after lore:decision/0006: the chain (`supersedes`, `supersededBy`, `current`, `history`), what `new --supersedes` may supersede and writes (`planSupersede`, `markSuperseded`), the refusal `set` and `new --link` share, and every rule `check` reports (`supersedeProblems`). `context` and `show` keep how they present history.
- `src/graph-page/`: `lore graph`'s page. `data.ts` turns the graph into the nodes and edges the page draws (and `--json` prints); `index.ts` puts `page.html`, `page.css`, `render.js` and `page.js` together into one file with the data, the same bytes for the same notes. `render.js` holds what needs no browser (rendering a note's text, which links may be followed, seeded positions, which labels fit) and is tested directly; `page.js` is the canvas and the controls, checked in a browser.
- `src/plan.ts`: efforts and specs, freezing, drift, and specs changed after their efforts shipped. `check`, `next` and `freeze` ask it; `next` keeps the ranking.

Tests build repos in memory with `memoryTree` (`test/graph.test.ts`); the fixtures under `test/fixtures/` cover the disk and rg.

`editors/emacs/lore.el` is the Emacs front end: it only runs `lore ... --json` and keeps no index of its own; its ERT tests (`lore-test.el`) run against a real repo in a temp directory.

Design notes live in `docs/`.
