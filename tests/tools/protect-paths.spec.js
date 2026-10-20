import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Låsen kjøres med samme JSON som Claude Code sender. Bare .claude/, docs/specs/ og tests/acceptance/ i repoet er låst.
const hook = resolve('.claude/hooks/protect-paths.sh');
const root = '/repo/Jaktlogg';
const run = (tool, input, cwd = root) => {
  const r = spawnSync('bash', [hook], {
    input: JSON.stringify({ tool_name: tool, tool_input: input, cwd }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'fri';
};
const edit = (p, cwd) => run('Write', { file_path: p }, cwd);
const bash = c => run('Bash', { command: c });

test('låser .claude/, docs/specs/ og tests/acceptance/ i repoet', () => {
  expect(edit(`${root}/.claude/settings.json`)).toBe('ask');
  expect(edit(`${root}/.claude/hooks/protect-paths.sh`)).toBe('ask');
  expect(edit(`${root}/docs/specs/fugl.md`)).toBe('ask');
  expect(edit(`${root}/tests/acceptance/fugl.spec.js`)).toBe('ask');
  expect(edit('.claude/settings.json')).toBe('ask');
  expect(edit(`${root}/scripts/../.claude/settings.json`)).toBe('ask');
  expect(edit('../.claude/settings.json', `${root}/scripts`)).toBe('ask');
});

test('låser skrivende kommandoer mot låste mapper i repoet', () => {
  expect(bash(`echo x > ${root}/.claude/settings.json`)).toBe('ask');
  expect(bash('rm .claude/hooks/lint-file.sh')).toBe('ask');
  expect(bash('sed -i "" s/a/b/ ./docs/specs/fugl.md')).toBe('ask');
  expect(bash('cp x "tests/acceptance/fugl.spec.js"')).toBe('ask');
  expect(bash('echo x > ${CLAUDE_PROJECT_DIR}/.claude/settings.json')).toBe('ask');
  expect(bash('git checkout -- .claude/settings.json')).toBe('ask');
});

test('slipper gjennom kladdemappa og andre stier utenfor repoet', () => {
  expect(edit('/Users/martin/.claude/jobs/abc/tmp/vent.sh')).toBe('fri');
  expect(edit('/Users/martin/.claude/projects/x/memory/MEMORY.md')).toBe('fri');
  expect(edit(`${root}/../annet/.claude/settings.json`)).toBe('fri');
  expect(edit('.claude/x.md', '/Users/martin')).toBe('fri');
  expect(bash('cat > /Users/martin/.claude/jobs/abc/tmp/vent.sh')).toBe('fri');
  expect(bash('rm ~/.claude/jobs/abc/tmp/merke')).toBe('fri');
});

test('slipper gjennom vanlig kode, lesing og worktrees', () => {
  expect(edit(`${root}/index.html`)).toBe('fri');
  expect(edit(`${root}/tests/e2e/ny.spec.js`)).toBe('fri');
  expect(edit(`${root}/.claude/worktrees/fugl/index.html`)).toBe('fri');
  expect(bash('cat .claude/settings.json')).toBe('fri');
  expect(bash('git diff origin/main -- docs/specs/fugl.md')).toBe('fri');
});
