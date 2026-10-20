---
type: Spec
status: draft
anchors: [editors/emacs/**]
---
# Emacs integration

`lore.el` puts lore's answers where you edit: the notes governing the current file in a side window, citations and links you can follow, and `lore check` as diagnostics, all through `lore ... --json`.

## Behaviour
- `global-lore-mode` turns on `lore-mode` in every file under a directory with `.lore/`, when `lore` is on `exec-path`, and nowhere else.
- The mode line shows `lore:N`, the number of notes governing the file, once lore has answered; lore runs asynchronously and never blocks typing.
- `lore-sidebar-mode` shows a right side window listing the notes for the selected window's file, in `lore context` order: title (a button that opens the note), type and status, why it matched, and the summary; `lore-sidebar-full` adds bodies. It follows window and buffer changes after 0.2s idle, refetches after any save, and does not refetch a file it already shows.
- M-. on a citation (`lore:` and a note's name) in code or on `[[name]]`, `[[name][label]]` or `[[file:x.org][label]]` in a note opens the note. Off a citation or link, M-. falls through to the next xref backend (eglot, etags). M-? lists the code citing the note and the notes linking to it.
- Eldoc shows the title and summary of the note named at point.
- After `[[` or `lore:`, completion offers every note's name, annotated with its title.
- Flymake reports `lore check` problems for the buffer's file at their lines. lore reads the disk, so they reflect the file as last saved.
- Commands on `lore-command-map`: `lore-next` and `lore-show` (output with repo paths as buttons), `lore-check` (a compilation buffer, so `next-error` walks problems), `lore-new` (type from `.lore/schema.yml`, then visits the note), `lore-tick` and `lore-freeze` (save, run, revert, report in the echo area), `lore-sidebar-mode`, `lore-refresh`.
- In Org, a `lore:` link (`[[lore:<id>]]`) opens the note.
- A lore error (no such note, unreadable schema) is shown as lore worded it.

## Out of scope
- Any index or cache beyond a few seconds of `lore list` and the summaries eldoc has shown: lore stays the source of truth ([[0003-no-index-scan-per-call]]).
- Context or diagnostics for unsaved changes.
- Other editors. The JSON lore prints is the interface one would build on.
- Editing note bodies from Emacs commands; notes are edited as files.
