-- Phase 2: loans between me and people (SPEC §2.8) and ventures (SPEC §2.5).

-- ── Loan rules ───────────────────────────────────────────────────────────────
-- Each loan_action fixes the direction of money (SPEC §2.2):
--   lend         asset  → person   they owe me more
--   borrow       person → asset    I owe them more
--   repay_to_me  person → asset    they owe me less
--   repay_by_me  asset  → person   I owe them less
--   friend_paid  person → sink     I owe them more (and it is my spending)
--   write_off    person → sink     they owe me less (category "Loan written off")
create or replace function private.validate_loan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  fk text;
  tk text;
  target public.transactions;
begin
  if new.loan_action is null then
    return new;
  end if;

  select kind into fk from public.accounts where id = new.from_account_id;
  select kind into tk from public.accounts where id = new.to_account_id;

  if not (
    (new.loan_action in ('lend', 'repay_by_me') and fk = 'asset' and tk = 'person') or
    (new.loan_action in ('borrow', 'repay_to_me') and fk = 'person' and tk = 'asset') or
    (new.loan_action in ('friend_paid', 'write_off') and fk = 'person' and tk = 'sink')
  ) then
    raise exception 'loan_action % does not fit % → %', new.loan_action, fk, tk using errcode = '23514';
  end if;

  if new.loan_action not in ('lend', 'borrow') then
    new.due_date := null;
  end if;

  -- A repayment may name the open item it settles; it must be the same person and the right direction.
  if new.settles_transaction_id is not null then
    select * into target from public.transactions
    where id = new.settles_transaction_id and user_id = new.user_id;
    if target.id is null or not (
      (new.loan_action in ('repay_to_me', 'write_off') and target.loan_action = 'lend'
        and target.to_account_id = new.from_account_id) or
      (new.loan_action = 'repay_by_me' and target.loan_action in ('borrow', 'friend_paid')
        and target.from_account_id = new.to_account_id)
    ) then
      raise exception 'That repayment cannot settle the chosen item' using errcode = '23514';
    end if;
  elsif new.loan_action in ('lend', 'borrow', 'friend_paid') then
    new.settles_transaction_id := null;
  end if;

  return new;
end;
$$;

-- Runs after transactions_validate (triggers fire in name order).
create trigger transactions_validate_loan
  before insert or update on public.transactions
  for each row execute function private.validate_loan();

-- Write-offs always use the system "Loan written off" category.
create or replace function private.default_write_off_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.loan_action = 'write_off' and new.category_id is null then
    select id into new.category_id from public.categories
    where user_id = new.user_id and is_system and name = 'Loan written off' and parent_id is null;
  end if;
  return new;
end;
$$;

-- Must run before transactions_validate requires a category: "a" sorts first.
create trigger a_transactions_write_off_category
  before insert or update on public.transactions
  for each row execute function private.default_write_off_category();

-- ── Person balances ──────────────────────────────────────────────────────────
create or replace view public.person_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.archived,
  a.meta,
  coalesce(sum(t.amount) filter (where t.loan_action = 'lend'), 0)
    - coalesce(sum(t.amount) filter (where t.loan_action in ('repay_to_me', 'write_off')), 0) as they_owe_me,
  coalesce(sum(t.amount) filter (where t.loan_action in ('borrow', 'friend_paid')), 0)
    - coalesce(sum(t.amount) filter (where t.loan_action = 'repay_by_me'), 0) as i_owe_them,
  coalesce(sum(t.amount) filter (where t.to_account_id = a.id), 0)
    - coalesce(sum(t.amount) filter (where t.from_account_id = a.id), 0) as net,
  max(t.occurred_on) as last_activity
from public.accounts a
left join public.transactions t
  on t.from_account_id = a.id or t.to_account_id = a.id
where a.kind = 'person'
group by a.id;

