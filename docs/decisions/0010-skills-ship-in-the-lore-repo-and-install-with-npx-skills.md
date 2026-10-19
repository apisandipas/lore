---
type: Decision
status: accepted
---
# Skills ship in the lore repo and install with npx skills

## Context
The workflow skills from [[0008-workflow-skills-and-lore-next]] were going to live in a separate skills repo. Kept apart from the CLI, the two drift: a skill can call a flag or read output that its installed lore does not have. Copying skills from the CLI into each project would mean lore writing into agent directories it does not own, and keeping its own record of which copies were edited.

## Decision
The `lore-*` skills live in this repo under `skills/`, one directory per skill, and change in the same commits as the CLI they drive. They install with the `skills` CLI: `npx skills add apisandipas/lore`, which handles project or global installs and each agent's skills directory. `lore init` does not copy skills; it looks for them in the project's and the user's skills directories and prints that install command when they are missing.

## Consequences
One commit changes a command and the skills that call it. Installing, updating and choosing a location for skills is the `skills` CLI's job, not lore's. A project can still run skills older than its lore; `lore init` checks that skills are present, not that they match.
