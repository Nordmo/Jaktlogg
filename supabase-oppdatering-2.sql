-- Kjør denne i Supabase > SQL Editor hvis du allerede har kjørt supabase-oppsett.sql.
-- Trygg å kjøre flere ganger.
-- Ping for å holde gratisprosjektet aktivt (brukes av en ekstern tidsplan, se README)
create or replace function public.ping() returns integer language sql stable as $$ select 1 $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
