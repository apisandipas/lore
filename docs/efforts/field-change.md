---
type: Effort
status: active
specs: ["[[spec/lore-cli]]"]
issue: https://github.com/apisandipas/lore/issues/5
frozen:
  docs/specs/lore-cli.md: 070fd8a2df57
---
# Field change

One module turns field assignments from the command line into the values `lore new` and `lore set` write, checked before anything is written (#5). No behaviour changes.

## Approach

`src/change.ts` exports `planChange(g, target, changes)`: the target is a type, or a note when `+=` needs its current values; each change is a field, whether it adds, and its values. It allows the type's fields and those every note may use, checks a `type` against the schema, settles one value or a list, writes links as `[[type/stem]]`, merges `+=` (splitting Org's `[[a]] [[b]]`) without adding a note twice, and asks `fieldProblems` of each field. It returns the fields to write or the first problem. The commands keep their own rules: `new --link` takes only link fields, both refuse superseding until #6, and each words its errors. `linkTo` and `toList` move inside; `link` stays in edit.ts.

## Tasks

- [ ] Add `src/change.ts` with `planChange`, tested directly: common and type fields, an unknown field, `type` not in the schema, one value vs a list, `+=` on a link field given two names for one note, Org `[[a]] [[b]]` merging, a bad link
- [ ] `new` and `set` build their fields through `planChange`; `linkTo` leaves shared.ts and `toList` leaves set.ts; their output and messages are unchanged, with a test that `new --link specs=auth --link specs=spec/auth` writes one link
- [ ] CONTEXT.md describes `src/change.ts`; `lore check` and the tests pass
