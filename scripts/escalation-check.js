// Harde eskaleringsregler for /ship. Sjekker den faktiske diffen, ikke bare "Berører"-listen i specen.
// Bruk: node scripts/escalation-check.js docs/specs/<funksjon>.md [base]
// Exit 0: ingen treff, kan shippes. Exit 1: eskaler til Martin. Exit 2: feil bruk (f.eks. ucommittede endringer).
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const fail = msg => { console.error(msg); process.exit(2); };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 }).trimEnd();
const tryGit = (...a) => { try { return git(...a); } catch { return ''; } };

const [specPath, baseArg] = process.argv.slice(2);
if (!specPath || !existsSync(specPath)) fail('Bruk: node scripts/escalation-check.js docs/specs/<funksjon>.md [base]');
const base = baseArg || (tryGit('rev-parse', '-q', '--verify', 'origin/main') ? 'origin/main' : 'main');
if (git('status', '--porcelain')) fail('Arbeidskopien har ucommittede endringer. Commit alt før sjekken.');

/* ---------- diff ---------- */
const range = `${base}...HEAD`;
const files = new Map();
for (const row of git('diff', '--name-status', '--no-renames', range).split('\n').filter(Boolean)) {
  const [status, path] = row.split('\t');
  files.set(path, { status, add: [], del: [] });
}
let cur = null, inHunk = false;
for (const line of git('diff', '--no-renames', '--unified=0', '--no-color', range).split('\n')) {
  const head = line.match(/^diff --git a\/.+ b\/(.+)$/);
  if (head) { cur = files.get(head[1]); inHunk = false; continue; }
  if (line.startsWith('@@')) { inHunk = true; continue; }
  if (!cur || !inHunk) continue;
  if (line[0] === '+') cur.add.push(line.slice(1));
  else if (line[0] === '-') cur.del.push(line.slice(1));
}

// Kode der innholdet teller. Docs og tester har egne regler.
const CODE = /^(?!docs\/|tests\/).*\.(html|js|sql|sh|json|ya?ml)$/;
const show = (p, l) => `${p}: ${l.trim().slice(0, 120)}`;
const paths = re => [...files.keys()].filter(p => re.test(p));
const lines = (re, only = CODE, which = ['add', 'del']) => [...files].filter(([p]) => only.test(p))
  .flatMap(([p, f]) => which.flatMap(k => f[k]).filter(l => re.test(l)).slice(0, 3).map(l => show(p, l)));
const count = (arr, re) => arr.filter(l => re.test(l)).length;

/* ---------- låste filer ---------- */
const name = basename(specPath, '.md');
const lockFiles = new Set([specPath, `tests/acceptance/${name}.spec.js`]);
const LOCKED = /^(docs\/specs|tests\/acceptance)\//;
function lockedHits() {
  const out = [];
  const lock = tryGit('log', '--reverse', '--format=%H %s', `${base}..HEAD`).split('\n').find(l => / Lås spec og akseptansetester/.test(l));
  if (!lock) {
    out.push(...paths(LOCKED).map(p => `${p}: endret uten låse-commit`));
  } else {
    const sha = lock.split(' ')[0];
    const before = Number(tryGit('rev-list', '--count', `${base}..${sha}~1`) || 0);
    if (before > 0) out.push(`${before} commit(s) før låse-commiten: koden kom før testene`);
    for (const p of git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n').filter(Boolean)) {
      if (!lockFiles.has(p)) out.push(`${p}: med i låse-commiten, men hører ikke til denne specen`);
    }
    for (const p of git('diff', '--name-only', sha, 'HEAD', '--', 'docs/specs', 'tests/acceptance').split('\n').filter(Boolean)) {
      out.push(`${p}: endret etter at den ble låst`);
    }
  }
  if (!existsSync(`tests/acceptance/${name}.spec.js`)) out.push(`tests/acceptance/${name}.spec.js finnes ikke`);
  return out;
}

