---
name: lore-plan
description: Plan the work for an accepted lore Spec as an Effort note under docs/efforts with an ordered task checklist, then freeze it against the spec; also re-plan an effort whose spec changed. Use in a repo with a .lore/ directory when the user wants to plan, break down or scope work on a spec, or when lore next names lore-plan.
---

# lore-plan

An effort is one piece of work against one or more specs. It names them in `specs:`, explains the approach, and lists its tasks as a Markdown checklist. `lore freeze` records which version of each spec it was planned against, so `lore check` can say when a spec moves underneath it.

Read `.lore/WORKFLOW.md` first if it exists; the project's process wins over this skill.

## A new plan

1. **Read the spec.** `lore show <spec>` gives its body, links, and any efforts already planned against it. It should be `accepted`; if it is `draft`, go back to `lore-spec`.
2. **Read the code it touches.** Find the files the work will change and run `lore context <file>...` on them. Decisions and `CONTEXT.md` rules found there constrain the plan.
3. **Create the effort.** `lore new Effort "<title>" --link specs=<spec>` writes `docs/efforts/<slug>.md` with status `planned`, linked to the spec. Repeat `--link specs=<spec>` for each spec the effort covers.
4. **Write the approach.** Under `## Approach`, a short paragraph on how the work will go and why that way. If it involves a choice a later reader would question, record it with `lore-decide` and link it.
5. **Write the tasks.** Under `## Tasks`, a checklist (`- [ ] ...`):
   - Each task is small enough to finish and verify in one sitting, and ends in a state where the tests pass.
   - Order them so each builds on the last. `lore next` and `lore-build` take the first unchecked one.
   - Say what is done when it is done: "Expire reset links after an hour, with a test", not "link expiry".
   - Cover every statement under the spec's `## Behaviour`, and nothing under `## Out of scope`.
6. **Review with the user.** Show the plan and adjust it until they agree.
7. **Freeze and check.** Run `lore freeze <effort>`, then `lore check`.

## Re-planning after drift

`lore next` or `lore check` reports `<spec> changed since it was planned`.

1. See what changed: `git log -p -- <spec path>` since the effort's `frozen:` entry was written (`git log -1 --format=%H -S frozen -- <effort path>` finds that commit).
2. Revise the tasks. Uncheck work the change undoes, add tasks for new behaviour, remove tasks that no longer apply. Say which checked tasks are affected.
3. Review with the user, then `lore freeze <effort>` again and `lore check`.

End with one line naming the next step: `Next: lore-build docs/efforts/<slug>.md (<first task>)`.
