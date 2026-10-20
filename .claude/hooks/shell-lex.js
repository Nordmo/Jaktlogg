// Enkel shell-lekser for vaktene: deler en Bash-kommando i enkle kommandoer slik skallet gjør.
// Brukes av protect-paths.js og guard-merge.js, så tekst i argumenter (PR-beskrivelser, søk) ikke tolkes som kommandoer.
export const lit = s => s.replaceAll('\x01', '$');   // $ i '...' er vanlig tekst og lagres som \x01

// Deler en kommando i enkle kommandoer: ord, omdirigeringer, heredocs og <<<-strenger.
// $(...), `...` og <(...) blir egne kommandoer, og står som \0 (ukjent verdi) i ordet.
export function lex(src, i = 0, sub = false) {
  const cmds = [], docs = [];
  let cmd, word = null, op = null, depth = 0;
  const next = () => { cmd = { words: [], redirs: [], docs: [], strs: [] }; cmds.push(cmd); };
  const add = s => { word = (word ?? '') + s; };
  const end = () => {
    if (word === null) return;
    if (op === '<<' || op === '<<-') docs.push({ cmd, delim: word, strip: op === '<<-' });
    else if (op === '<<<') cmd.strs.push(word);
    else if (op) cmd.redirs.push({ op, target: word });
    else cmd.words.push(word);
    word = null; op = null;
  };
  const subst = j => { const r = lex(src, j, true); cmds.push(...r.cmds); add('\0'); return r.end; };
  const tick = j => { const k = src.indexOf('`', j + 1), e = k < 0 ? src.length : k; cmds.push(...lex(src.slice(j + 1, e)).cmds); add('\0'); return e + 1; };
  const until = (j, open, close) => { let d = 0; for (; j < src.length; j++) { if (src.startsWith(open, j)) d++; else if (src.startsWith(close, j) && --d === 0) return j + close.length; } return j; };
  const dollar = j => src.startsWith('$((', j) ? (add('\0'), until(j + 1, '(', ')'))
    : src[j + 1] === '(' ? subst(j + 2)
    : src[j + 1] === '{' ? (k => (add(src.slice(j, k)), k))(until(j + 1, '{', '}'))
    : (add('$'), j + 1);
  const heredocs = j => {
    for (const d of docs.splice(0)) {
      const body = [];
      while (j < src.length) {
        const k = src.indexOf('\n', j), e = k < 0 ? src.length : k, line = src.slice(j, e);
        j = e + 1;
        if ((d.strip ? line.replace(/^\t+/, '') : line) === d.delim) break;
        body.push(line);
      }
      d.cmd.docs.push(body.join('\n'));
    }
    return j;
  };
  next();
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { if (src[i + 1] !== '\n') add(src[i + 1] ?? ''); i += 2; }
    else if (c === "'") { const k = src.indexOf("'", i + 1), e = k < 0 ? src.length : k; add(src.slice(i + 1, e).replaceAll('$', '\x01')); i = e + 1; }
    else if (c === '"') {
      add(''); i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && '"\\$`\n'.includes(src[i + 1])) { if (src[i + 1] !== '\n') add(src[i + 1]); i += 2; }
        else if (src[i] === '$') i = dollar(i);
        else if (src[i] === '`') i = tick(i);
        else add(src[i++]);
      }
      i++;
    }
    else if (c === '$' && src[i + 1] === "'") { let k = i + 2; while (k < src.length && src[k] !== "'") k += src[k] === '\\' ? 2 : 1; add(src.slice(i + 2, k).replaceAll('$', '\x01')); i = k + 1; }
    else if (c === '$') i = dollar(i);
    else if (c === '`') i = tick(i);
    else if (c === '#' && word === null) { while (i < src.length && src[i] !== '\n') i++; }
    else if (c === ' ' || c === '\t') { end(); i++; }
    else if (c === '\n') { end(); i = heredocs(i + 1); next(); }
    else if ((c === '<' || c === '>') && src[i + 1] === '(') { end(); i = subst(i + 2); end(); }
    else if (c === '<' || c === '>' || (c === '&' && src[i + 1] === '>')) {
      if (word !== null && /^\d+$/.test(word)) word = null; else end();
      let m = /^(&>>|&>|>>|>\||>&|<<<|<<-|<<|<>|<&|>|<)/.exec(src.slice(i))[0];
      i += m.length;
      if (m === '>&' || m === '<&') {
        const d = /^\s*(\d+|-)(?=[\s;&|)<>]|$)/.exec(src.slice(i));   // 2>&1, >&2: kopi av fd, ingen fil
        if (d) { i += d[0].length; continue; }
        m = m[0];
      }
      op = m;
    }
    else if (c === ';' || c === '&' || c === '|') { end(); i += src[i + 1] === c || (c === '|' && src[i + 1] === '&') ? 2 : 1; next(); }
    else if (c === '(') { end(); depth++; i++; next(); }
    else if (c === ')') { end(); i++; if (sub && depth === 0) return { cmds, end: i }; depth--; next(); }
    else add(src[i++]);
  }
  end();
  return { cmds, end: i };
}
