# lore

Typed project notes linked to the code they govern.

Before an agent (or a person) edits a file, it should know which specs, decisions and module notes apply to it. `lore` answers that from plain Markdown in your repo:

```
$ lore context pkg/auth/session.ts
pkg/auth/session.ts: 3 notes

Rotating refresh tokens  (Decision, accepted)
  docs/decisions/0012-rotating-tokens.md
  matched: cited at session.ts:4; anchor pkg/auth/**
  Refresh tokens rotate on every use; access tokens last 15 minutes.
  supersedes 0007-hard-expiry: Every session hard-expires after 15 minutes.

Auth  (Spec, accepted)
  docs/specs/auth.md
  matched: spec of Rotating refresh tokens
  Who can sign in, how, and for how long.

Auth package
  pkg/auth/CONTEXT.md
  matched: CONTEXT.md in pkg/auth/
  Owns session issuance and validation. Never import from pkg/billing.
```

No index, no database, no embeddings, no network. Every command reads the working tree, so results are never stale.

## Install

lore is a Nix flake. It needs [Bun](https://bun.sh) and [ripgrep](https://github.com/BurntSushi/ripgrep) at runtime; the package brings both.

```bash
nix run github:apisandipas/lore -- help
```

Or add it as a flake input and install `lore.packages.${system}.default`.

For development, `nix develop` gives you `bun` and `rg`; `bun src/main.ts <command>` runs from source.

## Concepts

**Notes** are Markdown files under the notes directory (`docs` by default), plus every `CONTEXT.md` in the repo. Frontmatter is optional:

```yaml
---
type: Decision
status: accepted
summary: One line shown in context output.   # default: a section or the first paragraph
aliases: [login]                              # other names that link here
anchors: [pkg/auth/**, "symbol:SessionManager"]
---
```

**Links** between notes use double brackets: by filename, by path, by alias, or by number prefix (`0007`). Links inside frontmatter fields, such as `spec: "[[auth]]"`, are the edges `lore context` follows.

**Citations** are how code points at a note: a comment containing `lore:` followed by the note's name, for example `// see lore:0012`. Code uses this instead of double brackets because bash tests and Lua strings contain double brackets too.

**Anchors** are how a note claims code: a path (`pkg/auth`), a glob (`pkg/auth/**`), or `symbol:Name`, which matches any file using that word.

**`CONTEXT.md`** files describe the directory they sit in. Every `CONTEXT.md` above a file applies to it, nearest first.

**Superseding.** Decisions are never edited or deleted. A new decision lists the old one in `supersedes`, and the old one becomes `superseded`. `lore context` always shows the decision in force, with one line of history; `lore show` walks the whole chain.

**Efforts and freezing.** An effort links the specs it was planned against and tracks its tasks as a Markdown checklist. `lore freeze` records a hash of each spec's body, and `lore check` reports when one changes, because the plan may now be stale. Once an effort is `done` its frozen versions are history: `check` stops reporting them, and a spec that changes after all its efforts shipped shows up in `lore next` as something to plan.

## Commands

| Command | What it does |
|---|---|
| `lore init` | Writes `.lore/` with the default schema, note templates and a `WORKFLOW.md`, keeping any file already there, and tells you how to install the skills if they are missing. |
| `lore context <file>...` | Notes that govern the files, ranked: code citations, symbol anchors, path anchors (most specific first), `CONTEXT.md` files, then notes one frontmatter link away. `--full` adds bodies, `--budget <tokens>` caps output (default 4000). |
| `lore show <note>` | A note with its supersede history, links out, links in, citing code, anchors and checklist progress. |
| `lore list` | Every note, one line each. `--type <type>` filters; `--summaries` adds each summary, which lets an agent find notes by meaning without embeddings. |
| `lore check` | Broken or ambiguous links and citations, anchors that match nothing, schema violations, superseding mistakes, and frozen specs that changed under an effort that is not `done`. Exits 1 when it finds problems. |
| `lore new <type> <title>` | Creates a note in the type's directory, numbered if the type has an `id`, from `.lore/templates/<Type>.md` if present. `--supersedes <note>` (repeatable) marks the old note superseded and moves its anchors to the new one. `--link <field>=<note>` (repeatable) fills a link field, for example `lore new Effort "Password reset" --link specs=auth`. |
| `lore set <note> <field>=<value>...` | Changes frontmatter fields in place, checking each value against the schema first: enums, types, and links that must name one note of the right type. `field+=value` adds to a list field. Superseding is left to `lore new --supersedes`. For example `lore set password-reset status=active`. |
| `lore tick <note>` | Ticks the first open checklist item and names the next one, or says every item is done. |
| `lore freeze <note>` | Records the current version of every spec the note links to. |
| `lore next` | What to do next and which `lore-*` skill does it, read from spec and effort state: a spec that changed under an effort, an effort ready to ship, the next open item, an accepted spec with no effort or changed since its efforts shipped, a draft spec. |

Every command except `help` and `version` takes `--json`.

## Workflow skills

The CLI enforces mechanics; the process lives in agent skills in [`skills/`](skills), which you can edit per project.

```bash
lore init                          # .lore/ schema, templates and WORKFLOW.md
npx skills add apisandipas/lore    # the lore-* skills, per project or with -g
```

| Skill | Step |
|---|---|
| `lore-spec` | Write or revise a spec with the user until they accept it |
| `lore-plan` | Turn an accepted spec into an Effort with a task checklist, and freeze it; re-plan when the spec drifts |
| `lore-build` | Work the first open task, running `lore context` before every edit |
| `lore-ship` | Check the work against the spec, bring notes up to date, mark the effort done |
| `lore-decide` | Record a decision, or supersede one, at any step |
| `lore-next` | Run `lore next` and hand off to the skill it names |

Each skill ends with a line naming the next step, and reads `.lore/WORKFLOW.md` first so a project can change the flow. In a fresh session, ask for `lore-next`.

Small work, such as a bug fix or a rename, skips the flow: no spec, no effort, just `lore context` before each edit and `lore check` after. The Size section of `.lore/WORKFLOW.md` says where the line falls, and a project can move it.

### Claude Code hook

The skills tell the agent to run `lore context` before every edit; a hook makes it happen whether or not a skill is loaded. [`hooks/claude-code.sh`](hooks/claude-code.sh) runs `lore context` on the file an `Edit` or `Write` is about to touch and hands the notes to the agent, saying nothing when no note applies. It needs `jq`. Copy it to `.claude/hooks/lore-context.sh` and add it to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|MultiEdit|Write", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lore-context.sh" }] }
    ]
  }
}
```

<details>
<summary><b>The flow in plain English, with a small feature</b></summary>

<br>

Think of lore as a notebook that lives in your repo, with three kinds of page:

- **Spec**: what you want.
- **Effort**: the to-do list for building it.
- **Decision**: why you chose X over Y.

The agent does the writing. Your job is mostly answering questions and saying yes or no. `lore next` reads the notebook and says which step is next, so you never have to remember where you were.

Say you have a small todo app and want tasks to have due dates.

**0. Once per repo.** Run `lore init` and install the skills.

**1. Say what you want: `lore-spec`.** You say "use lore-spec, I want due dates on tasks". The agent creates `docs/specs/due-dates.md` and asks you questions. Can a task have no due date? What happens when it passes: does it turn red, does it send an email? Days only, or times too? It writes your answers down:

```markdown
## Behaviour
- A task may have a due date (a day, no time).
- Overdue tasks show in red at the top of the list.

