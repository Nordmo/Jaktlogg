import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Merge-vakten kjøres med samme JSON som Claude Code sender. 'deny' er sperret, 'fri' går rett gjennom.
const hook = resolve('.claude/hooks/guard-merge.js');
const bash = command => {
  const r = spawnSync('node', [hook], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'fri';
};
const alle = (svar, cmds) => { for (const c of cmds) expect.soft(bash(c), c).toBe(svar); };

test('sperrer merge uten --auto og med --admin', () => alle('deny', [
  'gh pr merge 4',
  'gh pr merge 4 --squash',
  'gh pr merge 4 --squash --delete-branch',
  'gh pr merge 4 --auto --admin --squash',
  'gh pr merge --admin 4',
  'cd /tmp && gh pr merge 4 --squash',
  'GH_TOKEN=x gh pr merge 4 --squash',
  `bash -c 'gh pr merge 4 --squash'`,
  'echo $(gh pr merge 4)',
  "bash <<'EOF'\ngh pr merge 4 --squash\nEOF",
  'eval "gh pr merge 4"',
  'timeout 900 gh pr merge 4 --squash',
  'scripts/vent.sh 900 gh pr merge 4 --squash',
  './scripts/vent.sh 60 gh pr merge --admin 4',
  'nice -n 5 gh pr merge 4',
]));

test('slipper gjennom merge med --auto', () => alle('fri', [
  'gh pr merge 4 --auto --squash --delete-branch',
  'gh pr merge --auto --squash 4',
  'gh pr checks 4 --watch --fail-fast && gh pr view 4 --json state',
  'scripts/vent.sh 450 gh pr checks 4 --watch --fail-fast',
  'gh pr merge 4 --auto --squash --delete-branch && scripts/vent.sh 450 gh pr checks 4 --watch --fail-fast',
]));

test('sperrer endring av GitHub-innstillinger', () => alle('deny', [
  'gh repo edit --enable-auto-merge=false',
  'gh api -X PUT repos/Nordmo/Jaktlogg/branches/main/protection',
  'gh api repos/Nordmo/Jaktlogg/rulesets/1 --method DELETE',
  'gh api repos/{owner}/{repo} -X PATCH -f allow_auto_merge=false',
  'gh api repos/{owner}/{repo} -F allow_auto_merge=false',
  'gh api --method=POST repos/Nordmo/Jaktlogg/pages',
]));

test('slipper gjennom lesing av GitHub-innstillinger', () => alle('fri', [
  'gh api repos/{owner}/{repo} --jq .allow_auto_merge',
  'gh api repos/{owner}/{repo}/rules/branches/main',
  'gh api -X GET repos/Nordmo/Jaktlogg/rulesets',
  'gh pr view 4 --json mergeCommit -q .mergeCommit.oid',
]));

test('slipper gjennom tekst i søk, commit-meldinger og PR-beskrivelser', () => alle('fri', [
  'grep -rn "gh pr merge" .claude/',
  `grep -qE 'gh pr merge' <<<"$cmd"`,
  `jq -r '.message' x.jsonl | grep -E "gh pr merge|--admin|gh repo edit"`,
  'gh pr create --title "Vakt" --body "Bruk aldri gh pr merge --admin eller gh repo edit"',
  `gh pr create --title "Vakt" --body "$(cat <<'EOF'\n## Merge\nStopper \`gh pr merge 4 --squash\` og \`gh api -X PUT repos/x/y/rulesets\`.\nEOF\n)"`,
  'gh pr edit 4 --body-file /tmp/body.md',
  'git commit -m "Sperr gh pr merge uten --auto"',
  'echo "gh repo edit er sperret"',
  'bash scripts/check.sh',
]));
