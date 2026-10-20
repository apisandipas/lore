#!/bin/sh
# Does the Claude Code hook change what a real agent writes? Runs the same task
# in a scratch repo with and without hooks/claude-code.sh, and reports whether
# each first edit followed a note the code gives no hint of.
#
#   test/agent/hook-trial.sh [trials]    (default 3)
#
# Not part of `bun test`: it runs real `claude -p` sessions, which cost money
# (about $0.20 each). Needs claude, jq and lore on PATH. Exits 1 if any hooked
# run's first edit missed the note.
set -eu
trials=${1:-3}
hook=$(cd "$(dirname "$0")/../.." && pwd)/hooks/claude-code.sh
work=$(mktemp -d)
echo "scratch: $work"

# A repo whose only clue to the money rule is a decision anchored to the code.
mkdir -p "$work/template/src/billing" "$work/template/docs/decisions"
cd "$work/template"
git init -q
lore init >/dev/null
cat > src/billing/charge.ts <<'EOF'
export function formatReceipt(lines: string[]): string {
  return lines.join("\n");
}
EOF
cat > docs/decisions/0001-money-in-cents.md <<'EOF'
---
type: Decision
status: accepted
anchors: [src/billing/**]
---
# Money is integer cents, named with a Cents suffix

Money is a whole number of cents everywhere in `src/billing`. Names that hold money end in `Cents`. Round with `Math.round` once, at the end of a calculation.
EOF
git add -A && git commit -qm init

task='Add an exported function applyDiscount to src/billing/charge.ts. It takes a price and a discount percentage and returns the discounted price. Just make the edit; no tests needed.'
run() { # dir
  (cd "$1" && claude -p "$task" --permission-mode acceptEdits \
    --allowedTools "Read Edit Write Glob Grep" --output-format json >run.json 2>err.log)
}
hooked() { # dir
  cp -r "$work/template" "$1"
  mkdir -p "$1/.claude/hooks"
  cp "$hook" "$1/.claude/hooks/lore-context.sh"
  cmd='"$CLAUDE_PROJECT_DIR"/.claude/hooks/lore-context.sh'
  jq -n --arg cmd "$cmd" '{hooks: {
    PreToolUse: [{matcher: "Read|Edit|MultiEdit|Write", hooks: [{type: "command", command: $cmd}]}],
    SessionStart: [{matcher: "compact", hooks: [{type: "command", command: $cmd}]}]}}' \
    >"$1/.claude/settings.json"
}

i=1
while [ "$i" -le "$trials" ]; do
  cp -r "$work/template" "$work/plain$i"
  hooked "$work/hooked$i"
  run "$work/plain$i" &
  run "$work/hooked$i" &
  i=$((i + 1))
done
wait

failed=0
printf '%-9s %-6s %-8s %s\n' run edits follows "first edit"
for dir in "$work"/plain* "$work"/hooked*; do
  name=$(basename "$dir")
  session=$(jq -r .session_id "$dir/run.json")
  log=$(find ~/.claude/projects -name "$session.jsonl" | head -1)
  calls=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' "$log")
  edits=$(printf '%s\n' "$calls" | grep -cE '^(Edit|MultiEdit|Write)$' || true)
  first=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and (.name=="Edit" or .name=="Write")) | (.input.new_string // .input.content)' "$log" |
    grep -m1 'function applyDiscount' | tr -s ' ' || true)
  case $first in *Cents*) follows=yes ;; *) follows=no ;; esac
  case $name:$follows in hooked*:no) failed=1 ;; esac
  printf '%-9s %-6s %-8s %s\n' "$name" "$edits" "$follows" "$first"
done
exit $failed
