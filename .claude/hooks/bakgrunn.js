#!/usr/bin/env node
// Bakgrunnsjobber som fortsatt kjører i økten: agenter (som revieweren) og Bash startet i bakgrunnen, uten at
// task-notification om at de er ferdige har kommet. Brukes av verify-before-stop.sh, så /ship ikke varsler «venter»
// mens Claude bare venter på en bakgrunnsjobb. Bruk: bakgrunn.js <transcript_path>. Skriver antallet, 0 uten transkript.
import { readFileSync } from 'node:fs';

let lines = [];
try { lines = readFileSync(process.argv[2], 'utf8').split('\n'); } catch { /* ingen transkript: ingen jobber */ }
const started = new Set(), done = new Set();
const text = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x?.text ?? '').join('') : '';
for (const line of lines) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  for (const c of Array.isArray(e.message?.content) ? e.message.content : [])
    if (c?.type === 'tool_result' && /^(Async agent launched|Command running in background)/.test(text(c.content))) started.add(c.tool_use_id);
  for (const n of JSON.stringify(e).split('<task-notification>').slice(1)) {
    const id = /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(n)?.[1], status = /<status>(\w+)<\/status>/.exec(n)?.[1];
    if (id && status && status !== 'running') done.add(id);
  }
}
process.stdout.write(`${[...started].filter(id => !done.has(id)).length}\n`);   // ikke console.log: FORCE_COLOR gir fargekoder
