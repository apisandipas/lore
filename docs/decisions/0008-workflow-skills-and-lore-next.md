---
type: Decision
status: accepted
---
# Workflow skills are prefixed, and `lore next` says what comes next

## Context
Skill names alone do not show the order of the flow, and autocomplete sorts them alphabetically.

## Decision
Skills: `lore-spec` → `lore-plan` → `lore-build` → `lore-ship`, with `lore-decide` usable at any step and `lore-next` wrapping `lore next`. Each skill ends with a handoff line naming the next step. `lore next` infers the step from note state: draft spec, accepted spec with no effort, effort with open items, all items done, or drifted spec.

## Consequences
You can resume after a break, or in a fresh agent session, without remembering where you were.
