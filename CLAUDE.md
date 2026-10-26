# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Høydespor jaktlogg: privat jaktlogg i 3D (GPX/TCX-spor, rypetreff, vær, dronevideo). Svar, UI-tekst og commit-meldinger på norsk.

## Kjøre

`python3 -m http.server 8000` og åpne http://localhost:8000. Ingen byggesteg. Krever internett (biblioteker fra CDN, kart, terreng, vær).

`npm run check` kjører alle sjekker i `scripts/check.sh` (prosjektregler, ESLint, gitleaks, npm audit, Playwright) og stopper ved første feil. CI (`.github/workflows/check.yml`) kjører samme kommando. Enkeltvis: `npm run lint`, `npx playwright test -g "<navn>"`. Krever `brew install gitleaks` lokalt. Skript, hooks og `/ship` skal virke både på macOS (bash 3.2) og i GitHub Actions: ingen `timeout` (bruk `scripts/vent.sh <sekunder> <kommando>`) eller andre GNU-kommandoer. `tests/tools/vent.spec.js` sjekker det.

Hooks i `.claude/settings.json`: `lint-file.sh` linter hver fil etter Edit/Write, `verify-before-stop.sh` hindrer avslutning til `npm run check` er grønn, `protect-paths.js` spør Martin før noe skrives til, flyttes inn i eller slettes fra `docs/specs/`, `tests/acceptance/` og `.claude/` (lesing og kjøring av tester og skript der er fritt), og `guard-merge.js` tillater bare `gh pr merge --auto` og sperrer endring av GitHub-innstillinger. Begge vaktene tolker kommandoen med `shell-lex.js`, så tekst i søk og PR-beskrivelser ikke gir alarm. Etter tre røde forsøk skrives `ESCALATION.md` (ikke i git). `ship-start.sh` merker økten når `/ship` starter, og Stop-vakten varsler da Martin hver gang Claude stopper: med utfallet fra `scripts/ship-utfall.sh`, ellers «venter». «Venter» sendes ikke mens en bakgrunnsjobb (agent eller Bash) fra økten kjører (`bakgrunn.js` leser transkriptet). `ship-venter.sh` (Notification, `permission_prompt`) varsler når Claude venter på et ja under `/ship`.

Rutinen: Martin godkjenner specen (`Status: godkjent`) og kjører `/ship docs/specs/<funksjon>.md` direkte, uten å committe først. `/ship` committer specen sammen med akseptansetestene i låse-commiten på sin egen branch. Annet som ikke er committet stopper `/ship` (`scripts/ship-klar.sh`).

`/ship docs/specs/<funksjon>.md` låser akseptansetestene, implementerer, kaller `reviewer` (Sonnet, maks tre runder), kjører `scripts/escalation-check.js` mot diffen, åpner PR og slår på auto-merge. GitHub merger når CI er grønn, og Pages publiseres fra `main` bare etter grønne sjekker (`deploy`-jobben i `check.yml`). `scripts/ntfy.sh` varsler Martin; emnet ligger i `.ntfy-topic` (i `.gitignore`) og i secret `NTFY_TOPIC`, aldri i en fil som committes.

## Arkitektur

- Alt er `index.html`: CSS, markup og ett stort `<script>` uten moduler, delt i seksjoner merket `/* ---------- navn ---------- */`. Koden er tett med énlinjers funksjoner; følg den stilen.
- To lagringslag med samme grensesnitt: `Local` (IndexedDB) og `Cloud` (Supabase-tabellene `trips`, `observations` og bucket `media`). Den globale `store` peker på ett av dem. Uten innlogging kjører appen lokalt med eksempeltur.
- `TRIP_FIELDS`/`OBS_FIELDS` (lagring) og `TRIP_LIST`/`OBS_LIST` (lister) må stemme med databaseskjemaet.
- `CONFIG` øverst har Supabase-URL og publishable-nøkkel, som er ment å være offentlig (repoet er offentlig). Aldri secret- eller service_role-nøkler.
- MapLibre-kart med 3D-terreng; en `requestAnimationFrame`-loop (`tick`) driver avspilling og kamera.

## Fallgruver (ikke "rydd" disse bort)

