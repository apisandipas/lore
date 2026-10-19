---
type: Effort
status: active
specs: ["[[lore-cli]]"]
frozen:
  docs/specs/lore-cli.md: 35f19b850af7
---
# Link fields on lore new

## Approach

`--link <field>=<note>` is parsed in `main.ts` like `--supersedes`, and `runNew` checks every link before it writes anything, so a bad link leaves no half-made note. It resolves notes with `findNote`, the same lookup `--supersedes` uses, and writes links in the same quoted `"[[stem]]"` form. `supersedes` is refused as a `--link` field because superseding also rewrites the old note; `--supersedes` stays the one way to do that. The flag is generic over the schema rather than a `--spec` flag ([[0005-cli-owns-mechanics-skills-own-process]]).

## Tasks

- [x] Parse `--link` in `main.ts` as a repeatable string; a value without `field=note` is a usage error (exit 2). Test it.
- [ ] Validate links in `runNew` before writing: the field must be a `link` field of the type, the note must resolve to exactly one note of the linked type, a non-`many` field takes one value, and `supersedes` is refused with a pointer to `--supersedes`. Exit 1 with a message naming the problem, and no file written. Test each case.
- [ ] Write link fields into the new note's frontmatter, after `status` and `supersedes` and before `anchors`: a `many` field as a list, any other field as one value. Test the exact file written, and that `lore check` passes on an Effort created with `--link specs=auth` in the typed fixture.
- [ ] Document `--link` in `help.txt` and the README commands table, and include `--link` in the `--json` output of `new` as `links`.
- [ ] Change `skills/lore-plan/SKILL.md` step 3 to create the effort with `lore new Effort "<title>" --link specs=<spec>` in place of editing frontmatter by hand.
- [ ] Remove "Proposed; not built yet." from the spec, then `lore freeze link-fields-on-lore-new` again, since that edit changes the frozen spec.
