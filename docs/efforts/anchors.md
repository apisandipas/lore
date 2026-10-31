---
type: Effort
status: active
specs: ["[[spec/lore-cli]]"]
issue: https://github.com/apisandipas/lore/issues/4
frozen:
  docs/specs/lore-cli.md: 070fd8a2df57
---
# Anchors

One module says which files an anchor governs, so listing an anchor's files and testing one file against it cannot disagree, and no caller parses anchor syntax (#4).

## Approach

`src/anchor.ts` parses an anchor once into its `kind` (path, glob or symbol), its cleaned `name`, `files()`, `covers(file)` and `specificity`. Graph builds them from the repo's files and tree and caches them per graph (no index, lore:decision/0003); `g.anchor(text)` replaces `anchorFiles`, `anchorMatches` and `anchorSpecificity`. `note.anchors` stays strings. A symbol's files are still listed with rg and one file still tested with a regex, the fast path `context --session` needs; the regex now treats letters and digits in any script as word characters, as `rg -w` does, so the two agree. Ranking and its wording stay in `context`.

## Tasks

- [x] Add `src/anchor.ts` with `kind`, `name`, `files()`, `covers(file)` and `specificity`; Graph exposes `anchor(text)` and drops `anchorFiles`, `anchorMatches` and `anchorSpecificity`; check, show and context use it and no caller slices `symbol:` or normalises a path; tests pass
- [x] `covers()` matches symbol words as `rg -w` does in any script; the agreement test runs through the Anchor interface and includes a symbol beside a non-ASCII letter
- [x] CONTEXT.md describes `src/anchor.ts`; `lore check` and the tests pass; nothing user-visible beyond the fix, so `site/` stays as it is unless a check says otherwise
