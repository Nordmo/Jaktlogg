# Spec: Turer fra klokka

Status: godkjent
Godkjent av: Martin, 2026-10-22

## Mål

Når Martin åpner appen innlogget, viser en boks over turlisten nye turer fra klokka. Det gjelder aktiviteter av typen «Hike» fra inneværende jaktsesong, hentet fra intervals.icu. «Legg inn» åpner den vanlige turdialogen med fila, så Martin bare fyller inn ryper, art og kommentarer. «Ikke jakt» skjuler turen, og «Vis skjulte turer» lar ham hente den tilbake. Lap-trykk blir rypetreff som før.

Bygger på `fit-filer.md`, som må være merget først.

## Ikke-mål

- Ingen tidsplan, pg_cron eller ventetabell. Hentingen skjer bare når appen åpnes innlogget.
- Ingen nøkkel per bruker ennå. Bare eieren av nøkkelen (Martin) ser boksen. Jaktkameratene merker ingen endring.
- Ingen tur lagres uten at Martin trykker «Lagre tur» i dialogen.
- Ingen publisering av funksjonen fra GitHub Actions, og ingen Supabase-token i GitHub.
- Ingen annen ny avhengighet enn supabase-js i `index.ts`, låst til samme versjon som appen (2.117.2).
- Ingen endring i `parseTCX`, `fitToTcx`, rypetreff-veiviseren, kameraet, terrenget eller rutetegningen.
- Ingen andre aktivitetstyper enn «Hike», og ingen turer fra før sesongstart. Eldre turer kan fortsatt lastes opp manuelt.

## Akseptansekriterier

App-AK-ene bruker den felles oppstarten i `tests/helpers/oppstart.js` (se `testoppstart.md`) og importerer `test` og `expect` derfra. AK9 starter med `startLocal(page)`. De andre starter med en ny `startCloud(page, svar)` i oppstarten, som gir en falsk innlogget økt og svarer med oppdiktede data og den kunstige FIT-fila fra `fit-filer.md`. Testene kjører i 2D, som alle andre, og ingen test trenger internett. Handler-AK-ene kjører i Node mot `handler.js` med en falsk `fetch` for intervals.icu, en falsk `getUser` og en falsk nøkkel. **Ingen test kaller det ekte intervals.icu eller det ekte Supabase-prosjektet.**

I AK-ene betyr «feil fra funksjonen» et svar med en annen statuskode enn 2xx, 401 eller 403, eller at det ikke kommer noe svar innen 8 sekunder.

1. **AK1:** Gitt at funksjonen gir 2 Hike-aktiviteter som ikke er logget, når jaktloggen vises, så står boksen «Nye turer fra klokka» over turlisten. Den har 2 linjer med dato, klokkeslett (norsk tid) og km, nyeste først, og hver linje har knappene «Legg inn» og «Ikke jakt».
2. **AK2:** Gitt AK1, når «Legg inn» trykkes på en linje, så hentes fila for akkurat den aktiviteten, og den vanlige turdialogen åpnes med rundetrykkene som rypetreff. Når «Lagre tur» trykkes, så lagres turen med `source_id` lik aktivitets-ID, og linjen forsvinner fra boksen.
3. **AK3:** Gitt AK2, når dialogen lukkes uten å lagre, så lagres ingen tur, og linjen blir stående.
4. **AK4:** Gitt AK1, når «Ikke jakt» trykkes, så lagres en rad i `import_skip` med aktivitets-ID, og linjen forsvinner. Når siden lastes på nytt og `import_skip` har raden, så vises ikke aktiviteten blant de nye turene.
5. **AK5:** Gitt en aktivitet og en egen tur der `started_at` er innen 5 minutter fra aktivitetens start, så vises ikke aktiviteten. Er den egne turen 6 minutter unna, vises aktiviteten. Er turen innen 5 minutter en lagkamerats (en annen `owner`), vises aktiviteten.
6. **AK6:** Gitt en egen tur med `source_id` lik aktivitets-ID, så vises ikke aktiviteten, uansett starttid.
7. **AK7:** Gitt 0 nye og 0 skjulte aktiviteter, så vises ingen boks. Gitt én ny linje, når den er lagt inn eller skjult, så forsvinner linjen. Det som blir igjen er ingenting, eller bare lenken fra AK18 hvis noe er skjult.
8. **AK8:** Gitt at funksjonen svarer 401 eller 403 («ikke koblet»), når jaktloggen vises, så vises verken boks eller feillinje. Loggen virker som før, og det oppstår ingen `pageerror`.
9. **AK9:** Gitt lokal modus (ikke innlogget), så kalles funksjonen aldri, og boksen vises ikke.
10. **AK10 (handler):** Gitt at `getUser` gir eierens e-post, når listen hentes, så kaller handleren `GET /api/v1/athlete/0/activities` med basic auth `API_KEY:<nøkkel>` og `oldest` lik sesongstarten (AK16). Svaret har bare aktiviteter av typen «Hike», hver med id, start (`start_date`, UTC) og distanse. Nøkkelen står ikke noe sted i svaret.
11. **AK11 (handler):** Gitt en aktivitets-ID, når fila hentes, så kaller handleren `GET /api/v1/activity/{id}/file` og svarer med rå FIT-bytes. Det gjelder både når intervals.icu sender fila gzip-pakket og når den sender den upakket.
12. **AK12 (handler):** Brukeren avgjøres bare av `getUser(token)`, der tokenet er det som står etter `Bearer ` i `Authorization`-headeren.
    - Uten `Authorization`, eller når `getUser` avviser tokenet (feil eller ingen bruker), svarer handleren 401.
    - Gitt et gyldig token for en annen e-post enn `INTERVALS_OWNER_EMAIL`, svarer den 403.
    - Gitt eierens e-post i en annen header, i en URL-parameter eller i body, men uten gyldig token, svarer den 401.
    - I alle disse tilfellene kalles ikke intervals.icu.
    - E-posten sammenlignes uten forskjell på store og små bokstaver.
