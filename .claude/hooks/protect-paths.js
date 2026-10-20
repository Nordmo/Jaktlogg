#!/usr/bin/env node
// Lås: endringer i spec, akseptansetester og .claude/ må godkjennes av Martin. Nye vanlige tester er fritt fram.
// Bare mappene inne i repoet er låst, ikke ~/.claude/. Worktrees under .claude/worktrees/<navn>/ er vanlig kode.
// Bash tolkes: låsen spør bare når noe skrives til, flyttes inn i eller slettes fra en låst mappe. Lesing, kjøring
// av skript og tester, og tekst i argumenter (PR-beskrivelser) slipper gjennom. Kan et mål ikke tolkes, og en låst
// sti står i kommandoen, spør den.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { lex, lit } from './shell-lex.js';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const start = input.cwd || root;
const LOCKED = [['docs', 'specs'], ['tests', 'acceptance'], ['.claude']];
// En låst sti nevnt i teksten (ikke ~/.claude/ eller /annen/mappe/.claude/)
const MENTION = /(^|[^\w~/.-])(\.\/)?(docs\/specs|tests\/acceptance|\.claude)\b/;
const norm = s => lit(s).split(`${root}/`).join('').replace(/\$\{?CLAUDE_PROJECT_DIR\}?\//g, '').replace(/\.claude\/worktrees\/[^/\s'"]+\//g, '');

/* ---------- stier ---------- */
const glob = (p, n) => !/[*?[]/.test(p) ? p === n : (n[0] !== '.' || p[0] === '.')
  && new RegExp(`^${p.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(n);
const VARS = { HOME: homedir(), CLAUDE_PROJECT_DIR: root, TMPDIR: '/tmp' }, SET = {};   // SET: X=... satt tidligere i kommandoen
const expand = (w, cwd) => {
  w = w.replace(/^~(?=\/|$)/, homedir()).replace(/\$(?:\{(\w+)\}|(\w+))/g, (m, a, b) => (a ?? b) === 'PWD' && cwd ? cwd : VARS[a ?? b] ?? SET[a ?? b] ?? m);
  return /[$\0]/.test(w) || (cwd == null && !isAbsolute(w)) ? null : lit(w);
};
// 'inn': i en låst mappe. 'over': en mappe som har en låst mappe i seg. 'ukjent': kan ikke tolkes.
function where(w, cwd, raw = false) {
  const p = raw ? w : expand(w, cwd);
  if (p == null) return 'ukjent';
  let r = relative(root, resolve(cwd ?? '/', p));
  if (r === '..' || r.startsWith('../') || isAbsolute(r)) return null;
  r = r.replace(/^\.claude\/worktrees\/[^/]+(\/|$)/, '');
  const s = r ? r.split('/') : [];
  if (LOCKED.some(L => s.length >= L.length && L.every((n, i) => glob(s[i], n)))) return 'inn';
  if (LOCKED.some(L => s.length < L.length && s.every((x, i) => glob(x, L[i])))) return 'over';
  return null;
}

/* ---------- kommandoer ---------- */
const PREFIX = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'time', 'sudo', 'command', 'builtin', 'exec', 'nohup', 'stdbuf']);
const SKIP = new Set(['for', 'case', 'select', 'function', 'fi', 'done', 'esac']);
const SHELLS = /^(ba|z|da|k)?sh$/;
const INTERP = /^(python[\d.]*|node|deno|bun|ruby|perl|php)$/;
const WRITERS = /^(rm|rmdir|unlink|shred|mv|cp|ln|install|rsync|tee|touch|mkdir|truncate|chmod|chown|dd|g?sed|perl|patch)$/;
// Kode som skriver, sletter eller starter andre prosesser. Står en låst sti i samme kode, spør låsen.
const WRITES = new RegExp([
  String.raw`\bopen(Sync)?\s*\([^)]*?,\s*(mode\s*=\s*)?['"][^'"]*[wax+>]`, String.raw`(?<!std(out|err))\.write\s*\(`,
  String.raw`\b(write|append)(File|FileSync)?\b`, String.raw`write_(text|bytes)`, 'createWriteStream',
  String.raw`\b(rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|rename|renameSync|copyFile|copyFileSync|cp|cpSync|mkdir|mkdirSync|truncate|truncateSync|chmod|chmodSync|symlink|symlinkSync|touch|rmtree|makedirs)\b`,
  String.raw`\bos\.(remove|replace)`, String.raw`shutil\.`, String.raw`File\.(write|open|delete|rename)`, 'FileUtils',
  'subprocess', 'child_process', String.raw`\bsystem\s*\(`, String.raw`\b(exec|execSync|spawn|spawnSync)\s*\(`,
].join('|'));

function check(cmds, cwd, mentioned) {
  let hit = null;
  const flag = w => { hit ??= norm(w === '\0' || w.includes('\0') ? 'ukjent mål' : w); };
  // Ukjent mål ($DIR/.claude, $(...)): spør hvis målet selv eller kommandoen nevner en låst mappe
  const doubt = w => mentioned || /(^|\/)(docs\/specs|tests\/acceptance|\.claude)(\/|$)/.test(w);
  const write = (w, dir = cwd) => { const h = where(w, dir); if (h === 'inn' || (h === 'ukjent' && doubt(w))) flag(w); };
  const remove = (w, dir = cwd) => { const h = where(w, dir); if (h === 'inn' || h === 'over' || (h === 'ukjent' && doubt(w))) flag(w); };
  const nested = src => { hit ??= check(lex(lit(src)).cmds, cwd, mentioned); };
  for (const { words, redirs, docs, strs } of cmds) {
    for (const r of redirs) if (r.op.includes('>')) write(r.target);
    const w = words.slice();
    let piped = false;   // xargs: argumentene kommer fra stdin og er ukjente
    while (w.length) {
      const h = w[0];
      if (PREFIX.has(h) || /^[A-Za-z_]\w*=/.test(h)) w.shift();
      else if (h === 'env') { w.shift(); while (w.length && (w[0].startsWith('-') || /^\w+=/.test(w[0]))) w.shift(); }
      else if (h === 'nice' || h === 'timeout') { w.shift(); while (w.length && /^(-|[\d.]+[smhd]?$)/.test(w[0])) w.shift(); }
      else if (h === 'xargs') { w.shift(); piped = true; while (w.length && w[0].startsWith('-')) w.splice(0, /^-[IinPLdEsa]$/.test(w[0]) ? 2 : 1); }
      else break;
    }
    if (!w.length && words.length) for (const a of words) { const [n, v] = [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]; SET[n] = expand(v, cwd) ?? undefined; }
    if (!w.length || SKIP.has(w[0])) continue;
    const name = basename(w[0]), args = w.slice(1), dd = args.indexOf('--');
    const files = args.filter((a, k) => a !== '' && k !== dd && ((dd >= 0 && k > dd) || !a.startsWith('-')));
    const opt = (...names) => args.flatMap((a, k) => names.includes(a) ? [args[k + 1] ?? ''] : names.filter(n => n.startsWith('--') && a.startsWith(`${n}=`)).map(n => a.slice(n.length + 1)));
    if (piped && WRITERS.test(name) && mentioned) flag('\0');
    if (name === 'cd' || name === 'pushd') {
      const p = expand(files[0] ?? '~', cwd);
      cwd = p == null || (cwd == null && !isAbsolute(p)) ? null : resolve(cwd ?? '/', p);
    }
    else if (/^(rm|rmdir|unlink|shred|trash|mv)$/.test(name)) files.forEach(a => remove(a));
    else if (/^(cp|ln|install|rsync|ditto|scp)$/.test(name)) { const t = opt('-t', '--target-directory'); if (t.length) t.forEach(a => write(a)); else if (files.length) write(files.at(-1)); }
    else if (/^(tee|touch|mkdir|truncate|chmod|chown|chgrp|chflags|xattr|setfacl|patch)$/.test(name)) files.forEach(a => write(a));
    else if (name === 'dd') args.filter(a => a.startsWith('of=')).forEach(a => write(a.slice(3)));
    else if (/^g?sed$/.test(name)) {   // uten -e/-f er første argument skriptet, ikke en fil. -es/a/b/ og -ne er også -e
      if (args.some(a => /^-[^-]*i/.test(a) || a.startsWith('--in-place'))) { const sc = opt('-e', '-f', '--expression', '--file'), own = sc.length || args.some(a => /^-[^-]*[ef]/.test(a)); files.filter(a => !sc.includes(a)).slice(own ? 0 : 1).forEach(a => write(a)); }
    }
    else if (/^(tar|bsdtar|unzip)$/.test(name)) opt('-C', '--directory', '-d').forEach(a => write(a));
    else if (/^(curl|wget)$/.test(name)) opt('-o', '--output', '-O', '--output-document').forEach(a => write(a));
    else if (name === 'find') {
      const k = args.findIndex(a => /^[-(!]/.test(a)), roots = k < 0 ? args : args.slice(0, k);
      if (args.includes('-delete') || args.some((a, j) => /^-(exec|execdir|ok|okdir)$/.test(a) && WRITERS.test(basename(args[j + 1] ?? '')))) (roots.length ? roots : ['.']).forEach(a => remove(a));
    }
    else if (name === 'git') {
      let k = 0, dir = cwd;
      while (k < args.length && args[k].startsWith('-')) { if (args[k] === '-C') dir = resolve(dir ?? '/', expand(args[++k] ?? '', dir) ?? '\0'); else if (args[k] === '-c') k++; k++; }
      const sub = args[k], rest = args.slice(k + 1).filter(a => a !== '' && !a.startsWith('-'));
      if (/^(checkout|restore|rm|mv|clean|stash|apply|am|reset|checkout-index|update-index)$/.test(sub)) rest.forEach(a => remove(a, dir));
      if (sub === 'clean' && !rest.length && !args.some(a => a === '-n' || a === '--dry-run')) remove('.', dir);
    }
    else if (name === 'eval') nested(args.join(' '));
    else if (SHELLS.test(name) || INTERP.test(name)) {
      // Inline kode (-c, -e ...) og heredoc/stdin uten skriptfil tolkes. Kjøring av en skriptfil slipper gjennom.
      const code = [];
      let script = null;
      for (let k = 0; k < args.length && script == null; k++) {
        const a = args[k];
        if (SHELLS.test(name) ? /^-[a-z]*c[a-z]*$/.test(a) : /^(-c|-e|-E|-p|--eval|--print)$/.test(a)) code.push(args[++k] ?? '');
        else if (a === '-m') script = args[k + 1] ?? '';
        else if (!a.startsWith('-')) script = a;
      }
      if (script == null) code.push(...docs, ...strs);
      code.splice(0, code.length, ...code.map(lit));
      if (SHELLS.test(name)) code.forEach(nested);
      else {
        if (/^(perl|ruby)$/.test(name) && args.some(a => /^-[a-zA-Z]*i/.test(a))) files.forEach(a => write(a));
        if (code.some(s => MENTION.test(norm(s)) && WRITES.test(s))) flag(norm(code.join(' ')).match(MENTION)[0].trim());
        if (script == null && !code.length && mentioned) flag('\0');   // kode fra en pipe: kan ikke leses
      }
    }
    else {
      opt('--output', '--out-file', '--outfile').forEach(a => write(a));
      if (args.some(a => /^--(write|fix|in-place)$/.test(a))) files.forEach(a => write(a));
    }
  }
  return hit;
}

/* ---------- svar ---------- */
let hit = null;
if (input.tool_name === 'Bash') {
  const command = input.tool_input?.command ?? '';
  hit = check(lex(command).cmds, start, MENTION.test(norm(command)));
} else {
  const p = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (p && where(p, start, true) === 'inn') hit = relative(root, resolve(start, p));
}
if (hit) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask',
    permissionDecisionReason: `Låst: ${hit}. Spec, akseptansetester og .claude/ endres bare med Martins ja.` } }));
}
