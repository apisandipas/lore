---
name: lore-spec
description: Write or revise a lore Spec, the note under docs/specs that says what something should do and what it leaves out, until the user accepts it. Use in a repo with a .lore/ directory when the user wants to specify a feature, describe intended behaviour before building, write requirements, or when lore next names lore-spec.
---

# lore-spec

A spec says what something should do, for whom, and what it deliberately leaves out. It is the thing an effort is planned against, so a vague spec makes a vague plan. Specs are edited in place, unlike decisions.

Read `.lore/WORKFLOW.md` first if it exists; the project's process wins over this skill.

## Steps

1. **Find or create the spec.** Run `lore list --type Spec --summaries` to see what exists. Revise an existing spec rather than writing a second one that overlaps it. For a new one: `lore new Spec "<title>"`, which writes `docs/specs/<slug>.md` with status `draft`.
2. **Learn the ground.** Read the notes that bear on it: `lore list --summaries` for related decisions, and `lore context <file>` for any code the spec covers. If it describes existing code, read that code.
3. **Ask, don't invent.** Interview the user about what is unclear: who uses it, the main path, the edge cases, limits, errors, and what is out of scope. Ask a few questions at a time. Record answers in the spec as you go, not at the end.
4. **Write it.**
   - The first paragraph under the title is the summary that `lore context` and `lore list --summaries` show. Make it one sentence that stands alone.
   - Under `## Behaviour`, write statements someone could test: "A reset link expires after one hour", not "links should be secure".
   - Under `## Out of scope`, name what a reader might expect and will not get.
   - Link related notes with `[[name]]`. If the spec governs code that already exists, add `anchors:` to its frontmatter (a path, a glob, or `symbol:Name`).
   - A choice between alternatives that needs its reasons kept belongs in a decision; use `lore-decide` and link it.
5. **Check.** Run `lore check` and fix anything it reports about this spec.
6. **Accept only with the user.** Show the spec and ask whether it is right. Set `status: accepted` only when the user says so. Until then it stays `draft`.

If the spec has an effort planned against it and you change its body, `lore check` will report drift on that effort. That is intended: say so, and hand off to `lore-plan` rather than `lore-build`.

End with one line naming the next step:
- accepted: `Next: lore-plan docs/specs/<slug>.md`
- still open: `Next: lore-spec docs/specs/<slug>.md (<what is still open>)`
