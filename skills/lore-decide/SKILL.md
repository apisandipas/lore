---
name: lore-decide
description: Record a decision as a numbered lore Decision note under docs/decisions - the choice, the context that forced it and its consequences - or supersede an earlier one. Use in a repo with a .lore/ directory at any workflow step when choosing between alternatives a later reader would question, reversing an earlier decision, or when the user says to record, document or decide something.
---

# lore-decide

A decision records a choice, why it was made, and what follows from it. Accepted decisions are never edited; a change of mind is a new decision that supersedes the old one, so the history stays readable. This skill can run at any step and returns to the step that called it.

Read `.lore/WORKFLOW.md` first if it exists; the project's process wins over this skill.

## When it is worth a note

Record a decision when a later reader, human or agent, would look at the code and ask "why not the obvious way?", or would undo it by accident. Do not record choices the code or a spec already makes plain.

## Steps

1. **Check what exists.** `lore list --type Decision --summaries`, and `lore context <file>...` on the code it affects. If an accepted decision already covers this, follow it or supersede it; do not write a parallel one.
2. **Create it.**
   - New: `lore new Decision "<the choice, stated>"`, for example "Reset links expire after one hour".
   - Replacing one: `lore new Decision "<title>" --supersedes <id>`. lore marks the old one `superseded` and moves its anchors to the new note.
3. **Fill the sections.**
   - `## Context`: the forces at play and the alternatives considered.
   - `## Decision`: the choice. Its first paragraph is the summary `lore context` shows beside the code, so make it stand alone.
   - `## Consequences`: what gets easier, what gets harder, what is now ruled out.
   - Link the spec or effort that prompted it with `[[name]]`. Add `anchors:` for code it governs.
4. **Agree it.** It starts `proposed`. Once the user agrees, `lore set <id> status=accepted`.
5. **Cite it** in code where the choice shows: a comment such as `// see lore:0012`.
6. **Check.** `lore check`. After superseding, it lists code still citing the old decision; update those citations.

End with one line returning to the step in progress, for example `Next: lore-build docs/efforts/<slug>.md (<task>)`, or `Next: lore-next` if there was none.
