"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useEntry } from "@/components/entry/entry-provider";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import {
  byIncomeGroup,
  byParentCategory,
  bySpendingGroup,
  bySubcategory,
  categoriesInGroup,
  incomeBySourceInRange,
  sourcesInGroup,
  type Lookups,
  type Row,
} from "@/lib/analytics/compute";
import type { Range } from "@/lib/analytics/period";
import { useLedgerRows } from "@/lib/analytics/use-ledger-rows";
import { formatPKR } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { useOpenItems, usePersonBalances } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";

export type Breakdown = "earnings" | "spendings" | "loans";

/** The sheet behind each Home card. */
export function BreakdownPanel({
  open,
  onOpenChange,
  range,
  label,
  today,
}: {
  open: Breakdown | null;
  onOpenChange: (o: Breakdown | null) => void;
  range: Range;
  /** e.g. "November 2026" */
  label: string;
  today: string;
}) {
  const title = open === "earnings" ? "Earnings" : open === "spendings" ? "Spendings" : "Loans";
  return (
    <ResponsivePanel
      open={open !== null}
      onOpenChange={(o) => !o && onOpenChange(null)}
      title={title}
      description={open === "loans" ? "Everything open between you and others" : label}
    >
      {open === "earnings" && <Earnings range={range} />}
      {open === "spendings" && <Spendings range={range} today={today} />}
      {open === "loans" && <Loans today={today} onNavigate={() => onOpenChange(null)} />}
    </ResponsivePanel>
  );
}

function useRowsAndLookups() {
  const rows = useLedgerRows();
  const m = useLedgerModel();
  const lookups: Lookups = useMemo(
    () => ({ accountById: m.accountById, catById: m.catById, groupById: m.groupById }),
    [m.accountById, m.catById, m.groupById],
  );
  // Before the groups migration runs there are none: fall back to flat lists.
  return { rows: rows.data ?? [], lookups, loading: rows.isLoading || m.isLoading, hasGroups: m.groupById.size > 0 };
}

function Loading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="animate-spin text-muted-foreground" />
    </div>
  );
}