13. **AK13 (handler):** Gitt en `OPTIONS`-forespørsel fra `https://nordmo.github.io` eller fra localhost, så svarer handleren med CORS-hoder for den adressen. Listen over tillatte adresser står øverst i `handler.js`, med en kommentar om at et eget domene (`CNAME`) må legges til der.
14. **AK14:** Gitt eieren, når funksjonen gir feil (se definisjonen over AK1), så viser boksen bare én diskret linje: «Fikk ikke kontakt med klokka». Det gjelder også når det ikke kommer svar og denne nettleseren har fått et vellykket svar fra funksjonen før. Det kommer ingen toast, og loggen virker som før. Testene dekker 500, 502 og et svar som aldri kommer, der linjen vises etter 8 sekunder. Gitt en nettleser som aldri har fått et vellykket svar, når det ikke kommer svar, så vises ingenting.
15. **AK15:** Gitt en aktivitet med `start_date` `2026-10-18T06:00:00Z` og `start_date_local` `2026-10-18T08:00:00`, og en egen tur med `started_at` `2026-10-18T06:02:00Z`, så vises ikke aktiviteten. Gitt i stedet en egen tur med `started_at` `2026-10-18T08:00:00Z` (lik den lokale tiden, men 2 timer feil i UTC), så vises aktiviteten.
16. **AK16:** `seasonStart(now)` gir 1. august kl. 00:00 norsk tid i inneværende år når `now` er 1. august eller senere i norsk tid, og ellers 1. august året før. Kontrollpunkter (`now` → dato som sendes som `oldest`):

    | `now` | `oldest` |
    | --- | --- |
    | 2026-10-21 | 2026-08-01 |
    | 2026-08-01 | 2026-08-01 |
    | 2026-07-31 | 2025-08-01 |
    | 2027-02-10 | 2026-08-01 |
    | `2026-07-31T22:30:00Z` (00:30 norsk tid 1. august) | 2026-08-01 |
17. **AK17:** Gitt at en egen tur med samme `source_id` allerede finnes i databasen (for eksempel lagret i en annen fane), når «Lagre tur» trykkes, så vises den norske meldingen «Turen er allerede lagt inn». Det finnes fortsatt bare én tur med den `source_id`, og ingen rypetreff lagres for forsøket. I testen svarer `/rest` med Postgres-feil `23505` (brudd på unik indeks), som databasen gir.
18. **AK18:** Gitt minst én skjult aktivitet i sesongen, så har boksen lenken «Vis skjulte turer (N)». Det gjelder også når ingen nye turer finnes. Da er lenken alt boksen viser. Når lenken trykkes, så vises de skjulte turene med dato, klokkeslett, km og knappen «Hent tilbake». Når «Hent tilbake» trykkes, så slettes raden i `import_skip`, og turen står igjen blant de nye turene med «Legg inn» og «Ikke jakt».
19. **AK19:** Ingen JavaScript-feil (`pageerror`) i løpet av app-testene.

