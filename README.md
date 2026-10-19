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

No index, no database, no embeddings, no network. Every command reads the working tree, so results are never stale. lore is a slim take on the core ideas of [Rhizome](https://github.com/atomicobject/rhizome).

## Install

lore is a Nix flake. It needs [Bun](https://bun.sh) and [ripgrep](https://github.com/BurntSushi/ripgrep) at runtime; the package brings both.

```bash
nix run github:apisandipas/lore -- help
```

Or add it as a flake input and install `lore.packages.${system}.default`. While the repo is private, Nix needs a GitHub token to fetch it, for example `--option access-tokens "github.com=$(gh auth token)"`.

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

**Efforts and freezing.** An effort links the specs it was planned against and tracks its tasks as a Markdown checklist. `lore freeze` records a hash of each spec's body, and `lore check` reports when one changes, because the plan may now be stale.

## Commands

| Command | What it does |
|---|---|
| `lore context <file>...` | Notes that govern the files, ranked: code citations, symbol anchors, path anchors (most specific first), `CONTEXT.md` files, then notes one frontmatter link away. `--full` adds bodies, `--budget <tokens>` caps output (default 4000). |
| `lore show <note>` | A note with its supersede history, links out, links in, citing code, anchors and checklist progress. |
| `lore list` | Every note, one line each. `--type <type>` filters; `--summaries` adds each summary, which lets an agent find notes by meaning without embeddings. |
| `lore check` | Broken or ambiguous links and citations, anchors that match nothing, schema violations, superseding mistakes, and frozen specs that changed. Exits 1 when it finds problems. |
| `lore new <type> <title>` | Creates a note in the type's directory, numbered if the type has an `id`, from `.lore/templates/<Type>.md` if present. `--supersedes <note>` (repeatable) marks the old note superseded and moves its anchors to the new one. |
| `lore freeze <note>` | Records the current version of every spec the note links to. |

Every command except `help` and `version` takes `--json`.

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

Working now: everything above. Next: `lore next` (what to do next, read from note state), `lore init` (schema, templates and a `WORKFLOW.md`), and a set of agent skills for the flow `lore-spec` → `lore-plan` → `lore-build` → `lore-ship`, with `lore-decide` at any step.

lore's design decisions are recorded as lore notes in [`docs/decisions`](docs/decisions); `lore list --summaries` in this repo is a quick tour.

## License

Not yet chosen.
