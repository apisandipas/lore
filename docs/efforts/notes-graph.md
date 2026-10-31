---
type: Effort
status: active
specs: ["[[spec/notes-graph]]"]
issue: https://github.com/apisandipas/lore/issues/20
frozen:
  docs/specs/notes-graph.md: 16de88105a61
---
# Notes graph

`lore graph` writes the notes as one self-contained, interactive HTML page, built from the prototype reviewed on #20.

## Approach

Two halves with a JSON seam between them. `src/graph-page/data.ts` turns a Graph into the page's data (nodes, edges, ghosts, the code layer, each body's refs), a pure function tested in memory like the rest of lore; `--json` prints exactly that. The page is the prototype's HTML, CSS and script, kept as separate files under `src/graph-page/` and imported as text, so they ship inside the binary as `help.txt` does (lore:decision/0002). `page.ts` puts them and the data into one file, deterministically. The parts of the script that need no DOM (rendering a note's text, which links are safe, seeded starting positions, label collisions) live in a module the tests import directly; the rest is checked in headless Chrome on lore's and imp's notes. The GitHub URL comes from `git remote get-url origin` in the command, not from the data builder, so tests pass it in. `src/commands/graph.ts` stays thin.

## Tasks

- [x] `graphData(g, { url })` in `src/graph-page/data.ts`: every note a node with name, title, type, status, summary, drift, body and refs; frontmatter and body links as edges, deduplicated, by kind; links to no note or several as `missing:` ghost nodes; anchors and citing files as code nodes. `lore graph --json` prints it; the command declares `--out`, `--depth` and `--open`; help.txt names them. Tests on a memory repo cover each node and edge kind
- [x] The page: the prototype's HTML, CSS and script moved into `src/graph-page/` and imported as text; `lore graph` writes it to `--out` or `lore-graph.html` in the temp directory and prints the path; the data is embedded safely (a note containing `</script>` or `$'` survives); the same notes give the same bytes; GitHub URL from `origin` only when it is on GitHub, at the current branch. Tests for the written file, its embedded data, determinism and the URL
- [x] `lore graph <note> [--depth N]` opens focused (`#focus=` with depth, default 2); a note that resolves to nothing or several is exit 1 with `find`'s message; a bad `--depth` is exit 2; `--open` opens the browser. Tests for each but `--open`
- [x] The DOM-free script in its own module with tests: only `http:`, `https:`, `mailto:` and relative links become clickable; starting positions seeded from node ids, the same on every load; overlapping labels hidden, busiest first; Markdown and Org bodies rendered as the prototype does
- [x] In the page: ghost nodes drawn faint with dashed edges; `#note=<name>` selects a note and is kept in the address as you select; Esc closes the panel or leaves focus, `/` searches, arrows step through the selected note's links. Checked in headless Chrome on lore's and imp's notes with no console errors
- [ ] Docs: `lore graph` on the site's commands page and in the README if it lists commands; CONTEXT.md describes `src/graph-page/`; the spec gains `anchors:` for `src/graph-page/**` and `src/commands/graph.ts`; `lore check` and the tests pass
