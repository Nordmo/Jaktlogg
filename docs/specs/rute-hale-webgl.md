# Spec: Halen tegnes med WebGL, uten workerne

Status: godkjent
Godkjent av: Martin, 2026-10-24

## Mål

I 3D følger den oransje ruten markøren i Safari like tett som i 2D. Den korte halen fra enden av `route-done` til markøren tegnes i samme bilde som markøren, uten å vente på MapLibres workers, og den skjules bak terreng på samme måte som `route-done`.

## Ikke-mål

- `route-done` beholdes som i dag (GeoJSON-kilde, oppdateres hvert `RP.S`-punkt). Ingen line-gradient eller line-progress.
- Kilden `route-head` og lagene `route-glow-h` og `route-done-h` fjernes. Halen finnes bare som det nye laget `route-tail`.
- Ingen endring i MapLibre eller i workerkøen. Ingen oppgradering av MapLibre.
- Ikke noe lerret over kartet (overlegg). Halen tegnes inne i kartet, med dybdetest mot terrenget.
- Videoeksporten endres ikke: under eksport tegnes ruten som i dag (`paintRoute(p,true)` og `mapIdle`), og `route-tail` tegner ingenting.
- Kamera, avlesning, grafer og tidslinje følger `state.progress` som i dag.
- Ingen WebKit i Playwright. Safari måles med et skript som Martin kjører lokalt.

## Akseptansekriterier

AK1–AK5 måles i Safari med `scripts/safari-maling.mjs` på Grunnfjorden, med følgekamera og 40 s avspilling. Skriptet kjøres lokalt av Martin før merge (se Notater). AK6–AK14 testes i Playwright (Chromium) i `tests/acceptance/rute-hale-webgl.spec.js`.

1. **AK1 (Safari, 3D):** Gitt Grunnfjorden i 3D med følgekamera, når turen spilles av i 40 s, så er avstanden langs sporet mellom markøren og enden av halen som er tegnet høyst 1 sporpunkt i 98 % av bildene. Hullet mellom enden av den tegnede `route-done` (`querySourceFeatures`) og starten av halen er høyst 1 sporpunkt i 98 % av bildene. (På `main`: median 48 m, p90 197 m, maks 400 m.)
2. **AK2 (Safari, 2D):** Det samme som AK1, i 2D, men med 99 % av bildene.
3. **AK3 (Safari):** Bildefrekvensen i 3D og 2D er minst 95 % av det samme skriptet måler på `main` i samme økt. (På `main`: 29,2–29,7 bilder/s i 3D og 30 i 2D.)
4. **AK4 (Safari, 3D):** Overgangen mellom halen og `route-done` synes ikke. Gitt Grunnfjorden i 3D med følgekamera, pauset på tre steder (flatt, bratt oppover og bratt nedover), så tar skriptet et skjermbilde av skjøten. Der måles bredden på den oransje linjen (antall oransje piksler på tvers av linjen) 10 px på hver side av skjøten. Forskjellen er høyst 1 px (enhetspiksler), og fargen er lik (forskjell høyst 8 i hver RGB-kanal i progress-modus). Martin ser i tillegg på skjermbildene og på en avspilling, og finner ingen synlig skjøt.
5. **AK5 (Safari, 3D):** Der ruten går bak terreng, skjules halen der `route-done` ville vært skjult. Skriptet tester de seks stedene på Grunnfjorden der halen ligger bak en fjellrygg sett fra følgekameraet (ved 23, 24, 77, 78, 82 og 84 % av turen; se Notater). På hvert sted tar det to skjermbilder av samme strekning: ett med `route-done` tegnet helt fram (fasit), og ett med `route-done` fram til halens start og halen tegnet resten. Så sammenlignes de oransje pikslene, med 2 px slingringsmonn:
   - Av de oransje pikslene halen ville hatt uten dybdetest, og som fasiten ikke har, er minst 90 % skjult, på hvert av de seks stedene.
   - Av de oransje pikslene i fasiten mangler høyst 15 % hos halen, på hvert av de seks stedene.
   - Martin ser på skjermbildene og finner ingen del av halen som synes gjennom en fjellrygg der `route-done` er skjult.
