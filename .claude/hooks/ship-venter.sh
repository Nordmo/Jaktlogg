#!/bin/bash
# Notification (permission_prompt): Claude venter på Martins ja. Varsler bare når /ship kjører i denne økten,
# slik at Martin ikke får push for vanlige spørsmål mens han sitter ved maskinen.
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
marker="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)/ship-aktiv"
[ -f "$marker" ] || exit 0
s=$(sed -n 2p "$marker"); [ -z "$s" ] || [ "$s" = "$(jq -r '.session_id' <<<"$input")" ] || exit 0
scripts/ntfy.sh "Jaktlogg: /ship $(head -n 1 "$marker") venter på ja" "$(jq -r '.message // "Claude trenger tillatelse."' <<<"$input")" "" 4
exit 0
