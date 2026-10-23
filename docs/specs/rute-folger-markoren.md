# Spec: Ruten følger markøren

Status: godkjent
Godkjent av: Martin, 2026-10-23

## Mål

Under avspilling slutter den oransje ruten der markøren er, uansett nettleser og bildefrekvens. Det skal ikke lenger være et synlig hull mellom markøren og den oransje linjen.

## Ikke-mål

- Ingen endring i hvordan ruten tegnes: fortsatt to kilder (`route-done` og `route-head`), ingen line-gradient eller line-progress (Fallgruver i CLAUDE.md).
- Ingen omvei rundt `freeRtt` i MapLibre i denne endringen (løsning b). Den kan bli en egen spec når effekten på bildefrekvensen er målt.
- Kamera, grafer og tidslinje følger fortsatt den egentlige posisjonen (`state.progress`). Bare markøren og tallene i avlesningen følger det som er tegnet.
- Videoeksporten endres ikke.
- WebKit kjøres bare for testene i denne specen, ikke for hele suiten.
- Ingen oppgradering av MapLibre.

## Akseptansekriterier

Testene bruker et syntetisk spor med ca. 4000 punkter som lages i testen, 3D med (flatt) terreng og følgekamera. Testene kjører med programvaregrafikk, så alle avstander måles i sporpunkter eller tegnede bilder (`render`-hendelser), aldri i millisekunder. «Tegnet ende» er punktet lengst ut langs sporet blant koordinatene som `map.querySourceFeatures` gir for `route-done` og `route-head` etter et `render`. «Gap» er antall sporpunkter fra tegnet ende til markøren (`posMarker.getLngLat()`).

1. **AK1:** Gitt et langt spor i 3D med følgekamera og en avspillingsfart der hvert tegnede bilde flytter markøren minst 8 sporpunkter, når turen spilles av i minst 30 tegnede bilder, så er gapet høyst 1 sporpunkt i minst 95 % av bildene og aldri over 2. (Rød på `main`: der er gapet 2–3 bilder, altså 16 punkter eller mer.)
2. **AK2:** Gitt samme avspilling, så ligger markøren aldri mer enn 3 tegnede bilders avspilling bak den egentlige posisjonen, og markøren når siste punkt når avspillingen er ferdig. (Hindrer at AK1 består ved at markøren står stille.)
3. **AK3:** Gitt avspilling, når brukeren trykker pause og kartet er i ro (`idle`), så er gapet 0, og markøren står på den egentlige posisjonen.
4. **AK4:** Gitt farging etter høyde, puls og fart (én deltest for hver), når turen spilles av og pauses midt i, så har hvert tegnet segment i `route-head` samme farge (`c`) som segmentet på samme sted i hele ruten fargelagt på én gang (`doneGeoJSON(T,p,0)`).
5. **AK5:** Gitt `state.exporting`, når `paintRoute(p,true)` kjøres og kartet er i ro, så ender tegnet linje nøyaktig ved `p` (± 1 punkt), og markørlogikken gjør ingenting. Diffen endrer ikke `exportVideo`/`drawFrame`. (Selve videoen kan ikke lages i testene, fordi muxer-bibliotekene avvises.)
6. **AK6:** Gitt avspilling forbi 70 %, når brukeren spoler tilbake til 30 % og så fram til 60 % (pause, `setProgress(…, true)`), så finnes det etter `idle` ingen tegnet oransje bit etter markøren, ingen hull mellom start og markøren, og tegnet ende er markørens punkt ± 1.
7. **AK7:** Gitt avspilling i minst 30 tegnede bilder, så kalles `setData` på `route-head` og `route-done` til sammen ikke oftere enn i dag (høyst 1 `route-head` per tegnet bilde, `route-done` høyst hvert `RP.S`-punkt), og den nye markørlogikken kjører høyst én gang per tegnet bilde. Bildefrekvensen måles i tillegg for hånd av Martin i Safari på Grunnfjorden før og etter (Notater).
8. **AK8:** Gitt avspilling, så viser tallene i visningen (tid, distanse, puls og høyde i `updateReadout`) verdiene for markørens posisjon, ikke for den egentlige posisjonen, i hvert tegnede bilde (± 1 sporpunkt). På pause er de lik verdiene for den egentlige posisjonen. I videoen regnes tallene for samme `p` som linjen og markøren i bildet (`valuesAt(f.p*T.total)` i `drawFrame`). Det stemmer allerede i dag og skal ikke endres.
9. **AK9:** Testene i `tests/acceptance/rute-folger-markoren.spec.js` kjører og består både i Chromium og i et eget Playwright-prosjekt for WebKit. WebKit-prosjektet kjører bare den fila (`testMatch`), og resten av suiten kjører som før bare i Chromium.
10. **AK10:** Ingen JavaScript-feil (`pageerror`) i løpet av testene.

