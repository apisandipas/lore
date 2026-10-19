---
type: Decision
status: accepted
anchors: [src/commands/freeze.ts]
---
# Efforts freeze the spec versions they plan against

## Context
When a spec changes mid-build, the plan built on it can go stale without anyone noticing.

## Decision
An Effort records a sha256 of each spec it was planned against (`lore freeze`). `lore check` reports drift. Tasks are a checklist inside the Effort note rather than a separate type.

## Consequences
An effort's tasks live with its plan and its frozen spec versions, so `lore next` can read progress from the repo alone. Teams that track tasks elsewhere can leave the checklist empty.