6. **AK6:** Kilden `route-head` og lagene `route-glow-h` og `route-done-h` finnes ikke (`map.getSource('route-head')` og `map.getLayer(…)` gir `undefined`). Gitt avspilling (3D og 2D), så oppdateres `route-done` som før (høyst hvert `RP.S`-punkt), og ingen GeoJSON-kilde får `setData` hvert bilde.
7. **AK7:** Gitt avspilling, så slutter halen i hvert bilde nøyaktig ved markøren (samme lengde og breddegrad som `posMarker.getLngLat()`) og starter ved punkt `RP.shown`, enden av den tegnede `route-done` (± 1 sporpunkt).
8. **AK8:** Gitt farging etter høyde, puls og fart, så har hver bit av halen samme farge som samme sted i `doneGeoJSON(T,p,0)`. Bredden og gløden regnes ut fra de samme verdiene som lagene `route-done` og `route-glow` (zoom 10 → 16).
9. **AK9:** Gitt pause, så er gapet 0. Gitt spoling bakover og fremover, så finnes det ingen oransje bit etter markøren og ingen hull mellom start og markøren.
10. **AK10:** Gitt eksport (`state.exporting`), så tegner `route-tail` ingenting, og `runExport` og `drawFrame` er uendret (samme sha256 som i dag).
11. **AK11:** `route-tail` er et custom layer med `renderingMode:'3d'`, og det ligger etter alle draperte lag (`line`, `fill`, `raster`, `hillshade`, `background`) og rett før `obs-circle`. Observasjoner og markører ligger over halen.
12. **AK12:** Gitt at ruten er slått av (`#routeToggle`), eller at visningen er jaktloggen, så tegnes ikke halen.
13. **AK13:** Ingen JavaScript-feil (`pageerror`), og ingen WebGL-feil (`gl.getError()` er `NO_ERROR` etter at `route-tail` har tegnet).
14. **AK14:** Fallgruvene i `CLAUDE.md` sier at halen (`route-tail`) bruker interne deler av MapLibre (`modelViewProjectionMatrix` i `render`, og plasseringen rett før `obs-circle`), og at den må testes på nytt i Safari med `scripts/safari-maling.mjs` når MapLibre oppgraderes. Fallgruven om de to GeoJSON-kildene er skrevet om (se Endringer).

## Berører

- [ ] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [ ] Innlogging eller tilgang
- [ ] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [ ] Nøkler eller `CONFIG`
- [x] Kamera, terreng eller rutetegning (se Fallgruver i CLAUDE.md)
- [x] Reglene agenten dømmes etter: `.github/`, `.claude/`, `scripts/`, config-filer, `package.json`, `CLAUDE.md` (nytt `scripts/safari-maling.mjs`, fallgruvene om rutetegningen i `CLAUDE.md`)

## Åpne spørsmål

## Notater

### Avgjort av Martin (24.10.2026)

- Halen skal ikke synes gjennom fjellrygger. Der ruten går bak terreng, skjules halen akkurat som `route-done`. Derfor brukes a) custom layer med dybdetest, ikke overlegg.
- Kilden `route-head` og lagene `route-glow-h` og `route-done-h` fjernes.
- AK1–AK5 er akseptansekriterier som måles lokalt i Safari med `scripts/safari-maling.mjs`. `/ship` kan ikke kjøre dem i CI. Derfor åpner `/ship` PR-en uten auto-merge, med resultatet fra Playwright (AK6–AK14). Martin kjører målingen i Safari og merger selv.
- Grensene i AK5 står: minst 90 % skjult og høyst 15 % manglende piksler, på hvert av de seks stedene. Prototypen nådde 81–100 % skjult og 0–25 % mangler. Å justere gløden og fjerne prikkene der sikten går langs bakken er en del av implementasjonen. Klarer implementasjonen ikke grensene etter tre runder, eskaleres det med skjermbildene fra alle seks stedene. Kravet senkes ikke.
- Etter eskaleringen i PR #12 (24.10.2026): AK1 senkes til 98 % (runde 3 ga 98,9 %). Halen skal ligge oppå terrenget, og skjules med en toleranse i dybdetesten (terrenget må ligge tydelig foran, flere meter, økende med avstanden), ikke med løft og `polygonOffset`. Høyst to runder. Består ikke AK4 og AK5 begge da, velger Martin B (godta og endre kravene).
- Fallgruven om interne deler av MapLibre i `CLAUDE.md` skrives i samme PR (AK14), fordi en ucommittet endring utenfor specen stopper `/ship`.

### Målinger i Safari: årsaken (24.10.2026, `main`)

Safari 18.6, denne Mac-en, `safaridriver`. Grunnfjorden (4367 punkter, 10,92 km), følgekamera (pitch 70), 40 s avspilling. Instrumentert fra WebDriver uten å endre appen. Runde A måler uten gap-måling, runde B med.

