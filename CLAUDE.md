# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Høydespor jaktlogg: privat jaktlogg i 3D (GPX/TCX-spor, rypetreff, vær, dronevideo). Svar, UI-tekst og commit-meldinger på norsk.

## Kjøre

`python3 -m http.server 8000` og åpne http://localhost:8000. Ingen bygg, avhengigheter, tester eller lint ennå. Krever internett (biblioteker fra CDN, kart, terreng, vær).

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
