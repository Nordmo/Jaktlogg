#!/bin/bash
# Push til telefonen via ntfy.sh. Bruk: scripts/ntfy.sh "<tittel>" "<melding>" [lenke] [prioritet 1-5]
# Emnet er hemmelig (repoet er offentlig): $NTFY_TOPIC, ellers .ntfy-topic i repo-roten (står i .gitignore).
# Feiler aldri: mangler emne eller nett, skrives bare en advarsel.
title=$1 msg=$2 click=${3:-} prio=${4:-3}
root=$(cd "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/.." 2>/dev/null && pwd)
topic=${NTFY_TOPIC:-$(cat "${root:-.}/.ntfy-topic" 2>/dev/null)}
if [ -z "$topic" ]; then echo "ntfy: fant ikke emne, varsel ikke sendt" >&2; exit 0; fi

jq -n --arg t "$topic" --arg ti "$title" --arg m "$msg" --arg c "$click" --argjson p "$prio" \
  '{topic: $t, title: $ti, message: $m, priority: $p, tags: ["deer"]} + (if $c == "" then {} else {click: $c} end)' \
  | curl -fsS -m 10 -o /dev/null -H 'Content-Type: application/json' -d @- https://ntfy.sh/ \
  || echo "ntfy: varsel ikke sendt" >&2
exit 0
