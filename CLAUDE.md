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
- Gått rute tegnes med to kilder: `route-done` (lang, sjelden oppdatert) og `route-head` (kort hale, hver frame). Ikke bytt til line-gradient/line-progress (feil på svingete turer), og ikke slå dem sammen (henger etter markøren).
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
