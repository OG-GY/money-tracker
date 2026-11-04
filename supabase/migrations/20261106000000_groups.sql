-- High-level groups above categories (spending) and income sources (income), so
-- reports can answer "what % goes to me vs family vs business" and
-- "what % comes from my job vs profit". A subcategory inherits its parent's
-- group unless it sets its own (e.g. Bills › Electricity → Family & home).

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('spending', 'income')),
  name text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, kind, name)
);
select private.apply_owner_rls('public.groups');

alter table public.categories add column group_id uuid references public.groups on delete set null;
alter table public.accounts add column group_id uuid references public.groups on delete set null;

-- FK checks bypass RLS: keep groups to their owner and the right kind.
create or replace function private.validate_group_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g public.groups;
begin
  if new.group_id is null then
    return new;
  end if;
  select * into g from public.groups where id = new.group_id and user_id = new.user_id;
  if g.id is null then
    raise exception 'Unknown group' using errcode = '23503';
  end if;
  -- Nested so `new.kind` is only read on accounts (categories have no kind column).
  if tg_table_name = 'categories' then
    if g.kind <> 'spending' then
      raise exception 'Categories belong to spending groups' using errcode = '23514';
    end if;
  elsif g.kind <> 'income' or new.kind <> 'source' then
    raise exception 'Only income sources belong to income groups' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_validate_group before insert or update on public.categories
  for each row execute function private.validate_group_link();
create trigger accounts_validate_group before insert or update on public.accounts
  for each row execute function private.validate_group_link();

-- Create the default groups and file existing categories / sources into them.
-- Idempotent: only fills gaps, never overrides a choice the user made.
create or replace function public.seed_groups()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g_personal uuid;
  g_family uuid;
  g_business uuid;
  g_giving uuid;
  g_other uuid;
  i_job uuid;
  i_freelance uuid;
  i_business uuid;
  i_profit uuid;
  i_other uuid;
  fam_parent uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  insert into public.groups (user_id, kind, name, sort_order) values
    (uid, 'spending', 'Personal', 1),
    (uid, 'spending', 'Family & home', 2),
    (uid, 'spending', 'Business', 3),
    (uid, 'spending', 'Giving', 4),
    (uid, 'spending', 'Other', 5),
    (uid, 'income', 'Job', 1),
    (uid, 'income', 'Freelance & clients', 2),
    (uid, 'income', 'Business', 3),
    (uid, 'income', 'Profit & returns', 4),
    (uid, 'income', 'Gifts & other', 5)
  on conflict (user_id, kind, name) do nothing;

  select id into g_personal from public.groups where user_id = uid and kind = 'spending' and name = 'Personal';
  select id into g_family from public.groups where user_id = uid and kind = 'spending' and name = 'Family & home';
  select id into g_business from public.groups where user_id = uid and kind = 'spending' and name = 'Business';
  select id into g_giving from public.groups where user_id = uid and kind = 'spending' and name = 'Giving';
  select id into g_other from public.groups where user_id = uid and kind = 'spending' and name = 'Other';
  select id into i_job from public.groups where user_id = uid and kind = 'income' and name = 'Job';
  select id into i_freelance from public.groups where user_id = uid and kind = 'income' and name = 'Freelance & clients';
  select id into i_business from public.groups where user_id = uid and kind = 'income' and name = 'Business';
  select id into i_profit from public.groups where user_id = uid and kind = 'income' and name = 'Profit & returns';
  select id into i_other from public.groups where user_id = uid and kind = 'income' and name = 'Gifts & other';

  -- Top-level categories that have no group yet.
  update public.categories c set group_id = case
      when c.name in ('Family support') then g_family
      when c.name in ('Business') then g_business
      when c.name in ('Charity') then g_giving
      when c.is_system then g_other
      else g_personal
    end
  where c.user_id = uid and c.parent_id is null and c.group_id is null;

  -- Home utilities are paid for the family, the rest of Bills stays personal.
  update public.categories c set group_id = g_family
  from public.categories p
  where c.user_id = uid and c.parent_id = p.id and p.name = 'Bills'
    and c.name in ('Electricity', 'Gas') and c.group_id is null;

  -- A clear home for money sent back home.
  select id into fam_parent from public.categories where user_id = uid and parent_id is null and name = 'Family support';
  if fam_parent is not null then
    insert into public.categories (user_id, parent_id, name, default_need_want, default_envelope_id, sort_order)
    select uid, fam_parent, n, 'need',
           (select default_envelope_id from public.categories where id = fam_parent), o
    from unnest(array['Sent home', 'Home groceries', 'Family medical']) with ordinality as x(n, o)
    on conflict do nothing;
  end if;

  -- Income sources (not the system ones like Opening Balance).
  update public.accounts a set group_id = case
      when a.name ilike '%salary%' or a.name ilike '%tankhwah%' then i_job
      when a.name ilike '%profit%' or a.name ilike '%return%' then i_profit
      when a.name ilike '%gift%' then i_other
      else i_freelance
    end
  where a.user_id = uid and a.kind = 'source' and a.group_id is null and not (a.meta ? 'system');
end;
$$;

grant execute on function public.seed_groups() to authenticated;

-- Backfill everyone who already has data. auth.uid() reads this setting, so
-- each user's rows are written as that user (works whether or not RLS is bypassed).
do $$
declare
  u record;
begin
  for u in select distinct user_id from public.categories loop
    perform set_config('request.jwt.claim.sub', u.user_id::text, true);
    perform public.seed_groups();
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;