## Out of scope
- Reminders or emails.
```

When you say it's right, the spec becomes `accepted`. `lore next` now says `lore-plan`: you know what you want, but there's no plan yet.

**2. Plan the work: `lore-plan`.** You say "go ahead". The agent reads your code and writes `docs/efforts/due-dates.md`:

```markdown
## Tasks
- [ ] Add a due_date column to tasks, with a migration
- [ ] Show a date picker when editing a task
- [ ] Sort overdue tasks first and colour them red
```

You look it over. When you agree, the agent freezes the plan, which records the exact version of the spec it was planned against. `lore next` now says `lore-build`, starting with the first task.

**3. Build it, one task at a time: `lore-build`.** You say "go ahead". For each task the agent asks lore which notes govern the files it is about to touch, follows them, does the task, runs the tests, and ticks the box. Then it does the next one, or stops if you asked for just one. The next task is always the first unticked box, so you can close the laptop at any point. Tomorrow, `lore next` tells you exactly where you were. When every box is ticked, `lore next` says `lore-ship`.

**4. Finish: `lore-ship`.** The agent checks the work against the spec: do tasks have dates, are overdue ones red? It confirms the tests and `lore check` pass, and marks the effort `done`. `lore next` now says nothing is in progress.

**If you change your mind.** Halfway through building, you decide you do want reminder emails. Edit the spec. Because the plan was frozen, lore sees that the spec changed under it, and `lore next` sends you back to `lore-plan` rather than letting the old plan carry on.

**Recording a choice: `lore-decide`.** The agent has to choose between storing dates as text or as real dates, and the reason matters. It writes a short Decision: "Due dates are stored as real dates, because sorting text dates breaks." From then on, whenever anyone is about to edit the task code, lore shows that decision first, so nobody "fixes" it back by accident.

**What you actually type:**

| You say | What happens |
|---|---|
| "use lore-spec, I want X" | The agent interviews you and writes down what you want |
| "go ahead" | The agent does the step it just named |
| "use lore-next", or "where was I?" | The agent tells you what's next |
| "yes", or "no, change Y" | You approve the spec and the plan |

After the first message, it's mostly "go ahead".

</details>

## Configuration

`.lore/schema.yml` at the repo root. Without it, lore uses the git root and `docs/`, and checks links, citations and anchors but not types.

```yaml
notes: docs
ignore: [test/fixtures/**]          # globs excluded everywhere
types:
  Spec:
    dir: docs/specs                 # notes here are Specs unless they say otherwise
    fields:
      status: { enum: [draft, accepted, retired], required: true }
  Decision:
    dir: docs/decisions
    id: "{n:4}"                     # lore new numbers these 0001, 0002, ...
    summary: Decision               # summary comes from the "## Decision" section
    fields:
      status: { enum: [proposed, accepted, superseded], required: true }
      supersedes: { link: Decision, many: true }
  Effort:
    dir: docs/efforts
    freeze: [specs]                 # fields lore freeze follows
    fields:
      specs: { link: Spec, many: true, required: true }
      status: { enum: [planned, active, done] }
```

A field can be `required`, limited to an `enum`, or a `link` to another type, optionally `many`. The first `status` value in the enum is what `lore new` starts a note with.

## Status

Working now: everything above. The skills are new and have not yet carried a real project from spec to ship.

lore's design decisions are recorded as lore notes in [`docs/decisions`](docs/decisions); `lore list --summaries` in this repo is a quick tour.

## License

[MIT](LICENSE)
