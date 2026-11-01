"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Account,
  AccountBalance,
  BalanceSnapshot,
  BalanceUpdate,
  BudgetOverview,
  Category,
  Envelope,
  EnvelopeBalance,
  EnvelopeMove,
  MoveKind,
  OpenItem,
  PeriodSummary,
  PersonBalance,
  TxType,
  TypedTransaction,
  Venture,
  VentureMonth,
  VentureSummary,
} from "@/lib/db/types";
import type { AccountValues, PersonValues, TransactionValues, VentureValues } from "./schema";

let client: ReturnType<typeof createClient> | null = null;
const db = () => (client ??= createClient());

// Every ledger read sits under this prefix so one invalidation refreshes them all.
const LEDGER = "ledger";
export const keys = {
  accounts: [LEDGER, "accounts"] as const,
  balances: [LEDGER, "balances"] as const,
  categories: [LEDGER, "categories"] as const,
  transactions: (f: TransactionFilters) => [LEDGER, "transactions", f] as const,
  summary: (start: string, end: string) => [LEDGER, "summary", start, end] as const,
  people: [LEDGER, "people"] as const,
  openItems: (personId?: string) => [LEDGER, "open-items", personId ?? "all"] as const,
  ventures: [LEDGER, "ventures"] as const,
  ventureSummary: (start?: string, end?: string) => [LEDGER, "venture-summary", start ?? "", end ?? ""] as const,
  ventureMonthly: (id: string) => [LEDGER, "venture-monthly", id] as const,
  envelopes: [LEDGER, "envelopes"] as const,
  envelopeBalances: (month: string) => [LEDGER, "envelope-balances", month] as const,
  budget: (month?: string) => [LEDGER, "budget", month ?? "all"] as const,
  moves: (envelopeId?: string) => [LEDGER, "moves", envelopeId ?? "all"] as const,
  snapshots: [LEDGER, "snapshots"] as const,
};

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** All accounts, archived included (old entries still need their names). */
export function useAccounts() {
  return useQuery({
    queryKey: keys.accounts,
    queryFn: async () => unwrap<Account[]>(await db().from("accounts").select("*").order("created_at")),
  });
}

export function usePersonBalances() {
  return useQuery({
    queryKey: keys.people,
    queryFn: async () =>
      unwrap<PersonBalance[]>(await db().from("person_balances").select("*").order("name")).map((p) => ({
        ...p,
        they_owe_me: Number(p.they_owe_me),
        i_owe_them: Number(p.i_owe_them),
        net: Number(p.net),
      })),
  });
}

/** Open loan items after repayments (oldest-first settlement); all people when no id. */
export function useOpenItems(personId?: string) {
  return useQuery({
    queryKey: keys.openItems(personId),
    queryFn: async () =>
      unwrap<OpenItem[]>(await db().rpc("person_open_items", personId ? { p_person: personId } : {})).map((i) => ({
        ...i,
        amount: Number(i.amount),
        outstanding: Number(i.outstanding),
      })),
  });
}

export function useVentures() {
  return useQuery({
    queryKey: keys.ventures,
    queryFn: async () => unwrap<Venture[]>(await db().from("ventures").select("*").order("created_at")),
  });
}

export function useVentureSummary(start?: string, end?: string) {
  return useQuery({
    queryKey: keys.ventureSummary(start, end),
    queryFn: async () =>
      unwrap<VentureSummary[]>(
        await db().rpc("venture_summary", { p_start: start ?? null, p_end: end ?? null }),
      ).map((v) => ({
        ...v,
        revenue: Number(v.revenue),
        costs: Number(v.costs),
        profit: Number(v.profit),
        invested: Number(v.invested),
        drawn: Number(v.drawn),
        net_personal: Number(v.net_personal),
        roi: v.roi === null ? null : Number(v.roi),
      })),
    placeholderData: (prev) => prev,
  });
}

export function useVentureMonthly(ventureId: string) {
  return useQuery({
    queryKey: keys.ventureMonthly(ventureId),
    queryFn: async () =>
      unwrap<VentureMonth[]>(await db().rpc("venture_monthly", { p_venture: ventureId })).map((r) => ({
        month: r.month,
        revenue: Number(r.revenue),
        costs: Number(r.costs),
        invested: Number(r.invested),
        drawn: Number(r.drawn),
      })),
  });
}

