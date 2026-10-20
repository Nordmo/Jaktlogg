#!/bin/bash
# /ship starter: merk økten med ship-aktiv, slik at Stop-vakten varsler Martin uansett hvordan /ship slutter.
# Linje 1 er funksjonen, linje 2 økten. Vakten varsler bare for økten som startet /ship.
input=$(cat)
prompt=$(jq -r '.prompt // empty' <<<"$input")
[[ "$prompt" =~ ^/ship([[:space:]]+([^[:space:]]+))? ]] || exit 0
name=$(basename "${BASH_REMATCH[2]:-ukjent}" .md)
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
printf '%s\n%s\n' "$name" "$(jq -r '.session_id // empty' <<<"$input")" > "$dir/ship-aktiv"
rm -f "$dir/ship-utfall"
exit 0
