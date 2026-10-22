---
type: Effort
status: done
specs: ["[[spec/lore-cli]]"]
frozen:
  docs/specs/lore-cli.md: 070fd8a2df57
---
# Qualified note names

Name typed notes `type/stem` so a spec and an effort can share a filename ([[decision/0012]]).

## Approach
Give each note a `name` once the graph knows its type, resolve it alongside the forms that already work, and use it everywhere lore writes a link or names a note. `lore new` warns about the bare links it makes ambiguous, before writing, while they still resolve.

## Tasks
- [x] Resolve `type/stem` and `type/id`, in any case
- [x] Write links and name notes in messages as `type/stem`
- [x] Ambiguity errors and `check` name the notes a bare name could mean
- [x] `lore new` lists bare links and citations it makes ambiguous, with the name each meant
- [x] Spec, README and skills use qualified names
