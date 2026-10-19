# lore

A CLI that indexes typed Markdown notes and their links to code.

`src/main.ts` dispatches commands. `src/repo.ts` finds the repo root, reads `.lore/schema.yml` and lists files; `src/schema.ts` parses note types. `src/parse.ts` reads one note; `src/graph.ts` builds the note graph, code citations, anchors and supersede chains. `src/frontmatter.ts` edits frontmatter in place for commands that write. `src/commands/` holds one file per command. Design notes live in `docs/`.
