import { test, expect } from '@playwright/test';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

// Forutsetningene for /ship kjøres i et nytt git-repo. Godkjent spec og akseptansetesten kan være ucommittet, alt annet ikke.
const script = resolve('scripts/ship-klar.sh');
let repo;
const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
const put = (p, s = 'x') => { mkdirSync(dirname(join(repo, p)), { recursive: true }); writeFileSync(join(repo, p), s); };
const spec = (status = 'godkjent', open = '') => `# Spec: Fugl\n\nStatus: ${status}\n\n## Mål\n\nx\n\n## Åpne spørsmål\n\n<!-- Må være tomt før status settes til godkjent. -->\n${open}\n## Notater\n\ny\n`;
const klar = (p = 'docs/specs/fugl.md') => {
  const r = spawnSync('bash', [script, p], { cwd: repo, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim() };
};

test.beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'ship-klar-'));
  git('init', '-qb', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  put('index.html'); git('add', '-A'); git('commit', '-qm', 'c');
});
test.afterEach(() => rmSync(repo, { recursive: true, force: true }));

test('godkjent spec som ikke er committet er klar', () => {
  put('docs/specs/fugl.md', spec());
  expect(klar()).toEqual({ code: 0, out: '' });
  expect(klar('./docs/specs/fugl.md').code).toBe(0);
});

test('ucommittet spec og akseptansetest sammen er klar', () => {
  put('docs/specs/fugl.md', spec());
  put('tests/acceptance/fugl.spec.js');
  expect(klar().code).toBe(0);
});

test('committet godkjent spec med ren arbeidskopi er klar', () => {
  put('docs/specs/fugl.md', spec()); git('add', '-A'); git('commit', '-qm', 'spec');
  expect(klar().code).toBe(0);
});

test('endring i en committet spec er klar (status satt til godkjent etterpå)', () => {
  put('docs/specs/fugl.md', spec('utkast')); git('add', '-A'); git('commit', '-qm', 'spec');
  put('docs/specs/fugl.md', spec());
  expect(klar().code).toBe(0);
});

test('stopper for alt annet som ikke er committet', () => {
  put('docs/specs/fugl.md', spec());
  for (const [p, lag] of [
    ['index.html', () => put('index.html', 'endret')],
    ['scripts/ny.sh', () => put('scripts/ny.sh')],
    ['docs/specs/annen.md', () => put('docs/specs/annen.md', spec())],
    ['tests/acceptance/annen.spec.js', () => put('tests/acceptance/annen.spec.js')],
    ['tests/e2e/fugl.spec.js', () => put('tests/e2e/fugl.spec.js')],
    ['tests/acceptance/fugl.spec.js.bak', () => put('tests/acceptance/fugl.spec.js.bak')],
    ['docs/specs/æøå.md', () => put('docs/specs/æøå.md')],
  ]) {
    lag();
    const r = klar();
    expect.soft(r.code, p).toBe(1);
    expect.soft(r.out, p).toContain(p);
    git('reset', '-q', '--hard'); git('clean', '-qfd', '-e', 'docs/specs/fugl.md');
  }
});

test('stopper også for staget kode', () => {
  put('docs/specs/fugl.md', spec());
  put('index.html', 'endret'); git('add', 'index.html');
  expect(klar()).toEqual({ code: 1, out: 'ucommittet utenfor specen og akseptansetesten: index.html' });
});

test('stopper når specen ikke er godkjent, mangler eller har åpne spørsmål', () => {
  put('docs/specs/fugl.md', spec('utkast'));
  expect(klar()).toEqual({ code: 1, out: 'specen har ikke Status: godkjent' });
  put('docs/specs/fugl.md', spec('godkjent', '- Skal linjen vises i skymodus?\n'));
  expect(klar()).toEqual({ code: 1, out: '«Åpne spørsmål» er ikke tom' });
  expect(klar('docs/specs/finnes-ikke.md').out).toContain('docs/specs/finnes-ikke.md finnes ikke');
  put('notater/fugl.md', spec());
  expect(klar('notater/fugl.md').out).toContain('ligger ikke under docs/specs/');
});

test('skriptet er kjørbart', () => {
  expect(statSync(script).mode & 0o111).not.toBe(0);
});
