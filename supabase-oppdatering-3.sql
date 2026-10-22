-- Kjør denne i Supabase > SQL Editor hvis du allerede har kjørt supabase-oppsett.sql.
-- Trygg å kjøre flere ganger.
-- Turer fra klokka (intervals.icu): hvilken aktivitet en tur kom fra, og aktiviteter som ikke var jakt.
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