## Berører

- [x] Databaseskjema, ny tabell eller RLS-policy (krever `supabase-oppdatering-N.sql` og README)
- [x] Innlogging eller tilgang
- [x] Ny avhengighet (CDN-bibliotek eller npm-pakke)
- [x] Nøkler eller `CONFIG`
- [ ] Kamera, terreng eller rutetegning (se Fallgruver i CLAUDE.md)
- [ ] Reglene agenten dømmes etter: `.github/`, `.claude/`, `scripts/`, config-filer, `package.json`, `CLAUDE.md`

## Åpne spørsmål

## Notater

**Innlogging i funksjonen:**
- JWT-sjekken i Supabase (`verify_jwt`) skal stå på. Den er på som standard ved `supabase functions deploy`. Bruk aldri `--no-verify-jwt`. Plattformen godtar da bare forespørsler med et gyldig bruker-JWT i `Authorization`. `sb.functions.invoke` sender innloggingstokenet der av seg selv.
- I tillegg slår funksjonen opp brukeren med supabase-js: `index.ts` lager en klient med `createClient(SUPABASE_URL, <publishable-nøkkelen>)` og gir handleren en `getUser(token)` som kaller `auth.getUser(token)`. Det er auth-serveren som sjekker tokenet. Svaret gir e-posten som sammenlignes med `INTERVALS_OWNER_EMAIL`. Brukeren hentes aldri fra en annen header, e-post, parameter eller verdi appen sender.
- supabase-js importeres som `npm:@supabase/supabase-js@2.117.2`, med eksakt versjon, samme som i `index.html`. Ingen `^`, `~` eller versjon uten tall.
- **Miljøvariabler** som Supabase setter selv i Edge Functions:
  - `SUPABASE_URL`.
  - `SUPABASE_PUBLISHABLE_KEYS`: et JSON-objekt med navngitte nøkler. Bruk `JSON.parse(...).default`.
  - Den gamle `SUPABASE_ANON_KEY` brukes ikke, fordi prosjektet bruker publishable-nøkler (`sb_publishable_...`).
  - `SUPABASE_SECRET_KEYS` og `SUPABASE_SERVICE_ROLE_KEY` skal ikke brukes. Funksjonen trenger ikke omgå RLS.
- Egne secrets (settes av Martin): `INTERVALS_API_KEY` og `INTERVALS_OWNER_EMAIL`.

**Funksjonen** (`supabase/functions/klokke/`):
- `handler.js` er vanlig JavaScript uten `Deno` og uten supabase-js. Den eksporterer en funksjon som får `request`, `fetch`, `getUser` og et objekt med miljøverdiene. Kallene til intervals.icu går gjennom `fetch`, og brukeroppslaget gjennom `getUser`, så Node-testene dekker hele logikken med falske versjoner av begge.
- `index.ts` er bare innpakningen. Den leser `Deno.env`, lager supabase-klienten, gir handleren `globalThis.fetch` og `getUser`, og kjører `Deno.serve`. ESLint ser bare `.js`, så `index.ts` lintes ikke.
- Handleren har to handlinger: liste (`?oldest=YYYY-MM-DD`) og fil (`?id=`). Sesongstarten regnes ut i appen med `seasonStart` og sendes med som dato.
- Svarkoder: 401 uten gyldig bruker, 403 «ikke koblet» for andre enn eieren, 502 når intervals.icu feiler eller svarer med noe annet enn 2xx.
- Aktivitets-ID fra intervals.icu brukes både i `source_id` og i `import_skip`. `external_id` trengs ikke.
- Nøkkelen finnes bare som secret i Supabase. Testene bruker en åpenbart falsk verdi, for eksempel `test-nokkel`. Ingen ekte aktivitets-ID-er, e-postadresser eller spor i tester eller spec. Bruk `din@epost.no` og `kompis@epost.no`.

