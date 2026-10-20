#!/bin/bash
# Lås: endringer i spec, akseptansetester og .claude/ må godkjennes av Martin. Nye vanlige tester er fritt fram.
# Bare mappene inne i repoet er låst. ~/.claude/ og andre mapper utenfor repoet er ikke det.
input=$(cat)
tool=$(jq -r '.tool_name' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
root="${CLAUDE_PROJECT_DIR:-$PWD}"
locked='(docs/specs|tests/acceptance|\.claude)/'
# Worktrees ligger under .claude/worktrees/<navn>/ og er vanlig kode, ikke låste filer.
worktree() { sed -E 's#\.claude/worktrees/[^/ ]+/##g'; }

case "$tool" in
  Bash)
    # Stier inne i repoet gjøres relative. Låst er da en relativ sti som starter med en låst mappe:
    # først i et ord (etter mellomrom, anførselstegn, = eller omdirigering) eller etter ./
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input" \
      | sed -E "s#${root}/##g; s#\\\$\{?CLAUDE_PROJECT_DIR\}?/##g" | worktree)
    grep -qE "(^|[[:space:]\"'=<>|;&(]|\./)$locked" <<<"$cmd" || exit 0
    # Bare kommandoer som kan skrive eller slette. Lesing (cat, grep, git diff) slipper gjennom.
    grep -qE '>|(^|[^[:alnum:]_-])(tee|rm|mv|cp|truncate|patch|sed -i|perl -i)([^[:alnum:]_]|$)|git (checkout|restore|rm|mv|apply|stash|reset)' <<<"$cmd" || exit 0
    what="en kommando som kan endre låste filer" ;;
  *)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
    [ -n "$path" ] || exit 0
    case "$path" in /*) ;; *) path="${cwd:-$root}/$path" ;; esac
    path=$(python3 -c 'import os,sys; print(os.path.normpath(sys.argv[1]))' "$path")
    case "$path" in "$root"/*) path=${path#"$root"/} ;; *) exit 0 ;; esac
    path=$(worktree <<<"$path")
    grep -qE "^$locked" <<<"$path" || exit 0
    what="$path" ;;
esac

jq -n --arg r "Låst: $what. Spec, akseptansetester og .claude/ endres bare med Martins ja." \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
