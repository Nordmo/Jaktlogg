#!/bin/bash
# Lås: endringer i spec, akseptansetester og .claude/ må godkjennes av Martin. Nye vanlige tester er fritt fram.
input=$(cat)
tool=$(jq -r '.tool_name' <<<"$input")
root="${CLAUDE_PROJECT_DIR:-$PWD}"
locked='(docs/specs|tests/acceptance|\.claude)/'
# Worktrees ligger under .claude/worktrees/<navn>/ og er vanlig kode, ikke låste filer.
strip() { sed -E "s#${root}/##g; s#\.claude/worktrees/[^/ ]+/##g"; }

case "$tool" in
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input" | strip)
    grep -qE "$locked" <<<"$cmd" || exit 0
    # Bare kommandoer som kan skrive eller slette. Lesing (cat, grep, git diff) slipper gjennom.
    grep -qE '>|(^|[^[:alnum:]_-])(tee|rm|mv|cp|truncate|patch|sed -i|perl -i)([^[:alnum:]_]|$)|git (checkout|restore|rm|mv|apply|stash|reset)' <<<"$cmd" || exit 0
    what="en kommando som kan endre låste filer" ;;
  *)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" | strip)
    grep -qE "^$locked" <<<"$path" || exit 0
    what="$path" ;;
esac

jq -n --arg r "Låst: $what. Spec, akseptansetester og .claude/ endres bare med Martins ja." \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
