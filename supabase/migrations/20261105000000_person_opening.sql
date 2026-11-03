-- Starting loan balance per person: "before I started tracking, Saad owed me /
-- I owed Saad Rs X". One entry per person, editable; it touches no account and
-- never counts as income or spending.
--   they owe me:  Opening Balance → person   (loan_action 'opening')
--   I owe them:   person → Opening Balance   (loan_action 'opening')

alter table public.transactions drop constraint if exists transactions_loan_action_check;
alter table public.transactions add constraint transactions_loan_action_check check (loan_action in
  ('lend', 'borrow', 'repay_to_me', 'repay_by_me', 'friend_paid', 'write_off', 'opening'));

-- At most one starting balance per person (the other side is always Opening Balance).
create unique index transactions_one_person_opening
  on public.transactions (user_id, least(from_account_id, to_account_id), greatest(from_account_id, to_account_id))
  where loan_action = 'opening';

-- Allow Opening Balance ↔ person, and only for a person's starting balance.
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

  -- Only the from → to pairs in SPEC §2.2 are meaningful, plus a person's starting balance.
  if (f.kind, t.kind) in (('source', 'person'), ('person', 'source')) then
    if new.loan_action is distinct from 'opening'
       or coalesce(f.meta->>'system', t.meta->>'system') is distinct from 'opening_balance' then
      raise exception 'Only a starting balance can link a person to Opening Balance' using errcode = '23514';
    end if;
  elsif (f.kind, t.kind) not in (
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
    (new.loan_action in ('friend_paid', 'write_off') and fk = 'person' and tk = 'sink') or
    (new.loan_action = 'opening' and ((fk = 'source' and tk = 'person') or (fk = 'person' and tk = 'source')))
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
      (new.loan_action in ('repay_to_me', 'write_off')
        and (target.loan_action = 'lend' or (target.loan_action = 'opening' and fk = 'person'))
        and target.to_account_id = new.from_account_id) or
      (new.loan_action = 'repay_by_me'
        and (target.loan_action in ('borrow', 'friend_paid') or (target.loan_action = 'opening' and tk = 'person'))
        and target.from_account_id = new.to_account_id)
    ) then
      raise exception 'That repayment cannot settle the chosen item' using errcode = '23514';
    end if;
  elsif new.loan_action in ('lend', 'borrow', 'friend_paid', 'opening') then
    new.settles_transaction_id := null;
  end if;

  return new;
end;
$$;

-- Starting balances count on the right side of the person's position.
create or replace view public.person_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.archived,
  a.meta,
  coalesce(sum(t.amount) filter (where t.loan_action = 'lend' or (t.loan_action = 'opening' and t.to_account_id = a.id)), 0)
    - coalesce(sum(t.amount) filter (where t.loan_action in ('repay_to_me', 'write_off')), 0) as they_owe_me,
  coalesce(sum(t.amount) filter (where t.loan_action in ('borrow', 'friend_paid') or (t.loan_action = 'opening' and t.from_account_id = a.id)), 0)
    - coalesce(sum(t.amount) filter (where t.loan_action = 'repay_by_me'), 0) as i_owe_them,
  coalesce(sum(t.amount) filter (where t.to_account_id = a.id), 0)
    - coalesce(sum(t.amount) filter (where t.from_account_id = a.id), 0) as net,
  max(t.occurred_on) as last_activity
from public.accounts a
left join public.transactions t
  on t.from_account_id = a.id or t.to_account_id = a.id
where a.kind = 'person'
group by a.id;

