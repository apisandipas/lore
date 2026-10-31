---
type: Spec
status: accepted
issue: https://github.com/apisandipas/lore/issues/20
anchors: [src/graph-page/**, src/commands/graph.ts]
---
# Notes graph

`lore graph` writes the notes as one self-contained HTML page, an interactive graph in the spirit of Obsidian's graph view, so people who don't use the CLI can see what was decided, what builds on what, and what governs which code.

## Behaviour

### The command
- `lore graph [<note>] [--out <file>] [--depth N] [--open]` writes the page to `--out`, or to `lore-graph.html` in the temp directory when no `--out` is given, and prints the path it wrote.
- With `<note>`, the page opens focused on that note: its graph `--depth` links out (default 2), with a "Show all" that returns to every note. The page still holds every note. A `<note>` that resolves to nothing, or to several notes, is an error, as for `show`.
- `--open` opens the written page in the default browser (`xdg-open`, `open` or `start`).
- `--json` prints the graph's data (nodes and edges, below) instead of writing a page.
- The page is one file with no network access: no scripts, styles or fonts loaded from elsewhere ([[0001-bun-typescript-no-runtime-deps]]). It is built on each run from the working tree ([[0003-no-index-scan-per-call]]), and the same notes always give the same file, byte for byte: no timestamps.

### What is drawn
- Every note is a node, `CONTEXT.md` files included, coloured by type. A superseded or retired note is faded; a `draft`, `planned` or `proposed` note is hollow; an effort whose frozen spec changed has a red ring.
- Every link between notes is an edge. A `supersedes` link is dashed, other frontmatter links have an arrow, body links are thin. Two notes linked twice the same way are one edge.
- A link to no note, or to several, is a faint ghost node named by the link's text, with a dashed edge.
- The code layer, hidden until turned on: each anchor is one node, joined to every note that claims it, and each file that cites a note is one node, joined to the notes it cites.
- The layout is the same each time the page opens: starting positions come from each node's id, not from chance.
- The busiest notes (most links) are always labelled; other labels appear as you zoom in, and a label that would overlap one already drawn is hidden.

### Using it
- Zoom, pan, and drag nodes. Hovering a node lights it and its neighbours and dims the rest.
- Controls: one checkbox per type with its count, toggles for the code layer, superseded notes and notes with no links, and a search over titles and names; Enter selects the first match.
- Selecting a node opens a side panel: type, status and a drift warning; title and name; the note's text rendered from Markdown or Org; then the notes it links to, the notes linking to it, and its code, each row saying how they are linked. The panel can be resized by dragging its edge, and the width is remembered.
- A `[[link]]` in the rendered text selects that note. Only `http:`, `https:`, `mailto:` and relative links in the text become clickable; any other scheme is shown as text.
- "Focus here" shows the selected note's local graph; "Open on GitHub" opens its file when the repo's `origin` remote is on GitHub, at the current branch, and is absent otherwise.
- The address records the view: `#note=<name>` for the selected note, `#focus=<name>` for the local graph, `#code` for the code layer. Opening the page with them restores that view, so a link can be shared.
- Keyboard: Esc closes the panel, or leaves focus; `/` moves to the search box; with a note selected, the arrow keys step through its linked notes.
- The page follows the system's light or dark theme.

### The data
- `--json` prints `{ repo, url, types, nodes, edges }`. A node has `id` (a note's path, `anchor:<text>`, `file:<path>` or `missing:<target>`), `kind` (`note`, `code` or `missing`), `name`, `title`, `type`, `status`, `summary` and `drift`; a note node also has `body` and `refs`, each link target in its body mapped to the id it resolves to. An edge has `source`, `target` and `kind` (the frontmatter field, `link` for a body link, `anchor` or `cites`).

## Out of scope
- A server, live reload or `--watch`: rerun the command.
- Editing notes from the page.
- Rendered pages per note, or a site of notes.
- Graphs much past a few thousand nodes (#21), publishing from CI (#22), opening notes in an editor (#23), searching note text (#24) and exporting images (#25) are later work.
