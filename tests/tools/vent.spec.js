import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// scripts/vent.sh er tidsgrensen /ship bruker i stedet for GNU timeout, som ikke finnes på macOS.
const vent = (...a) => { const t = Date.now(), r = spawnSync('bash', [resolve('scripts/vent.sh'), ...a], { encoding: 'utf8' }); return { code: r.status, out: r.stdout.trim(), s: (Date.now() - t) / 1000 }; };

test('stopper kommandoen når tiden er ute, med exit 124', () => {
  const r = vent('1', 'sleep', '30');
  expect(r.code).toBe(124);
  expect(r.s).toBeLessThan(5);
});

test('gir kommandoens egen exit og utdata når den blir ferdig i tide', () => {
  expect(vent('10', 'bash', '-c', 'echo hei; exit 3')).toMatchObject({ code: 3, out: 'hei' });
  expect(vent('10', 'true').code).toBe(0);
  expect(vent('10', 'echo', 'rask').s).toBeLessThan(2);
});

test('avviser ugyldig tidsgrense', () => {
  expect(vent('x', 'true').code).toBe(2);
});

// Hooks, /ship og skript skal kjøre likt på Mac og i GitHub Actions. Ingen av disse finnes på macOS.
const LINUX = [
  [/(^|[\s;&|(`$]|&&)timeout\s+-?[\w.]*\d/m, 'timeout (bruk scripts/vent.sh)'],
  [/\breadlink\s+-[a-z]*f/, 'readlink -f'], [/\bdate\s+(-d|--date)\b/, 'date -d'], [/\bgrep\s+-[a-zA-Z]*P/, 'grep -P'],
  [/\bstat\s+-c\b/, 'stat -c'], [/\bxargs\s+-[a-z]*r/, 'xargs -r'], [/\b(sha256sum|md5sum|nproc|tac|setsid)\b/, 'GNU-verktøy'],
  [/\b(mapfile|readarray|declare\s+-A)\b/, 'bash 4 (macOS har bash 3.2)'],
];
const files = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });

test('ingen Linux-kommandoer i .claude/ og scripts/', () => {
  // Vaktene tolker ordet timeout i kommandoer, men kjører det ikke
  for (const f of [...files('.claude'), ...files('scripts')].filter(f => /\.(sh|md)$/.test(f) && !f.includes('worktrees'))) {
    const s = readFileSync(f, 'utf8').replace(/`timeout`/g, '');
    for (const [re, what] of LINUX) expect.soft(re.test(s), `${f}: ${what}`).toBe(false);
  }
});
