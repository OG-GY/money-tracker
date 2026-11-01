-- Phase 1: full ledger schema (SPEC §3). Envelope / venture / snapshot tables are
-- created now so foreign keys are in place; their logic arrives in Phases 2, 3, 6.

-- ── Envelopes ────────────────────────────────────────────────────────────────
create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('personal', 'venture', 'to_assign')),
  monthly_target bigint check (monthly_target >= 0),
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
select private.apply_owner_rls('public.envelopes');

-- ── Accounts ─────────────────────────────────────────────────────────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('asset', 'person', 'source', 'sink')),
  subtype text check (subtype in ('bank', 'wallet', 'cash', 'savings')),
  on_budget boolean not null default true,
  archived boolean not null default false,
  meta jsonb not null default '{}',  -- persons: phone, note; system accounts: {"system": "..."}
  created_at timestamptz not null default now(),
  check ((kind = 'asset') = (subtype is not null)),
  check (kind = 'asset' or on_budget = false)
);
create unique index accounts_name_per_kind on public.accounts (user_id, kind, lower(name));
select private.apply_owner_rls('public.accounts');

-- ── Ventures ─────────────────────────────────────────────────────────────────
create table public.ventures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  started_on date,
  envelope_id uuid references public.envelopes on delete restrict,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
select private.apply_owner_rls('public.ventures');

-- ── Categories (two levels) ──────────────────────────────────────────────────
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  parent_id uuid references public.categories on delete restrict,
  name text not null check (length(trim(name)) > 0),
  default_need_want text check (default_need_want in ('need', 'want')),
  default_envelope_id uuid references public.envelopes on delete set null,
  is_system boolean not null default false,
  sort_order int not null default 0,
  archived boolean not null default false,
  unique nulls not distinct (user_id, parent_id, name)
);
select private.apply_owner_rls('public.categories');

-- ── Transactions ─────────────────────────────────────────────────────────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  occurred_on date not null default (now() at time zone 'Asia/Karachi')::date,
  amount bigint not null check (amount > 0),
  from_account_id uuid not null references public.accounts on delete restrict,
  to_account_id uuid not null references public.accounts on delete restrict,
  category_id uuid references public.categories on delete restrict,
  envelope_id uuid references public.envelopes on delete set null,
  venture_id uuid references public.ventures on delete set null,
  for_whom text not null default 'self' check (for_whom in ('self', 'gift', 'family', 'household', 'other')),
  need_want text check (need_want in ('need', 'want')),
  merchant text,
  note text,
  due_date date,
  loan_action text check (loan_action in
    ('lend', 'borrow', 'repay_to_me', 'repay_by_me', 'friend_paid', 'write_off')),
  settles_transaction_id uuid references public.transactions on delete set null,
  entry_method text not null default 'manual' check (entry_method in ('manual', 'voice', 'system')),
  entry_batch_id uuid,
  auto_confirmed boolean not null default false,
  raw_transcript text,
  client_id uuid unique,
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);
create index transactions_user_date on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_from on public.transactions (from_account_id);
create index transactions_to on public.transactions (to_account_id);
create index transactions_category on public.transactions (category_id);
select private.apply_owner_rls('public.transactions');

-- Integrity rules that a CHECK can't express (SPEC §2.2, §3 "Validation").
create or replace function private.validate_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f public.accounts;
  t public.accounts;
  person_involved boolean;
