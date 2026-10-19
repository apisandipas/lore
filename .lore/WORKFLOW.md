# Workflow

How this project uses lore. The `lore-*` skills read this file before they act, so editing it, and the skills, changes the process. The `lore` CLI only enforces mechanics: links, citations, anchors, superseding and freezing.

## Notes

- **Spec** (`docs/specs`): what something should do and what it leaves out. `draft` while it is worked out, `accepted` once agreed, `retired` when it no longer applies. Specs are edited in place.
- **Effort** (`docs/efforts`): one piece of work against one or more specs. It names them in `specs:` and lists its tasks as a Markdown checklist. `planned`, then `active`, then `done`.
- **Decision** (`docs/decisions`, numbered): a choice, the context that forced it, and its consequences. Once `accepted` it is never edited; a change of mind is a new decision made with `lore new Decision "<title>" --supersedes <id>`.
- **CONTEXT.md**: what a directory holds and the rules for code in it. It applies to everything beneath it.

## Size

Size the work before picking a skill. Most work is small, and small work skips the flow.

- **Small**: a bug fix, a rename, a dependency bump, or any change you can state in one sentence and land in one commit, as long as no accepted spec or decision says otherwise. No spec and no effort. Run `lore context` on each file, make the change, then run the tests and `lore check`. If you made a choice a later reader would question, record it with **lore-decide**.
- **Feature**: anything that changes what a spec says, adds behaviour a user would notice, or needs more than one commit. Use the flow below.

When it is unclear, ask the user. If small work grows past one commit, stop and start a spec.

## Flow

1. **lore-spec**: write or revise a spec until it is `accepted`.
2. **lore-plan**: create an Effort for an accepted spec, break the work into checklist tasks, and `lore freeze` it.
3. **lore-build**: take the first open task, do it, check it off. Repeat.
4. **lore-ship**: with every task checked, confirm `lore check` and the tests pass, mark the Effort `done`, and update any `CONTEXT.md` the work changed.

**lore-decide** records a decision at any step, whenever a choice would surprise a later reader. **lore-next** runs `lore next` to say which step comes next; use it after a break or in a fresh session.

## Rules

- Before editing a file, run `lore context <file>` and follow the notes it lists.
- When code follows a decision a reader might question, cite it in a comment: `see lore:<id>`.
- If a spec changes during an Effort, `lore check` reports drift. Revisit the plan, then run `lore freeze <effort>` again.
- Run `lore check` before committing.
