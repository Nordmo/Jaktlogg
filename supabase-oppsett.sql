-- Høydespor jaktlogg: database, tilgang og lagring
-- Lim inn hele fila i Supabase > SQL Editor og trykk Run.
-- Kan kjøres flere ganger uten å ødelegge noe.

-- 1. Laget: bare e-postadresser i denne tabellen får se og lagre turer.
create table if not exists public.lag (
  email text primary key
);
alter table public.lag enable row level security;
-- Ingen policyer på lag: tabellen kan bare endres her i SQL Editor eller i Table Editor.

create or replace function public.er_i_laget() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lag where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- 2. Turer
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  area text,
  started_at timestamptz,
  gpx text not null,
  distance_m double precision,
  gain_m double precision,
  duration_s double precision,
  participants text,
  dogs text,
  bag integer not null default 0,
  notes text,
  conditions jsonb,
  weather jsonb,
  weather_summary jsonb,
  track_simple jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Observasjoner (ryper, annet vilt, bilder, dronevideoer, notater)
create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'rype',
  name text,
  species text,
  count integer,
  dog_point boolean not null default false,
  shot integer not null default 0,
  note text,
  lat double precision not null,
  lon double precision not null,
  d double precision,
  seen_at timestamptz,
  media_path text,
  media_type text,
  include_in_video boolean not null default true,
  clip_start real not null default 0,
  clip_len real not null default 5,
  created_at timestamptz not null default now()
);
create index if not exists observations_trip_idx on public.observations(trip_id);

-- 3b. Felter for rypetreff, hund og analyse (lagt til senere, trygt å kjøre flere ganger)
alter table public.trips add column if not exists with_dog boolean not null default false;
alter table public.trips add column if not exists effort jsonb;
alter table public.observations add column if not exists habitat text;
alter table public.observations add column if not exists outcome text;
alter table public.observations add column if not exists ele real;
alter table public.observations add column if not exists slope real;
alter table public.observations add column if not exists aspect real;
alter table public.observations add column if not exists wx jsonb;

-- 4. Tilgang: alle i laget ser alt, men endrer og sletter bare sitt eget.
alter table public.trips enable row level security;
alter table public.observations enable row level security;

-- Eksplisitte rettigheter for Data API-et. Trengs når «Automatically expose new tables»
-- er slått av, og skader ikke når den er på. Utloggede (anon) får ingenting.
revoke all on public.trips, public.observations, public.lag from anon, authenticated;
grant select, insert, update, delete on public.trips, public.observations to authenticated;
revoke all on function public.er_i_laget() from public, anon;
grant execute on function public.er_i_laget() to authenticated;

drop policy if exists "laget leser turer" on public.trips;
drop policy if exists "laget lager turer" on public.trips;
drop policy if exists "eier endrer tur" on public.trips;
drop policy if exists "eier sletter tur" on public.trips;
create policy "laget leser turer" on public.trips for select to authenticated using (public.er_i_laget());
create policy "laget lager turer" on public.trips for insert to authenticated with check (public.er_i_laget() and owner = auth.uid());
create policy "eier endrer tur" on public.trips for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "eier sletter tur" on public.trips for delete to authenticated using (owner = auth.uid());

drop policy if exists "laget leser obs" on public.observations;
drop policy if exists "laget lager obs" on public.observations;
drop policy if exists "eier endrer obs" on public.observations;
drop policy if exists "eier sletter obs" on public.observations;
create policy "laget leser obs" on public.observations for select to authenticated using (public.er_i_laget());
create policy "laget lager obs" on public.observations for insert to authenticated with check (public.er_i_laget() and owner = auth.uid());
create policy "eier endrer obs" on public.observations for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "eier sletter obs" on public.observations for delete to authenticated using (owner = auth.uid());

-- 5. Lagring av bilder og dronevideoer (privat bøtte, maks 50 MB per fil på gratisnivået)
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "laget leser media" on storage.objects;
drop policy if exists "laget laster opp media" on storage.objects;
drop policy if exists "eier endrer media" on storage.objects;
drop policy if exists "eier sletter media" on storage.objects;
create policy "laget leser media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.er_i_laget());
create policy "laget laster opp media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.er_i_laget() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "eier endrer media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "eier sletter media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Ping for å holde gratisprosjektet aktivt (brukes av en ekstern tidsplan, se README)
create or replace function public.ping() returns integer language sql stable as $$ select 1 $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- 5b. Turer fra klokka (intervals.icu): hvilken aktivitet en tur kom fra, og aktiviteter som ikke var jakt.
alter table public.trips add column if not exists source_id text;
create unique index if not exists trips_owner_source_id_key on public.trips(owner, source_id) where source_id is not null;

create table if not exists public.import_skip (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id text not null,
  created_at timestamptz not null default now(),
  primary key (owner, source_id)
);
alter table public.import_skip enable row level security;
revoke all on public.import_skip from anon, authenticated;
grant select, insert, delete on public.import_skip to authenticated;

drop policy if exists "eier leser skjulte" on public.import_skip;
drop policy if exists "eier skjuler" on public.import_skip;
drop policy if exists "eier henter tilbake" on public.import_skip;
create policy "eier leser skjulte" on public.import_skip for select to authenticated using (owner = auth.uid());
create policy "eier skjuler" on public.import_skip for insert to authenticated with check (public.er_i_laget() and owner = auth.uid());
create policy "eier henter tilbake" on public.import_skip for delete to authenticated using (owner = auth.uid());

-- 6. Legg inn deg selv (og senere jaktkameratene). Bytt ut adressen:
insert into public.lag (email) values ('din@epost.no') on conflict do nothing;
