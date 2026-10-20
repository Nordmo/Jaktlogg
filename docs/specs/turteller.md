# Spec: Turteller over turlisten

Status: godkjent
Godkjent av: Martin, 2026-10-20

## Mål

Over turlisten i jaktloggen står det hvor mange turer listen viser. Når en sesong er valgt, står det også hvor mange turer som finnes totalt, for eksempel «3 av 12 turer».

## Ikke-mål

- Statistikkboksen «Turer» endres ikke og fjernes ikke.
- Ingen endring i sesongfilter, sortering, turkort eller bannere.
- Ingen endring i lagring, database eller kart.

## Akseptansekriterier

Testene kjører i lokal modus med de tre eksempelturene: to i sesong 2025 og én i 2024.

1. **AK1:** Gitt lokal modus med tre eksempelturer og sesong «Alle», når jaktloggen vises, så står teksten «3 turer» rett over det første turkortet.
2. **AK2:** Gitt samme utgangspunkt, når brukeren velger sesong 2025, så endres teksten til «2 av 3 turer».
3. **AK3:** Gitt samme utgangspunkt, når brukeren velger sesong 2024, så står det «1 av 3 turer».
4. **AK4:** Gitt sesong 2025 er valgt, når brukeren velger «Alle» igjen, så står det «3 turer».
5. **AK5:** Gitt at brukeren har slettet eksempelturene og loggen er tom, når jaktloggen vises, så finnes ingen tellelinje, og «Ingen turer ennå» vises som før.
6. **AK6:** Gitt nøyaktig én tur totalt, når jaktloggen vises med «Alle», så står det «1 tur» (entall).
7. **AK7:** Gitt at valgt sesong har 0 turer mens loggen totalt har 12, når teksten lages, så blir den «0 av 12 turer». Linjen skjules bare når loggen ikke har noen turer i det hele tatt (AK5).
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

- Endres trolig bare i `renderLog` i `index.html` (rundt linje 1710–1723). `trips` (filtrert) og `state.trips` (alle) finnes allerede der.
- Linjen legges rett før `<div class="trips">`, med en liten dempet stil i samme ånd som `.eyebrow`, og en `id` eller klasse (f.eks. `#tripCount`) som testene kan finne.
- AK7 kan ikke nås gjennom brukergrensesnittet i dag. Sesongknappene lages fra turene som finnes, og `renderLog` setter sesongen tilbake til «Alle» hvis den ikke har turer (linje 1701). Teksten lages derfor i en egen énlinjes funksjon, f.eks. `tripCountText(shown,total)`, og AK7 tester den direkte med `page.evaluate`. Tilbakestillingen i linje 1701 skal ikke endres.
- AK6 kan testes ved å slette to av eksempelturene, eller ved å legge inn én tur gjennom `Local` i testen.
- Testene legges i `tests/acceptance/turteller.spec.js` med `test('AK1: ...')` osv.
