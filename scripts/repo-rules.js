// Prosjektregler fra CLAUDE.md som kan sjekkes maskinelt.
import { readFileSync, readdirSync } from 'node:fs';

const errors = [];
const html = readFileSync('index.html', 'utf8');

// Bibliotek fra CDN må ha eksakt versjon, ellers kan en ny versjon knekke kamera og terreng.
for (const [url] of html.matchAll(/https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/[^"'\s)]+/g)) {
  if (!/@\d+\.\d+\.\d+\//.test(url)) errors.push(`Bibliotek uten låst versjon: ${url}`);
}

// Secret-nøkkelen omgår alle tilgangsregler og skal aldri ligge i nettsiden.
if (/sb_secret_|service_role/.test(html)) errors.push('index.html inneholder en secret- eller service_role-nøkkel.');

// SQL-filene skal bare ha plassholderadresser.
const allowed = new Set(['din@epost.no', 'kompis@epost.no']);
for (const f of readdirSync('.').filter(f => f.endsWith('.sql'))) {
  for (const [mail] of readFileSync(f, 'utf8').matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) {
    if (!allowed.has(mail)) errors.push(`${f}: ekte e-postadresse (${mail}). Bruk din@epost.no.`);
  }
}

// CI kjører i Playwrights container. Bildet må ha samme versjon som @playwright/test, ellers mangler nettleserne.
const pw = JSON.parse(readFileSync('package.json', 'utf8')).devDependencies['@playwright/test'];
const image = readFileSync('.github/workflows/check.yml', 'utf8').match(/mcr\.microsoft\.com\/playwright:v([\d.]+)-/);
if (!image || image[1] !== pw) errors.push(`check.yml: Playwright-bildet (${image ? image[1] : 'mangler'}) må ha samme versjon som @playwright/test (${pw}).`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Prosjektregler OK');