/* ---------- regler ---------- */
// box: hvilken linje i "Berører" som varsler regelen. null betyr at regelen aldri kan varsles på forhånd.
const RULES = [
  { id: 'tilgang', title: 'Innlogging og tilgang', box: /Innlogging|tilgang/i,
    hits: () => [
      ...lines(/\bauth\.|signIn|signOut|getSession|onAuthStateChange|updateUser|access_token|\bsession\b/i),
      ...lines(/\bpolicy\b|row level security|\bgrant\b|\brevoke\b/i, /\.sql$/),
    ] },
  { id: 'database', title: 'Databaseskjema', box: /Databaseskjema|RLS/i,
    hits: () => [
      ...paths(/\.sql$/).map(p => `${p}: SQL endret`),
      ...lines(/_FIELDS|_LIST\s*=|\.from\(|storage\.|\.rpc\(/, /^index\.html$/),
    ] },
  { id: 'avhengighet', title: 'Ny avhengighet', box: /avhengighet/i,
    hits: () => [
      ...lines(/"\s*:\s*"[\^~<>=]*\d/, /^package\.json$/, ['add']),
      ...paths(/(^|\/)package-lock\.json$|(^|\/)requirements.*\.txt$/).map(p => `${p}: endret`),
      ...lines(/<script[^>]*\bsrc=|<link[^>]*\bhref=|\bimport\s*\(|https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh)/, /^index\.html$/, ['add']),
    ] },
  { id: 'nokler', title: 'Nøkler, hemmeligheter og CONFIG', box: /Nøkler|CONFIG/i,
    hits: () => [
      ...paths(/(^|\/)\.env|\.pem$|\.key$|(^|\/)\.gitleaks/).map(p => `${p}: endret`),
      ...lines(/\bCONFIG\b|sb_publishable_|sb_secret_|service_role|api[_-]?key|secret|password|token/i),
    ] },
  { id: 'kamera', title: 'Kamera, terreng og rutetegning', box: /Kamera|terreng|rutetegning/i,
    hits: () => lines(/_elevationFreeze|jumpTo|easeTo|flyTo|FreeCamera|setTerrain|terrain|route-done|route-head|poi-mk|maplibregl-marker|requestAnimationFrame|function tick\b/, /^index\.html$/) },
  { id: 'regler', title: 'Reglene agenten dømmes etter', box: /workflows|\.claude/i,
    hits: () => paths(/^\.github\/|^\.claude\/|^scripts\/|^(eslint|playwright)\.config\.|^package\.json$|^CLAUDE\.md$|^\.gitignore$|^CNAME$/).map(p => `${p}: ${files.get(p).status === 'D' ? 'slettet' : 'endret'}`) },
  { id: 'tester', title: 'Slettede, skippede eller svekkede tester', box: null,
    hits: () => [...files].filter(([p]) => /^tests\//.test(p)).flatMap(([p, f]) => [
      ...(f.status === 'D' ? [`${p}: slettet`] : []),
      ...f.add.filter(l => /\.(skip|fixme|only|fail)\s*\(|testIgnore|grepInvert/.test(l)).map(l => show(p, l)),
      ...(count(f.del, /\bexpect\s*\(/) > count(f.add, /\bexpect\s*\(/) ? [`${p}: færre expect() enn før`] : []),
      ...(count(f.del, /\btest\s*\(/) > count(f.add, /\btest\s*\(/) ? [`${p}: færre test() enn før`] : []),
    ]) },
  { id: 'last', title: 'Låst spec eller akseptansetest endret', box: null, hits: lockedHits },
];

/* ---------- spec ---------- */
const spec = readFileSync(specPath, 'utf8');
const status = (spec.match(/^Status:\s*(.+)$/m) || [])[1]?.trim() || '';
const section = (spec.split(/^## Berører/m)[1] || '').split(/^## /m)[0];
const checked = [...section.matchAll(/^- \[[xX]\]\s*(.+)$/gm)].map(m => m[1].trim());

const hits = RULES.map(r => ({ ...r, evidence: r.hits() })).filter(r => r.evidence.length).map(r => ({
  id: r.id, title: r.title,
  varslet: !!r.box && checked.some(c => r.box.test(c)),
  evidence: r.evidence.slice(0, 8),
}));
const report = {
  escalate: false, base, spec: specPath, status,
  ikkeGodkjent: !/^godkjent$/i.test(status),
  treff: hits,
  ikkeVarslet: hits.filter(h => !h.varslet).map(h => h.id),
  avkrysset: checked,
};
// Alle treff eskalerer. Avkryssede punkter eskalerer også, selv uten treff, fordi specen lover det.
report.escalate = report.ikkeGodkjent || hits.length > 0 || checked.length > 0;

console.log(JSON.stringify(report, null, 2));
process.exit(report.escalate ? 1 : 0);
