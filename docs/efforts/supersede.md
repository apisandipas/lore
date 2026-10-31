---
type: Effort
status: active
specs: ["[[spec/lore-cli]]"]
issue: https://github.com/apisandipas/lore/issues/6
frozen:
  docs/specs/lore-cli.md: 070fd8a2df57
---
# Supersede

One module owns superseding, what it writes and what must then hold, so `check` requires exactly what `new --supersedes` produces (#6, lore:decision/0006). No behaviour changes.

## Approach

`src/supersede.ts`, shaped like `plan.ts`: functions of the graph. `supersedes`, `supersededBy`, `current` and `history` read the chain, and Graph drops its three methods; `SUPERSEDES` and `SUPERSEDED` move here. `planSupersede(g, refs)` checks the notes to supersede and returns them with the new note's `supersedes` and `anchors` fields, or a problem; `markSuperseded(tree, olds)` flips them, so `new` still checks everything before it writes. `superseding(field, values)` is the refusal `set` and `new --link` share. `supersedeProblems(g)` is every superseding rule `check` reports, citations of a superseded note included. `context` and `show` keep how they present history.

## Tasks

- [x] Add `src/supersede.ts` with the chain functions, `history` and the constants; Graph drops `supersedes`, `supersededBy` and `current`; check, context, show, new, set and plan use it; tests pass
- [x] `planSupersede`, `markSuperseded` and `superseding`: `new` and `set` use them, with a test that `new --supersedes` on a memory tree leaves `check` with nothing to report
- [x] `supersedeProblems(g)`: check's superseding and citation rules move into it, with a Graph-level test of each problem
- [ ] CONTEXT.md describes `src/supersede.ts`; `lore check` and the tests pass
