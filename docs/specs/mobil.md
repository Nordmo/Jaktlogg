# Spec: Jaktlogg på mobil

Status: godkjent
Godkjent av: Martin, 28.10.2026 (rettingene i akseptansetesten, fordelingen på mobilprosjektene og delingen av vinduene: Martin, 28.10.2026)

## Mål

Jaktloggen kan brukes med tommelen på telefon, stående og liggende. Turene synes når appen åpnes, og en tur kan åpnes og spilles av. Rypetreff kan registreres med knappen eller med langt trykk i kartet, og en GPX-, TCX- eller FIT-fil kan lastes opp fra telefonen. Knappene er store nok til fingeren, siden kan ikke scrolles sidelengs, zoom er ikke sperret, og kartet tegnes med høyst dobbel pikseltetthet.

## Ikke-mål

- Ingen ny funksjonalitet, utover måleverktøyet bak `?fps` (AK4).
- Ikke Friends & family.
- Ingen endring i databasen eller i innloggingen. Innloggingsskjermen får bare nytt oppsett på telefon.
- Ingen oppgradering av MapLibre.
- Videoeksporten testes ikke på mobil. «Lag video» flyttes på smal skjerm (AK13), men `runExport` og `drawFrame` endres ikke.
- `preserveDrawingBuffer` endres ikke (se Notater).
- Ingen automatisk overgang til 2D på svake telefoner. 2D-knappen er løsningen, og den skal være lett å nå.
- PC-en (mus, bredere enn 980 px) skal se ut og virke som i dag.
- Ingen låste tester endres. Må en låst test endres, stopper arbeidet, og Martin spørres.

## Akseptansekriterier

AK1–AK3 og AK5–AK15 testes i Playwright i `tests/acceptance/mobil.spec.js`, i to nye prosjekter i `playwright.config.js`: `mobil-chromium` og `mobil-webkit`, med `isMobile`, `hasTouch` og `deviceScaleFactor: 3`. Testene kjører i 2D som resten (`startLocal`, `startCloud`). Det vanlige prosjektet hopper over `mobil.spec.js`, og mobilprosjektene kjører bare den. `workers: 2` står som før. AK3, AK4, AK8, AK11–AK14 og «Oppsett» kjører bare i `mobil-chromium` (`grepInvert` i `mobil-webkit`), fordi de ikke tester noe som er forskjellig mellom nettleserne. Vinduene er 390×844 og 360×800 stående, og 844×390 og 800×360 liggende. De er delt mellom nettleserne: 390×844 og 844×390 kjører i `mobil-webkit`, og 360×800 og 800×360 i `mobil-chromium`. Testene som bare kjører i `mobil-chromium`, og AK15, kjører der i alle sine vinduer. AK5 går gjennom vinduene til sin nettleser. Hver AK kjører fortsatt stående og liggende i minst én nettleser der den gjorde det før delingen. Flytene kjøres i 390×844 og 360×800. AK4 testes i Playwright der det går, men selve målingen gjør Martin på telefonen (AK16). AK16 og AK17 gjøres av Martin før merge.

«Trykkflate» måles slik: for hvert synlig element som kan trykkes på, sjekkes `document.elementFromPoint` i hjørnene og midten av en boks på 44×44 px sentrert på elementet. Alle ni punktene skal treffe elementet selv eller noe inni det. Da teller usynlige kanter med, og to knapper som står for tett, feiler.

