#!/usr/bin/env node
// Merge bare via auto-merge, slik at GitHub venter på grønn CI. Agenten får heller ikke endre porten selv.
// Kommandoen tolkes som i protect-paths.js: bare ekte gh-kommandoer teller, ikke tekst i søk og PR-beskrivelser.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { lex, lit } from './shell-lex.js';

const input = JSON.parse(readFileSync(0, 'utf8'));
const PREFIX = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'time', 'sudo', 'command', 'builtin', 'exec', 'nohup', 'xargs']);
// Endepunkter for branch protection, regelsett, Pages og selve repo-innstillingene
const SETTINGS = /(^|\/)(rulesets|protection)(\/|$)|\/pages(\/|$)|^\/?repos\/[^/]+\/[^/]+\/?$/;
const OPT_ARG = /^(-X|--method|-f|-F|--field|--raw-field|--input|-H|--header|-q|--jq|-t|--template|--hostname|--cache|-p|--preview)$/;
const NO_SETTINGS = 'Endring av GitHub-innstillinger er sperret for agenten.';

function check(cmds) {
  for (const { words, docs, strs } of cmds) {
    const w = words.map(lit);
    for (;;) {   // prefikser som kjører resten som en kommando: env, nice, timeout og scripts/vent.sh med tidsgrense
      if (w.length && (PREFIX.has(w[0]) || /^[A-Za-z_]\w*=/.test(w[0]))) w.shift();
      else if (w[0] === 'env') { w.shift(); while (w.length && (w[0].startsWith('-') || /^\w+=/.test(w[0]))) w.shift(); }
      else if (/^(nice|timeout|vent\.sh)$/.test(basename(w[0] ?? ''))) { w.shift(); while (w.length && /^(-|[\d.]+[smhd]?$)/.test(w[0])) w.shift(); }
      else break;
    }
    if (!w.length) continue;
    const name = basename(w[0]), args = w.slice(1);
    let why = null;
    if (/^(ba|z|da|k)?sh$/.test(name)) {
      // bash -c '...' og bash <<EOF: koden kjøres, så den sjekkes. bash skript.sh slipper gjennom.
      const k = args.findIndex(a => /^-[a-z]*c[a-z]*$/.test(a));
      const code = k >= 0 ? [args[k + 1] ?? ''] : args.some(a => !a.startsWith('-')) ? [] : [...docs, ...strs];
      for (const c of code) why ??= check(lex(c).cmds);
    }
    else if (name === 'eval') why = check(lex(args.join(' ')).cmds);
    else if (name === 'gh') {
      const pos = args.filter((a, k) => !a.startsWith('-') && !OPT_ARG.test(args[k - 1] ?? ''));
      if (pos[0] === 'pr' && pos[1] === 'merge') {
        if (args.includes('--admin')) why = 'gh pr merge --admin hopper over sjekkene og er sperret.';
        else if (!args.includes('--auto')) why = 'Bare gh pr merge --auto --squash er lov. Da merger GitHub først når CI er grønn.';
      }
      else if (pos[0] === 'repo' && pos[1] === 'edit') why = NO_SETTINGS;
      else if (pos[0] === 'api') {
        // gh api bruker POST når det sendes felt, ellers GET, med mindre -X/--method sier noe annet
        const m = args.flatMap((a, k) => a === '-X' || a === '--method' ? [args[k + 1] ?? ''] : /^(-X|--method=)./.test(a) ? [a.replace(/^(-X|--method=)/, '')] : []).at(-1)
          ?? (args.some(a => /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(a)) ? 'POST' : 'GET');
        if (/^(PUT|PATCH|POST|DELETE)$/i.test(m) && SETTINGS.test(pos[1] ?? '')) why = NO_SETTINGS;
      }
    }
    if (why) return why;
  }
  return null;
}

const why = check(lex(input.tool_input?.command ?? '').cmds);
if (why) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } }));
