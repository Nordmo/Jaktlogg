# Spec: Testene kjører uten internett

Status: godkjent
Godkjent av: Martin, 2026-10-21

## Mål

Alle nettlesertestene starter appen på samme måte, og ingen test er avhengig av internett. Bibliotekene kommer fra lokale kopier med de samme låste versjonene som `index.html` bruker. Kartfliser og terreng er tomme og flate, og alt annet utenfor maskinen stoppes. Da vises innloggingsskjermen alltid, og en treg eller manglende CDN kan ikke lenger gjøre testene røde. Det er dette som gjorde AK5 i `fit-filer` og de eldre testene ustabile (PR #7).

Testene kjører i 2D som standard. Oppstarten slår av 3D-terrenget når appen er startet, fordi 3D-terreng i programvaregrafikk uten skjermkort gjør hvert bilde svært dyrt. Testene som skal dekke 3D, slår det på igjen selv.

## Ikke-mål

- Ingen endring i `index.html`, og ingen endring i appens oppførsel for brukere. Appen laster fortsatt alt fra CDN.
- Ingen endring i hva testene sjekker. Hver `expect` i eksisterende tester står uendret. Bare oppstarten (`goto` og «Bruk uten innlogging») og importen av `test` endres.
- Ingen oppgradering av MapLibre (4.7.1) eller supabase-js (2.117.2).
- Ingen falsk innlogging (Cloud-modus) ennå. Det kommer i `turer-fra-klokka.md`, som skal bygge på oppstarten herfra.
- Ingen endring i `tests/tools/`. Testene der starter ingen nettleser.
- Ingen endring i CI-workflowen.
- Testene sjekker ikke kamera, terreng eller kartfliser mot ekte data. Fallgruvene i CLAUDE.md må fortsatt sjekkes manuelt.
- Ingen endring i reglene for `/ship` (ship-klar, regresjonsunntak, CI én gang per commit, formell godkjenning av eskaleringer). Det tas i en egen spec etterpå.

## Akseptansekriterier

Testene ligger i `tests/acceptance/testoppstart.spec.js` og bruker den felles oppstarten (`tests/helpers/oppstart.js`).

1. **AK1:** Gitt den felles oppstarten, når appen åpnes, så vises innloggingsskjermen med «Bruk uten innlogging» hver gang. Når knappen trykkes, så viser jaktloggen de tre eksempelturene.
2. **AK2:** Gitt den felles oppstarten, når en test åpner appen, åpner en eksempeltur, spiller av og bytter kartlag (Satellitt, Kartverket og OpenTopoMap), så har ingen forespørsel gått til en annen adresse enn `127.0.0.1`. Alt annet er enten besvart av oppstarten eller avvist.
3. **AK3:** Gitt en forespørsel til en adresse oppstarten ikke kjenner, så feiler testen med en melding som nevner adressen. Nye eksterne avhengigheter blir altså oppdaget i stedet for å slippe stille gjennom.
4. **AK4:** MapLibre, supabase-js og `@garmin/fitsdk` som serveres i testene, er de samme versjonene som `index.html` peker på. Testen leser versjonene fra adressene i `index.html` (`maplibre-gl@x.y.z`, `@supabase/supabase-js@x.y.z` og `@garmin/fitsdk@x.y.z`).
    - MapLibre sammenlignes med versjonen i lisenslinjen øverst i `tests/vendor/maplibre-gl.js` (`maplibre-gl-js/blob/vX.Y.Z/LICENSE.txt`).
    - De to andre sammenlignes med `version` i `node_modules/<pakke>/package.json`.
    - Er versjonene ulike, feiler testen. `tests/vendor/` har også `maplibre-gl.css` og `LICENSE.txt`.
5. **AK5:** Gitt den felles oppstarten og en åpnet eksempeltur, når kartet er ferdig tegnet, så gir appens egen `terrainAt(lon, lat)` midt på sporet `ele` 500 (±1) og `slope` 0 (±0,5). Terrenget er flatt på 500 moh. og kommer fra oppstarten, ikke fra `s3.amazonaws.com`.
6. **AK6:** Gitt den felles oppstarten, når en FIT-fil velges (samme kunstige fil som i `fit-filer`), så serveres `@garmin/fitsdk` lokalt, og turdialogen åpnes. AK7 i `fit-filer` (biblioteket hentes først når FIT velges) gjelder fortsatt.
7. **AK7:** Alle testfiler under `tests/acceptance/` og `tests/e2e/` importerer `test` og `expect` fra `tests/helpers/oppstart.js`, ikke direkte fra `@playwright/test`. Ingen av dem kaller `page.goto` eller trykker `#lLocal` selv, bare gjennom oppstarten. Testen sjekker dette ved å lese filene.
8. **AK8:** `playwright.config.js` har `workers: 2` både lokalt og i CI.
9. **AK9:** `npm run check` er grønn. Alle eksisterende tester i `turteller`, `tellelinje-stil`, `fit-filer` og `tests/e2e/smoke.spec.js` består med uendrede `expect`-er.
10. **AK10:** Gitt den felles oppstarten, når `startLocal` er ferdig, så er 3D-terrenget slått av (`state.terrainOn` er `false`, `map.getTerrain()` er tom). Når en eksempeltur spilles av, så tar et klikk på «pause» under 2 sekunder.
11. **AK11:** Minst smoke-testen og AK5 i `testoppstart` kjører med 3D-terreng på (`med3D(page)` i oppstarten), og ingen av dem gir `pageerror`. Testen sjekker at `tests/e2e/smoke.spec.js` kaller `med3D`. Den åpner også selv en eksempeltur i 3D, spiller av og setter på pause uten `pageerror`.

## Berører

- [ ] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [ ] Innlogging eller tilgang
- [x] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [ ] Nøkler eller `CONFIG`
- [ ] Kamera, terreng eller rutetegning (se Fallgruver i CLAUDE.md)
- [x] Reglene agenten dømmes etter: `.github/`, `.claude/`, `scripts/`, config-filer, `package.json`, `CLAUDE.md`

## Åpne spørsmål

## Notater

**Krav til PR-en og eskaleringen:**
- PR-beskrivelsen viser at ingen `expect`-linjer i `tests/acceptance/` er endret. Ta med resultatet av `git diff origin/main -- tests/acceptance | grep -E '^[+-].*expect\('`, som skal være tomt. Er det ikke tomt, eskaleres PR-en.
- Treffer eskaleringssjekken regelen `last`, og det vil den gjøre her, eskaleres PR-en til Martin som utkast-PR (`gh pr create --draft`), uten auto-merge. Martin merger selv.

**Terrengverdier i eksisterende tester** (sjekket før godkjenning): Ingen test sjekker høyde, helning eller eksposisjon fra terrenget.
- `turteller` og `tellelinje-stil` sjekker bare tekst og plassering.
- I `fit-filer` kommer «høydemeter» (AK1) og høyde og puls i TCX (AK5) fra sporet i FIT-fila, ikke fra terrenget.
- Smoke-testen sjekker bare at kartet og avspillingsknappen vises.

Med flatt terreng får eksempelturene høyde 500 moh. fra terrengmodellen i stedet for ekte høyder, og helning 0. Det er ingen test som ser på disse verdiene, så ingen blir røde eller meningsløse.

**Låste tester endres.** For AK7 må importen og oppstarten byttes i `tests/acceptance/turteller.spec.js`, `tellelinje-stil.spec.js` og `fit-filer.spec.js`. Det er låste filer fra andre specer. Låsen spør Martin for hver fil, og eskaleringssjekken vil vise regelen `last`. Den kan ikke krysses av og går alltid til Martin. Endringen er bare oppstart og import:

```js
// før
import { test, expect } from '@playwright/test';
await page.goto('/'); await page.locator('#lLocal').click();
// etter
import { test, expect, startLocal } from '../helpers/oppstart.js';
await startLocal(page);
```

I `fit-filer` byttes bare importen og `beforeEach`. Navigasjonsblokken etter `page.reload()` i AK5 (`local.or(...)`) står urørt, med `test.setTimeout(120_000)`. Ellers ville en `expect`-linje forsvunnet. Godkjent av Martin 2026-10-21.

**Felles oppstart** (`tests/helpers/oppstart.js`):
- Eksporterer `test` (utvidet med `test.extend`, en automatisk fixture som setter opp `page.route` før hver test), `expect`, `startLocal(page)` og `med3D(page)`.
- `startLocal(page)` går til `/`, venter på at `#lLocal` blir synlig, trykker den, venter på jaktloggen og slår av terrenget med appens egen `setTerrain(false)`.
- `med3D(page)` slår terrenget på igjen med `setTerrain(true)` og venter til `map.getTerrain()` finnes.
- Å trykke en kameraknapp (Følg, Drone og så videre) slår terrenget på i appen (`bindUI`). Tester som trykker slike knapper, kjører derfor i 3D.
- Ruting, med én tabell øverst i fila:
  - `unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js` og `.css` gir `tests/vendor/maplibre-gl.js` og `.css`.
  - `cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js` gir `node_modules/@supabase/supabase-js/dist/umd/supabase.js`.
  - `cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/+esm` gir `node_modules/@garmin/fitsdk/src/index.js`. Fila importerer sine egne filer relativt, så resten av `.../fitsdk@21.218.0/<fil>.js` gir `src/<fil>.js`. Sjekk at stiene stemmer før testene låses.
  - `mp4-muxer` og `webm-muxer` avvises. De brukes bare ved videoeksport, og ingen test eksporterer video.
  - Kartfliser (`server.arcgisonline.com`, `cache.kartverket.no`, `*.tile.opentopomap.org`) gir en tom gjennomsiktig PNG på 256×256.
  - Terreng (`s3.amazonaws.com/elevation-tiles-prod/terrarium/*`) gir en flat terrarium-PNG på 256×256, der alle piksler er (129, 244, 0), altså 500 meter (terrarium: R·256 + G + B/256 − 32768).
  - Ikke bruk 0 meter. Appen tolker høyde 0 fra terrenget som «mangler data» (`v!==0` i `terrainAt` og `fillEleFromTerrain`). Med 0 meter ville testene kjørt en annen kodevei enn med ekte terreng.
  - PNG-ene lages én gang i Node med `zlib` (ingen bildefiler i repoet, og ingen ny pakke for dette).
  - Fonter (`fonts.googleapis.com`, `fonts.gstatic.com`) og Open-Meteo avvises.
  - Supabase (`*.supabase.co`) avvises, så ingen test kan nå det ekte prosjektet.
  - Alt annet som ikke er `127.0.0.1`, avvises og registreres. Fixturen feiler testen etterpå hvis listen ikke er tom (AK3).
- Tester som trenger egne ruter, for eksempel `fit-filer` som avviser Open-Meteo, kan fortsatt legge dem til. Den nyeste `page.route` vinner i Playwright.

**Lokale kopier** (beslutning A fra eskaleringen i PR #8, Martin 2026-10-21):
- **MapLibre:** `maplibre-gl.js`, `maplibre-gl.css` og `LICENSE.txt` (3-Clause BSD) fra `https://unpkg.com/maplibre-gl@4.7.1/dist/` legges uendret i `tests/vendor/`.
  - Den kommer ikke fra npm, fordi `npm audit` stopper `maplibre-gl@4.7.1` med en critical sårbarhet (GHSA-jrc7-96c5-q579). Oppgraderingen tas i `docs/specs/maplibre-6.md`.
  - SHA-256 for `maplibre-gl.js`: `be9633c4d870e26fb37f1cfe5c5a77181667114003ea16207ac7850d8da8add1`.
  - `tests/vendor/**` legges til i `ignores` i `eslint.config.js`, slik at ESLint ikke går gjennom en minifisert fil fra tredjepart. Gitleaks skanner den fortsatt. Gir gitleaks treff i fila, er det en eskalering, ikke et unntak agenten legger inn selv.
- **supabase-js:** `@supabase/supabase-js@2.117.2` legges inn som devDependency (eksakt versjon, `--save-exact`).
- **`@garmin/fitsdk`:** serveres fortsatt fra `node_modules`. Biblioteket skal aldri ligge i repoet, fordi Garmin-lisensen forbyr publisering.

Nettsiden bruker ingen av kopiene. De er bare kilden for testene.

**Klikket som hang på «scrolling into view»** (PR #7): Før endringen kjører implementøren `npx playwright test tests/acceptance/fit-filer.spec.js -g AK5 --repeat-each=5` og skriver ned resultatet. Etter endringen kjøres samme kommando igjen, og begge resultatene skrives i PR-beskrivelsen. Henger klikket fortsatt etter endringen, er det en eskalering, ikke noe som skal lappes med lengre tidsgrenser.

**Antall arbeidere:** `workers: 2` gjør belastningen lik lokalt (8 kjerner, i dag 4 arbeidere) og i CI. Skriv tiden for `npm run check` før og etter i PR-beskrivelsen.

**3D-terreng:** Testene kjører i 2D som standard (AK10). Smoke-testen og AK5 kjører i 3D med flate fliser på 500 moh. (AK11), slik at kamera- og terrengkoden fortsatt kjøres. Testene endrer ikke kamera, terreng eller rutetegning i appen.

Målt i PR #8 med én arbeider, eksempelturen og 4 sekunder avspilling:
- Med 3D-terreng ble det tegnet 6 bilder (ca. 400 ms per bilde), og et klikk på pause tok 9,7 s.
- Uten terreng ble det tegnet 150 bilder, og et klikk på pause tok 0,26 s.
- Lavere pikseltetthet (`deviceScaleFactor: 0.5`) ga ingen forskjell.
- JavaScript-en i `tick` brukte bare 14 ms totalt. Kartet tegner 0 bilder når ingenting beveger seg.

- Tester: `tests/acceptance/testoppstart.spec.js` med `test('AK1: ...')` osv.
