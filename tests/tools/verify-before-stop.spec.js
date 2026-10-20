import { test, expect } from '@playwright/test';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

// Stop-vakten kjøres i et nytt git-repo der `npm run check` alltid er rød. Exit 0 slipper Claude, 2 blokkerer.
const hook = resolve('.claude/hooks/verify-before-stop.sh');
let repo, n = 0;
const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
const put = (p, s = 'x') => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), s); };
const commit = (...paths) => { for (const p of paths) put(p, `${p} ${n++}`); git('add', '-A'); git('commit', '-qm', 'c'); };
const stop = () => {
  const id = `vakt-test-${process.pid}-${n++}`;
  const r = spawnSync('bash', [hook], { input: JSON.stringify({ session_id: id }), env: { ...process.env, CLAUDE_PROJECT_DIR: repo }, encoding: 'utf8' });
  rmSync(`/tmp/claude-verify-${id}`, { force: true });
  return r.status;
};

test.beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'vakt-'));
  git('init', '-qb', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  put('package.json', JSON.stringify({ scripts: { check: 'exit 1' } }));
  commit('index.html');
  git('switch', '-qc', 'ship/fugl');
});
test.afterEach(() => rmSync(repo, { recursive: true, force: true }));

test('slipper gjennom uten endringer', () => {
  expect(stop()).toBe(0);
});

test('blokkerer når koden er endret og sjekkene er røde', () => {
  commit('index.html');
  expect(stop()).toBe(2);
});

test('test først: slipper gjennom når bare spec og akseptansetester er endret', () => {
  commit('docs/specs/fugl.md', 'tests/acceptance/fugl.spec.js');
  expect(stop()).toBe(0);
  put('tests/acceptance/fugl.spec.js', 'endret, ikke committet');
  put('docs/specs/ny.md');
  expect(stop()).toBe(0);
});

test('test først: sjekker som før så fort noe annet også er endret', () => {
  commit('docs/specs/fugl.md', 'tests/acceptance/fugl.spec.js');
  put('index.html', 'ikke committet');
  expect(stop()).toBe(2);
  git('checkout', '--', 'index.html');
  put('tests/e2e/ny.spec.js');
  expect(stop()).toBe(2);
  rmSync(join(repo, 'tests/e2e'), { recursive: true });
  commit('docs/specs-falsk/fugl.md');
  expect(stop()).toBe(2);
});
