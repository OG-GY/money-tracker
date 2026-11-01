// Pure aggregations behind every analytics view (SPEC §6). All exclude
// transfers and loan movements unless stated; opening balances never count.

import type { Account, Category, ForWhom, TxType } from "@/lib/db/types";
import { addDays, addMonths, monthRange } from "@/lib/dates";
import { daysBetween, inRange, type Range } from "./period";

export type Row = {
  id: string;
  occurred_on: string;
  amount: number;
  tx_type: TxType;
  from_account_id: string;
  to_account_id: string;
  category_id: string | null;
  for_whom: ForWhom;
  need_want: "need" | "want" | null;
  merchant: string | null;
  venture_id: string | null;
  loan_action: string | null;
};

export type Lookups = {
  accountById: Map<string, Account>;
  catById: Map<string, Category>;
};

const isIncome = (r: Row) => r.tx_type === "income";
const isExpense = (r: Row) => r.tx_type === "expense";
const within = (rows: Row[], range: Range) => rows.filter((r) => inRange(r.occurred_on, range));
const sum = (rows: Row[]) => rows.reduce((s, r) => s + r.amount, 0);

export function totals(rows: Row[], range: Range) {
  const r = within(rows, range);
  return { income: sum(r.filter(isIncome)), expense: sum(r.filter(isExpense)) };
}

/** Percent change, null when there's nothing to compare against. */
export const pctChange = (now: number, before: number) => (before ? ((now - before) / before) * 100 : null);

export function periodSummary(rows: Row[], current: Range, previous: Range) {
  const c = totals(rows, current);
  const p = totals(rows, previous);
  const days = Math.max(daysBetween(current.start, current.end), 1);
  const prevDays = Math.max(daysBetween(previous.start, previous.end), 1);
  return {
    income: c.income,
    expense: c.expense,
    net: c.income - c.expense,
    dailySpend: c.expense / days,
    prev: { ...p, net: p.income - p.expense, dailySpend: p.expense / prevDays },
    change: {
      income: pctChange(c.income, p.income),
      expense: pctChange(c.expense, p.expense),
      net: pctChange(c.income - c.expense, p.income - p.expense),
      dailySpend: pctChange(c.expense / days, p.expense / prevDays),
    },
  };
}

// ── Time buckets ─────────────────────────────────────────────────────────────

export function daysOf(range: Range) {
  const out: string[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** First days of the `n` months ending with the month containing `today`. */
export function lastMonths(today: string, n: number) {
  const start = monthRange(today).start;
  return Array.from({ length: n }, (_, i) => addMonths(start, i - n + 1));
}

const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

export function cashflowDaily(rows: Row[], range: Range) {
  const by = new Map(daysOf(range).map((d) => [d, { date: d, income: 0, expense: 0 }]));
  for (const r of within(rows, range)) {
    const b = by.get(r.occurred_on);
    if (!b) continue;
    if (isIncome(r)) b.income += r.amount;
    if (isExpense(r)) b.expense += r.amount;
  }
  return [...by.values()];
}

export function cashflowMonthly(rows: Row[], months: string[]) {
  const by = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]));
  for (const r of rows) {
    const b = by.get(monthOf(r.occurred_on));
    if (!b) continue;
    if (isIncome(r)) b.income += r.amount;
    if (isExpense(r)) b.expense += r.amount;
  }
  return [...by.values()];
}

// ── Where it goes ────────────────────────────────────────────────────────────

const parentId = (catId: string | null, l: Lookups) => {
  if (!catId) return "uncategorised";
  return l.catById.get(catId)?.parent_id ?? catId;
};
const catName = (id: string, l: Lookups) => (id === "uncategorised" ? "Uncategorised" : (l.catById.get(id)?.name ?? "Unknown"));

export type Slice = { id: string; name: string; amount: number };

export function byParentCategory(rows: Row[], range: Range, l: Lookups): Slice[] {
  const by = new Map<string, number>();
  for (const r of within(rows, range).filter(isExpense)) {
    const p = parentId(r.category_id, l);
    by.set(p, (by.get(p) ?? 0) + r.amount);
  }
  return [...by].map(([id, amount]) => ({ id, name: catName(id, l), amount })).sort((a, b) => b.amount - a.amount);
}

