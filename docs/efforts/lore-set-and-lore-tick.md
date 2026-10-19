---
type: Effort
status: active
specs: ["[[lore-cli]]"]
frozen:
  docs/specs/lore-cli.md: 8ae622797434
---
# lore set and lore tick

## Approach

Both commands replace hand edits the skills make on every run. `set` reuses what `new --link` already does: the link lookup moves into `shared.ts` so both commands resolve and type-check links the same way, and every assignment is checked before `setField` writes anything. `tick` needs the line of the first open checklist item, which the parser records next to the item's text. Superseding stays with `lore new --supersedes` ([[0006-decisions-are-superseded-never-edited]]).

## Tasks

- [x] Move the link lookup in `new.ts` (resolve a name to one note, check it has the linked type) into a helper in `shared.ts`, and use it from `new`. Tests pass unchanged.
- [x] Record the file line of the first unchecked checklist item in `parse.ts`, beside its text. Test it.
- [x] `lore tick <note>`: tick the first unchecked item and print the item ticked and the next one, or that every item is done; a note with nothing unchecked exits 1 and writes nothing; `--json` gives `path`, `ticked` and `next`. Tests for each case.
- [x] `lore set <note> <field>=<value>...` checks every assignment before writing: a malformed assignment is a usage error (exit 2); an unknown field, a value outside an enum, a type not in the schema, a link that does not resolve to one note of the linked type, two values or `+=` on a field that is not `many`, `supersedes`, and `status=superseded` each exit 1 with a message and write nothing. A test for each case.
- [x] `lore set` writes: `=` replaces, repeated `=` on a `many` field sets the list, `+=` adds to the existing list without duplicates; links are written as `"[[stem]]"`; other fields are left alone. Prints the fields it set; `--json` gives `path` and the new values. Test the exact file written, and that `lore check` passes on it.
- [ ] Document `set` and `tick` in `help.txt` and the README commands table.
- [ ] The skills use the commands in place of hand edits: `lore-build` sets the effort `active` and ticks items with `lore tick`; `lore-ship` sets it `done`; `lore-spec` and `lore-decide` set `status=accepted`.