## Berører

- [ ] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [ ] Innlogging eller tilgang
- [ ] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [ ] Nøkler eller `CONFIG`
- [x] Kamera, terreng eller rutetegning (se Fallgruver i CLAUDE.md)
- [x] Reglene agenten dømmes etter: `.github/`, `.claude/`, `scripts/`, config-filer, `package.json`, `CLAUDE.md` (Fallgruver i `CLAUDE.md`, WebKit-prosjekt i `playwright.config.js` og WebKit-installasjon i `.github/workflows/check.yml`)

## Åpne spørsmål

## Notater

### Avgjort av Martin (2026-10-23)

- WebKit: ja, men bare som et eget Playwright-prosjekt for denne specens tester. Hvor mye CI-tiden øker, måles og skrives i PR-en.
- Markøren kan ligge høyst 3 tegnede bilders avspilling bak den egentlige posisjonen. Blir gapet større (for eksempel når nye fliser lastes), hopper markøren til den egentlige posisjonen og linjen tar den igjen.
- Tallene i visningen følger markøren (AK8).
- Følgekameraet sikter fortsatt mot den egentlige posisjonen, så markøren kan ligge litt bak midten av bildet ved lav bildefrekvens.

### Årsak: hypoteser mot koden

| Hypotese | Stemmer med koden? |
|---|---|
| Køen av `setData` vokser | Nei. `sendBulk` sendes bare hvert `RP.S`-punkt, `setHead` høyst hvert 24. ms, og MapLibre avbryter eldre `LD` i workeren (`abandoned` → `dataabort` → `fin(false)`). Stemmer med målingen. |
| Linjen vises 2–3 tegnede bilder etter `setData` | Ja. Kjeden i MapLibre 4.7.1: `setData` → `LD` til worker → `data`/`content` på hovedtråden → `SourceCache.reload()` sender `RT` for *hver* flis i kilden → flisene kommer tilbake → `data`-hendelse per flis → neste `render`. To runder til workeren, hver landet mellom bilder. Markøren (`posMarker.setLngLat` i `setProgress`) er en DOM-node som flyttes med en gang. Gapet i meter = 2–3 bilder × fart per bilde, derfor verst på Grunnfjorden (17–25 bilder/s). |
| Hver `setData` sletter terrengteksturene | Ja. `_terrainDataCallback` kaller `terrain.sourceCache.freeRtt(e.tile.tileID)` for hver flis-hendelse fra alle kilder unntatt når kilden er DEM og `_elevationFreeze` er på (da hoppes bare høydeoppdateringen over, ikke `freeRtt`). GeoJSON-kildene laster alle synlige fliser på nytt, også tomme, så hele terrenget tegnes på nytt ved hver `route-head`-oppdatering. `RenderToTexture` gjenbruker ellers teksturen når kameraet beveger seg. |
| `freeRtt` er årsaken til lav bildefrekvens | Uavklart (målingene spriker). Påvirker gapet i meter, men ikke i antall bilder, så det løser ikke AK1 alene. |
| 24 ms-sperren i `paintRoute` | Nei. Ved under 40 bilder/s går det mer enn 24 ms mellom bilder, så halen sendes hvert bilde. |
| Feature-state i stedet for `setData` | Virker ikke uten mer: feature-state endrer ikke `rtt`, og `freeRtt` kalles bare fra `_terrainDataCallback`. I 3D ville linjen stå fast i gamle teksturer. |

### Safari (ikke målt)

