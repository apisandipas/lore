---
type: Effort
status: active
specs: ["[[lore-cli]]"]
frozen:
  docs/specs/lore-cli.md: c615fd989a8f
---
# Org notes

Read and write Org files as notes beside Markdown ones, so a repo that keeps its specs in Org (dogear) can use lore without converting them.

## Approach

The note model stays as it is; only the syntax around it varies. `parse.ts` picks a syntax by extension (Markdown or Org) for the field header, headings, links, blocks and checkboxes, and `edit.ts` does the same for writing fields and ticking. Field values are YAML in both, so validation, freezing and drift need no change. Links in Org resolve through the same `resolve`, with `file:` paths made relative to the note first.

## Tasks

- [x] Read Org notes: `#+key:` fields, title, summary and sections, links (`[[x][label]]`, relative `file:`, no URLs), checklists and blocks; the graph loads `.org` files and resolves names without `.org`. Tests on an Org fixture.
- [x] Write Org notes: `set`, `freeze` and `tick` on an `.org` note change `#+key:` lines and write `[X]`, and the result reads back the same. Tests, including an all-digit frozen hash.
- [x] `lore new` writes an Org note for a type with `format: org`, from `.lore/templates/<Type>.org` when present. Tests.
- [ ] A dogear-shaped repo: Org specs with `[[file:…][…]]` links and Markdown efforts planned against them pass `check`, `next`, `context` and `freeze`. README mentions Org.
