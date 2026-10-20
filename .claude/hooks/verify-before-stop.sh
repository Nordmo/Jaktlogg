#!/bin/bash
# Stop-vakt: Claude får ikke avslutte før `npm run check` er grønn. Gir opp etter 3 forsøk og skriver ESCALATION.md.
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
session=$(jq -r '.session_id' <<<"$input")
counter="/tmp/claude-verify-$session"

# Commits som ikke er på main ennå (egen branch, eller main som ikke er pushet)
base=origin/main; git rev-parse -q --verify "$base" >/dev/null || base=main
ahead=$(git rev-list --count "$base..HEAD" 2>/dev/null || echo 0)

# Ingen endringer i arbeidskopien og ingen nye commits: ingenting å verifisere
if git diff --quiet HEAD && [ -z "$(git ls-files --others --exclude-standard)" ] && [ "$ahead" -eq 0 ]; then
  rm -f "$counter"; exit 0
fi

if output=$(npm run check 2>&1); then
  rm -f "$counter"; exit 0          # grønt: Claude får stoppe
fi

n=$(( $(cat "$counter" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$counter"
if [ "$n" -ge 3 ]; then
  rm -f "$counter"
  printf '# Eskalering\n\nSjekker feiler etter 3 forsøk.\n\n```\n%s\n```\n' "$(tail -n 60 <<<"$output")" > ESCALATION.md
  exit 0                            # la Claude stoppe, mennesket tar over
fi

echo "Sjekker feilet (forsøk $n av 3). Fiks dette før du avslutter:" >&2
tail -n 60 <<<"$output" >&2
exit 2                              # blokker stopp, Claude fortsetter