- `WorkerPool.workerCount` er `max(min(floor(hardwareConcurrency/2),3),1)` i Safari, ellers 1. Hver GeoJSON-kilde får én fast worker ved oppretting (`dispatcher.getActor()` går på rundgang), og alle flisene i kilden bruker den (`t.actor=this.actor`). `route-done` og `route-head` kan derfor havne på ulike workers.
- Innen én kilde kommer svarene i rekkefølge, så `RP.sent/RP.done/RP.confB` stemmer fortsatt.
- Mellom kildene er rekkefølgen ikke sikker. `checkRouteShown` venter på `isSourceLoaded('route-done')`, men etter 300 ms-reserven flyttes halens start (`RP.shown`) selv om `route-done`-flisene ikke er ferdige. Med to workers kan halen da tegnes før hoveddelen, og det blir et kort *hull* mellom hoveddel og hale. Det er en annen feil enn etterslepet, men den kan gjøre Safari verre. Løsning a) er uavhengig av rekkefølgen, fordi markøren bare leser det som faktisk er tegnet.

### Løsninger vurdert

- **a) Markøren flyttes til tegnet posisjon (valgt).** Hver feature i `doneGeoJSON` får egenskapen `p` (andelen av turen ved featurens siste koordinat; eksakt slutt for halen, `T.cum[a]/T.total` for hoveddelen). I `map.on('render')` leses høyeste `p` med `querySourceFeatures` på `route-head` og `route-done` (små kilder). Markøren settes til `posAt(min(drawnP, state.progress))`, og til `state.progress` når gapet er over 3 tegnede bilders avspilling, når ingenting er tegnet ennå, eller når turen ikke spilles av og kartet er i ro. Markøren og linjen kommer da i samme bilde, uansett bildefrekvens og worker-rekkefølge. Ingen nye `setData`, ingen private MapLibre-API-er, og fargene (`c`) er uendret.
- **b) `freeRtt` bare for rutefliser med innhold.** Krever å bytte ut `map._terrainDataCallback` (privat) og legge det inn igjen etter hver `setTerrain`. Kan gi høyere bildefrekvens, men flytter ikke linjen nærmere i antall bilder, så AK1 blir fortsatt rød. Effekten er ikke bevist. Utsatt til egen spec.
- **c) Unngå `setData` hvert bilde.** Feature-state virker ikke i 3D uten b) (se over). Datadrevet `setPaintProperty` laster kilden på nytt og frigjør i tillegg alle teksturer (`style`-hendelse). Å bare oppdatere halen sjeldnere gir et hakkete hode. Forkastet.

### Endringer (trolig)

- `index.html`, seksjonen med rutetegningen: `p` i `doneGeoJSON`, en ny énlinjes `markerAt()`/`syncMarker()` som kalles fra `map.on('render')`, og `setProgress` slutter å sette markøren direkte mens turen spilles av. `updateReadout` regner tallene for markørens posisjon og kalles fra samme sted. `exportVideo` og `drawFrame` røres ikke (`state.exporting` hoppes over).
- `playwright.config.js`: `projects` med `chromium` (alt, som i dag) og `webkit` (bare `rute-folger-markoren.spec.js`). `browserName` flyttes fra `use` inn i prosjektene.
- `.github/workflows/check.yml`: `npx playwright install --with-deps chromium webkit`. `scripts/check.sh` trenger trolig ingen endring, fordi `npx playwright test` kjører alle prosjektene.
- PR-en oppgir CI-tiden for testjobben før (siste grønne kjøring på `main`) og etter, og hvor lang tid WebKit-prosjektet tar alene.
- Risiko: WebGL i WebKit med programvaregrafikk på Linux i CI kan være tregere eller mangle. Virker det ikke, stopper `/ship` og spør Martin i stedet for å hoppe over WebKit.
- `CLAUDE.md`, Fallgruver: (1) Markøren står der linjen faktisk er tegnet (`p` i `route-done`/`route-head`), ikke flytt den tilbake til `state.progress` under avspilling. (2) Hver `setData` på en GeoJSON-kilde laster alle flisene på nytt og sletter alle terrengteksturer (`freeRtt`). (3) Linjen vises 2–3 tegnede bilder etter `setData`, så alt som må møte linjen, må lese det som er tegnet.
- `tests/acceptance/rute-folger-markoren.spec.js` med `test('AK1: …')` osv. Bruker `tests/helpers/oppstart.js`, lager sporet i testen og legger det inn via `Local`. Tegnet ende i testen regnes fra geometrien (ikke `p`), så AK1 er rød på `main`.

### Manuell måling (Martin)

Grunnfjorden og Skarsfjorden #2 i Safari, følgekamera, 40 s: bilder per sekund og synlig hull før og etter. Bildefrekvensen skal ikke bli lavere.
