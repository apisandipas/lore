---
type: Decision
status: accepted
anchors: [src/graph.ts]
---
# Notes are named type slash stem

## Context
A note was named by its filename alone, across every type. A spec `due-dates` and the effort that builds it, `due-dates`, could not both exist: creating the effort made every bare `[[due-dates]]` ambiguous, including links in notes nobody touched, and lore wrote bare names itself even when given a qualified one. Telling users to pick filenames that never collide is a convention lore cannot enforce.

## Decision
A typed note's name is its type, lowercased, a slash, then its filename: `spec/due-dates`, `decision/0012-notes-are-named-type-slash-stem`, or `decision/0012` by number. Every link and message lore writes uses that name. Bare filenames, paths and number prefixes still resolve while they name one note, so existing notes and `lore show due-dates` keep working. When `lore new` makes a bare name ambiguous, it lists the links and citations that used it and the name each meant.

The type, not the directory, qualifies the name, so moving a type's `dir` leaves every link intact.

## Consequences
Names are longer in frontmatter and citations (`lore:decision/0012`). Hand-written bare links keep working until a second note takes the filename; `check` then reports them with the names they could mean.
