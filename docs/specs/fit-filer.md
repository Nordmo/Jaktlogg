# Spec: FIT-filer i turdialogen

Status: godkjent
Godkjent av: Martin, 2026-10-21

## Mål

Martin kan velge en .fit-fil fra klokka under «Ny tur», akkurat som en GPX- eller TCX-fil. Manuelle Lap-trykk blir rypetreff som venter på utfylling, som i TCX i dag. Dette er grunnlaget for `turer-fra-klokka.md`, der fila hentes automatisk.

## Ikke-mål

- Ingen henting fra intervals.icu eller andre tjenester. Det kommer i `turer-fra-klokka.md`.
- Ingen endring i databasen, `TRIP_FIELDS`, `OBS_FIELDS`, `TRIP_LIST` eller `OBS_LIST`.
- Ingen endring i hvordan GPX og TCX leses (`parseGPX`, `parseTCX`), i rypetreff-veiviseren, kameraet, terrenget eller rutetegningen.
- Ingen nytt felt i turdialogen.

## Akseptansekriterier

Testene kjører i lokal modus. FIT-fila lages av et skript i testene med `@garmin/fitsdk` og oppdiktede koordinater. Ingen ekte spor og ingen binærfil fra klokka i repoet. Fila har posisjon, høyde (`enhancedAltitude`), puls og tidspunkt omtrent hvert 3. sekund, to manuelle runder (`lapTrigger` «manual»), én automatisk runde (for eksempel «distance») og en siste runde med `sessionEnd`.

1. **AK1:** Gitt den kunstige FIT-fila, når den velges under «Ny tur», så åpnes turdialogen. Sammendraget viser km, høydemeter og «2 trykk på rundeknappen blir rypetreff du fyller ut».
2. **AK2:** Gitt AK1, når «Lagre tur» trykkes, så har turen nøyaktig 2 rypetreff som venter på utfylling. Tidspunktene (`seen_at`) ligger innen 3 sekunder fra de manuelle rundetrykkene i fila, og posisjonene ligger på sporet.
3. **AK3:** Gitt samme fil, så gir verken den automatiske runden eller `sessionEnd`-runden noe rypetreff.
4. **AK4:** Gitt den samme FIT-fila gzip-pakket, når den velges, så blir resultatet det samme som i AK1 og AK2.
5. **AK5:** Gitt en tur lagret fra FIT, når siden lastes på nytt og turen åpnes, så er distansen den samme som før lagring. Det lagrede sporet (`gpx`-feltet) er TCX (`TrainingCenterDatabase`) og har både høyde og puls.
6. **AK6:** Gitt en fil med `.fit`-endelse som ikke er gyldig FIT, når den velges, så vises en norsk feilmelding som toast. Ingen tur lagres, og det oppstår ingen `pageerror`.
7. **AK7:** Gitt at appen startes og ingen FIT-fil er valgt, så har siden ikke gjort noen forespørsel etter `@garmin/fitsdk`.
8. **AK8:** Gitt en GPX-fil og en TCX-fil, når de velges, så åpnes turdialogen som før. Det oppstår ingen `pageerror` i løpet av testene.

## Berører

- [ ] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [ ] Innlogging eller tilgang
- [x] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [ ] Nøkler eller `CONFIG`
- [ ] Kamera, terreng eller rutetegning (se Fallgruver i CLAUDE.md)
- [x] Reglene agenten dømmes etter: `.github/`, `.claude/`, `scripts/`, config-filer, `package.json`, `CLAUDE.md`

## Åpne spørsmål

## Notater

- **Lisens:** `@garmin/fitsdk` har Garmins egen FIT-lisens («SEE LICENSE IN LICENSE.txt»), ikke MIT. Lisensen er godkjent av Martin 2026-10-21.
- **Bibliotek:** `@garmin/fitsdk@21.218.0` er en ES-modul. Den lastes med dynamisk `import('https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/+esm')` først når en FIT-fil er valgt (AK7). `scripts/repo-rules.js` krever `@x.y.z/` i adressen, og det har denne. Samme versjon legges inn som devDependency, slik at testskriptet kan lage den kunstige fila.
- **Endringer i `index.html`:** `beginNewTrip` (rundt linje 1620) leser i dag `file.text()`. For .fit (endelse eller FIT-signaturen `.FIT` på byte 8–11) leses `arrayBuffer()`. Er fila gzip (`1f 8b`), pakkes den ut med `DecompressionStream('gzip')`. Så lager en ny `fitToTcx(bytes)` i GPX-seksjonen TCX-tekst, som går videre til `parseGPX` og `tripDraft.gpx` som før.
- **Runder:** Bare `lapTrigger` «manual» blir `<TriggerMethod>Manual</TriggerMethod>`. Alt annet blir noe som `parseTCX` ignorerer. Da gjelder regelen i CLAUDE.md om at bare manuelle runder blir rypetreff, uten at `parseTCX` endres.
- **Filvalg:** `accept` på `#gpxInput` (linje 413) får `.fit`. Teksten «Bruk en .gpx- eller .tcx-fil» kan nevne .fit.
- **Testfil:** Skriptet legges for eksempel i `tests/fixtures/lag-fit.js`, og fila lages under testkjøringen. Bruk koordinater som åpenbart er oppdiktet, gjerne samme område som eksempelturene.
- **Tester:** `tests/acceptance/fit-filer.spec.js` med `test('AK1: ...')` osv.