**Appen** (`index.html`):
- `TRIP_FIELDS` og `TRIP_LIST` får `source_id`. `beginNewTrip` (fra `fit-filer.md`) tar imot bytes og `source_id`, slik at «Legg inn» går gjennom nøyaktig samme dialog og `saveTripModal` som manuell opplasting.
- Boksen tegnes i `renderLog` (rundt linje 1700), over tellelinjen. Henting skjer med `sb.functions.invoke('klokke', …)` etter `loadLog` når `store===Cloud`. Kallet avbrytes etter 8 sekunder.
- Funksjonen returnerer alle Hike-aktiviteter i sesongen, og appen deler dem inn:
  - Skjult: finnes i `import_skip`.
  - Logget: en egen tur (`t.mine`) har samme `source_id`, eller `|Date.parse(started_at) − Date.parse(start_date)| ≤ 5 min`. Logget vises ikke.
  - Ny: resten.

  `start_date` er UTC fra intervals.icu. **Bruk aldri `start_date_local`**, som er norsk tid uten tidssone.
- `import_skip` leses og endres med `sb.from('import_skip')` (select, insert, delete).
- AK17: `errText` (eller `saveTripModal`) gjør Postgres-kode `23505` på `source_id` om til «Turen er allerede lagt inn». Turen lagres før rypetreffene, så det lagres ingen rypetreff når turen feiler.
- «Fikk kontakt før» huskes i `localStorage` (for eksempel `hoydespor.klokke`), med try/catch som ellers i fila.
- `Local` trenger ingen `import_skip`, fordi boksen aldri vises i lokal modus.

**Falsk innlogging i testene:**
- `startCloud(page, svar)` legges i `tests/helpers/oppstart.js` og eksporteres sammen med `startLocal`. `tests/helpers/` er ikke låst, men endringen skal ikke røre rutingen eller 2D-oppstarten som testoppstart-testene sjekker.
- Før siden lastes, legger den en falsk økt i `localStorage` under nøkkelen supabase-js bruker (`sb-<prosjekt-ref>-auth-token`, ref lest fra `CONFIG.supabaseUrl` i `index.html`). Økten har `expires_at` langt fram i tid, en oppdiktet bruker-ID og e-posten `din@epost.no`, slik at `sb.auth.getSession()` gir en økt uten nettkall.
- Den legger til `page.route` for `<supabaseUrl>/auth/v1/**`, `/rest/v1/**` og `/functions/v1/klokke**` med svarene testen gir (turer, `import_skip`, aktiviteter, FIT-fila, statuskoder eller et svar som aldri kommer). `page.route` går foran `context.route` i oppstarten. Andre kall mot `*.supabase.co` avvises fortsatt av oppstarten.
- Til slutt kaller den `sjekkStartstil` og `setTerrain(false)` som `startLocal`, og venter på jaktloggen.
- Ingen ekte nøkler eller tokens i testene. Tokenet er en åpenbart falsk streng.

**Database:**
- `trips.source_id text`, med unik indeks på `(owner, source_id)` der `source_id` ikke er null.
- Ny tabell `import_skip(owner uuid not null default auth.uid() references auth.users(id) on delete cascade, source_id text not null, created_at timestamptz not null default now(), primary key (owner, source_id))`.
  - Egne `grant select, insert, delete ... to authenticated`, og `revoke` fra `anon`.
  - RLS-policyer for select, insert og delete med `owner = auth.uid()`. Insert krever også `public.er_i_laget()`.
- Endringene legges i `supabase-oppsett.sql` og i ny `supabase-oppdatering-3.sql`. Begge skal tåle å kjøres flere ganger.
- README oppdateres: oppdateringslisten, «Bruk» (boksen, «Ikke jakt» og «Vis skjulte turer») og et nytt avsnitt om oppsettet av intervals.icu (stegene under).

**Manuell sjekkliste for Martin etter merge** (kan ikke testes i loopen):
1. Kjør `supabase-oppdatering-3.sql` i SQL Editor.
2. Sett secrets i Supabase (Edge Functions → Secrets): `INTERVALS_API_KEY` og `INTERVALS_OWNER_EMAIL`.
3. Publiser funksjonen: `npx supabase functions deploy klokke --project-ref <ref>`, uten `--no-verify-jwt`. Eller lim den inn i Dashboard. Sjekk i Dashboard at «Verify JWT» står på for `klokke`.
4. Åpne appen innlogget og sjekk at en ekte tur fra klokka dukker opp, kan legges inn og får rypetreff på riktig sted.
5. Trykk «Ikke jakt» på en tur, og hent den tilbake med «Vis skjulte turer».
6. Logg inn som en annen bruker i laget, og bekreft at boksen ikke vises (403). Svaret ser du i nettleserens nettverksfane eller i loggene til funksjonen i Supabase.

- Tester: `tests/acceptance/turer-fra-klokka.spec.js` med `test('AK1: ...')` osv.
