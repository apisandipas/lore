---
name: lore-graph
description: Open a lore repo's notes as an interactive graph in the browser - specs, efforts and decisions as nodes, the links between them, and optionally the code they govern - with `lore graph`. Use in a repo with a .lore/ directory when the user wants to see, show, map or visualise the notes, asks for the big picture, what links to or builds on a note, how decisions relate, or wants a page to share with someone who does not use the CLI.
---

# lore-graph

`lore graph` writes the notes as one self-contained HTML page and prints its path. This skill picks what to show, opens it, and says what the user is looking at.

## Steps

1. **Pick the view.**
   - The whole picture: `lore graph --open`.
   - Around one note ("what links to the auth spec?"): `lore graph <note> --open`, which opens focused on it two links out. Add `--depth 1` for only its neighbours, more for a wider view. Name the note as `lore show` would; if the name is ambiguous, the error lists the candidates, so pick one or ask.
   - To keep or share the page: add `--out <file>`. In a repo, suggest a path git ignores, or the docs folder if the user wants it committed.
2. **Run it.** Without a browser, such as in a remote or headless session, leave out `--open` and give the user the printed path, or the `--out` file, to open themselves.
3. **Say what they are looking at**, in a sentence or two: notes are coloured by type, faded when superseded or retired, hollow while draft or planned, and ringed red when an effort's spec changed under it; a dashed node is a link to a note that does not exist; the Code checkbox adds the code that anchors and citations reach. Clicking a note opens it in a side panel, *Focus here* narrows to its neighbours, `/` searches, and the address can be copied to share the view.
4. **If the user wants the graph data rather than a page**, `lore graph --json` prints the nodes and edges.

`lore check` reports the same broken links the dashed nodes show; offer to run it if there are several.
