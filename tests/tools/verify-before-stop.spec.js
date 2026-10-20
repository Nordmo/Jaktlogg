import { test, expect } from '@playwright/test';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

// Stop-vakten kjøres i et nytt git-repo der `npm run check` alltid er rød. Exit 0 slipper Claude, 2 blokkerer.
const hook = resolve('.claude/hooks/verify-before-stop.sh');
let repo, n = 0;
const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
const put = (p, s = 'x') => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), s); };
const commit = (...paths) => { for (const p of paths) put(p, `${p} ${n++}`); git('add', '-A'); git('commit', '-qm', 'c'); };
const stop = (session) => {
  const id = session ?? `vakt-test-${process.pid}-${n++}`;
  const r = spawnSync('bash', [hook], { input: JSON.stringify({ session_id: id }), env: { ...process.env, CLAUDE_PROJECT_DIR: repo }, encoding: 'utf8' });
  if (!session) rmSync(`/tmp/claude-verify-${id}`, { force: true });
  return r.status;
};
// Varsler havner i .git/varsler i stedet for på telefonen (falsk scripts/ntfy.sh).
const varsler = () => { const f = join(repo, '.git/varsler'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : []; };
const marker = () => join(repo, '.git/ship-aktiv');
const shipStart = (prompt, session) => spawnSync('bash', [resolve('.claude/hooks/ship-start.sh')],
  { input: JSON.stringify({ prompt, session_id: session }), env: { ...process.env, CLAUDE_PROJECT_DIR: repo }, encoding: 'utf8' });
const utfall = (...a) => execFileSync(resolve('scripts/ship-utfall.sh'), a, { cwd: repo, stdio: 'pipe' });
const check = (code) => { put('package.json', JSON.stringify({ scripts: { check: `exit ${code}` } })); git('add', '-A'); git('commit', '-qm', 'c'); };

test.beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'vakt-'));
  git('init', '-qb', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  put('package.json', JSON.stringify({ scripts: { check: 'exit 1' } }));
  put('scripts/ntfy.sh', '#!/bin/bash\necho "$1|$2|$3|$4" >> "$(git rev-parse --git-dir)/varsler"\n');
  chmodSync(join(repo, 'scripts/ntfy.sh'), 0o755);
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

test('/ship merker økten når den starter, andre meldinger gjør det ikke', () => {
  shipStart('Fiks en feil i kartet', 'okt-1');
  expect(existsSync(marker())).toBe(false);
  shipStart('/ship docs/specs/fugl.md', 'okt-1');
  expect(readFileSync(marker(), 'utf8')).toBe('fugl\nokt-1\n');
});

// De fire måtene /ship kan slutte på. Hver skal gi nøyaktig ett varsel og rydde merket.
for (const [navn, tittel, lenke] of [
  ['merget og publisert', 'Jaktlogg: shippet og publisert', 'https://github.com/x/pull/9'],
  ['PR venter på at Martin merger', 'Jaktlogg: PR venter på deg', 'https://github.com/x/pull/9'],
  ['eskalering', 'Jaktlogg: trenger deg', 'https://github.com/x/pull/9'],
]) {
  test(`varsler når /ship slutter: ${navn}`, () => {
    check(0);
    shipStart('/ship docs/specs/fugl.md', 'okt-1');
    utfall(tittel, 'fugl: melding', lenke, '4');
    expect(stop('okt-1')).toBe(0);
    expect(varsler()).toEqual([`${tittel}|fugl: melding|${lenke}|4`]);
    expect(existsSync(marker())).toBe(false);
    expect(stop('okt-1')).toBe(0);
    expect(varsler()).toHaveLength(1);
  });
}

test('varsler når /ship slutter: tre røde forsøk', () => {
  commit('index.html');
  shipStart('/ship docs/specs/fugl.md', 'okt-rod');
  try {
    expect([stop('okt-rod'), stop('okt-rod')]).toEqual([2, 2]);
    expect(varsler()).toEqual([]);
    expect(stop('okt-rod')).toBe(0);
  } finally { rmSync('/tmp/claude-verify-okt-rod', { force: true }); }
  expect(varsler()).toEqual(['Jaktlogg: eskalering|/ship fugl: sjekkene feiler etter 3 forsøk. Se ESCALATION.md.||4']);
  expect(existsSync(marker())).toBe(false);
});

test('varsler «venter» når /ship stopper uten utfall, og bare for økten som startet den', () => {
  shipStart('/ship docs/specs/fugl.md', 'okt-1');
  expect(stop('okt-2')).toBe(0);
  expect(varsler()).toEqual([]);
  expect(stop('okt-1')).toBe(0);
  expect(varsler()).toEqual(['Jaktlogg: /ship fugl venter|Claude har stoppet før /ship var ferdig. Se i terminalen.||4']);
  expect(existsSync(marker())).toBe(true);
});

test('utfallet varsles selv om ship-start ikke kjørte', () => {
  utfall('Jaktlogg: /ship stoppet', 'specen er ikke godkjent', '', '4');
  expect(stop()).toBe(0);
  expect(varsler()).toEqual(['Jaktlogg: /ship stoppet|specen er ikke godkjent||4']);
});
