"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { ChartCard, ChartEmpty, DataTable } from "@/components/charts/chart-card";
import { EChart, baseOption, categoryAxis, valueAxis } from "@/components/charts/echart";
import { formatDay } from "@/lib/dates";
import { formatCompactPKR, formatPKR } from "@/lib/format";
import { useOpenItems, usePersonBalances, useVentureSummary } from "@/lib/ledger/queries";
import type { Analytics } from "./use-analytics";

/** Horizontal bars that diverge from zero; sign carries meaning (good/bad), so it uses the semantic pair. */
function divergingBars(a: Analytics, items: { name: string; value: number }[], label: string) {
  const t = a.theme!;
  return (
    <EChart
      label={label}
      height={items.length * 36 + 24}
      option={{
        ...baseOption(t),
        grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
        tooltip: { ...baseOption(t).tooltip, trigger: "item", valueFormatter: (v: number) => formatPKR(v) },
        xAxis: { ...valueAxis(t), splitLine: { show: false }, axisLabel: { show: false } },
        yAxis: { ...categoryAxis(t, items.map((i) => i.name)), inverse: true, axisLine: { show: false } },
        series: [
          {
            type: "bar",
            barMaxWidth: 20,
            data: items.map((i) => ({
              value: i.value,
              itemStyle: { color: i.value < 0 ? t.expense : t.income, borderRadius: i.value < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] },
            })),
            label: {
              show: true,
              position: "right",
              color: t.ink,
              fontSize: 11,
              formatter: (p: { value: number }) => formatCompactPKR(p.value),
            },
            markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: t.axis, type: "solid", width: 1 }, data: [{ xAxis: 0 }] },
          },
        ],
      }}
    />
  );
}

// ── 12. Ventures ─────────────────────────────────────────────────────────────

export function Ventures({ a }: { a: Analytics }) {
  const summary = useVentureSummary(a.current.start, a.current.end);
  const list = (summary.data ?? []).filter((v) => !v.archived && (v.revenue || v.costs || v.invested || v.drawn || v.status === "active"));

  return (
    <ChartCard
      title="Ventures"
      description="Profit this period · burn and payback on each venture's page"
      table={{
        columns: ["Venture", "Put in", "Revenue", "Costs", "Profit", "Took out", "ROI"],
        rows: list.map((v) => [v.name, formatPKR(v.invested), formatPKR(v.revenue), formatPKR(v.costs), formatPKR(v.profit), formatPKR(v.drawn), v.roi === null ? "—" : `${v.roi}%`]),
      }}
    >
      {!list.length ? (
        <ChartEmpty height={160}>No ventures yet.</ChartEmpty>
      ) : (
        <div className="flex flex-col gap-4">
          {divergingBars(a, list.map((v) => ({ name: v.name, value: v.profit })), "Bar chart of profit per venture")}
          <div className="flex flex-wrap gap-2">
            {list.map((v) => (
              <Link key={v.venture_id} href={`/ventures/${v.venture_id}`} className="rounded-full bg-muted px-3 py-1 text-sm hover:bg-accent">
                {v.name} · ROI {v.roi === null ? "—" : `${v.roi}%`}
              </Link>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ── 13. Loans ────────────────────────────────────────────────────────────────

export function Loans({ a }: { a: Analytics }) {
  const people = usePersonBalances();
  const open = useOpenItems();
  const active = (people.data ?? []).filter((p) => !p.archived && (p.they_owe_me || p.i_owe_them));
  const owedToMe = active.reduce((s, p) => s + Math.max(p.they_owe_me, 0), 0);
  const iOwe = active.reduce((s, p) => s + Math.max(p.i_owe_them, 0), 0);
  const overdue = (open.data ?? [])
    .filter((i) => i.outstanding > 0 && i.due_date && i.due_date < a.today)
    .sort((x, y) => x.due_date!.localeCompare(y.due_date!));
  const name = (id: string) => a.model.accountById.get(id)?.name ?? "?";

  return (
    <ChartCard
      title="Loans"
      description="Positive: they owe you · negative: you owe them"
      table={{
        columns: ["Person", "They owe me", "I owe them", "Net"],
        rows: active.map((p) => [p.name, formatPKR(p.they_owe_me), formatPKR(p.i_owe_them), formatPKR(p.net)]),
      }}
    >
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Owed to me</dt>
          <dd className="text-lg font-semibold">{formatPKR(owedToMe)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">I owe</dt>
          <dd className="text-lg font-semibold">{formatPKR(iOwe)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Net</dt>
          <dd className="text-lg font-semibold">{formatPKR(owedToMe - iOwe)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Overdue</dt>
          <dd className="flex items-center gap-1 text-lg font-semibold">
            {overdue.length > 0 && <AlertTriangle className="size-4 text-warning" aria-hidden />}
            {overdue.length}
          </dd>
        </div>
      </dl>
      {active.length ? divergingBars(a, active.map((p) => ({ name: p.name, value: p.net })), "Bar chart of net balance per person") : <ChartEmpty height={120}>No open loans.</ChartEmpty>}
      {overdue.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" /> Overdue
          </p>
          <DataTable
            columns={["Person", "Direction", "Due", "Outstanding"]}
            align={["left", "left", "left", "right"]}
            rows={overdue.map((i) => [name(i.person_id), i.direction === "they_owe" ? "Owes you" : "You owe", formatDay(i.due_date!, a.today), formatPKR(i.outstanding)])}
          />
        </div>
      )}
    </ChartCard>
  );
}
