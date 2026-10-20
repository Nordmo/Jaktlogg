#!/bin/bash
# Merge bare via auto-merge, slik at GitHub venter på grønn CI. Agenten får heller ikke endre porten selv.
cmd=$(jq -r '.tool_input.command // empty')
deny() { jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'; exit 0; }

if grep -qE 'gh pr merge' <<<"$cmd"; then
  grep -qE -- '--admin' <<<"$cmd" && deny "gh pr merge --admin hopper over sjekkene og er sperret."
  grep -qE -- '--auto' <<<"$cmd" || deny "Bare gh pr merge --auto --squash er lov. Da merger GitHub først når CI er grønn."
fi
# Branch protection, regelsett, Pages og repo-innstillinger endres bare av Martin.
grep -qE 'gh repo edit|gh api .*(-X|--method) *(PUT|PATCH|POST|DELETE).*(rulesets|protection|/pages|repos/[^/ ]+/[^/ ]+( |$))' <<<"$cmd" \
  && deny "Endring av GitHub-innstillinger er sperret for agenten."
exit 0