export function useBalances() {
  return useQuery({
    queryKey: keys.balances,
    queryFn: async () =>
      unwrap<AccountBalance[]>(await db().from("account_balances").select("*").eq("archived", false)),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () =>
      unwrap<Category[]>(
        await db().from("categories").select("*").eq("archived", false).order("sort_order").order("name"),
      ),
    staleTime: 5 * 60_000,
  });
}

export type TransactionFilters = {
  accountId?: string;
  personId?: string;
  ventureId?: string;
  autoConfirmed?: boolean;
  voice?: boolean;
  categoryIds?: string[];
  type?: TxType;
  forWhom?: string;
  needWant?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
};

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: keys.transactions(filters),
    queryFn: async () => {
      let q = db()
        .from("transactions_typed")
        .select("*")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(filters.limit ?? 500);

      if (filters.accountId) {
        q = q.or(`from_account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId}`);
      }
      // Separate or() calls are ANDed, so account + person narrows to both.
      if (filters.personId) {
        q = q.or(`from_account_id.eq.${filters.personId},to_account_id.eq.${filters.personId}`);
      }
      if (filters.ventureId) q = q.eq("venture_id", filters.ventureId);
      if (filters.autoConfirmed) q = q.eq("auto_confirmed", true);
      if (filters.voice) q = q.eq("entry_method", "voice");
      if (filters.categoryIds?.length) q = q.in("category_id", filters.categoryIds);
      if (filters.type) q = q.eq("tx_type", filters.type);
      if (filters.forWhom) q = q.eq("for_whom", filters.forWhom);
      if (filters.needWant) q = q.eq("need_want", filters.needWant);
      if (filters.from) q = q.gte("occurred_on", filters.from);
      if (filters.to) q = q.lte("occurred_on", filters.to);
      if (filters.search) {
        // Strip characters that would break PostgREST's or() syntax.
        const s = filters.search.replace(/[,()*%]/g, " ").trim();
        if (s) q = q.or(`merchant.ilike.*${s}*,note.ilike.*${s}*`);
      }
      return unwrap<TypedTransaction[]>(await q);
    },
    placeholderData: (prev) => prev,
  });
}

export function usePeriodSummary(start: string, end: string) {
  return useQuery({
    queryKey: keys.summary(start, end),
    queryFn: async () => {
      const rows = unwrap<PeriodSummary[]>(
        await db().rpc("period_summary", { p_start: start, p_end: end }),
      );
      const r = rows[0];
      return {
        income: Number(r?.income ?? 0),
        expense: Number(r?.expense ?? 0),
        net: Number(r?.net ?? 0),
        days: Number(r?.days ?? 1),
      };
    },
  });
}

export function useEnvelopes() {
  return useQuery({
    queryKey: keys.envelopes,
    queryFn: async () =>
      unwrap<Envelope[]>(await db().from("envelopes").select("*").order("sort_order").order("name")),
  });
}

const num = (v: unknown) => Number(v ?? 0);

/** Per-envelope figures for the month containing `month` (YYYY-MM-DD). */
export function useEnvelopeBalances(month: string) {
  return useQuery({
    queryKey: keys.envelopeBalances(month),
    queryFn: async () =>
      unwrap<EnvelopeBalance[]>(await db().rpc("envelope_balances", { p_month: month })).map((e) => ({
        ...e,
        monthly_target: e.monthly_target === null ? null : num(e.monthly_target),
        rolled_over: num(e.rolled_over),
        assigned: num(e.assigned),
        spent: num(e.spent),
        received: num(e.received),
        available: num(e.available),
      })),
    placeholderData: (prev) => prev,
  });
}

/** On-budget total, envelope total and To Assign at the end of a month (default: now). */
export function useBudgetOverview(month?: string) {
  return useQuery({
    queryKey: keys.budget(month),
    queryFn: async () => {
      const r = unwrap<BudgetOverview[]>(await db().rpc("budget_overview", { p_month: month ?? null }))[0];
      return { on_budget_total: num(r?.on_budget_total), envelopes_total: num(r?.envelopes_total), to_assign: num(r?.to_assign) };
    },
    placeholderData: (prev) => prev,
  });
}