- `map._elevationFreeze=false` før `jumpTo` og på `moveend` omgår en feil i MapLibre 4. Uten den sikter kameraet mot feil høyde og havner inne i fjellet.
- Gått rute tegnes i to deler: GeoJSON-kilden `route-done` (lang, oppdateres hvert `RP.S`-punkt) og halen `route-tail` fra `RP.shown` til markøren, som er et custom layer (WebGL) og tegnes i hvert bilde. Ikke bytt til line-gradient/line-progress (feil på svingete turer), og ikke slå dem sammen (henger etter markøren).
- Ikke flytt halen tilbake til en GeoJSON-kilde. I 3D står hver `setData` i kø bak terrengflisene i workerne, i Safari i flere sekunder (målt i `docs/specs/rute-hale-webgl.md`). Ikke legg halen som et lerret over kartet heller: da synes den gjennom fjellrygger.
- `route-tail` bruker interne deler av MapLibre 4.7.1, som `map._elevationFreeze`:
  - Matrisen er `modelViewProjectionMatrix` (tredje argument til `render`), med x og y i verdenspiksler og z i meter. `customLayerMatrix` mangler forskyvningen for terrenghøyden i kartets senter og gir feil høyde.
  - Laget må ligge rett før `obs-circle`, etter alle draperte lag (`line`, `fill`, `raster`, `hillshade`, `background`). Ligger det midt blant dem, tegnes terrenget to ganger per bilde (målt 29,5 → 27,5 bilder/s i Safari).
  - Skjulingen bak terreng gjøres i fragmentshaderen mot `map.terrain._fboDepthTexture`, ikke med vanlig dybdetest. Teksturen har NDC-z pakket i RGBA av `pack()` i MapLibres `terrainDepth`-shader. Pakk ut med `dot(farge, (1/256³, 1/256², 1/256, 1))`, ikke som `depthAtPoint` (gir 255/256 av verdien, ca. 12 % for kort avstand). Avstand fra kameraet er `projectionMatrix[14]/(ndc+projectionMatrix[10])`, samme enhet som `gl_Position.w`.
  - Høyden regnes ut som terrengnettet: flisen som tegnes (`terrain.sourceCache.getRenderableTiles()`), `terrain.meshSize` ruter, trekanter langs diagonalen, og `terrain.getElevation`.
  - Den bruker også `map.transform.worldSize`, `map.transform.zoom` og `map.terrain.getElevationForLngLatZoom`.
  - Når MapLibre oppgraderes, må halen testes på nytt i Safari med `node scripts/safari-maling.mjs <spor.gpx>` (AK1–AK5 i specen), i tillegg til kamera og terreng.
- Gi aldri `.poi-mk` eller andre markører `position` i CSS. Det overstyrer MapLibres plassering.
- Nye tabeller trenger egne `grant`-linjer og RLS-policyer, fordi "Automatically expose new tables" er av i Supabase.
- Bruk alltid plassholderen `din@epost.no` i SQL-filene, aldri ekte e-postadresser.
- Bare manuelle runder i TCX (`TriggerMethod` Manual) blir rypetreff; automatiske ignoreres.
- Låste versjoner: MapLibre 4.7.1 (unpkg), supabase-js 2.117.2 (jsdelivr). Ikke oppgrader uten å teste kamera og terreng.
- Finnes en `CNAME`-fil (eget domene), skal den ikke slettes.

## Database

- `supabase-oppsett.sql` gir alltid siste skjema og tåler å kjøres flere ganger. Endringer for eksisterende databaser legges også i en ny `supabase-oppdatering-N.sql`, og README oppdateres.
- RLS: alle i tabellen `lag` leser alt, bare eier endrer og sletter. Mediefiler ligger under `<user_id>/...`.
- Brukeren kjører SQL selv i Supabase SQL Editor.

## Plan

`docs/agent-loop.md` bygges fase for fase. Ikke start en fase før brukeren ber om det.

   ## Tekst og UI-elementer
   - Ingen eyebrow-etiketter over overskrifter med mindre de bærer informasjon brukeren trenger.
   - Ingen dekorativ tekst: ingen taglines, undertekster eller hjelpetekst som gjentar det overskriften eller elementet allerede sier.
   - Før du legger til et element: kan det fjernes uten at brukeren mister noe? Da fjernes det.
   - Skriv hele, naturlige setninger. Aldri staccato-fragmenter som "Raskt. Enkelt. Trygt."