1. **AK1 (stående):** I 390×844 og 360×800 er turene synlige når jaktloggen åpnes (skuffen er åpen, og første tur ligger innenfor vinduet). Trykk på en tur åpner den og lukker skuffen. Avspillingsknappen er synlig, kan trykkes uten `force`, og `state.playing` blir `true`. ☰ åpner og lukker skuffen, og tilbake til jaktloggen åpner den igjen. (På `main`: turlista ligger utenfor skjermen, og i 390×844 dekker skuffen avspillingsknappen.)
2. **AK2 (liggende):** I 844×390 og 800×360 gjelder det samme som i AK1. I tillegg er høydeprofilen (`#charts`) skjult når vinduet er under 500 px høyt, og kartet (`#stage`) er minst halve vindushøyden. Fra 500 px og opp vises profilen som i dag. (På `main`: kartet er 108 px i 844×390 og 78 px i 800×360.)
3. **AK3 (pikseltetthet):** Når kartet vises, er `map.getPixelRatio()` høyst 2: 2 med `deviceScaleFactor` 3, 2 med 2, og 1 med 1. Kartlerretet er `clientWidth × getPixelRatio()` piksler bredt. `runExport` og `drawFrame` har samme sha256 som i dag. Eksporten setter selv 1 eller 2 og setter grensen tilbake etterpå.
4. **AK4 (teller for bilder per sekund):** Uten `?fps` i adressen finnes ingen teller (`#fps` finnes ikke i DOM-en) og ingen lytter på kartets `render`. Med `?fps` står en liten teller øverst til venstre i kartet med antall bilder kartet har tegnet det siste sekundet og pikseltettheten, for eksempel «58 bilder/s · 2×». Med `?fps&pr=3` brukes 3 i stedet for grensen, så Martin kan sammenligne. Telleren dekker ingen knapper og tar ikke imot trykk (`pointer-events: none`). I Playwright viser den over 0 under avspilling, og 0 når turen står stille (kartet tegner ikke da, se målingen fra PR #8).
5. **AK5 (ingen sidescrolling, ingenting utenfor):** I alle fire vinduene, i jaktloggen, på innloggingsskjermen og i en åpnet tur, med skuffen åpen og lukket, er `document.documentElement.scrollWidth` høyst `innerWidth`. Ingen synlige knapper i toppraden og tidslinja overlapper hverandre, og alle ligger innenfor vinduet. (På `main`: 373–390 px bredt i 360×800, «Rypetreff» ligger oppå «Jaktlogg».)
6. **AK6 (trykkflater):** På berøringsskjerm (`pointer: coarse`) har alle synlige knapper, lenker, felt, nedtrekkslister, brytere, valg (`.chips`), faner, spolelinja (`#scrub`), høydeforsterkningen (`#exag`), kartets zoom- og kompassknapper og observasjonsmerkene (`.poi-mk`) en trykkflate på minst 44×44 px. Det sjekkes i jaktloggen, i en åpnet tur, i alle tre fanene i skuffen, i hvert steg i veiviseren, i turdialogen, i observasjonsdialogen og på innloggingsskjermen. Kravet om at alle ni punktene treffer elementet selv, gjelder ikke observasjonsmerkene seg imellom, fordi rypetreff ofte ligger tett. For `.poi-mk` sjekkes trykkflaten på et merke som ligger alene, og overlapp mot knapper og andre elementer sjekkes som før. Merkene flyttes ikke for å bestå testen. Et trykk i kartet 18 px fra midten av et observasjonspunkt åpner det, og 18 px fra ruten flytter markøren dit (i dag ±6 px). Med mus (1280×720, uten `hasTouch`) er `.btn` 34 px høy og `.play` 38 px, og kartet bruker ±6 px som i dag.
7. **AK7 (tekst og zoom):** På berøringsskjerm er all synlig tekst minst 12 px, og `input`, `select` og `textarea` minst 16 px (ellers zoomer iPhone inn når man trykker i et felt), i de samme visningene som AK6. Med mus er `.ro span` 10 px som i dag. Viewport-taggen har ikke `maximum-scale`, `minimum-scale` eller `user-scalable`, og `touch-action` på `html` og `body` er `auto` eller `manipulation`.
8. **AK8 (logge inn):** Med falske svar fra Supabase (`page.route`, som `startCloud`) fyller testen inn e-post og passord med trykk og trykker «Logg inn». Jaktloggen vises med skuffen åpen.
9. **AK9 (rypetreff med knappen):** I en åpnet tur trykker testen «Rypetreff» og deretter på ruten i kartet. Veiviseren åpnes. Testen går gjennom alle stegene med trykk og lagrer. «Neste», «Tilbake» og «Lagre rypetreff» ligger innenfor vinduet i hvert steg. Treffet står i Observasjoner-fanen etterpå.
10. **AK10 (langt trykk):** I Chromium (CDP `Input.dispatchTouchEvent`) åpner en finger holdt i ro på kartet i 800 ms veiviseren nøyaktig én gang, også om nettleseren sender `contextmenu` under trykket (Android gjør det). Holdt i 300 ms, eller flyttet under trykket, åpner den ikke. I begge nettleserne har kartet `user-select: none` og `-webkit-touch-callout: none`, så iPhone ikke viser kopier-meny eller markerer tekst.
11. **AK11 (bytte fane):** I skuffen åpner trykk på Tur, Observasjoner og Kart og lys riktig fane. I hver fane kan testen scrolle til det siste elementet, og det ligger innenfor vinduet.
12. **AK12 (laste opp fil):** I jaktloggen trykker testen «Ny tur». Filvelgeren åpnes (`filechooser`), og testen gir den en GPX-fil. Turdialogen vises med «Lagre tur» innenfor vinduet, og etter lagring står turen i lista. På berøringsskjerm har `#gpxInput` ingen `accept`, så iPhone ikke gjør .fit-, .tcx- og .gpx-filer grå i Filer-appen. Med mus er `accept` som i dag. En fil som ikke er GPX, TCX eller FIT gir en feilmelding, ikke en JavaScript-feil.
13. **AK13 (Presenter og video):** Under 560 px bredde står «Presenter» og «Lag video» ikke i toppraden, men øverst i Tur-fanen i skuffen, og trykk åpner presentasjonen og eksportdialogen. Fra 560 px og opp står de i toppraden som i dag.
14. **AK14 (iPhone-feller i CSS):** `index.html` bruker ikke `100vh` uten `dvh` (dialogene og innloggingen får ikke knappene under adresselinja). Tidslinja (`.tl`) og dialogenes bunn har `env(safe-area-inset-bottom)`, så knappene ikke havner under hjemlinja.
15. **AK15 (tapt WebGL-kontekst):** I Chromium mister kartet konteksten (`WEBGL_lose_context.loseContext()`) og får den tilbake (`restoreContext()`), slik iPhone kan gjøre når appen har vært i bakgrunnen. Etterpå tegnes kartet og ruten, `route-tail` tegner uten WebGL-feil (`gl.getError()` er `NO_ERROR`), og avspillingen virker. Ingen `pageerror`.

Ingen JavaScript-feil (`pageerror`) i noen av testene.

16. **AK16 (bilder per sekund, Martins telefon):** Martin åpner en tur med `?fps` og med `?fps&pr=3`, spiller av 40 s i 3D med følgekamera, og skriver ned tallene i Notater. Med grensen (2×) er bildefrekvensen minst 95 % av den med 3×.
17. **AK17 (manuell sjekkliste):** Martin går gjennom sjekklista i Notater på egen iPhone, og alle punktene er i orden.

## Berører

- [ ] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [ ] Innlogging eller tilgang
- [ ] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [ ] Nøkler eller `CONFIG`
- [x] Kamera, terreng eller rutetegning (`pixelRatio` i `initMap`, trykkflaten i `onMapClick`, `route-tail` etter tapt kontekst)
- [x] Reglene agenten dømmes etter: `.github/`, `.claude/`, `scripts/`, config-filer, `package.json`, `CLAUDE.md` (to nye prosjekter i `playwright.config.js`)

## Åpne spørsmål

## Notater

### Avgjort av Martin (28.10.2026)

- Skuffen beholdes. På telefon er den åpen i jaktloggen og lukkes når en tur åpnes.
- Under 500 px høyde skjules høydeprofilen.
- 44 px og 12/16 px tekst gjelder bare på berøringsskjerm (`pointer: coarse`). PC-en er uendret.
- Svak telefon er ikke-mål.
- pixelRatio er alltid høyst 2 når kartet vises. Effekten måles med `?fps` (AK16). Grensen er 95 %, ikke «minst like mange», fordi tallene varierer litt mellom kjøringer.
- Under 560 px flyttes «Presenter» og «Lag video» til Tur-fanen.
- Mobiltestene får egne Playwright-prosjekter og kjører i 2D.
- Ytelse kan ikke måles i CI, der 3D-terrenget tegnes uten skjermkort (ca. 400 ms per bilde, PR #8). Spørsmålet om ekte telefon løses med `?fps` og sjekklista.
- Videoeksporten: MapLibre 4.7.1 kan endre pikseltettheten underveis (`setPixelRatio` setter verdien og kaller `resize`). `runExport` setter allerede 1 eller 2 og setter tilbake det kartet hadde. Grensen begrenser derfor ikke videoen, og ingenting i eksporten endres.
- Tidsbruk: mål hvor lang tid hele suiten (`npm run check`) tar lokalt og i CI, før og etter de to nye prosjektene, og skriv tallene i PR-beskrivelsen. Repoet skal bli privat, og da teller Actions-minuttene (2 000 per måned). Øker CI-tiden med mer enn 5 minutter, foreslås hvilke AK som kan nøyes med ett av mobilprosjektene, og Martin spørres før noe endres.
- Kildehenvisningen i kartet er lukket fra start på berøringsskjerm (i-knappen åpner den). Esri, OpenTopoMap og Kartverket kan kreve at den er synlig. Det sjekkes i lisensavklaringen før betaling.
- AK16 og AK17 kan ikke kjøres i CI. Eskaleringssjekken gir exit 1 fordi «Berører» har to avkrysninger. `/ship` åpner PR-en uten auto-merge, og Martin merger selv etter sjekklista.

### Rettinger i akseptansetesten (godkjent av Martin 28.10.2026)

Etter låsingen viste det seg at `tests/acceptance/mobil.spec.js` hadde fire feil som bare kunne rettes i testen (eskalert i PR #16). Kravene er uendret.

1. `start()` brukte `page.goto`, som `testoppstart` AK7 forbyr. Den bruker nå `visLogin`, og `?fps` settes med `history.replaceState` i et init-skript før appen leser adressen.
2. AK6 telte observasjonsmerker utenfor kartet som synlige (målt x ≈ 3 400–77 000 px etter zoom). Merker med midtpunkt utenfor `#stage` hoppes over.
3. `kartpunkt()` krevde 40 px til alle merker og fant ingen punkter på ruten på en telefon (9 merker på ca. 180 px dekket alle 108 punktene). Nå må de ni punktene i en boks på 44×44 px rundt punktet treffe kartlerretet.
4. AK6/AK7 trykket to ganger på samme punkt med 0,4 s mellomrom, og MapLibre tolket det som dobbelttrykk (zoom i stedet for `click`, også på `main`). Testen venter 600 ms før det andre trykket.

AK3, AK4, AK8, AK11–AK14 og «Oppsett» kjører bare i `mobil-chromium`, fordi CI-tiden ellers ville økt med mer enn 5 minutter.

Martin godkjente også `location` og `history` i `/* global */`-kommentaren i testfila (28.10.2026).

### Tid for suiten (28.10.2026)

Med begge nettleserne i alle vinduer tok jobben `check` i CI 13,5 min (mot 6,3–9,3 min, snitt ca. 8 min, i de åtte siste kjøringene uten mobiltestene). Den første kjøringen på PR #16 ble stoppet av tidsgrensen på 15 min. Martin bestemte derfor 28.10.2026 at vinduene deles mellom nettleserne (se innledningen til akseptansekriteriene). Endringen i den låste testen er godkjent bare for denne delingen (AK5). Tidsgrensen for jobben er hevet til 20 min som sikkerhetsmargin, ikke som løsning. Målet er under 11 min i CI.

| | Lokalt (`npm run check`) | CI, jobben `check` |
|---|---|---|
| Før mobiltestene | ca. 3,6 min | 6,3–9,3 min, snitt ca. 8 min |
| Begge nettleserne i alle vinduer | 6,8 min | 13,5 min |
| Vinduene delt | 5,6 min | 12,2 min |

Målet på 11 min er ikke nådd. Delingen sparte ca. 70 s i CI (`npm run check` 765 → 693 s, mot 517 s på `main`). I kjøringen med delte vinduer hang AK12 (390×844, `mobil-chromium`) til tidsgrensen på 180 s og besto ved omkjøringen (`1 flaky`). Det kostet over 3 min. Årsaken er et kappløp i testen: etter «Lagre tur» kaller appen `loadLog` og så `openTrip`, mens testen sjekker `state.view` før `openTrip` er ferdig. Uten omkjøringen ville jobben tatt ca. 9 min. Forslagene står i PR #16 og endres ikke uten Martins ja.

### `preserveDrawingBuffer`

`preserveDrawingBuffer: true` trengs for videoeksporten: `drawFrame` kopierer kartlerretet etter `mapIdle`, utenfor bildet MapLibre tegner. Uten den ville kopien være tom. Testene for halen leser også lerretet.

På telefon koster den trolig noe. Telefoner har grafikkbrikker som tegner skjermen i ruter, og de kan vanligvis kaste bildet etter at det er vist. Med `preserveDrawingBuffer` må bildet tas vare på og kopieres, og det gir mer minnetrafikk for hvert bilde, mer jo flere piksler. Grensen på 2× minsker kostnaden. Det er ikke målt, og det endres ikke her. Skal det måles, må det kunne slås av bak `?fps` i en egen spec.

### Målt på `main` 28.10.2026

Playwright 1.63, `isMobile`, `hasTouch`, `deviceScaleFactor: 3`, lokal modus, eksempelturene. Likt i Chromium og WebKit der ikke annet står.

| Vindu | Jaktloggen | Åpnet tur |
|---|---|---|
| 390×844 | Turlista ligger i skuffen utenfor skjermen | Skuffen blir liggende og dekker avspillingsknappen |
| 360×800 | Som over. Dokumentet er 373 px (WebKit) / 372 px (Chromium). Kontoknappen ligger utenfor (WebKit) | Dokumentet er 390 px. «Rypetreff» ligger oppå «Jaktlogg» |
| 844×390 | Turlista utenfor skjermen | Tidslinja er 228 px, kartet 108 px |
| 800×360 | Som over | Kartet er 78 px |
| 800×500 | Som over | Kartet er 218 px. Skuffen dekker avspillingsknappen når den står åpen |

- Funnet i utkastet («800×500 fant ikke avspillingsknappen») skyldtes skuffen, ikke bredden.
- Under 44 px: 21 elementer i jaktloggen og 30 i turvisningen (vanlig knapp 34 px, avspilling 38 px, faner, brytere 34×20, spolelinja 30 px høy).
- Tekst under 12 px: 13 elementer i jaktloggen og 25–35 i turvisningen (etiketter på 10–11 px). Skjemafeltene er 14 px.
- `map.getPixelRatio()` er 3. Viewport-taggen sperrer ikke zoom.
- Trykk i kartet leter bare ±6 px rundt fingeren (`onMapClick`).
- Ingen JavaScript-feil.

### Slik åpner Martin branchen på telefonen før merge

GitHub Pages publiserer bare fra `main`, så branchen kjøres fra Mac-en:

1. `git switch <branch>` og `python3 -m http.server 8000 --bind 0.0.0.0` i repoet. Svar ja hvis macOS spør om innkommende tilkoblinger.
2. Finn Mac-ens adresse med `ipconfig getifaddr en0`.
3. Åpne `http://<adressen>:8000/?fps` i Safari på iPhonen, på samme wifi.

Innlogging virker derfra (passordinnlogging går rett mot Supabase). Rypetreff og turer du lager mens du er innlogget, havner i den ekte loggen min. Testbrukeren ser dem også, til individuelle brukere er ferdig. Bruk «Bruk uten innlogging» til punkt 4–6, eller slett det etterpå.

### Sjekkliste på iPhonen før merge (AK16 og AK17)

1. Logg inn. Feltene zoomer ikke inn når du trykker i dem.
2. Turene synes med en gang. Åpne en tur.
3. Spill av 40 s i 3D med følgekamera og les av telleren. Gjør det samme med `?fps&pr=3`. Skriv begge tallene i Notater (AK16).
4. Hold fingeren på kartet. Veiviseren åpnes, uten kopier-meny, tekstmarkering eller forstørrelsesglass.
5. Registrer et rypetreff helt ut, med et bilde tatt med kameraet. Knappene nederst synes hele tiden, også når adresselinja er stor.
6. Trykk «Ny tur». I Filer-appen kan du velge en .gpx-, en .tcx- og en .fit-fil (ingen er grå).
7. Bytt mellom de tre fanene i skuffen.
8. Snu telefonen. Kartet synes, og ingenting ligger under kameraøya eller hjemlinja.
9. Klyp for å zoome i skuffen. Siden zoomer.
10. Trykk 2D og 3D nede til høyre.
11. Gå til hjemskjermen, åpne et par andre apper og vent et minutt. Gå tilbake til Safari. Kartet, ruten og avspillingen virker.
12. Åpne en tur med mange rypetreff tett sammen, trykk «Rypetreff», og registrer et nytt treff mellom de gamle. Merkene er nå 44 px og kan dekke ruten. Går det ikke, er det en feil, og PR-en merges ikke.

### Endringer (trolig)

- `index.html`, CSS: `@media (pointer: coarse)` for trykkflater og tekst, `@media (max-height: 499px)` for profilen, toppraden under 560 px, `user-select` og `-webkit-touch-callout` på kartet, `dvh` og `env(safe-area-inset-bottom)`, telleren.
- `index.html`, script: `pixelRatio: Math.min(2, devicePixelRatio)` i `initMap` (eller `pr` fra adressen), skuffen i `setView`/`openTrip`, trykkflaten i `onMapClick`, ett åpningspunkt for langt trykk, `accept` på berøringsskjerm, «Presenter» og «Lag video» i Tur-fanen, telleren bak `?fps`, `route-tail` som lager GL-ressursene på nytt etter tapt kontekst.
- `playwright.config.js`: prosjektene `chromium` (som i dag, uten `mobil.spec.js`), `mobil-chromium` og `mobil-webkit`. `workers: 2` står.
- `tests/acceptance/mobil.spec.js`: AK1–AK15.
