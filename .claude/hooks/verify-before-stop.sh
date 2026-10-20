#!/bin/bash
# Stop-vakt: Claude får ikke avslutte før `npm run check` er grønn. Gir opp etter 3 forsøk og skriver ESCALATION.md.
# Unntak: er bare docs/specs/ og tests/acceptance/ endret siden main, slipper den gjennom (testene er røde med vilje).
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
session=$(jq -r '.session_id' <<<"$input")
counter="/tmp/claude-verify-$session"
# ship-start.sh lager ship-aktiv når /ship starter, og /ship skriver utfallet med scripts/ship-utfall.sh.
# Stopper Claude under /ship, varsler vakten alltid Martin: med utfallet hvis det finnes, ellers "venter".
gitdir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
marker="$gitdir/ship-aktiv" result="$gitdir/ship-utfall"
mine() { [ -n "$gitdir" ] && [ -f "$marker" ] && { s=$(sed -n 2p "$marker"); [ -z "$s" ] || [ "$s" = "$session" ]; }; }
field() { jq -r ".$1 // empty" "$result"; }
stopped() {
  mine || exit 0
  if [ -f "$result" ]; then
    scripts/ntfy.sh "$(field title)" "$(field message)" "$(field click)" "$(field priority)"
    rm -f "$marker" "$result"
  else
    scripts/ntfy.sh "Jaktlogg: /ship $(head -n 1 "$marker") venter" "Claude har stoppet før /ship var ferdig. Se i terminalen." "" 4
  fi
  exit 0
}

# Commits som ikke er på main ennå (egen branch, eller main som ikke er pushet)
base=origin/main; git rev-parse -q --verify "$base" >/dev/null || base=main
ahead=$(git rev-list --count "$base..HEAD" 2>/dev/null || echo 0)

# Ingen endringer i arbeidskopien og ingen nye commits: ingenting å verifisere
if git diff --quiet HEAD && [ -z "$(git ls-files --others --exclude-standard)" ] && [ "$ahead" -eq 0 ]; then
  rm -f "$counter"; stopped
fi

# Test først: er bare spec og akseptansetester endret siden main, er røde tester meningen
changed=$( { git diff --name-only "$(git merge-base "$base" HEAD)"; git ls-files --others --exclude-standard; } | sort -u)
if ! grep -qvE '^(docs/specs|tests/acceptance)/' <<<"$changed"; then
  rm -f "$counter"; stopped
fi

if output=$(npm run check 2>&1); then
  rm -f "$counter"; stopped          # grønt: Claude får stoppe
fi

n=$(( $(cat "$counter" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$counter"
if [ "$n" -ge 3 ]; then
  rm -f "$counter"
  printf '# Eskalering\n\nSjekker feiler etter 3 forsøk.\n\n```\n%s\n```\n' "$(tail -n 60 <<<"$output")" > ESCALATION.md
  what="Sjekkene"; if mine; then what="/ship $(head -n 1 "$marker"): sjekkene"; rm -f "$marker" "$result"; fi
  scripts/ntfy.sh "Jaktlogg: eskalering" "$what feiler etter 3 forsøk. Se ESCALATION.md." "" 4
  exit 0                            # la Claude stoppe, mennesket tar over
fi

echo "Sjekker feilet (forsøk $n av 3). Fiks dette før du avslutter:" >&2
tail -n 60 <<<"$output" >&2
exit 2                              # blokker stopp, Claude fortsetter
