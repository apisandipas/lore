#!/bin/sh
# Claude Code PreToolUse hook: before an Edit or Write, show the agent the
# notes that govern the file. Silent when lore is missing or no note applies.
# ponytail: runs on every edit, so a file edited ten times shows its notes ten
# times; remember files per session_id if that costs too many tokens.
file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && command -v lore >/dev/null || exit 0
out=$(lore context --budget 1500 "$file" 2>/dev/null) || exit 0
case $out in *": no notes"*) exit 0 ;; esac
jq -n --arg ctx "$out" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
