# lore

Typed project notes linked to the code they govern. Documentation, with examples: **[apisandipas.github.io/lore](https://apisandipas.github.io/lore/)**.

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

With Homebrew, on macOS or Linux (brings ripgrep too):

```bash
brew install apisandipas/lore/lore
```

Or install the standalone binary (no Bun or Node needed) into `~/.local/bin`:

```bash
curl -fsSL https://apisandipas.github.io/lore/install.sh | sh
```

lore also needs [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`): `brew install ripgrep`, `apt install ripgrep`, or your package manager's. `LORE_VERSION=v0.1.0-alpha.5` picks a release and `LORE_INSTALL_DIR` the directory. Windows and the other builds are on the [releases page](https://github.com/apisandipas/lore/releases); run the script again to upgrade.

With Nix, the flake brings Bun and ripgrep itself:

```bash
nix run github:apisandipas/lore -- help
```

Or add it as a flake input and install `lore.packages.${system}.default`.

For development, `nix develop` gives you `bun` and `rg`; `bun src/main.ts <command>` runs from source.

Then, in each repo: `lore init`, the [workflow skills](#workflow-skills), and for Claude Code the [hook](#install-1) that hands the agent its notes before it edits.

## Concepts

**Notes** are Markdown or Org files under the notes directory (`docs` by default), plus every `CONTEXT.md` in the repo. Frontmatter is optional:

```yaml
---
type: Decision
status: accepted
summary: One line shown in context output.   # default: a section or the first paragraph
aliases: [login]                              # other names that link here
anchors: [pkg/auth/**, "symbol:SessionManager"]
---
```

**Org notes** work the same, written the Org way: fields are the `#+key: value` lines at the top (`#+status: accepted`, `#+anchors: [src/items/**]`), links are `[[name]]`, `[[name][label]]` or `[[file:prd.org][the PRD]]`, and checklists are `- [ ]` and `[X]`. Both kinds can sit in one repo, and a Markdown effort can plan against an Org spec.

**Names.** A note is named by its type and filename: `spec/due-dates`, `effort/due-dates`, `decision/0007-money-is-integer-cents` (or `decision/0007`). A spec and the effort that builds it can share a filename; the type tells them apart. lore always writes names this way, and still reads a bare filename while only one note has it.

**Links** between notes use double brackets: by name, by filename, by path, by alias, or by number prefix (`0007`). Links inside frontmatter fields, such as `specs: ["[[spec/auth]]"]`, are the edges `lore context` follows.

**Citations** are how code points at a note: a comment containing `lore:` followed by the note's name, for example `// see lore:decision/0012`. Code uses this instead of double brackets because bash tests and Lua strings contain double brackets too.

**Anchors** are how a note claims code: a path (`pkg/auth`), a glob (`pkg/auth/**`), or `symbol:Name`, which matches any file using that word.

**`CONTEXT.md`** files describe the directory they sit in. Every `CONTEXT.md` above a file applies to it, nearest first.

**Superseding.** Decisions are never edited or deleted. A new decision lists the old one in `supersedes`, and the old one becomes `superseded`. `lore context` always shows the decision in force, with one line of history; `lore show` walks the whole chain.

**Efforts and freezing.** An effort links the specs it was planned against and tracks its tasks as a Markdown checklist. `lore freeze` records a hash of each spec's body, and `lore check` reports when one changes, because the plan may now be stale. Once an effort is `done` its frozen versions are history: `check` stops reporting them, and a spec that changes after all its efforts shipped shows up in `lore next` as something to plan.

## Commands

| Command | What it does |
|---|---|
| `lore init` | Writes `.lore/` with the default schema, note templates and a `WORKFLOW.md`, keeping any file already there, and tells you how to install the skills if they are missing. |
| `lore context <file>...` | Notes that govern the files, ranked: code citations, symbol anchors, path anchors (most specific first), `CONTEXT.md` files, then notes one frontmatter link away. `--full` adds bodies, `--budget <tokens>` caps output (default 4000). `--session <id>` shows only notes that session has not seen, or that changed since. |
| `lore show <note>` | A note with its supersede history, links out, links in, citing code, anchors and checklist progress. |
| `lore list` | Every note, one line each. `--type <type>` filters; `--summaries` adds each summary, which lets an agent find notes by meaning without embeddings. |
| `lore check` | Broken or ambiguous links and citations, anchors that match nothing, schema violations, superseding mistakes, and frozen specs that changed under an effort that is not `done`. Exits 1 when it finds problems. |
| `lore new <type> <title>` | Creates a note in the type's directory, numbered if the type has an `id`, from `.lore/templates/<Type>.md` if present. `--supersedes <note>` (repeatable) marks the old note superseded and moves its anchors to the new one. `--link <field>=<note>` (repeatable) fills a link field, for example `lore new Effort "Password reset" --link specs=auth`. |
| `lore set <note> <field>=<value>...` | Changes frontmatter fields in place, checking each value against the schema first: enums, types, and links that must name one note of the right type. `field+=value` adds to a list field. Superseding is left to `lore new --supersedes`. For example `lore set password-reset status=active`. |
| `lore tick <note>` | Ticks the first open checklist item and names the next one, or says every item is done. |
| `lore freeze <note>` | Records the current version of every spec the note links to. |
| `lore next` | What to do next and which `lore-*` skill does it, read from spec and effort state: a spec that changed under an effort, an effort ready to ship, the next open item, an accepted spec with no effort or changed since its efforts shipped, a draft spec. |
| `lore graph [<note>]` | Writes the notes as one self-contained HTML page, an interactive graph in the spirit of Obsidian's: notes coloured by type, links between them, the code they govern on request, and each note readable in a side panel. Prints the page's path; `--out <file>` chooses it and `--open` opens it. With a note, the page opens focused on it, `--depth <n>` links out (default 2). |

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
| `lore-graph` | Open the notes as an interactive graph in the browser, whole or around one note |

Each skill ends with a line naming the next step, and reads `.lore/WORKFLOW.md` first so a project can change the flow. In a fresh session, ask for `lore-next`.

Small work, such as a bug fix or a rename, skips the flow: no spec, no effort, just `lore context` before each edit and `lore check` after. The Size section of `.lore/WORKFLOW.md` says where the line falls, and a project can move it.

### Claude Code hook

The skills tell the agent to run `lore context` before every edit; the hook makes it happen whether or not a skill is loaded. [`hooks/claude-code.sh`](hooks/claude-code.sh) runs `lore context --session` on each file the agent reads or edits and hands it the notes that govern that file:

- **Before the agent writes.** It runs on `Read` as well as `Edit` and `Write`. Notes handed over at an edit arrive after the edit is made, so the agent writes the code once and then fixes it.
- **Once per session.** A note is shown again only if it changes, or after the conversation is compacted.
- **Silent otherwise.** Outside a repo with `.lore/`, or when `lore` or `jq` is missing, it does nothing.

`test/agent/hook-trial.sh` runs real Claude Code sessions with and without the hook to show the difference.

#### Install

It needs `lore` and `jq` on `PATH`.

**In one project**, so everyone who clones it gets the hook:

```bash
mkdir -p .claude/hooks
curl -fsSL https://raw.githubusercontent.com/apisandipas/lore/main/hooks/claude-code.sh -o .claude/hooks/lore-context.sh
chmod +x .claude/hooks/lore-context.sh
```

Then add this to `.claude/settings.json`, merging it with any `hooks` already there, and commit both files:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Read|Edit|MultiEdit|Write", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lore-context.sh" }] }
    ],
    "SessionStart": [
      { "matcher": "compact", "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/lore-context.sh" }] }
    ]
  }
}
```

**For every repo you work in**, put the script in `~/.claude/hooks/lore-context.sh` instead and add the same `hooks` to `~/.claude/settings.json`, with `~/.claude/hooks/lore-context.sh` as the command. It stays silent in repos without `.lore/`.

**Check it.** Start a new Claude Code session (hooks are read at startup) and run `/hooks`: the script should be listed under `PreToolUse` and `SessionStart`. Then ask the agent to read a file that has notes; `lore context <file>` shows which notes it should have been given.

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
| "show me the graph", or "what links to the auth spec?" | The agent opens the notes as a graph in your browser |

After the first message, it's mostly "go ahead".

</details>

## Emacs

[`editors/emacs/lore.el`](editors/emacs/lore.el) puts lore where you edit. In any file of a lore repo:

- **Sidebar.** `lore-sidebar-mode` keeps a side window listing the notes that govern the selected file, with why each matched and its summary; it follows you between buffers.
- **Follow.** `M-.` on a citation in code or a `[[link]]` in a note opens the note; `M-?` lists the code citing it and the notes linking to it. Elsewhere `M-.` is untouched.
- **Read.** Eldoc shows the summary of the note at point, and the mode line shows how many notes govern the file.
- **Write.** Completion after `[[` or `lore:` offers note names; Flymake shows `lore check` problems for the file, as saved.
- **Work.** `lore-next`, `lore-show`, `lore-check` (a compilation buffer), `lore-new`, `lore-tick` and `lore-freeze` sit on `lore-command-map`.
- **Org.** `[[lore:<id>]]` is a link type.

```elisp
(require 'lore)                 ; or the flake's packages.<system>.emacs
(global-lore-mode 1)
(keymap-global-set "C-c l" lore-command-map)
```

`bun run test:emacs` runs its tests against a real repo; `nix flake check` runs them too.

## Configuration

`.lore/schema.yml` at the repo root. Without it, lore uses the git root and `docs/`, and checks links, citations and anchors but not types.

```yaml
notes: docs
ignore: [test/fixtures/**]          # globs excluded everywhere
types:
  Spec:
    dir: docs/specs                 # notes here are Specs unless they say otherwise
    format: md                      # or org: what lore new writes, from .lore/templates/Spec.org
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