-- Starting balances are the oldest open item, so repayments settle them first.
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
      case
        when t.loan_action in ('lend', 'repay_by_me') then t.to_account_id
        when t.loan_action = 'opening' and fa.kind = 'source' then t.to_account_id
        else t.from_account_id
      end as pid,
      t.loan_action = 'opening' and fa.kind = 'source' as opening_owed_to_me
    from public.transactions t
    join public.accounts fa on fa.id = t.from_account_id
    where t.loan_action is not null
  ),
  items as (
    select id, pid, loan_action, occurred_on, due_date, amount, note, merchant, created_at,
      case when loan_action = 'lend' or opening_owed_to_me then 'they_owe' else 'i_owe' end as direction,
      -- Starting balances predate everything else for this person.
      case when loan_action = 'opening' then 0 else 1 end as rank
    from person_tx
    where loan_action in ('lend', 'borrow', 'friend_paid', 'opening')
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
      sum(r.rem) over (partition by r.pid, r.direction order by r.rank, r.occurred_on, r.created_at, r.id) as cum
    from remaining r
    left join pools p on p.pid = r.pid and p.direction = r.direction
  )
  select id, pid, direction, loan_action, occurred_on, due_date, amount,
         greatest(0, least(rem, cum - pool))::bigint as outstanding, note, merchant
  from ordered
  order by pid, direction, rank, occurred_on, created_at
$$;

-- Lists show a starting balance as "opening", never as income or a loan movement.
create or replace view public.transactions_typed
with (security_invoker = true) as
select
  t.*,
  case
    when f.meta->>'system' = 'reconciliation'
      or (t2.kind = 'sink' and c.is_system and c.name = 'Reconciliation adjustment') then 'adjustment'
    when t.loan_action = 'opening' then 'opening'
    when f.kind = 'source' and t2.kind = 'asset' then
      case when f.meta->>'system' = 'opening_balance' then 'opening' else 'income' end
    when t2.kind = 'sink' then 'expense'
    when f.kind = 'asset' and t2.kind = 'asset' then 'transfer'
    else 'loan'
  end as tx_type
from public.transactions t
join public.accounts f on f.id = t.from_account_id
join public.accounts t2 on t2.id = t.to_account_id
left join public.categories c on c.id = t.category_id;

-- Set, change or clear a person's starting balance in one call.
--   p_direction: 'they_owe' | 'i_owe'; amount 0 (or null direction) clears it.
create or replace function public.set_person_opening(p_person uuid, p_direction text, p_amount bigint)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  person public.accounts;
  src uuid;
  existing public.transactions;
  tx uuid;
begin
  select * into person from public.accounts where id = p_person and user_id = uid and kind = 'person';
  if person.id is null then
    raise exception 'Unknown person' using errcode = '23503';
  end if;
  if p_direction is not null and p_direction not in ('they_owe', 'i_owe') then
    raise exception 'Direction must be they_owe or i_owe' using errcode = '22023';
  end if;

  select * into existing from public.transactions
  where user_id = uid and loan_action = 'opening' and (from_account_id = p_person or to_account_id = p_person);

  if p_direction is null or coalesce(p_amount, 0) <= 0 then
    if existing.id is not null then
      -- Repayments that pointed at it fall back to oldest-first.
      update public.transactions set settles_transaction_id = null where settles_transaction_id = existing.id;
      delete from public.transactions where id = existing.id;
    end if;
    return null;
  end if;

  select id into src from public.accounts where user_id = uid and meta->>'system' = 'opening_balance';
  if src is null then
    insert into public.accounts (user_id, name, kind, on_budget, meta)
    values (uid, 'Opening Balance', 'source', false, '{"system": "opening_balance"}') returning id into src;
  end if;

  if existing.id is not null then
    update public.transactions
    set amount = p_amount,
        from_account_id = case when p_direction = 'they_owe' then src else p_person end,
        to_account_id = case when p_direction = 'they_owe' then p_person else src end
    where id = existing.id
    returning id into tx;
  else
    insert into public.transactions (user_id, occurred_on, amount, from_account_id, to_account_id, loan_action, entry_method, note)
    values (
      uid,
      -- Dated when the person was added: it's what stood before tracking began.
      (person.created_at at time zone 'Asia/Karachi')::date,
      p_amount,
      case when p_direction = 'they_owe' then src else p_person end,
      case when p_direction = 'they_owe' then p_person else src end,
      'opening', 'system', 'Starting balance'
    )
    returning id into tx;
  end if;
  return tx;
end;
$$;

grant execute on function public.set_person_opening(uuid, text, bigint) to authenticated;
