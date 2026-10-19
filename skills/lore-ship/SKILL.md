---
name: lore-ship
description: Close a lore Effort whose tasks are all checked - confirm the work meets its spec, lore check and the tests pass, the notes describe the code as it now is, then mark the effort done. Use in a repo with a .lore/ directory when the user wants to finish, wrap up or ship an effort, or when lore next names lore-ship.
---

# lore-ship

Closing an effort is a check that the work matches what was asked, and that the notes now describe the code as it is.

Read `.lore/WORKFLOW.md` first if it exists; the project's process wins over this skill.

## Steps

1. **Confirm it is finished.** `lore show <effort>` should say every checklist item is done. If not, go back to `lore-build`.
2. **Hold it against the spec.** For each spec in the effort's `specs:`, read the statements under `## Behaviour` and confirm each one holds in the code, with a test where one makes sense. A gap becomes a new unchecked task, and the effort goes back to `lore-build`.
3. **Run the checks.** `lore check` must be clean, with no drift on this effort, and the project's tests must pass.
4. **Bring the notes up to date.**
   - A directory whose purpose or rules changed gets its `CONTEXT.md` updated, or a new one.
   - Code the spec or a decision now governs, but no anchor or citation reaches, gets an `anchors:` entry on that note.
   - Run `lore context` on a few of the changed files and check the right notes come back.
5. **Close it.** `lore set <effort> status=done`. Leave the spec `accepted`; `lore set <spec> status=retired` only if the user says it no longer applies.
6. **Commit** if that is how the project works, and tell the user what shipped.

End with one line: `Next: lore-next`.