export function bySubcategory(rows: Row[], range: Range, parent: string, l: Lookups): Slice[] {
  const by = new Map<string, number>();
  for (const r of within(rows, range).filter(isExpense)) {
    if (parentId(r.category_id, l) !== parent) continue;
    const id = r.category_id ?? "uncategorised";
    by.set(id, (by.get(id) ?? 0) + r.amount);
  }
  return [...by]
    .map(([id, amount]) => ({ id, name: id === parent ? `${catName(id, l)} (general)` : catName(id, l), amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function byForWhom(rows: Row[], range: Range) {
  const order: ForWhom[] = ["self", "family", "household", "gift", "other"];
  const by = new Map<ForWhom, number>(order.map((k) => [k, 0]));
  for (const r of within(rows, range).filter(isExpense)) by.set(r.for_whom, (by.get(r.for_whom) ?? 0) + r.amount);
  return order.map((k) => ({ key: k, amount: by.get(k) ?? 0 }));
}

export function needWant(rows: Row[], range: Range) {
  const r = within(rows, range).filter(isExpense);
  const need = sum(r.filter((x) => x.need_want !== "want"));
  const want = sum(r.filter((x) => x.need_want === "want"));
  return { need, want, wantShare: need + want ? (want / (need + want)) * 100 : 0 };
}

export function dailySpend(rows: Row[], range: Range) {
  const by = new Map<string, number>();
  for (const r of within(rows, range).filter(isExpense)) by.set(r.occurred_on, (by.get(r.occurred_on) ?? 0) + r.amount);
  return by;
}

export type TreeNode = { name: string; value: number; children?: TreeNode[] };

export function categoryTree(rows: Row[], range: Range, l: Lookups): TreeNode[] {
  return byParentCategory(rows, range, l).map((p) => {
    const children = bySubcategory(rows, range, p.id, l).map((c) => ({ name: c.name, value: c.amount }));
    return { name: p.name, value: p.amount, children: children.length > 1 ? children : undefined };
  });
}

// ── Leak detection ───────────────────────────────────────────────────────────

/** Categories running above their average over the 3 equal periods before. */
export function aboveAverage(rows: Row[], range: Range, prior: Range[], l: Lookups) {
  const now = byParentCategory(rows, range, l);
  const avg = new Map<string, number>();
  for (const p of prior) for (const s of byParentCategory(rows, p, l)) avg.set(s.id, (avg.get(s.id) ?? 0) + s.amount / prior.length);
  return now
    .map((s) => ({ ...s, average: avg.get(s.id) ?? 0 }))
    .filter((s) => s.average > 0 && s.amount > s.average * 1.1)
    .map((s) => ({ ...s, over: s.amount - s.average, overPct: ((s.amount - s.average) / s.average) * 100 }))
    .sort((a, b) => b.over - a.over);
}

/** Many small spends that add up: by merchant, else subcategory. */
export function smallRepeated(rows: Row[], range: Range, l: Lookups, maxAmount = 1000, minCount = 3) {
  const by = new Map<string, { label: string; count: number; total: number }>();
  for (const r of within(rows, range).filter(isExpense)) {
    if (r.amount > maxAmount) continue;
    const key = r.merchant?.trim().toLowerCase() || `cat:${r.category_id}`;
    const label = r.merchant?.trim() || (r.category_id ? catName(r.category_id, l) : "Uncategorised");
    const g = by.get(key) ?? { label, count: 0, total: 0 };
    g.count++;
    g.total += r.amount;
    by.set(key, g);
  }
  return [...by.values()].filter((g) => g.count >= minCount).sort((a, b) => b.total - a.total);
}

export function wantsShareByMonth(rows: Row[], months: string[]) {
  return months.map((m) => {
    const r = rows.filter((x) => isExpense(x) && monthOf(x.occurred_on) === m);
    const total = sum(r);
    const want = sum(r.filter((x) => x.need_want === "want"));
    return { month: m, share: total ? (want / total) * 100 : null };
  });
}

// ── Savings, net worth, income, accounts ─────────────────────────────────────

export function savingsRateByMonth(rows: Row[], months: string[]) {
  return cashflowMonthly(rows, months).map((m) => ({
    month: m.month,
    rate: m.income ? ((m.income - m.expense) / m.income) * 100 : null,
  }));
}

/** Running balance of a set of accounts at each month end (all history counts). */
export function balancesAtMonthEnds(rows: Row[], months: string[], include: (a: Account | undefined) => boolean, l: Lookups) {
  const sorted = [...rows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  let i = 0;
  let running = 0;
  return months.map((m) => {
    const end = monthRange(m).end;
    while (i < sorted.length && sorted[i].occurred_on <= end) {
      const r = sorted[i++];
      if (include(l.accountById.get(r.to_account_id))) running += r.amount;
      if (include(l.accountById.get(r.from_account_id))) running -= r.amount;
    }
    return { month: m, value: running };
  });
}

/** Net worth = assets + owed to me − I owe = Σ asset and person balances (SPEC §6.10). */
export const netWorthByMonth = (rows: Row[], months: string[], l: Lookups) =>
  balancesAtMonthEnds(rows, months, (a) => a?.kind === "asset" || a?.kind === "person", l);

export function incomeBySource(rows: Row[], months: string[], l: Lookups) {
  const sources = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!isIncome(r)) continue;
    const m = monthOf(r.occurred_on);
    if (!months.includes(m)) continue;
    const per = sources.get(r.from_account_id) ?? new Map<string, number>();
    per.set(m, (per.get(m) ?? 0) + r.amount);
    sources.set(r.from_account_id, per);
  }
  return [...sources].map(([id, per]) => ({
    id,
    name: l.accountById.get(id)?.name ?? "Unknown",
    byMonth: months.map((m) => per.get(m) ?? 0),
    total: [...per.values()].reduce((s, v) => s + v, 0),
  }));
}

/** Salary vs irregular: a source named "salary", or one that paid in each of the last 3 months. */
export function regularSources(series: ReturnType<typeof incomeBySource>) {
  return new Set(
    series
      .filter((s) => /salary|tankhwah/i.test(s.name) || s.byMonth.slice(-4, -1).every((v) => v > 0))
      .map((s) => s.id),
  );
}

// ── Money flow (Sankey) ──────────────────────────────────────────────────────

export type Flow = { nodes: { name: string; group: "source" | "account" | "category" | "venture" | "savings" | "person" }[]; links: { source: string; target: string; value: number }[] };

/** Income sources → accounts → categories / ventures / savings for the period. */
export function moneyFlow(rows: Row[], range: Range, l: Lookups, ventureNames: Map<string, string>): Flow {
  const links = new Map<string, number>();
  const nodes = new Map<string, Flow["nodes"][number]["group"]>();
  const add = (source: string, sGroup: Flow["nodes"][number]["group"], target: string, tGroup: Flow["nodes"][number]["group"], v: number) => {
    nodes.set(source, sGroup);
    nodes.set(target, tGroup);
    const k = `${source}\u0000${target}`;
    links.set(k, (links.get(k) ?? 0) + v);
  };
  const name = (id: string) => l.accountById.get(id)?.name ?? "?";

  for (const r of within(rows, range)) {
    const from = l.accountById.get(r.from_account_id);
    const to = l.accountById.get(r.to_account_id);
    if (r.tx_type === "income") add(name(r.from_account_id), "source", name(r.to_account_id), "account", r.amount);
    else if (r.tx_type === "expense") {
      const src = from?.kind === "person" ? `${from.name} (paid for me)` : name(r.from_account_id);
      const srcGroup = from?.kind === "person" ? "person" : "account";
      if (r.venture_id) add(src, srcGroup, `Venture · ${ventureNames.get(r.venture_id) ?? "?"}`, "venture", r.amount);
      else add(src, srcGroup, catName(parentId(r.category_id, l), l), "category", r.amount);
    } else if (r.tx_type === "transfer" && from?.on_budget && to && !to.on_budget) {
      // Saving: a distinct terminal node keeps the diagram acyclic.
      add(name(r.from_account_id), "account", `Saved · ${to.name}`, "savings", r.amount);
    }
  }
  return {
    nodes: [...nodes].map(([n, group]) => ({ name: n, group })),
    links: [...links].map(([k, value]) => {
      const [source, target] = k.split("\u0000");
      return { source, target, value };
    }),
  };
}

/** Stable colour slots: rank entities by all-time size once, so filters never repaint (dataviz rule). */
export function stableSlots(totals: { id: string; amount: number }[], slots: number) {
  const ranked = [...totals].sort((a, b) => b.amount - a.amount).slice(0, slots);
  return new Map(ranked.map((t, i) => [t.id, i]));
}