| | 3D (3 kjøringer) | 2D (2 kjøringer) |
|---|---|---|
| Bilder per sekund | 29,2–29,6 (median 33 ms per bilde) | 29,9–30,0 (33 ms) |
| `setData` på `route-head` → `content`, median | **1,6–2,7 s** | **4 ms** |
| … p90 / maks | 4,5–5,0 s / 5,5 s | 12–15 ms / 126 ms |
| `content` → flisene lastet, median | 10–11 ms | 11 ms |
| Alder på `route-head` som er tegnet, median / p90 / maks | **1,7 / 4,7 / 5,9 s** | 33 / 36 / 203 ms |
| Ventende `setData` (kø) | opptil 115 (etter 25–30 s) | 0–1 |
| Avbrutte `LD` (`dataabort`) | 0 | 0 |
| Gap markør → enden av tegnet linje, median / p90 / maks | 48 / 197 / 400 m | 0 / 3 / 55 m |
| Workers | 3 (`route-head` på Worker 2, `route-done` på Worker 1) | samme |

Tolkning:

- **Køen er flaskehalsen, ikke tegningen.** Bildefrekvensen er lik i 3D og 2D. I 3D venter hver `setData` på `route-head` sekunder i workeren, bak terrengflisene. Raster-DEM-fliser fordeles på alle workerne, så ingen worker er fri. MapLibre avbryter ikke gamle `LD`, så køen vokser når kameraet laster nye fliser.
- Det synlige gapet (48 m i median) er mindre enn alderen på halen tilsier (1,7 s ≈ 450 m), fordi `route-done` ligger på en annen worker og kommer raskere fram. Den synlige oransje enden er da enden av `route-done`, og halen ligger flere sekunder bak, under den. Gapet blir derfor opptil `RP.S` punkter.
- Målingen i Chromium («køen vokser ikke») gjelder ikke Safari.
- Det forklarer også hvorfor PR #10 og filteret på `freeRtt` ikke hjalp: ingen av dem rører køen.

### Målinger i Safari: tre måter å skjule halen bak terreng (24.10.2026)

Prototyper lagt inn med WebDriver, uten å endre appen. De tegner halen fra `RP.shown` til markøren i tillegg til dagens rute. Kostnaden er målt i 40 s avspilling i 3D med følgekamera. Skjulingen er målt på de seks stedene der halen ligger bak terreng: 19–40 av 74 halepunkter er skjult etter MapLibres egen dybdetest for markører.

| | Bilder/s (main 29,2–29,7) | CPU for halen per bilde, median / p90 / maks | Skjuler riktig? |
|---|---|---|---|
| a) custom layer før `obs-circle`, 0,5 m løft | **29,7** | 0 / 1 / 1 ms | **Ja.** 81–100 % av pikslene som skal skjules, er skjult. Noen korte prikker der sikten går nesten langs bakken over en topp. |
| a) custom layer før `obs-circle`, 2 m løft | 29,5 | 0 / 1 / 1 ms | Dårligere: flere prikker over toppene (59–88 % skjult). |
| a) custom layer før `route-hit` | **27,4–27,7** | 0 / 2 / 3 ms | Som over, men lavere bildefrekvens (se under). |
| b) overlegg + dybdebuffer (én `readPixels` per bilde) | 29,5 | **10 / 17 / 28 ms** | Nei. Store biter synes gjennom ryggen. Dybdebufferet har lav oppløsning, og hver bit tegnes helt eller ikke. |
| b) overlegg + strålesøk (24 prøver per punkt) | 29,3 | 2 / 3 / 15 ms | Nei, skjulte ingenting. Kameraposisjonen fra `transform.getCameraPosition()` ser ut til å være feil i 3D. |
| b) overlegg uten sjekk | – | – | Hele halen synes gjennom ryggen. |

Valg: **a) custom layer, lagt rett før `obs-circle`, 0,5 m løft.** Det skjuler riktig, koster ingenting målbart i bildefrekvens, og bredden følger terrenget som `route-done` fordi stripa tegnes i verdenspiksler. Da faller også problemet med fast bredde på skjermen bort (AK4).

Plasseringen er avgjørende: et custom layer midt blant de draperte lagene (for eksempel før `route-hit`) deler terrengteksturene i to stabler, så terrenget tegnes to ganger per bilde. Det kostet ca. 7 % bildefrekvens.

Skjermbildene fra prototypene ligger i scratchpaden for økten og committes ikke. `scripts/safari-maling.mjs` lager dem på nytt.

### Løsning: custom layer `route-tail`