export function useEnvelopeMoves(envelopeId?: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.moves(envelopeId),
    enabled,
    queryFn: async () => {
      let q = db()
        .from("envelope_moves")
        .select("*")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (envelopeId) q = q.or(`from_envelope_id.eq.${envelopeId},to_envelope_id.eq.${envelopeId}`);
      return unwrap<EnvelopeMove[]>(await q).map((m) => ({ ...m, amount: num(m.amount) }));
    },
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

function useLedgerMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: [LEDGER] }),
  });
}

/** Map validated form values to a transactions row (SPEC §3 columns). */
function transactionRow(values: TransactionValues) {
  const isLoan = values.type === "loan";
  // Expenses and "friend paid for me" carry a category; write-offs get theirs from the DB.
  const hasCategory = values.type === "expense" || values.loan_action === "friend_paid";
  return {
    amount: values.amount,
    occurred_on: values.occurred_on,
    from_account_id: values.from_account_id,
    to_account_id: values.to_account_id,
    category_id: hasCategory ? (values.category_id ?? null) : null,
    need_want: hasCategory ? (values.need_want ?? null) : null,
    for_whom: values.for_whom,
    merchant: values.merchant,
    note: values.note,
    venture_id: values.type === "expense" || values.type === "income" ? (values.venture_id ?? null) : null,
    // null lets the DB pick the default (category envelope, Savings goal, or To Assign).
    envelope_id: values.envelope_id ?? null,
    loan_action: isLoan ? values.loan_action : null,
    due_date: isLoan && (values.loan_action === "lend" || values.loan_action === "borrow") ? (values.due_date ?? null) : null,
    settles_transaction_id: isLoan ? (values.settles_transaction_id ?? null) : null,
  };
}

export type EntryMeta = {
  entry_method: "manual" | "voice";
  auto_confirmed?: boolean;
  raw_transcript?: string | null;
  entry_batch_id?: string | null;
  /** Reuse the same id on retries so the insert stays idempotent. */
  client_id?: string;
};

/** Insert one transaction; idempotent on client_id (offline sync in Phase 6). */
export async function insertTransaction(values: TransactionValues, meta: EntryMeta = { entry_method: "manual" }) {
  const res = unwrap<{ id: string }[]>(
    await db()
      .from("transactions")
      .upsert(
        {
          ...transactionRow(values),
          entry_method: meta.entry_method,
          auto_confirmed: meta.auto_confirmed ?? false,
          raw_transcript: meta.raw_transcript ?? null,
          entry_batch_id: meta.entry_batch_id ?? null,
          client_id: meta.client_id ?? crypto.randomUUID(),
        },
        { onConflict: "client_id", ignoreDuplicates: true },
      )
      .select("id"),
  );
  return res[0]?.id;
}

export function useSaveTransaction() {
  return useLedgerMutation(
    async ({ id, values, meta }: { id?: string; values: TransactionValues; meta?: EntryMeta }) => {
      if (id) {
        unwrap(await db().from("transactions").update(transactionRow(values)).eq("id", id).select("id"));
        return id;
      }
      return insertTransaction(values, meta);
    },
  );
}

/** Remove several transactions at once (Undo for auto-added voice entries). */
export function useDeleteTransactions() {
  return useLedgerMutation(async (ids: string[]) => {
    if (ids.length) unwrap(await db().from("transactions").delete().in("id", ids).select("id"));
  });
}

export async function insertMove(move: MoveInput) {
  const res = unwrap<{ id: string }[]>(await db().from("envelope_moves").insert(move).select("id"));
  return res[0]?.id;
}

export function useDeleteTransaction() {
  return useLedgerMutation(async (id: string) => {
    unwrap(await db().from("transactions").delete().eq("id", id).select("id"));
  });
}

/** Undo for delete: put the exact row back, same id and client_id. */
export function useRestoreTransaction() {
  return useLedgerMutation(async (tx: TypedTransaction) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tx_type is derived, not a column
    const { tx_type, ...row } = tx;
    unwrap(await db().from("transactions").insert(row).select("id"));
  });
}

