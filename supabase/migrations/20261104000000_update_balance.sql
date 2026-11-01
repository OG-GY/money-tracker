-- "Update balance" (SPEC §2.7): the user types what an account really holds;
-- the app records the difference so the ledger matches reality.
--   never set before         → Opening Balance (never counts as income)
--   savings account, +diff   → profit income from "<Account> Profit"
--   otherwise                → a balance correction, kept out of income/expense

-- Corrections get their own derived type so analytics skip them.
create or replace view public.transactions_typed
with (security_invoker = true) as
select
  t.*,
  case
    when f.meta->>'system' = 'reconciliation'
      or (t2.kind = 'sink' and c.is_system and c.name = 'Reconciliation adjustment') then 'adjustment'
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

create or replace function public.update_balance(p_account uuid, p_balance bigint, p_date date default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d date := coalesce(p_date, (now() at time zone 'Asia/Karachi')::date);
  acc public.accounts;
  v_current bigint;
  diff bigint;
  has_history boolean;
  v_kind text;
  src uuid;
  sink uuid;
  cat uuid;
  tx uuid;
begin
  select * into acc from public.accounts where id = p_account and user_id = uid and kind = 'asset';
  if acc.id is null then
    raise exception 'Unknown account' using errcode = '23503';
  end if;

  -- Balance as of that day: later entries don't count.
  select coalesce(sum(case when to_account_id = acc.id then amount else -amount end), 0)
  into v_current
  from public.transactions
  where (to_account_id = acc.id or from_account_id = acc.id) and occurred_on <= d;

  select exists (select 1 from public.transactions where to_account_id = acc.id or from_account_id = acc.id)
  into has_history;

  diff := p_balance - v_current;
  v_kind := 'none';

  if diff <> 0 then
    if not has_history and diff > 0 then
      v_kind := 'opening';
      select id into src from public.accounts where user_id = uid and meta->>'system' = 'opening_balance';
      if src is null then
        insert into public.accounts (user_id, name, kind, on_budget, meta)
        values (uid, 'Opening Balance', 'source', false, '{"system": "opening_balance"}') returning id into src;
      end if;
      insert into public.transactions (user_id, occurred_on, amount, from_account_id, to_account_id, entry_method, note)
      values (uid, d, diff, src, acc.id, 'system', 'Opening balance') returning id into tx;

    elsif acc.subtype = 'savings' and diff > 0 then
      v_kind := 'profit';
      -- Reuse "<Account> Profit" (e.g. "Mahana Profit") or create it.
      select id into src from public.accounts
      where user_id = uid and kind = 'source' and lower(name) = lower(acc.name || ' Profit');
      if src is null then
        insert into public.accounts (user_id, name, kind, on_budget)
        values (uid, acc.name || ' Profit', 'source', false) returning id into src;
      end if;
      insert into public.transactions (user_id, occurred_on, amount, from_account_id, to_account_id, entry_method, note)
      values (uid, d, diff, src, acc.id, 'system', 'Profit from balance update') returning id into tx;

    elsif diff > 0 then
      v_kind := 'adjustment';
      select id into src from public.accounts where user_id = uid and meta->>'system' = 'reconciliation';
      if src is null then
        insert into public.accounts (user_id, name, kind, on_budget, meta)
        values (uid, 'Balance correction', 'source', false, '{"system": "reconciliation"}') returning id into src;
      end if;
      insert into public.transactions (user_id, occurred_on, amount, from_account_id, to_account_id, entry_method, note)
      values (uid, d, diff, src, acc.id, 'system', 'Balance correction') returning id into tx;

    else
      v_kind := 'adjustment';
      select id into sink from public.accounts where user_id = uid and meta->>'system' = 'spending';
      select id into cat from public.categories
      where user_id = uid and is_system and name = 'Reconciliation adjustment' and parent_id is null;
      if cat is null then
        insert into public.categories (user_id, name, is_system, sort_order)
        values (uid, 'Reconciliation adjustment', true, 99) returning id into cat;
      end if;
      insert into public.transactions (user_id, occurred_on, amount, from_account_id, to_account_id, category_id, entry_method, note)
      values (uid, d, -diff, acc.id, sink, cat, 'system', 'Balance correction') returning id into tx;
    end if;
  end if;

  insert into public.balance_snapshots (user_id, account_id, taken_on, balance, adjustment_transaction_id)
  values (uid, acc.id, d, p_balance, tx);

  return jsonb_build_object(
    'kind', v_kind,
    'previous', v_current,
    'balance', p_balance,
    'difference', diff,
    'transaction_id', tx,
    -- A savings balance going down needs a human look (SPEC §2.7 step 3).
    'flagged', acc.subtype = 'savings' and diff < 0
  );
end;
$$;

grant execute on function public.update_balance(uuid, bigint, date) to authenticated;