begin
  -- FK checks bypass RLS, so confirm every reference belongs to this user.
  select * into f from public.accounts where id = new.from_account_id and user_id = new.user_id;
  select * into t from public.accounts where id = new.to_account_id and user_id = new.user_id;
  if f.id is null or t.id is null then
    raise exception 'Unknown account' using errcode = '23503';
  end if;
  if new.category_id is not null and not exists
     (select 1 from public.categories where id = new.category_id and user_id = new.user_id) then
    raise exception 'Unknown category' using errcode = '23503';
  end if;
  if new.envelope_id is not null and not exists
     (select 1 from public.envelopes where id = new.envelope_id and user_id = new.user_id) then
    raise exception 'Unknown envelope' using errcode = '23503';
  end if;
  if new.venture_id is not null and not exists
     (select 1 from public.ventures where id = new.venture_id and user_id = new.user_id) then
    raise exception 'Unknown venture' using errcode = '23503';
  end if;

  -- Only the from → to pairs in SPEC §2.2 are meaningful.
  if (f.kind, t.kind) not in (
    ('source', 'asset'), ('asset', 'sink'), ('asset', 'asset'),
    ('asset', 'person'), ('person', 'asset'), ('person', 'sink')
  ) then
    raise exception 'Money cannot move from % to %', f.kind, t.kind using errcode = '23514';
  end if;

  if t.kind = 'sink' and new.category_id is null then
    raise exception 'Expenses need a category' using errcode = '23514';
  end if;
  if t.kind <> 'sink' then
    new.category_id := null;
    new.need_want := null;
  end if;

  person_involved := f.kind = 'person' or t.kind = 'person';
  if person_involved and new.loan_action is null then
    raise exception 'Person transactions need a loan_action' using errcode = '23514';
  end if;
  if not person_involved then
    new.loan_action := null;
    new.due_date := null;
    new.settles_transaction_id := null;
  end if;

  return new;
end;
$$;

create trigger transactions_validate
  before insert or update on public.transactions
  for each row execute function private.validate_transaction();

-- ── Envelope moves ───────────────────────────────────────────────────────────
create table public.envelope_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  occurred_on date not null default (now() at time zone 'Asia/Karachi')::date,
  amount bigint not null check (amount > 0),
  from_envelope_id uuid references public.envelopes on delete restrict,  -- null = To Assign
  to_envelope_id uuid references public.envelopes on delete restrict,    -- null = To Assign
  kind text not null check (kind in ('assign', 'move', 'investment', 'draw')),
  note text,
  created_at timestamptz not null default now(),
  check (from_envelope_id is distinct from to_envelope_id)
);
select private.apply_owner_rls('public.envelope_moves');

-- ── Balance snapshots ────────────────────────────────────────────────────────
create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  taken_on date not null,
  balance bigint not null,
  adjustment_transaction_id uuid references public.transactions on delete set null,
  created_at timestamptz not null default now()
);
select private.apply_owner_rls('public.balance_snapshots');

-- ── Views & functions ────────────────────────────────────────────────────────

-- Balance = incoming − outgoing (SPEC §2.1). Persons: + they owe me, − I owe them.
create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.kind,
  a.subtype,
  a.on_budget,
  a.archived,
  coalesce(inc.total, 0) - coalesce(out.total, 0) as balance,
  coalesce(inc.total, 0) as total_in,
  coalesce(out.total, 0) as total_out
from public.accounts a
left join (
  select to_account_id as id, sum(amount) as total from public.transactions group by 1
) inc on inc.id = a.id
left join (
  select from_account_id as id, sum(amount) as total from public.transactions group by 1
) out on out.id = a.id;

-- Each transaction with its derived type (SPEC §2.2 — never stored).
create or replace view public.transactions_typed
with (security_invoker = true) as
select
  t.*,
  case
    when f.kind = 'source' and t2.kind = 'asset' then
      case when f.meta->>'system' = 'opening_balance' then 'opening' else 'income' end
    when t2.kind = 'sink' then 'expense'
    when f.kind = 'asset' and t2.kind = 'asset' then 'transfer'
    else 'loan'
  end as tx_type
from public.transactions t
join public.accounts f on f.id = t.from_account_id
join public.accounts t2 on t2.id = t.to_account_id;

