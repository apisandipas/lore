---
type: Decision
status: accepted
---
# The CLI owns mechanics, skills own process

## Context
A tool that builds a workflow into itself grows large and forces that workflow on everyone. Teams differ in how they work; they should not differ in whether links resolve.

## Decision
The CLI is strict about mechanics: parsing, links, anchors, superseding, freezing, and `check`. Workflow lives in editable skills and a `WORKFLOW.md` that `lore init` installs. Durable knowledge lives in the repo; in-flight work may live in an issue tracker.

## Consequences
A project can change its process by editing skills, without touching lore.