/** One line with a flat share bar underneath (one series → one colour). */
function ShareRow({
  name,
  amount,
  share,
  meta,
  onClick,
  open,
  expandable,
}: {
  name: string;
  amount: number;
  share: number;
  meta?: string;
  onClick?: () => void;
  open?: boolean;
  expandable?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} className="w-full py-3 text-left">
      <div className="flex items-center gap-2">
        {expandable &&
          (open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />)}
        <span className="min-w-0 flex-1 truncate font-medium">
          {name}
          {meta && <span className="font-normal text-muted-foreground"> · {meta}</span>}
        </span>
        <span className="font-semibold tabular">{formatPKR(amount)}</span>
        <span className="w-10 text-right text-sm text-muted-foreground tabular">{Math.round(share)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share, 1)}%` }} />
      </div>
    </Comp>
  );
}

// ── Earnings: where it came from ─────────────────────────────────────────────

function Earnings({ range }: { range: Range }) {
  const { rows, lookups, loading, hasGroups } = useRowsAndLookups();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (loading) return <Loading />;
  const sources = incomeBySourceInRange(rows, range, lookups);
  const total = sources.reduce((s, x) => s + x.amount, 0);
  const groups = byIncomeGroup(rows, range, lookups);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-muted p-4">
        <p className="text-sm text-muted-foreground">Total earned</p>
        <p className="text-3xl font-semibold text-income">{formatPKR(total)}</p>
        <p className="text-sm text-muted-foreground">
          {sources.reduce((s, x) => s + x.count, 0)} payments from {sources.length} {sources.length === 1 ? "source" : "sources"}
        </p>
      </div>
      {sources.length && hasGroups ? (
        // Group first (Job 80%), then the sources inside it.
        <div className="divide-y">
          {groups.map((g) => {
            const isOpen = expanded === g.id;
            const members = sourcesInGroup(rows, range, g.id, lookups);
            return (
              <div key={g.id}>
                <ShareRow
                  name={g.name}
                  amount={g.amount}
                  share={(g.amount / total) * 100}
                  meta={`${members.length} ${members.length === 1 ? "source" : "sources"}`}
                  expandable
                  open={isOpen}
                  onClick={() => setExpanded(isOpen ? null : g.id)}
                />
                {isOpen && (
                  <ul className="mb-3 ml-6 flex flex-col gap-2 border-l pl-3 text-sm">
                    {members.map((s) => (
                      <li key={s.id} className="flex justify-between gap-3">
                        <span className="truncate text-muted-foreground">
                          {s.name} · {s.count}×
                        </span>
                        <span className="tabular">
                          {formatPKR(s.amount)}
                          <span className="ml-2 text-muted-foreground">{Math.round((s.amount / g.amount) * 100)}%</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : sources.length ? (
        <div className="divide-y">
          {sources.map((s) => (
            <ShareRow key={s.id} name={s.name} amount={s.amount} share={(s.amount / total) * 100} meta={`${s.count}×`} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing earned yet this month.</p>
      )}
      <Link href="/analytics" className="text-center text-sm text-primary">
        Open Analytics
      </Link>
    </div>
  );
}

// ── Spendings: where it went, by category ────────────────────────────────────

/** Categories (expandable to subcategories), optionally limited to one spending group. */
function CategoryRows({ rows, range, lookups, group }: { rows: Row[]; range: Range; lookups: Lookups; group?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const cats = group ? categoriesInGroup(rows, range, group, lookups) : byParentCategory(rows, range, lookups);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="divide-y">
      {cats.map((c) => {
        const subs = bySubcategory(rows, range, c.id, lookups, group);
        const canExpand = subs.length > 1 || (subs.length === 1 && subs[0].id !== c.id);
        const isOpen = expanded === c.id;
        return (
          <div key={c.id}>
            <ShareRow
              name={c.name}
              amount={c.amount}
              share={(c.amount / (total || 1)) * 100}
              expandable={canExpand}
              open={isOpen}
              onClick={canExpand ? () => setExpanded(isOpen ? null : c.id) : undefined}
            />
            {isOpen && (
              <ul className="mb-3 ml-6 flex flex-col gap-2 border-l pl-3 text-sm">
                {subs.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span className="truncate text-muted-foreground">{s.name}</span>
                    <span className="tabular">
                      {formatPKR(s.amount)}
                      <span className="ml-2 text-muted-foreground">{Math.round((s.amount / c.amount) * 100)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Spendings({ range, today }: { range: Range; today: string }) {
  const { rows, lookups, loading, hasGroups } = useRowsAndLookups();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (loading) return <Loading />;
  const groups = bySpendingGroup(rows, range, lookups);
  const total = groups.reduce((s, g) => s + g.amount, 0);
  const daysSoFar = Math.max(Number((today < range.end ? today : range.end).slice(8, 10)), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-muted p-4">
        <p className="text-sm text-muted-foreground">Total spent</p>
        <p className="text-3xl font-semibold text-expense">{formatPKR(total)}</p>
        <p className="text-sm text-muted-foreground">About {formatPKR(total / daysSoFar)} a day so far</p>
      </div>
      {total && hasGroups ? (
        // Group first (Personal / Family & home …), then its categories, then subcategories.
        <div className="divide-y">
          {groups.map((g) => {
            const isOpen = expanded === g.id;
            return (
              <div key={g.id}>
                <ShareRow
                  name={g.name}
                  amount={g.amount}
                  share={(g.amount / total) * 100}
                  expandable
                  open={isOpen}
                  onClick={() => setExpanded(isOpen ? null : g.id)}
                />
                {isOpen && (
                  <div className="mb-3 ml-6 border-l pl-3">
                    <CategoryRows rows={rows} range={range} lookups={lookups} group={g.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : total ? (
        <CategoryRows rows={rows} range={range} lookups={lookups} />
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing spent yet this month.</p>
      )}
      <Link href="/analytics?tab=spending" className="text-center text-sm text-primary">
        More in Analytics
      </Link>
    </div>
  );
}

// ── Loans: who owes whom ─────────────────────────────────────────────────────

function Loans({ today, onNavigate }: { today: string; onNavigate: () => void }) {
  const people = usePersonBalances();
  const open = useOpenItems();
  const { openNew } = useEntry();
  if (people.isLoading) return <Loading />;

  const active = (people.data ?? [])
    .filter((p) => !p.archived && (p.they_owe_me > 0 || p.i_owe_them > 0))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const owedToMe = active.reduce((s, p) => s + Math.max(p.they_owe_me, 0), 0);
  const iOwe = active.reduce((s, p) => s + Math.max(p.i_owe_them, 0), 0);
  const overdue = new Map<string, number>();
  for (const i of open.data ?? []) {
    if (i.outstanding > 0 && i.due_date && i.due_date < today) overdue.set(i.person_id, (overdue.get(i.person_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-muted p-4">
          <p className="text-sm text-muted-foreground">Others owe you</p>
          <p className="text-2xl font-semibold text-income">{formatPKR(owedToMe)}</p>
        </div>
        <div className="rounded-2xl bg-muted p-4">
          <p className="text-sm text-muted-foreground">You owe</p>
          <p className="text-2xl font-semibold text-expense">{formatPKR(iOwe)}</p>
        </div>
      </div>

      {active.length ? (
        <ul className="divide-y">
          {active.map((p) => {
            const od = overdue.get(p.account_id) ?? 0;
            return (
              <li key={p.account_id}>
                <Link href={`/people/${p.account_id}`} onClick={onNavigate} className="flex items-center gap-3 py-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-primary">
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {p.name}
                      {od > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 text-xs text-warning">
                          <AlertTriangle className="size-3" /> {od} overdue
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[p.they_owe_me > 0 && `owes you ${formatPKR(p.they_owe_me)}`, p.i_owe_them > 0 && `you owe ${formatPKR(p.i_owe_them)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className={cn("text-right font-semibold tabular", p.net > 0 ? "text-income" : p.net < 0 ? "text-expense" : "text-muted-foreground")}>
                    {p.net === 0 ? "Even" : formatPKR(Math.abs(p.net))}
                    <span className="block text-xs font-normal text-muted-foreground">{p.net > 0 ? "to you" : p.net < 0 ? "you owe" : ""}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">No open loans. Nobody owes anyone.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" render={<Link href="/people" onClick={onNavigate} />} nativeButton={false}>
          All people
        </Button>
        <Button
          className="h-11"
          onClick={() => {
            onNavigate();
            openNew({ type: "loan" });
          }}
        >
          <Plus /> Add loan
        </Button>
      </div>
    </div>
  );
}
