#!/bin/sh
# Claude Code hook for lore context. Silent whenever lore has nothing to add.
#   PreToolUse (Edit, MultiEdit, Write): show the agent the notes that govern
#     the file, each once per session and again only when it changes.
#   SessionStart (compact): the agent lost what it was shown; start over.
input=$(cat)
command -v lore >/dev/null || exit 0
session=$(printf '%s' "$input" | jq -r '.session_id // empty')
[ -n "$session" ] || exit 0

case $(printf '%s' "$input" | jq -r '.hook_event_name // empty') in
SessionStart)
  cd "$(printf '%s' "$input" | jq -r '.cwd // "."')" 2>/dev/null &&
    lore context --session "$session" --forget >/dev/null 2>&1
  exit 0
  ;;
esac

file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -n "$file" ] || exit 0
# Run from the file's directory, so lore finds the repo the file is in. A file
# about to be written may be in a directory that does not exist yet.
dir=$(dirname "$file")
while [ ! -d "$dir" ]; do dir=$(dirname "$dir"); done
cd "$dir" || exit 0
# Only inside a lore repo; elsewhere lore would search whatever directory
# holds the file, which could be all of $HOME.
root=$dir
until [ -d "$root/.lore" ]; do
  [ "$root" = / ] && exit 0
  root=$(dirname "$root")
done
out=$(lore context --session "$session" --budget 1500 "$file" 2>/dev/null) || exit 0
[ -n "$out" ] || exit 0
jq -n --arg ctx "$out" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
