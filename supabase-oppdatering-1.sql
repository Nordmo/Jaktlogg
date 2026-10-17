-- Kjør denne i Supabase > SQL Editor hvis du allerede har kjørt supabase-oppsett.sql.
-- Trygg å kjøre flere ganger.
-- Rypetreff, hund og analyse: nye felter
alter table public.trips add column if not exists with_dog boolean not null default false;
alter table public.trips add column if not exists effort jsonb;
alter table public.observations add column if not exists habitat text;
alter table public.observations add column if not exists outcome text;
alter table public.observations add column if not exists ele real;
alter table public.observations add column if not exists slope real;
alter table public.observations add column if not exists aspect real;
alter table public.observations add column if not exists wx jsonb;
