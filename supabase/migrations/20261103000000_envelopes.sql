-- Phase 3: envelopes (SPEC §2.6, D2, D10).
--
-- Model: every transaction changes the on-budget total by
--   (+amount if it lands in an on-budget asset) − (amount if it leaves one).
-- That change belongs to exactly one envelope: transactions.envelope_id,
-- where null means "To Assign". Envelope moves shift money between envelopes
-- without touching accounts. So, by construction:
--   on-budget total = Σ envelope balances + To Assign.

-- Mark the envelope that savings transfers come out of by default.
alter table public.envelopes add column role text check (role in ('savings_goal'));
create unique index envelopes_one_savings_goal on public.envelopes (user_id) where role = 'savings_goal';
update public.envelopes set role = 'savings_goal' where name = 'Savings goal' and kind = 'personal';

-- Keep the seed in step for new users.
create or replace function private.mark_savings_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'personal' and new.name = 'Savings goal' and new.role is null
     and not exists (select 1 from public.envelopes where user_id = new.user_id and role = 'savings_goal') then
    new.role := 'savings_goal';
  end if;
  return new;
end;
$$;
create trigger envelopes_mark_savings_goal
  before insert on public.envelopes
  for each row execute function private.mark_savings_goal();

-- ── Which envelope a transaction hits ────────────────────────────────────────
-- Fires after transactions_validate* ("z" sorts last), so categories are final.
create or replace function private.assign_transaction_envelope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  effect bigint;
  to_acc public.accounts;
begin
  -- Trigger functions run as the caller, who can't reach the private schema; keep this inline.
  select (case when t.on_budget then new.amount else 0 end) - (case when f.on_budget then new.amount else 0 end)
  into effect
  from public.accounts f, public.accounts t
  where f.id = new.from_account_id and t.id = new.to_account_id;

  if effect = 0 then
    -- Moves between on-budget accounts, or entirely off-budget: no envelope.
    new.envelope_id := null;
  elsif new.venture_id is not null then
    -- D10: business revenue lands in, and business costs come from, the venture envelope.
    select envelope_id into new.envelope_id from public.ventures where id = new.venture_id;
  elsif effect > 0 then
    -- Unlinked income, repayments, borrowing, withdrawals: To Assign.
    new.envelope_id := null;
  elsif new.envelope_id is null then
    -- Outflow with no envelope chosen: use the natural default.
    select * into to_acc from public.accounts where id = new.to_account_id;
    if to_acc.kind = 'sink' then
      select default_envelope_id into new.envelope_id from public.categories where id = new.category_id;
    elsif to_acc.kind = 'asset' then
      select id into new.envelope_id from public.envelopes where user_id = new.user_id and role = 'savings_goal';
    end if;
    -- Lending / repaying from an on-budget account defaults to To Assign (null).
  end if;

  if new.envelope_id is not null and exists
     (select 1 from public.envelopes where id = new.envelope_id and kind = 'to_assign') then
    new.envelope_id := null;
  end if;
  return new;
end;
$$;

create trigger z_transactions_envelope
  before insert or update on public.transactions
  for each row execute function private.assign_transaction_envelope();

-- Re-derive envelopes for anything entered before this migration.
update public.transactions set envelope_id = null;

-- ── Envelope move rules ──────────────────────────────────────────────────────
--   assign      To Assign ↔ personal (either way; back to To Assign = unassign)
--   move        personal → personal (e.g. covering an overspend)
--   investment  To Assign / personal → venture  ("Invest in ElevLoop")
--   draw        venture → To Assign              ("Pay myself")
create or replace function private.validate_envelope_move()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  fk text;
  tk text;
begin
  if new.from_envelope_id is not null then
    select kind into fk from public.envelopes where id = new.from_envelope_id and user_id = new.user_id;
    if fk is null then raise exception 'Unknown envelope' using errcode = '23503'; end if;
  end if;
  if new.to_envelope_id is not null then
    select kind into tk from public.envelopes where id = new.to_envelope_id and user_id = new.user_id;
    if tk is null then raise exception 'Unknown envelope' using errcode = '23503'; end if;
  end if;

  if not (
    (new.kind = 'assign' and ((fk is null and tk = 'personal') or (fk = 'personal' and tk is null))) or
    (new.kind = 'move' and fk = 'personal' and tk = 'personal') or
    (new.kind = 'investment' and (fk is null or fk = 'personal') and tk = 'venture') or
    (new.kind = 'draw' and fk = 'venture' and tk is null)
  ) then
    raise exception 'A % cannot go from % to %', new.kind, coalesce(fk, 'To Assign'), coalesce(tk, 'To Assign')
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger envelope_moves_validate
  before insert or update on public.envelope_moves
  for each row execute function private.validate_envelope_move();

-- ── Read side ────────────────────────────────────────────────────────────────

