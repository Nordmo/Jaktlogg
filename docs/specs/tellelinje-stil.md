# Spec: Tellelinjen med små bokstaver og mer luft

Status: godkjent
Godkjent av: Martin, 2026-10-20

## Mål

Tellelinjen over turlisten leses som vanlig tekst med små bokstaver («3 turer» i stedet for «3 TURER») og har litt mer luft ned til første turkort.

## Ikke-mål

- Teksten i linjen endres ikke («3 turer», «2 av 3 turer», «1 tur»). Det gjør heller ikke når den vises eller skjules.
- Andre `.eyebrow`-elementer (f.eks. «Jaktlogg» øverst i panelet) endres ikke.
- Skrift, størrelse og farge på tellelinjen endres ikke.
- Avstanden over tellelinjen, avstanden mellom turkortene og turkortene selv endres ikke.

## Akseptansekriterier

Testene kjører i lokal modus med de tre eksempelturene og sesong «Alle».

1. **AK1:** Gitt jaktloggen vises, når tellelinjen `#tripCount` leses som synlig tekst (`innerText`), så er den nøyaktig «3 turer» med små bokstaver, og beregnet `text-transform` er `none`.
2. **AK2:** Gitt samme utgangspunkt, så er beregnet `letter-spacing` på `#tripCount` `normal` eller `0px`.
3. **AK3:** Gitt samme utgangspunkt, så har `#tripCount` samme beregnede `font-family`, `font-size` og `color` som «Jaktlogg»-linjen (`#pane-log .eyebrow` som ikke er `#tripCount`).
4. **AK4:** Gitt samme utgangspunkt, så er den loddrette avstanden fra bunnen av `#tripCount` til toppen av første `.trip` 26 px (±1 px).
5. **AK5:** Gitt samme utgangspunkt, så er den loddrette avstanden fra bunnen av elementet rett før `#tripCount` til toppen av `#tripCount` 18 px (±1 px), som før.
6. **AK6:** Gitt samme utgangspunkt, så har «Jaktlogg»-linjen fortsatt `text-transform: uppercase`.
7. **AK7:** Gitt sesong 2025 er valgt, så viser `innerText` «2 av 3 turer», og AK4 gjelder fortsatt.
8. **AK8:** Ingen JavaScript-feil (`pageerror`) i løpet av testene.

## Berører

- [ ] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [ ] Innlogging eller tilgang
- [ ] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [ ] Nøkler eller `CONFIG`
- [ ] Kamera, terreng eller rutetegning (se Fallgruver i CLAUDE.md)
- [ ] Reglene agenten dømmes etter: `.github/`, `.claude/`, `scripts/`, config-filer, `package.json`, `CLAUDE.md`

## Åpne spørsmål

## Notater

- Trolig én CSS-linje ved `.eyebrow`-reglene i `index.html`: `#tripCount{text-transform:none;letter-spacing:normal;margin-bottom:8px}`. Marginen legges på toppen av `gap:18px` i `.pane`.
- Markupen i `renderLog` (`index.html:1724`) og `tripCountText` (`index.html:1698`) trenger ikke endres.
- Testene legges i `tests/acceptance/tellelinje-stil.spec.js` med `test('AK1: ...')` osv. De eksisterende testene i `turteller.spec.js` skal fortsatt være grønne.
