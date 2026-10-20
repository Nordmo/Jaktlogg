#!/bin/bash
# Utfallet av /ship. Stop-vakten sender det som varsel når Claude stopper, og rydder etterpå.
# Bruk: scripts/ship-utfall.sh "<tittel>" "<melding>" [lenke] [prioritet 1-5]. Samme argumenter som ntfy.sh.
dir=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
jq -n --arg t "$1" --arg m "$2" --arg c "${3:-}" --arg p "${4:-3}" '{title: $t, message: $m, click: $c, priority: $p}' > "$dir/ship-utfall"
# Kjørte ikke ship-start.sh, lages merket her (uten økt), så vakten likevel varsler.
[ -f "$dir/ship-aktiv" ] || echo ukjent > "$dir/ship-aktiv"
echo "Utfall lagret. Varselet sendes når du stopper."