-- Every budget-relevant change, from transactions and moves, as signed amounts
-- per envelope (null = To Assign).
create or replace view public.envelope_ledger
with (security_invoker = true) as
select x.user_id, x.occurred_on, x.envelope_id, x.amount, 'activity'::text as source, x.id as ref_id
from (
  select t.user_id, t.occurred_on, t.envelope_id, t.id,
    (case when ta.on_budget then t.amount else 0 end) - (case when fa.on_budget then t.amount else 0 end) as amount
  from public.transactions t
  join public.accounts fa on fa.id = t.from_account_id
  join public.accounts ta on ta.id = t.to_account_id
) x
where x.amount <> 0
union all
select m.user_id, m.occurred_on, m.to_envelope_id, m.amount, 'move', m.id from public.envelope_moves m
union all
select m.user_id, m.occurred_on, m.from_envelope_id, -m.amount, 'move', m.id from public.envelope_moves m;

-- Per envelope for one month (SPEC §3): rolled over from before, assigned this
-- month (net moves), spent / received this month, and available at month end.
create or replace function public.envelope_balances(p_month date)
returns table (
  envelope_id uuid,
  name text,
  kind text,
  role text,
  monthly_target bigint,
  sort_order int,
  archived boolean,
  venture_id uuid,
  rolled_over bigint,
  assigned bigint,
  spent bigint,
  received bigint,
  available bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as m_start,
           (date_trunc('month', p_month) + interval '1 month')::date as m_next
  ),
  agg as (
    select l.envelope_id,
      sum(l.amount) filter (where l.occurred_on < b.m_start) as before,
      sum(l.amount) filter (where l.source = 'move' and l.occurred_on >= b.m_start and l.occurred_on < b.m_next) as assigned,
      -sum(l.amount) filter (where l.source = 'activity' and l.amount < 0 and l.occurred_on >= b.m_start and l.occurred_on < b.m_next) as spent,
      sum(l.amount) filter (where l.source = 'activity' and l.amount > 0 and l.occurred_on >= b.m_start and l.occurred_on < b.m_next) as received
    from public.envelope_ledger l, bounds b
    where l.envelope_id is not null and l.occurred_on < b.m_next
    group by l.envelope_id
  )
  select e.id, e.name, e.kind, e.role, e.monthly_target, e.sort_order, e.archived, v.id,
    coalesce(a.before, 0)::bigint,
    coalesce(a.assigned, 0)::bigint,
    coalesce(a.spent, 0)::bigint,
    coalesce(a.received, 0)::bigint,
    (coalesce(a.before, 0) + coalesce(a.assigned, 0) - coalesce(a.spent, 0) + coalesce(a.received, 0))::bigint
  from public.envelopes e
  left join agg a on a.envelope_id = e.id
  left join public.ventures v on v.envelope_id = e.id
  where e.kind <> 'to_assign'
  order by e.kind = 'venture', e.sort_order, e.name
$$;

-- Budget totals at the end of a month (default: all time).
create or replace function public.budget_overview(p_month date default null)
returns table (on_budget_total bigint, envelopes_total bigint, to_assign bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with cutoff as (
    select case when p_month is null then 'infinity'::date
                else (date_trunc('month', p_month) + interval '1 month')::date end as d
  ),
  onb as (
    select coalesce(sum(l.amount), 0) as total
    from public.envelope_ledger l, cutoff c where l.source = 'activity' and l.occurred_on < c.d
  ),
  env as (
    select coalesce(sum(l.amount), 0) as total
    from public.envelope_ledger l, cutoff c where l.envelope_id is not null and l.occurred_on < c.d
  )
  select onb.total::bigint, env.total::bigint, (onb.total - env.total)::bigint from onb, env
$$;

-- "Copy last month's plan": assign what was assigned to each personal envelope
-- last month, minus anything already assigned this month. Returns moves created.
create or replace function public.copy_last_month_plan(p_month date)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m_start date := date_trunc('month', p_month)::date;
  prev_start date := (date_trunc('month', p_month) - interval '1 month')::date;
  n int;
begin
  with plan as (
    select e.id,
      coalesce(sum(l.amount) filter (where l.occurred_on >= prev_start and l.occurred_on < m_start), 0)
      - coalesce(sum(l.amount) filter (where l.occurred_on >= m_start
                                         and l.occurred_on < (m_start + interval '1 month')::date), 0) as gap
    from public.envelopes e
    join public.envelope_ledger l on l.envelope_id = e.id and l.source = 'move'
    join public.envelope_moves mv on mv.id = l.ref_id and mv.kind = 'assign'
    where e.kind = 'personal' and not e.archived
    group by e.id
  ),
  ins as (
    insert into public.envelope_moves (occurred_on, amount, from_envelope_id, to_envelope_id, kind, note)
    select greatest(m_start, least((now() at time zone 'Asia/Karachi')::date, (m_start + interval '1 month - 1 day')::date)),
           gap, null, id, 'assign', 'Copied from last month'
    from plan where gap > 0
    returning 1
  )
  select count(*) into n from ins;
  return n;
end;
$$;

grant execute on function public.envelope_balances(date) to authenticated;
grant execute on function public.budget_overview(date) to authenticated;
grant execute on function public.copy_last_month_plan(date) to authenticated;
