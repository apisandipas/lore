---
type: Effort
status: active
specs: ["[[lore-cli]]"]
frozen:
  docs/specs/lore-cli.md: c901abb34090
---
# Drift after shipping

## Approach

Drift on finished work stops being a `check` problem and becomes a `next` step. `check` and `next` must agree on what finished means, so the status names `next` reads move to `graph.ts` beside `SUPERSEDED`, and both commands use them. `check` skips the frozen entries of a `done` effort. `next` already collects the specs that efforts link to; it now also asks whether any effort, open or done, was frozen against the spec's current text, and a spec whose efforts are all `done` with none current goes to `lore-plan`.

## Tasks

- [x] Move the status names `draft`, `active`, `done` and `retired` from `next.ts` to `graph.ts` beside `SUPERSEDED`, and import them in `next.ts`. Tests pass unchanged.
- [x] `check` skips the frozen entries of an effort whose status is `done`, both changed and removed specs. Test with the typed fixture: freeze `reset`, change the spec, set `reset` to `done` and check is clean; set it back to `active` and the drift is reported again.
- [x] `next` reports `lore-plan` for an accepted spec whose efforts are all `done` when none was frozen against its current text, with the reason "spec changed since its efforts shipped", ranked with the other spec-level `lore-plan` steps. Test: a `done` effort frozen against the current spec gives nothing to do; after the spec changes, `lore-plan` on the spec.
- [ ] `lore check` is clean on lore's own repo, where `link-fields-on-lore-new` is `done` and frozen against an older `lore-cli`.
