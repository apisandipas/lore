---
type: Decision
status: accepted
---
# The CLI owns mechanics, skills own process

## Context
Rhizome grew to roughly 350k lines partly by building its workflow into the tool. Teams differ in how they work; they should not differ in whether links resolve.

## Decision
The CLI is strict about mechanics: parsing, links, anchors, superseding, freezing, and `check`. Workflow lives in editable skills and a `WORKFLOW.md` that `lore init` installs. Durable knowledge lives in the repo; in-flight work may live in an issue tracker.

## Consequences
A project can change its process by editing skills, without touching lore.
