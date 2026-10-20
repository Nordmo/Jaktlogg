import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Låsen kjøres med samme JSON som Claude Code sender. Bare .claude/, docs/specs/ og tests/acceptance/ i repoet er låst.
// 'ask' betyr at Martin får spørsmål, 'fri' at kommandoen går rett gjennom.
const hook = resolve('.claude/hooks/protect-paths.js');
const root = '/repo/Jaktlogg';
const scratch = '/private/tmp/claude-501/-repo-Jaktlogg/abc/scratchpad';
const run = (tool, input, cwd = root) => {
  const r = spawnSync('node', [hook], {
    input: JSON.stringify({ tool_name: tool, tool_input: input, cwd }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'fri';
};
const edit = (p, cwd) => run('Write', { file_path: p }, cwd);
const bash = c => run('Bash', { command: c });
const alle = (svar, cmds) => { for (const c of cmds) expect.soft(bash(c), c).toBe(svar); };

test('låser .claude/, docs/specs/ og tests/acceptance/ i repoet', () => {
  expect(edit(`${root}/.claude/settings.json`)).toBe('ask');
  expect(edit(`${root}/.claude/hooks/protect-paths.js`)).toBe('ask');
  expect(edit(`${root}/docs/specs/fugl.md`)).toBe('ask');
  expect(edit(`${root}/tests/acceptance/fugl.spec.js`)).toBe('ask');
  expect(edit('.claude/settings.json')).toBe('ask');
  expect(edit(`${root}/scripts/../.claude/settings.json`)).toBe('ask');
  expect(edit('../.claude/settings.json', `${root}/scripts`)).toBe('ask');
  expect(edit(`${root}/.claude/worktrees/fugl/docs/specs/fugl.md`)).toBe('ask');
});

test('slipper gjennom kladdemappa og andre stier utenfor repoet', () => {
  expect(edit('/Users/martin/.claude/jobs/abc/tmp/vent.sh')).toBe('fri');
  expect(edit('/Users/martin/.claude/projects/x/memory/MEMORY.md')).toBe('fri');
  expect(edit(`${root}/../annet/.claude/settings.json`)).toBe('fri');
  expect(edit('.claude/x.md', '/Users/martin')).toBe('fri');
  expect(edit(`${root}/index.html`)).toBe('fri');
  expect(edit(`${root}/tests/e2e/ny.spec.js`)).toBe('fri');
  expect(edit(`${root}/.claude/worktrees/fugl/index.html`)).toBe('fri');
});

test('stopper > og >> til låste filer', () => alle('ask', [
  'echo x > .claude/settings.json',
  'echo x >> docs/specs/fugl.md',
  'printf x 1> tests/acceptance/fugl.spec.js',
  'npm run check &> .claude/logg.txt',
  `echo x > ${root}/.claude/settings.json`,
  'echo x > ${CLAUDE_PROJECT_DIR}/.claude/settings.json',
  'echo x > "./docs/specs/fugl.md"',
  "cat > .claude/hooks/ny.sh <<'EOF'\necho hei\nEOF",
  'echo x > $(echo .claude/settings.json)',
  '(echo a; echo b) > tests/acceptance/fugl.spec.js',
]));

test('stopper sed -i, tee, cp, mv og rm på låste filer', () => alle('ask', [
  'sed -i "" s/a/b/ ./docs/specs/fugl.md',
  "sed -i.bak 's/a/b/' .claude/settings.json",
  'sed -E -i "" -e s/a/b/ tests/acceptance/fugl.spec.js',
  "perl -pi -e 's/a/b/' .claude/settings.json",
  'echo x | tee .claude/settings.json',
  'tee -a docs/specs/fugl.md < /tmp/x',
  'cp x "tests/acceptance/fugl.spec.js"',
  'cp /tmp/ny.sh .claude/hooks/',
  'mv /tmp/fugl.md docs/specs/fugl.md',
  'mv .claude/hooks/lint-file.sh /tmp/',
  'rm .claude/hooks/lint-file.sh',
  'rm -rf tests/acceptance',
  'rm -rf docs',
  'git checkout -- .claude/settings.json',
  'git restore docs/specs/fugl.md',
  'git rm tests/acceptance/fugl.spec.js',
  'git checkout -- .',
  'find .claude -name "*.sh" -delete',
  'npx prettier --write .claude/hooks/ship-start.sh',
  'scripts/vent.sh 60 rm .claude/hooks/lint-file.sh',
  'timeout 60 sed -i "" -e s/a/b/ docs/specs/fugl.md',
]));

// macOS-sed: -i tar et eget argument (tomt '' eller ""), og skriptet kan stå bak -e, alene eller klistret på.
const MAC_SED = f => [
  `sed -i '' 's/a/b/' ${f}`,
  `sed -i "" 's/a/b/' ${f}`,
  `sed -i '' -e 's/a/b/' ${f}`,
  `sed -i -e 's/a/b/' ${f}`,
  `sed -i '' -e 's/^Status: utkast$/Status: godkjent/' ${f}`,
  `sed -i '' -e 's/^Status: utkast$/Status: godkjent/' -e 's/^Godkjent av: –$/Godkjent av: Martin/' ${f}`,
  `sed -i '' -es/a/b/ ${f}`,
  `sed -i '' -e's/a/b/' ${f}`,
  `sed -i -es/a/b/ ${f}`,
  `sed -i'' -e 's/a/b/' ${f}`,
  `sed -i '' -n -e 's/a/b/p' ${f}`,
  `sed -i '' -ne 's/a/b/p' ${f}`,
  `sed -Ei '' -e 's/a/b/' ${f}`,
  `sed -i '' -E -e 's/a/b/' ${f}`,
  `sed -e 's/a/b/' -i '' ${f}`,
  `sed -i '' -f /tmp/x.sed ${f}`,
  `sed -i '' --expression='s/a/b/' ${f}`,
  `sed -i '' -e 's/a/b/' index.html ${f}`,
  `sed -i '' -e 's/a/b/' -- ${f}`,
  `/usr/bin/sed -i '' -e 's/a/b/' ${f}`,
  `git status --porcelain && sed -i '' -e 's/a/b/' ${f} && sed -n 3,4p ${f}`,
];

test('stopper alle macOS-varianter av sed -i på låste filer', () => alle('ask',
  ['docs/specs/fugl.md', 'tests/acceptance/fugl.spec.js', '.claude/settings.json', `${root}/docs/specs/fugl.md`].flatMap(MAC_SED)));

test('slipper gjennom de samme sed -i-variantene på ulåste filer', () => alle('fri', MAC_SED('index.html')));

test('stopper kode som åpner en låst fil for skriving', () => alle('ask', [
  `python3 -c "open('.claude/settings.json', 'w').write('{}')"`,
  `node -e "require('fs').writeFileSync('docs/specs/fugl.md', '')"`,
  "python3 - <<'EOF'\nfrom pathlib import Path\nPath('tests/acceptance/fugl.spec.js').write_text('')\nEOF",
  "node --input-type=module <<'EOF'\nimport { rmSync } from 'node:fs';\nrmSync('.claude/settings.json');\nEOF",
  `perl -e 'open(my $f, ">", ".claude/settings.json")'`,
]));

test('spør når den er i tvil', () => alle('ask', [
  'cd .claude/hooks && rm lint-file.sh',
  `bash -c 'echo x > .claude/settings.json'`,
  'eval "rm docs/specs/fugl.md"',
  'ls .claude/hooks | xargs rm',
  'for f in docs/specs/*.md; do sed -i "" s/a/b/ "$f"; done',
  'rm -rf "$DIR/.claude"',
  'cat docs/specs/fugl.md | python3',
  'rm -rf *',
]));

test('slipper gjennom lesing, også med 2>/dev/null', () => alle('fri', [
  'cat .claude/settings.json',
  'cat .claude/settings.json 2>/dev/null',
  'ls -la .claude/hooks 2>/dev/null',
  'grep -rn låst docs/specs tests/acceptance 2>/dev/null',
  'head -20 docs/specs/fugl.md 2>/dev/null; tail -5 tests/acceptance/fugl.spec.js 2>&1',
  'cat .claude/settings.json | jq .hooks',
  'git diff origin/main -- docs/specs/fugl.md',
  'git log --oneline -- .claude/ docs/specs/',
  'git add .claude/hooks/ship-start.sh docs/specs/fugl.md && git commit -m "Lås spec"',
  'cp docs/specs/fugl.md /tmp/fugl.md',
  `python3 -c "print(open('.claude/settings.json').read())"`,
  `node -e "console.log(require('fs').readFileSync('.claude/settings.json', 'utf8'))"`,
  'find .claude -name "*.sh" -exec grep -l ntfy {} +',
  'cat .claude/settings.json | python3 -m json.tool',
]));

test('slipper gjennom kjøring av tester og vakt-skript i låste mapper', () => alle('fri', [
  'npx playwright test tests/acceptance/fugl.spec.js',
  'npx playwright test tests/acceptance/ --output=test-results 2>&1 | tail -20',
  'bash .claude/hooks/verify-before-stop.sh < /tmp/inn.json',
  `echo '{"tool_name":"Bash","tool_input":{"command":"rm .claude/x"}}' | .claude/hooks/protect-paths.js`,
  `CLAUDE_PROJECT_DIR=/tmp/x bash .claude/hooks/ship-start.sh <<< '{"prompt":"/ship docs/specs/fugl.md"}'`,
  `node .claude/hooks/protect-paths.js <<'EOF'\n{"tool_input":{"command":"echo x > .claude/settings.json"}}\nEOF`,
  'node scripts/escalation-check.js docs/specs/fugl.md origin/main',
  'npx eslint .claude/hooks/protect-paths.js',
]));

test('slipper gjennom skriving til ulåste filer selv om en låst sti står et annet sted', () => alle('fri', [
  'grep -c ntfy .claude/settings.json > index.html',
  "sed -i '' 's#docs/specs/#x#' index.html",
  'echo "se .claude/settings.json" >> index.html',
  'cat docs/specs/fugl.md tests/acceptance/fugl.spec.js > /tmp/samlet.txt',
  'echo x > index.html # .claude/settings.json',
  'cp .claude/settings.json tests/e2e/kopi.json',
]));

test('slipper gjennom rm i /tmp og kladdemappa', () => alle('fri', [
  'rm -rf /tmp/vakt-123 2>/dev/null; cat .claude/settings.json',
  `rm -f ${scratch}/bevis.sh && ls .claude`,
  'rm /Users/martin/.claude/jobs/abc/tmp/merke',
  'rm ~/.claude/jobs/abc/tmp/merke',
  'cat > /Users/martin/.claude/jobs/abc/tmp/vent.sh',
  'rm -f "$TMPDIR/x" && cat docs/specs/fugl.md',
  'rm -f *.log',
]));

test('slipper gjennom tekst i PR-beskrivelser', () => alle('fri', [
  'gh pr create --title "Lås" --body "Låsen stopper nå rm .claude/x og echo x > docs/specs/y"',
  `gh pr create --title "Lås" --body "$(cat <<'EOF'\n## Låsen\nStopper \`echo x > .claude/settings.json\` og \`rm -rf tests/acceptance\`.\n(se AK1)\nEOF\n)"`,
  `git commit -m "Stopp sed -i på docs/specs/ og mv til .claude/"`,
  `gh pr comment 4 --body 'cp x .claude/hooks/ blir stoppet'`,
]));
