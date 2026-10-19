---
name: lore-next
description: Say which lore workflow step comes next in a repo that uses lore (typed Markdown notes under docs/ with a .lore/ directory), and which lore-* skill takes it. Use when resuming work after a break or in a fresh session, when asked "what's next", "where was I" or "what should I work on", or before starting any of lore-spec, lore-plan, lore-build or lore-ship without a named target.
---

# lore-next

`lore next` reads the state of specs and efforts and ranks what to do. This skill runs it and hands off to the skill it names.

## Steps

1. Run `lore next`. If it fails:
   - No `.lore/` in the repo: suggest `lore init`, which writes the schema, templates and `.lore/WORKFLOW.md`. Stop there.
   - "no type in .lore/schema.yml sets freeze": the schema has no Effort type. Show the user `.lore/schema.yml` and suggest adding one like the default `lore init` writes.
2. Run `lore check`. Problems there can matter more than the next step: a broken link or a citation of a superseded decision should be fixed first, or at least mentioned.
3. Read `.lore/WORKFLOW.md` if it exists. A project can change the flow, and its version wins over this skill.
4. Report the first step: the skill, the note, and the reason `lore next` gave, including the next checklist item for `lore-build`. Mention the rest of the list in one line if there is more.
5. Ask whether to go ahead, then follow that skill.

## Reading the output

| `lore next` says | Meaning |
|---|---|
| `lore-plan` … changed since it was planned | A spec moved under an effort; the tasks may be stale |
| `lore-ship` … all items done | Every task is checked; the effort needs closing |
| `lore-build` … next item | Work to do; the item is the first unchecked task |
| `lore-plan` … no checklist yet / not frozen | An effort exists but is not planned |
| `lore-plan` … spec with no effort | An accepted spec nobody has planned |
| `lore-spec` … draft spec | A spec still being worked out |
| nothing in progress | Start a new spec with `lore-spec` |

End with one line naming the step, for example: `Next: lore-build docs/efforts/password-reset.md (Email the link)`.
