-- Phase 0 foundation: keep-alive ping and the RLS convention every table follows.

-- Called daily by the Vercel Cron so the free project never pauses.
create or replace function public.keepalive()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- RLS convention (SPEC §3): every user table has `user_id uuid references auth.users`
-- and a single owner policy. Each Phase 1+ migration calls:
--   select private.apply_owner_rls('public.accounts');
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.apply_owner_rls(tbl regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('alter table %s force row level security', tbl);
  execute format('drop policy if exists owner_all on %s', tbl);
  execute format(
    'create policy owner_all on %s for all to authenticated
       using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))',
    tbl
  );
  -- Fill user_id from the session so clients never have to send it.
  execute format('alter table %s alter column user_id set default auth.uid()', tbl);
end;
$$;