- Et custom layer (`type:'custom'`, `renderingMode:'3d'`), lagt rett før `obs-circle` i `initMap`. MapLibre tegner det etter terrenget med dybdetest (`LEQUAL`, samme dybdeområde som terrenget), så terrenget skjuler det.
- I `render(gl, matrix, opts)` bygges en trekantstripe for punktene fra `RP.shown` til `posAt(T, state.progress*T.total)`. Hvert punkt får x og y i verdenspiksler (`map.transform.worldSize`) relativt til første punkt, og z = terrenghøyden (`map.terrain.getElevationForLngLatZoom`, med overdrivelse) + 0,5 m. Uten terreng er z = 0.
- Matrisen er `opts.modelViewProjectionMatrix` (x og y i verdenspiksler, z i meter), med første punkt lagt inn som forskyvning i Float64 før den gjøres om til Float32. Da unngås hopping på grunn av for lav presisjon ved høy zoom. `customLayerMatrix` (det andre argumentet) kan ikke brukes: den mangler forskyvningen for terrenghøyden i kartets senter, så halen ville havnet i feil høyde.
- Bredde: halvparten av bredden fra laget `route-done` (zoom 10 → 16: 2,5 → 5,5 px) i verdenspiksler, til hver side av linjen. Da blir den draperte bredden lik som for `route-done`. Gløden er en bredere stripe (`route-glow`: 8 → 18 px, 0,45 i opasitet) med myk kant i fragmentshaderen, og den justeres til den ser ut som `line-blur: 8`.
- Farger: samme segmentinndeling som `doneGeoJSON` (`step=ceil(T.n/220)`, `rampColor`) som farge per hjørne. Inndelingen trekkes ut i en felles funksjon, så hale og hoveddel ikke kan skli fra hverandre.
- `setHead` sender ikke lenger `setData`. Den kaller bare `map.triggerRepaint()`. `checkRouteShown` og logikken i `RP` beholdes: halen starter der `route-done` faktisk er tegnet.
- Kilden `route-head` og lagene `route-glow-h` og `route-done-h` fjernes (`initMap`, `showLog`, `#routeToggle`, `vis(...)`).
- `render` tegner ingenting når `state.exporting`, når ruten er slått av, eller i jaktloggen.

### Interne deler av MapLibre som brukes

Dette skal stå under Fallgruver i `CLAUDE.md`, som `map._elevationFreeze`:

- `map.transform.worldSize` og `map.transform.zoom` (intern `transform`, brukes allerede i appen).
- `map.terrain.getElevationForLngLatZoom` (brukes allerede).
- `opts.modelViewProjectionMatrix` i `render` til custom layers (tredje argument i 4.7.1).
- Rekkefølgen: et custom layer midt blant draperte lag deler terrengteksturene i to stabler (målt 29,5 → 27,5 bilder/s).

### Hvorfor ikke andre løsninger

- b) overlegg med dybdetest: se tabellen. Enten for dyrt og upresist (dybdebuffer) eller avhengig av en kameraposisjon som ikke stemmer i 3D (strålesøk).
- Mottrykk (vente med ny hale til forrige er tegnet): hver oppdatering venter fortsatt sekunder bak DEM-flisene.
- Egen worker for halen: MapLibre 4.7.1 lar ikke en kilde velge worker, og DEM-flisene bruker alle.
- Fortsette med `freeRtt`-filter: målt av Martin, hjalp ikke, og rører ikke køen.

### Endringer (trolig)

- `index.html`: seksjonen for rutetegning (`setHead`, `paintRoute`, `route-tail` og felles fargeinndeling), `initMap` (lagene `*-h` ut, `route-tail` inn), `showLog` og `#routeToggle`.
- `scripts/safari-maling.mjs`: målingene over som skript. Det starter server og `safaridriver`, åpner en GPX-fil i lokal modus og måler 3D og 2D (AK1–AK3). Så tar det skjermbilder av skjøten (AK4) og av de seks stedene bak terreng (AK5), skriver tabellen og lagrer skjermbildene. GPX-stien gis som argument og committes ikke.
- `CLAUDE.md`, Fallgruver: fallgruven om de to kildene (`route-done` og `route-head`) skrives om. Halen tegnes nå som custom layer, fordi `setData` på en GeoJSON-kilde står i kø bak DEM-flisene i 3D i Safari (sekunder). Ikke flytt halen tilbake til en GeoJSON-kilde, og ikke legg den som et overlegg over kartet (synes gjennom fjell). I tillegg de interne delene over, og at halen må testes på nytt i Safari med `scripts/safari-maling.mjs` når MapLibre oppgraderes (AK14).
- `tests/acceptance/rute-hale-webgl.spec.js` (Chromium): AK6–AK14.