-- Income / expense for a date range, excluding transfers, loans and opening balances.
create or replace function public.period_summary(p_start date, p_end date)
returns table (income bigint, expense bigint, net bigint, days int)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(amount) filter (where tx_type = 'income'), 0)::bigint,
    coalesce(sum(amount) filter (where tx_type = 'expense'), 0)::bigint,
    (coalesce(sum(amount) filter (where tx_type = 'income'), 0)
      - coalesce(sum(amount) filter (where tx_type = 'expense'), 0))::bigint,
    (p_end - p_start + 1)::int
  from public.transactions_typed
  where occurred_on between p_start and p_end
$$;

-- ── First-run seed (SPEC §2.3, §11) ──────────────────────────────────────────
-- Idempotent: only seeds when the user has no categories yet.
create or replace function public.seed_defaults()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  parent uuid;
  cat record;
  child text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.categories where user_id = uid) then
    return;
  end if;

  -- System accounts.
  insert into public.accounts (user_id, name, kind, on_budget, meta) values
    (uid, 'Spending', 'sink', false, '{"system": "spending"}'),
    (uid, 'Opening Balance', 'source', false, '{"system": "opening_balance"}')
  on conflict do nothing;

  -- Personal envelopes.
  insert into public.envelopes (user_id, name, kind, sort_order)
  select uid, n, 'personal', o
  from unnest(array['Food','Transport','Bills','Shopping','Health','Personal','Family','Charity','Savings goal','Fun'])
       with ordinality as e(n, o)
  on conflict do nothing;

  -- Categories: name, default need/want, default envelope, children.
  for cat in
    select * from (values
      (1,  'Food',              'need', 'Food',     array['Daily meals','Snacks','Eating out','Groceries'], false),
      (2,  'Transport',         'need', 'Transport',array['Fuel','Ride-hailing','Public transport','Vehicle maintenance'], false),
      (3,  'Shopping',          'want', 'Shopping', array['Clothes','Electronics','Home items','Other'], false),
      (4,  'Bills',             'need', 'Bills',    array['Mobile','Internet','Electricity','Gas','Rent'], false),
      (5,  'Health',            'need', 'Health',   array['Medicine','Doctor'], false),
      (6,  'Education',         'need', 'Personal', array['Courses','Books'], false),
      (7,  'Personal care',     'need', 'Personal', array[]::text[], false),
      (8,  'Entertainment',     'want', 'Fun',      array[]::text[], false),
      (9,  'Subscriptions',     'want', 'Bills',    array['Software/AI tools','Streaming'], false),
      (10, 'Family support',    'need', 'Family',   array[]::text[], false),
      (11, 'Charity',           'need', 'Charity',  array['Sadqa','Zakat'], false),
      (12, 'Fees & charges',    'need', 'Bills',    array['Bank/wallet fees'], false),
      (13, 'Business',          'need', null,       array['Ads','Tools','Hosting','Commissions','Freelance platform fees','Other'], false),
      (14, 'Loan written off',  null,   null,       array[]::text[], true),
      (15, 'Reconciliation adjustment', null, null, array[]::text[], true)
    ) as v(ord, name, nw, env_name, children, sys)
  loop
    insert into public.categories (user_id, name, default_need_want, default_envelope_id, is_system, sort_order)
    values (
      uid, cat.name, cat.nw,
      (select id from public.envelopes where user_id = uid and name = cat.env_name),
      cat.sys, cat.ord
    )
    returning id into parent;

    for child in select unnest(cat.children) loop
      insert into public.categories (user_id, parent_id, name, default_need_want, default_envelope_id, sort_order)
      select uid, parent, child,
             case when cat.name = 'Food' and child in ('Snacks', 'Eating out') then 'want' else cat.nw end,
             (select id from public.envelopes where user_id = uid and name = cat.env_name),
             0;
    end loop;
  end loop;
end;
$$;

grant execute on function public.seed_defaults() to authenticated;
grant execute on function public.period_summary(date, date) to authenticated;
