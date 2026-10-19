---
type: Decision
status: accepted
---
# No embeddings until summaries stop fitting in context

## Context
Embeddings find notes whose words differ from the query ("login" against "authentication"). They need a model, either a third-party API that sees your notes or a heavy local one, and a precomputed index, which conflicts with [[0003-no-index-scan-per-call]].

## Decision
No embeddings. `lore list --summaries` prints every note's title and summary so the agent can pick relevant notes itself; an `aliases:` field covers known synonyms.

## Consequences
Revisit at roughly a thousand notes. Embeddings would then be optional: a local model, vectors cached under `.lore/cache/` keyed on file hashes, never required by `context`, `show` or `check`.
