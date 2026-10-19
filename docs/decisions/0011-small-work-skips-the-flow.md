---
type: Decision
status: accepted
---
# Small work skips the spec, plan, build, ship flow

## Context
The flow suits a feature. Run on a one-line fix it costs a spec, an effort, a freeze and a ship step for a change that needed none of them, and people stop using lore rather than pay that.

## Decision
`.lore/WORKFLOW.md` sizes work before any skill runs. Small work (one sentence, one commit, nothing in an accepted spec or decision against it) gets `lore context` before each edit and `lore check` after, with no spec or effort. Everything else takes the flow. `lore-next` does the sizing when the user brings a task. The line lives in WORKFLOW.md, not the CLI, so a project can move it ([[0005-cli-owns-mechanics-skills-own-process]]).

## Consequences
Small fixes leave no Effort behind, so `lore next` never sees them. A choice made during one still gets a Decision through `lore-decide`.
