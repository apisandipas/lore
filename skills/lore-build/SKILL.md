---
name: lore-build
description: Work through a lore Effort's task checklist one task at a time, reading the notes that govern each file before editing it. Use in a repo with a .lore/ directory when the user wants to build, implement or continue an effort, work the next task, or when lore next names lore-build.
---

# lore-build

Builds one task from an effort's checklist, then the next. The rule that matters most: before editing a file, run `lore context` on it and follow what it says.

Read `.lore/WORKFLOW.md` first if it exists; the project's process wins over this skill.

## Steps

1. **Pick the task.** Use the effort the user named, or the one `lore next` gives. The task is the first unchecked item; `lore show <effort>` shows the checklist and the specs it was planned against. If `lore check` reports drift on this effort, stop and use `lore-plan` first.
2. **Mark it active.** If the effort's status is `planned`, run `lore set <effort> status=active`.
3. **Read before editing.** Run `lore context <file>...` on every file you expect to change, and again on new files once you know where they go. Follow the specs, decisions and `CONTEXT.md` rules it lists. `--full` shows note bodies when a summary is not enough.
4. **Do the task**, and only that task. Run the tests.
5. **When the notes and the task disagree**, stop and ask. Do not quietly work around a decision. Either the task changes, the spec changes (which sends the effort back to `lore-plan`), or a new decision supersedes the old one (`lore-decide`).
6. **Cite decisions in code** where a reader would ask why: a comment such as `// see lore:decision/0012` beside the code that follows decision 0012.
7. **Check it off.** `lore tick <effort>` ticks the task and prints the next one. Work you discover along the way becomes a new unchecked task in the effort, not part of this one.
8. **Verify.** `lore check` and the tests pass. Commit if that is how the project works, one task per commit.

Then take the next task, or stop if the user asked for one.

End with one line naming the next step:
- tasks remain: `Next: lore-build docs/efforts/<slug>.md (<next task>)`
- all checked: `Next: lore-ship docs/efforts/<slug>.md`
