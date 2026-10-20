#!/bin/bash
# Forutsetningene for /ship (steg 0). Bruk: scripts/ship-klar.sh docs/specs/<funksjon>.md
# Exit 0 uten utskrift når alt stemmer, ellers exit 1 og én linje per problem.
# Specen og akseptansetesten for den kan være ucommittet: /ship committer dem i låse-commiten. Alt annet må være committet.
cd "$(git rev-parse --show-toplevel)" || exit 1
spec=${1#./} name=$(basename "${1:-}" .md)
test="tests/acceptance/$name.spec.js"
problems=()
case "$spec" in docs/specs/*.md) ;; *) problems+=("${1:-(ingen spec)} ligger ikke under docs/specs/") ;; esac
if [ ! -f "$spec" ]; then problems+=("${1:-(ingen spec)} finnes ikke")
else
  grep -qE '^Status:[[:space:]]*godkjent[[:space:]]*$' "$spec" || problems+=("specen har ikke Status: godkjent")
  open=$(perl -0pe 's/<!--.*?-->//gs' "$spec" | awk '/^## /{on=($0 ~ /^## Åpne spørsmål/); next} on' | grep -v '^[[:space:]]*$')
  [ -z "$open" ] || problems+=("«Åpne spørsmål» er ikke tom")
fi
other=$(git -c core.quotePath=false status --porcelain --untracked-files=all | cut -c4- | grep -vxF -e "$spec" -e "$test")
[ -z "$other" ] || problems+=("ucommittet utenfor specen og akseptansetesten: ${other//$'\n'/, }")
[ ${#problems[@]} -eq 0 ] && exit 0
printf '%s\n' "${problems[@]}"
exit 1
