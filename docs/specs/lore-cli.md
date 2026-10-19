---
type: Spec
status: accepted
summary: The lore command line, what each command reads, and what it prints.
anchors: [src/**]
---
# lore CLI

lore indexes typed Markdown notes and the links between notes and code, and answers "what governs this file?" for agents and people.

## Notes
- Notes are Markdown files under the configured notes directory (`docs` by default), plus every `CONTEXT.md` in the repo.
- Frontmatter fields every note may use: `type`, `status`, `title`, `summary`, `aliases`, `anchors`. Without `title`, the first heading is the title; without `summary`, the first paragraph.
- Notes link to notes with double brackets, by filename, by path, or by number prefix (`0007`). Frontmatter values may hold links too; those are the edges `context` follows.
- Code cites a note with `lore:<name>` ([[0004-code-cites-notes-with-lore-prefix]]).
- `anchors` claim code: a path (`pkg/auth`), a glob (`pkg/auth/**`), or `symbol:Name` (any file using that word).

## Commands
Every command but `help` and `version` takes `--json`. Exit codes: 0 on success, 1 when a command fails or `check` finds problems, 2 for a usage error.

- `lore init`: write `.lore/schema.yml`, `.lore/WORKFLOW.md` and `.lore/templates/` for Spec, Decision and Effort, never overwriting a file that exists. Then look for the `lore-*` skills in `.claude/skills` and `.agents/skills`, in the project and the home directory, and print `npx skills add apisandipas/lore` when any are missing ([[0010-skills-ship-in-the-lore-repo-and-install-with-npx-skills]]).
- `lore context <file>...`: notes that govern the files, ranked: code citations, symbol anchors, path anchors (most specific first), `CONTEXT.md` files in ancestor directories, then notes one frontmatter link away. Summaries by default; `--full` adds bodies, `--budget <tokens>` caps output (default 4000).
- `lore show <note>`: the note, its supersede history, its links out, notes linking in, code citing it, what its anchors match, and its checklist progress.
- `lore list [--type T] [--summaries]`: every note, one line each ([[0009-no-embeddings-until-summaries-overflow]]).
- `lore check`: unreadable frontmatter, unresolved or ambiguous links and citations, anchors matching nothing, schema violations, superseding mistakes, and frozen specs that changed or were removed. An effort with status `done` is history, so its frozen specs are not checked; setting it back to `active` checks them again. Exit 1 when it finds problems.
- `lore new <type> <title> [--supersedes <note>]... [--link <field>=<note>]...`: create a note in the type's directory, numbered when the type has an `id`, from `.lore/templates/<Type>.md` when present. Superseding flips the old note's status and moves its anchors to the new note. `--link <field>=<note>` (repeatable) writes a link to that note into the field, after checking the note exists and has the type the field's `link` names; a `many` field collects every value given for it. A bad link writes nothing, and `supersedes` is refused: superseding goes through `--supersedes`.
- `lore freeze <note>`: record a hash of the body of each note in the type's `freeze` fields (every link field but `supersedes` by default). `check` reports when one changes.
- `lore next`: the next step and the `lore-*` skill that takes it, then the rest in order ([[0008-workflow-skills-and-lore-next]]). Efforts are the types that set `freeze`; specs are the types those fields link to. Ranked: an effort whose frozen spec changed (`lore-plan`), an effort with every item checked (`lore-ship`), an effort with open items (`lore-build`, naming the first), an effort with no checklist or no freeze (`lore-plan`), a spec no effort links (`lore-plan`), a `draft` spec (`lore-spec`). `active` efforts come before others of the same rank; `done` efforts and `retired` or `superseded` specs are skipped.

## Configuration
`.lore/schema.yml` at the repo root holds `notes` (the notes directory), `ignore` (globs excluded everywhere), and `types`. Without `.lore/`, the git root is the repo root.

Each type may set `dir` (notes there get the type without naming it), `id` (a `{n:4}` counter for `lore new`), `summary` (the section whose first paragraph summarises the note), `freeze` (the fields `lore freeze` follows), and `fields`. A field may be `required`, limited to an `enum`, or a `link` to another type, optionally `many`.

## Superseding
A note whose `supersedes` field links to another replaces it ([[0006-decisions-are-superseded-never-edited]]). `context` shows the note in force with one line of history; `show` walks the whole chain. `check` requires the old note to be `superseded`, a superseded note to have a successor and no anchors, and code to cite the note in force.

## Skills
The workflow lives in the `lore-*` skills under `skills/`, not in the CLI ([[0005-cli-owns-mechanics-skills-own-process]], [[0010-skills-ship-in-the-lore-repo-and-install-with-npx-skills]]). Each ends by naming the next step, and `lore next` names the skill for each step it reports.

## Out of scope
- An index, cache or database: every command scans the working tree ([[0003-no-index-scan-per-call]]).
- Embeddings or any network access ([[0009-no-embeddings-until-summaries-overflow]]).
- Workflow: the order of steps, and what a person or agent does at each, lives in the skills and `.lore/WORKFLOW.md`, not in the CLI ([[0005-cli-owns-mechanics-skills-own-process]]).
- Editing notes beyond what `new`, `freeze` and `init` write. lore reads Markdown; people and agents write it.
