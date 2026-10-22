# Høydespor jaktlogg

Privat jaktlogg i 3D: GPX-spor fra Garmin eller Strava, rypeobservasjoner, vær fra Open-Meteo og dronevideoer. Selve nettsiden er bare én fil (`index.html`) og kan ligge åpent. Turene, observasjonene og mediene ligger i din egen Supabase-database bak innlogging.

## 1. Opprett databasen (ca. 10 minutter)

1. Lag en gratis konto på [supabase.com](https://supabase.com) og trykk **New project**. Velg region Stockholm (eu-north-1), som er nærmest.
2. Åpne **SQL Editor**, lim inn hele `supabase-oppsett.sql` og bytt ut `din@epost.no` nederst med din egen adresse. Trykk **Run**.
3. Gå til **Authentication → Sign In / Providers → Email** og slå av **Allow new users to sign up**. Da kan ingen andre lage seg konto.
4. Gå til **Authentication → Users → Add user → Create new user**. Skriv e-post og passord og huk av **Auto Confirm User**.
5. Trykk **Connect** øverst på prosjektsiden og kopier **Project URL** (`https://xxxx.supabase.co`) og **publishable key** (`sb_publishable_...`). Begge finnes også under **Project Settings → API Keys**. Bruk ikke secret-nøkkelen (`sb_secret_...`) eller den gamle service_role-nøkkelen; de omgår alle tilgangsreglene.

## 2. Legg ut nettsiden

Den enkleste veien er GitHub Pages:

1. Lag et nytt repo på GitHub og last opp `index.html` (README og SQL-fila kan også ligge der).
2. Åpne `index.html` og fyll inn de to verdiene øverst i skriptet:
   ```js
   const CONFIG={ supabaseUrl:'https://xxxx.supabase.co', supabaseAnonKey:'sb_publishable_...' };
   ```
   Da slipper du og jaktkameratene å lime dem inn selv. Publishable-nøkkelen er laget for å ligge i nettsider; dataene beskyttes av innloggingen og tilgangsreglene i SQL-fila.
3. Gå til **Settings → Pages** og velg **Source: GitHub Actions**. Workflowen `.github/workflows/check.yml` publiserer `index.html` etter hver push til `main`, men bare når alle sjekkene er grønne. Etter et par minutter ligger siden på `https://<brukernavn>.github.io/<repo>/`.

Vil du ikke fylle inn CONFIG, kan du i stedet trykke på kontoknappen øverst til høyre i appen og velge **Koble til database**. Da huskes tilkoblingen i den nettleseren.

## 3. Ta med jaktkameratene

1. Legg til e-posten deres i tabellen `lag` (Table Editor → lag → Insert row), eller kjør:
   ```sql
   insert into public.lag (email) values ('kompis@epost.no');
   ```
2. Opprett brukeren deres under **Authentication → Users → Add user** med et midlertidig passord. De kan bytte passord selv i appen.

Alle i laget ser alle turer og observasjoner. Hver person kan bare endre og slette det de selv har lagt inn, men alle kan legge til observasjoner på hverandres turer.

## Bruk

- **Ny tur**: velg fila fra Garmin Connect (aktivitet → tannhjul → Eksporter til TCX eller GPX) eller Strava (aktivitet → ... → Eksporter GPX). Været for selve turen og de 24 timene før hentes automatisk.
- **Rundeknappen på klokka blir rypetreff**: trykk Lap hver gang dere finner rype, og eksporter turen som **TCX** fra Garmin Connect. Hvert manuelt rundetrykk blir et rypetreff på riktig sted og tidspunkt, merket «Fyll ut». Automatiske runder (for eksempel hver kilometer) blir ignorert. GPX-eksporten fra Garmin tar ikke med runder eller lagrede posisjoner.
- **Rypetreff**: trykk på knappen og så i kartet der rypene satt, bruk posisjonen på tidslinjen, eller trykk lenge (høyreklikk på PC) i kartet. Veiviseren spør om singelrype eller kull, miljø, skudd og art. Høyde, helning, eksposisjon og vær lagres automatisk med treffet.
- **Annet punkt**: bilder, dronevideoer, annet vilt og notater.
- **Jaktloggen** viser alle turer og ryper på ett kart, med sesongfilter og varmekart.
- **Nye turer fra klokka** (bare for den som har koblet til intervals.icu, se under): boksen over turlisten viser turer av typen «Hike» fra denne sesongen som ikke er lagt inn ennå. **Legg inn** åpner turdialogen med fila fra klokka, med rundetrykkene som rypetreff. **Ikke jakt** skjuler turen, og **Vis skjulte turer** lar deg hente den tilbake.
- **Analyse** viser rypetreff per time etter høyde, helning, eksposisjon, vind, temperatur og tid på døgnet, korrigert for hvor lenge dere faktisk gikk i hver kategori. Den viser også art etter høyde, miljø, hund mot uten hund og treffprosent. **Last ned data (CSV)** gir alle treffene som regneark.

## Oppdatering av en eksisterende database

Har du allerede kjørt `supabase-oppsett.sql`, kjør oppdateringene i SQL Editor i rekkefølge: `supabase-oppdatering-1.sql` (rypetreff, hund og analyse), `supabase-oppdatering-2.sql` (ping for å holde prosjektet våkent) og `supabase-oppdatering-3.sql` (turer fra klokka). Alle er trygge å kjøre flere ganger.

## Turer fra klokka (intervals.icu)

Klokka synkroniserer til Garmin Connect, og [intervals.icu](https://intervals.icu) henter turene derfra. Funksjonen `klokke` i Supabase henter dem fra intervals.icu, slik at de dukker opp i jaktloggen. Bare eieren av nøkkelen ser boksen. Jaktkameratene merker ingen endring.

1. Kjør `supabase-oppdatering-3.sql` i SQL Editor (står allerede i `supabase-oppsett.sql` for nye databaser).
2. Finn API-nøkkelen i intervals.icu under **Settings → Developer Settings**.
3. Sett to secrets i Supabase under **Edge Functions → Secrets**: `INTERVALS_API_KEY` (nøkkelen) og `INTERVALS_OWNER_EMAIL` (e-posten du logger inn i jaktloggen med). Nøkkelen skal aldri ligge i repoet.
4. Publiser funksjonen: `npx supabase functions deploy klokke --project-ref <ref>`. Bruk aldri `--no-verify-jwt`. Sjekk i Dashboard at **Verify JWT** står på for `klokke`.
5. Åpne appen innlogget. Nye turer fra sesongen (fra 1. august) vises over turlisten.

Bruker appen et eget domene (`CNAME`), må domenet legges til i listen øverst i `supabase/functions/klokke/handler.js`.

## Lagring over flere år

Dataene slettes ikke av Supabase så lenge prosjektet finnes. To ting er likevel verdt å vite:

- **Dvale mellom sesongene.** Gratisprosjekter settes på pause etter en uke uten aktivitet, så prosjektet vil sove fra vinteren til neste høst. Supabase sender e-post før det skjer, og prosjektet kan vekkes med ett klikk (Resume project) i inntil ett år. Ingen data går tapt ved pause.
- **Hold det våkent hvis du vil slippe dette.** Lag en gratis jobb på [cron-job.org](https://cron-job.org) som kjører hver tredje dag: metode `POST`, adresse `https://xxxx.supabase.co/rest/v1/rpc/ping`, og headeren `apikey` med publishable-nøkkelen. Funksjonen `ping` følger med i SQL-fila (eller `supabase-oppdatering-2.sql`) og gir ingen tilgang til data.
- **Sikkerhetskopi.** Gratisnivået har ingen automatisk sikkerhetskopi du kan hente ut. Trykk på kontoknappen og **Last ned sikkerhetskopi** etter hver sesong. Fila inneholder alle turer, spor, vær og observasjoner, men ikke bilder og videoer, så ta vare på originalene. **Gjenopprett fra sikkerhetskopi** legger turene inn igjen, også i et nytt prosjekt.

Plassbehov: en jakttur fra Garmin er typisk 0,5 til 3 MB som GPX, og databasen komprimerer tekst automatisk. Med 15 til 20 turer i året holder 500 MB i mange tiår. Det som fyller opp er bilder og dronevideoer (1 GB totalt på gratisnivået).

## Begrensninger å vite om

- Gratisnivået i Supabase tar 500 MB database, 1 GB filer og 5 GB nedlasting per måned, og maks 50 MB per fil. Dronevideoer bør kortes ned eller komprimeres før opplasting. GPX-filer tar lite plass, så hundrevis av turer går fint.
- Gratisprosjekter settes på pause etter en uke uten aktivitet. De vekkes med ett klikk i Supabase, og ingen data går tapt.
- Værdataene er modellverdier for stedet (MET Nordic 1 km for nyere turer, ERA5 for eldre), ikke målinger. Fyll inn føre og sikt selv.