-- Open loan items per person, after repayments. A repayment that names an item
-- settles it first (any excess spills over); everything else settles oldest first.
create or replace function public.person_open_items(p_person uuid default null)
returns table (
  transaction_id uuid,
  person_id uuid,
  direction text,          -- 'they_owe' | 'i_owe'
  loan_action text,
  occurred_on date,
  due_date date,
  amount bigint,
  outstanding bigint,
  note text,
  merchant text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with person_tx as (
    select t.*,
      case when t.loan_action in ('lend', 'repay_by_me') then t.to_account_id else t.from_account_id end as pid
    from public.transactions t
    where t.loan_action is not null
  ),
  items as (
    select id, pid, loan_action, occurred_on, due_date, amount, note, merchant, created_at,
      case when loan_action = 'lend' then 'they_owe' else 'i_owe' end as direction
    from person_tx
    where loan_action in ('lend', 'borrow', 'friend_paid')
      and (p_person is null or pid = p_person)
  ),
  settlements as (
    select pid, amount, settles_transaction_id,
      case when loan_action = 'repay_by_me' then 'i_owe' else 'they_owe' end as direction
    from person_tx
    where loan_action in ('repay_to_me', 'write_off', 'repay_by_me')
      and (p_person is null or pid = p_person)
  ),
  targeted as (
    select i.id, least(i.amount, coalesce(sum(s.amount), 0)) as applied,
           greatest(coalesce(sum(s.amount), 0) - i.amount, 0) as spill
    from items i
    left join settlements s on s.settles_transaction_id = i.id
    group by i.id, i.amount
  ),
  pools as (
    select pid, direction, sum(amount) filter (where settles_transaction_id is null) as untargeted
    from settlements group by pid, direction
  ),
  remaining as (
    select i.*, i.amount - tg.applied as rem, tg.spill
    from items i join targeted tg on tg.id = i.id
  ),
  ordered as (
    select r.*,
      coalesce(p.untargeted, 0)
        + sum(r.spill) over (partition by r.pid, r.direction) as pool,
      sum(r.rem) over (partition by r.pid, r.direction order by r.occurred_on, r.created_at, r.id) as cum
    from remaining r
    left join pools p on p.pid = r.pid and p.direction = r.direction
  )
  select id, pid, direction, loan_action, occurred_on, due_date, amount,
         greatest(0, least(rem, cum - pool))::bigint as outstanding, note, merchant
  from ordered
  order by pid, direction, occurred_on, created_at
$$;

grant execute on function public.person_open_items(uuid) to authenticated;

-- ── Ventures: each gets its own envelope ─────────────────────────────────────
create or replace function private.venture_envelope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.envelope_id is null then
    insert into public.envelopes (user_id, name, kind, sort_order)
    values (new.user_id, new.name, 'venture', 1000)
    returning id into new.envelope_id;
  elsif tg_op = 'UPDATE' and (new.name is distinct from old.name or new.archived is distinct from old.archived) then
    update public.envelopes set name = new.name, archived = new.archived where id = new.envelope_id;
  end if;
  return new;
end;
$$;

create trigger ventures_envelope
  before insert or update on public.ventures
  for each row execute function private.venture_envelope();

-- Totals per venture for a period (null bounds = all time). Investment and draws
-- are envelope moves (Phase 3); they are counted here already.
create or replace function public.venture_summary(p_start date default null, p_end date default null)
returns table (
  venture_id uuid,
  name text,
  status text,
  archived boolean,
  started_on date,
  revenue bigint,
  costs bigint,
  profit bigint,
  invested bigint,
  drawn bigint,
  net_personal bigint,
  roi numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with tx as (
    select venture_id,
      sum(amount) filter (where tx_type = 'income') as revenue,
      sum(amount) filter (where tx_type = 'expense') as costs
    from public.transactions_typed
    where venture_id is not null
      and (p_start is null or occurred_on >= p_start)
      and (p_end is null or occurred_on <= p_end)
    group by venture_id
  ),
  moves as (
    select v.id as venture_id,
      sum(m.amount) filter (where m.kind = 'investment' and m.to_envelope_id = v.envelope_id) as invested,
      sum(m.amount) filter (where m.kind = 'draw' and m.from_envelope_id = v.envelope_id) as drawn
    from public.ventures v
    join public.envelope_moves m on m.to_envelope_id = v.envelope_id or m.from_envelope_id = v.envelope_id
    where (p_start is null or m.occurred_on >= p_start)
      and (p_end is null or m.occurred_on <= p_end)
    group by v.id
  )
  select v.id, v.name, v.status, v.archived, v.started_on,
    coalesce(tx.revenue, 0)::bigint,
    coalesce(tx.costs, 0)::bigint,
    (coalesce(tx.revenue, 0) - coalesce(tx.costs, 0))::bigint,
    coalesce(mv.invested, 0)::bigint,
    coalesce(mv.drawn, 0)::bigint,
    (coalesce(mv.drawn, 0) - coalesce(mv.invested, 0))::bigint,
    case when coalesce(mv.invested, 0) > 0
      then round((coalesce(tx.revenue, 0) - coalesce(tx.costs, 0)) * 100.0 / mv.invested, 1) end
  from public.ventures v
  left join tx on tx.venture_id = v.id
  left join moves mv on mv.venture_id = v.id
  order by v.archived, v.status = 'closed', v.name
$$;

-- Month-by-month history for one venture (drives burn, payback and the draws chart).
create or replace function public.venture_monthly(p_venture uuid)
returns table (month date, revenue bigint, costs bigint, invested bigint, drawn bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with v as (select id, envelope_id from public.ventures where id = p_venture),
  r as (
    select date_trunc('month', t.occurred_on)::date as month,
      case when t.tx_type = 'income' then t.amount else 0 end as revenue,
      case when t.tx_type = 'expense' then t.amount else 0 end as costs,
      0::bigint as invested, 0::bigint as drawn
    from public.transactions_typed t join v on t.venture_id = v.id
    union all
    select date_trunc('month', m.occurred_on)::date,
      0, 0,
      case when m.kind = 'investment' and m.to_envelope_id = v.envelope_id then m.amount else 0 end,
      case when m.kind = 'draw' and m.from_envelope_id = v.envelope_id then m.amount else 0 end
    from public.envelope_moves m join v on m.to_envelope_id = v.envelope_id or m.from_envelope_id = v.envelope_id
  )
  select month, sum(revenue)::bigint, sum(costs)::bigint, sum(invested)::bigint, sum(drawn)::bigint
  from r group by month order by month
$$;

grant execute on function public.venture_summary(date, date) to authenticated;
grant execute on function public.venture_monthly(uuid) to authenticated;
