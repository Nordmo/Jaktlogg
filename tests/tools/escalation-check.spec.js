import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Eskaleringssjekken kjøres mot et lite git-repo i en temp-mappe, så vi vet at reglene treffer den faktiske diffen.
const script = resolve('scripts/escalation-check.js');
const spec = boxes => `# Spec: fugl\n\nStatus: godkjent\n\n## Berører\n\n- [${boxes.db ? 'x' : ' '}] Databaseskjema\n- [ ] Innlogging eller tilgang\n\n## Åpne spørsmål\n`;

let dir;
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
const write = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
const commit = msg => { git('add', '-A'); git('commit', '-qm', msg); };
const check = () => {
  const r = spawnSync('node', [script, 'docs/specs/fugl.md', 'main'], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.status === 2 ? r.stderr : JSON.parse(r.stdout) };
};

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eskalering-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  write('index.html', '<p>hei</p>\n');
  write('tests/e2e/a.spec.js', "test('a', () => { expect(1).toBe(1); });\n");
  commit('start');
  git('switch', '-qc', 'ship/fugl');
  write('docs/specs/fugl.md', spec({}));
  write('tests/acceptance/fugl.spec.js', "test('AK1: x', () => {});\n");
  commit('Lås spec og akseptansetester: fugl');
});
test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('vanlig endring gir ingen eskalering', () => {
  write('index.html', '<p>hei og hå</p>\n');
  commit('kode');
  expect(check()).toMatchObject({ code: 0, out: { escalate: false, treff: [] } });
});

test('SQL som ikke er krysset av i specen eskaleres som ikke varslet', () => {
  write('ny.sql', 'create table fugl (id int);\n');
  commit('kode');
  const { code, out } = check();
  expect(code).toBe(1);
  expect(out.ikkeVarslet).toContain('database');
});

test('avkrysset punkt eskalerer selv uten treff i diffen', () => {
  git('switch', '-q', 'main');
  git('branch', '-qD', 'ship/fugl');
  git('switch', '-qc', 'ship/fugl');
  write('docs/specs/fugl.md', spec({ db: true }));
  write('tests/acceptance/fugl.spec.js', "test('AK1: x', () => {});\n");
  commit('Lås spec og akseptansetester: fugl');
  const { code, out } = check();
  expect(code).toBe(1);
  expect(out.avkrysset).toEqual(['Databaseskjema']);
});

test('skippet eller svekket test eskaleres', () => {
  write('tests/e2e/a.spec.js', "test.skip('a', () => {});\n");
  commit('kode');
  const { code, out } = check();
  expect(code).toBe(1);
  expect(out.treff.map(t => t.id)).toContain('tester');
});

test('akseptansetest endret etter låsing eskaleres', () => {
  write('tests/acceptance/fugl.spec.js', "test('AK1: x', () => { /* enklere */ });\n");
  commit('kode');
  const { code, out } = check();
  expect(code).toBe(1);
  expect(out.treff.find(t => t.id === 'last').evidence.join()).toMatch(/endret etter at den ble låst/);
});

test('ny CDN-avhengighet i index.html eskaleres', () => {
  write('index.html', '<p>hei</p>\n<script src="https://unpkg.com/noe@1.0.0/x.js"></script>\n');
  commit('kode');
  expect(check().out.ikkeVarslet).toContain('avhengighet');
});

test('ucommittede endringer stopper sjekken', () => {
  write('index.html', '<p>ikke committet</p>\n');
  expect(check().code).toBe(2);
});