/** Creates an asset or income source; an asset's opening balance becomes a system income. */
export async function createAccount(values: AccountValues, openingSourceId: string | undefined, date: string) {
  const account = unwrap<Account>(
    await db()
      .from("accounts")
      .insert({
        name: values.name,
        kind: values.kind,
        subtype: values.kind === "asset" ? values.subtype : null,
        on_budget: values.kind === "asset" ? values.on_budget : false,
      })
      .select("*")
      .single(),
  );

  if (values.kind === "asset" && values.opening_balance > 0 && openingSourceId) {
    unwrap(
      await db()
        .from("transactions")
        .insert({
          amount: values.opening_balance,
          occurred_on: date,
          from_account_id: openingSourceId,
          to_account_id: account.id,
          entry_method: "system",
          note: "Opening balance",
          client_id: crypto.randomUUID(),
        })
        .select("id"),
    );
  }
  return account;
}

export function useCreateAccount() {
  return useLedgerMutation(
    async ({ values, openingSourceId, date }: { values: AccountValues; openingSourceId?: string; date: string }) =>
      createAccount(values, openingSourceId, date),
  );
}

export async function createPerson(values: Pick<PersonValues, "name"> & Partial<PersonValues>) {
  return unwrap<Account>(
    await db()
      .from("accounts")
      .insert({
        name: values.name,
        kind: "person",
        on_budget: false,
        meta: { ...(values.phone && { phone: values.phone }), ...(values.note && { note: values.note }) },
      })
      .select("*")
      .single(),
  );
}

export function useCreatePerson() {
  return useLedgerMutation(createPerson);
}

/** Rename, change meta, or archive any account (people included). */
export function useUpdateAccount() {
  return useLedgerMutation(
    async ({ id, patch }: { id: string; patch: Partial<Pick<Account, "name" | "archived" | "meta" | "on_budget">> }) => {
      unwrap(await db().from("accounts").update(patch).eq("id", id).select("id"));
    },
  );
}

export async function createVenture(values: VentureValues) {
  return unwrap<Venture>(await db().from("ventures").insert(values).select("*").single());
}

export function useCreateVenture() {
  return useLedgerMutation(createVenture);
}

export function useUpdateVenture() {
  return useLedgerMutation(async ({ id, patch }: { id: string; patch: Partial<VentureValues & { archived: boolean }> }) => {
    unwrap(await db().from("ventures").update(patch).eq("id", id).select("id"));
  });
}

export type MoveInput = {
  kind: MoveKind;
  amount: number;
  occurred_on: string;
  from_envelope_id: string | null; // null = To Assign
  to_envelope_id: string | null;
  note?: string | null;
};

export function useCreateMove() {
  return useLedgerMutation(insertMove);
}

export function useDeleteMove() {
  return useLedgerMutation(async (id: string) => {
    unwrap(await db().from("envelope_moves").delete().eq("id", id).select("id"));
  });
}

export function useCopyLastMonth() {
  return useLedgerMutation(async (month: string) =>
    unwrap<number>(await db().rpc("copy_last_month_plan", { p_month: month })),
  );
}

export function useSaveEnvelope() {
  return useLedgerMutation(
    async ({ id, values }: { id?: string; values: Partial<Pick<Envelope, "name" | "monthly_target" | "archived" | "sort_order">> }) => {
      if (id) unwrap(await db().from("envelopes").update(values).eq("id", id).select("id"));
      else unwrap(await db().from("envelopes").insert({ ...values, kind: "personal" }).select("id"));
    },
  );
}

/** Latest "Update balance" per account (when you last checked it against the bank). */
export function useLastSnapshots() {
  return useQuery({
    queryKey: keys.snapshots,
    queryFn: async () => {
      const rows = unwrap<BalanceSnapshot[]>(
        await db().from("balance_snapshots").select("*").order("taken_on", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      );
      const latest = new Map<string, BalanceSnapshot>();
      for (const r of rows) if (!latest.has(r.account_id)) latest.set(r.account_id, { ...r, balance: Number(r.balance) });
      return latest;
    },
  });
}

/** Tell the app what an account really holds; the DB records the difference (SPEC §2.7). */
export async function updateBalance(accountId: string, balance: number, date?: string) {
  const r = unwrap<BalanceUpdate>(await db().rpc("update_balance", { p_account: accountId, p_balance: balance, p_date: date ?? null }));
  return { ...r, previous: Number(r.previous), balance: Number(r.balance), difference: Number(r.difference) };
}

export function useUpdateBalance() {
  return useLedgerMutation(({ accountId, balance, date }: { accountId: string; balance: number; date?: string }) =>
    updateBalance(accountId, balance, date),
  );
}

export async function seedDefaults() {
  unwrap(await db().rpc("seed_defaults"));
}
