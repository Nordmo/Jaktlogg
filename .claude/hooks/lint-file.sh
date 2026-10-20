#!/bin/bash
# Rask lint av filen Claude nettopp endret. Hele suiten venter til Stop.
file=$(jq -r '.tool_input.file_path // empty')
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
case "$file" in *.html|*.js) ;; *) exit 0 ;; esac
[ -f "$file" ] || exit 0

if ! output=$(npx eslint --no-warn-ignored "$file" 2>&1); then
  echo "ESLint feilet i $file:" >&2
  echo "$output" >&2
  exit 2
fi
