"use client";

import { AlertTriangle } from "lucide-react";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { EChart, baseOption, categoryAxis, valueAxis } from "@/components/charts/echart";
import { balancesAtMonthEnds, cashflowMonthly, savingsRateByMonth, totals } from "@/lib/analytics/compute";
import { daysBetween } from "@/lib/analytics/period";
import { addDays, monthRange } from "@/lib/dates";
import { formatCompactPKR, formatPKR } from "@/lib/format";
import { useEnvelopeBalances } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";
import type { Analytics } from "./use-analytics";

// ── 8. Envelope health ───────────────────────────────────────────────────────

export function EnvelopeHealth({ a }: { a: Analytics }) {
  const t = a.theme!;
  const month = monthRange(a.today);
  const balances = useEnvelopeBalances(month.start);
  const elapsed = daysBetween(month.start, a.today);
  const remaining = daysBetween(a.today, month.end) - 1;

  const rows = (balances.data ?? [])
    .filter((e) => e.kind === "personal" && !e.archived && (e.assigned || e.spent || e.available || e.rolled_over))
    .map((e) => {
      const budget = e.rolled_over + e.assigned + e.received;
      const pace = e.spent / Math.max(elapsed, 1);
      return { ...e, budget, projected: e.available - pace * remaining, used: budget > 0 ? e.spent / budget : e.spent > 0 ? 1.01 : 0 };
    });
  const totalBudget = rows.reduce((s, r) => s + Math.max(r.budget, 0), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const usedPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const monthPct = Math.round((elapsed / daysBetween(month.start, month.end)) * 100);
  const gaugeColor = usedPct > 100 ? t.expense : usedPct > monthPct + 10 ? t.warning : t.series[0];

  return (
    <ChartCard
      title="Envelope health"
      description="This month · projected at the current pace"
      table={{
        columns: ["Envelope", "Budget", "Spent", "Available", "Month-end"],
        rows: rows.map((r) => [r.name, formatPKR(r.budget), formatPKR(r.spent), formatPKR(r.available), formatPKR(r.projected)]),
      }}
    >
      {!rows.length ? (
        <ChartEmpty height={220}>Assign money to envelopes to see their health.</ChartEmpty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center">
            <EChart
              label={`Gauge: ${usedPct}% of this month's envelope money spent`}
              height={180}
              option={{
                ...baseOption(t),
                series: [
                  {
                    type: "gauge",
                    startAngle: 210,
                    endAngle: -30,
                    min: 0,
                    max: 100,
                    radius: "92%",
                    progress: { show: true, width: 12, roundCap: true, itemStyle: { color: gaugeColor } },
                    axisLine: { roundCap: true, lineStyle: { width: 12, color: [[1, t.grid]] } },
                    pointer: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: { show: false },
                    anchor: { show: false },
                    title: { show: false },
                    detail: { valueAnimation: true, offsetCenter: [0, 0], fontSize: 28, fontWeight: 600, color: t.fg, formatter: "{value}%" },
                    data: [{ value: Math.min(usedPct, 999) }],
                  },
                ],
              }}
            />
            <p className="-mt-6 text-center text-sm text-muted-foreground">
              spent of {formatCompactPKR(totalBudget)} · {monthPct}% of the month gone
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const over = r.available < 0;
              const willRunOut = !over && r.projected < 0;
              const fill = over ? "bg-expense" : r.used > 0.9 || willRunOut ? "bg-warning" : "bg-primary";
              const track = over ? "bg-expense/15" : r.used > 0.9 || willRunOut ? "bg-warning/15" : "bg-primary/15";
              return (
                <li key={r.envelope_id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      <span className={cn("font-medium text-foreground", over && "text-expense")}>{formatPKR(r.available)}</span> left
                    </span>
                  </div>
                  <div className={cn("mt-1 h-2 overflow-hidden rounded-full", track)}>
                    <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.min(r.used, 1) * 100}%` }} />
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {(over || willRunOut) && <AlertTriangle className={cn("size-3", over ? "text-expense" : "text-warning")} />}
                    {over
                      ? `Overspent by ${formatPKR(-r.available)}`
                      : willRunOut
                        ? `At this pace it runs out — about ${formatPKR(-r.projected)} short by month end`
                        : `${formatPKR(r.spent)} of ${formatPKR(r.budget)} · ends near ${formatPKR(r.projected)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

// ── 9. Savings ───────────────────────────────────────────────────────────────

export function Savings({ a }: { a: Analytics }) {
  const t = a.theme!;
  const rates = savingsRateByMonth(a.rows, a.months);
  const cur = totals(a.rows, a.current);
  const curRate = cur.income ? ((cur.income - cur.expense) / cur.income) * 100 : null;

  const savingsAccounts = a.model.assets.filter((x) => x.subtype === "savings");
  const savingIds = new Set(savingsAccounts.map((x) => x.id));
  const balance = balancesAtMonthEnds(a.rows, a.months, (acc) => !!acc && savingIds.has(acc.id), a.lookups);
  // Profit = income from a source straight into a savings account (e.g. Mahana Profit).
  const profit = cashflowMonthly(
    a.rows.filter((r) => r.tx_type === "income" && savingIds.has(r.to_account_id)),
    a.months,
  ).map((m) => m.income);
  const last30 = a.rows
    .filter((r) => r.tx_type === "income" && savingIds.has(r.to_account_id) && r.occurred_on > addDays(a.today, -30))
    .reduce((s, r) => s + r.amount, 0);
  const nowBalance = balance.at(-1)?.value ?? 0;
  const annualised = nowBalance > 0 ? (last30 / nowBalance) * (365 / 30) * 100 : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        title="Savings rate"
        description={curRate === null ? "Share of income kept each month" : `${Math.round(curRate)}% of income kept this period`}
        table={{ columns: ["Month", "Saved %"], rows: rates.map((r, i) => [a.monthLabels[i], r.rate === null ? "—" : `${r.rate.toFixed(0)}%`]) }}
      >
        {rates.some((r) => r.rate !== null) ? (
          <EChart
            label="Bar chart of monthly savings rate"
            height={220}
            option={{
              ...baseOption(t),
              grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
              tooltip: { ...baseOption(t).tooltip, trigger: "axis", valueFormatter: (v: number | null) => (v == null ? "—" : `${v}%`) },
              xAxis: categoryAxis(t, a.monthLabels),
              yAxis: valueAxis(t, { percent: true }),
              series: [
                {
                  type: "bar",
                  barMaxWidth: 20,
                  data: rates.map((r) =>
                    r.rate === null
                      ? null
                      : {
                          value: Math.round(r.rate),
                          // Below zero means spending ate more than income: an expense signal.
                          itemStyle: { color: r.rate < 0 ? t.expense : t.series[0], borderRadius: r.rate < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0] },
                        },
                  ),
                },
              ],
            }}
          />
        ) : (
          <ChartEmpty height={220} />
        )}
      </ChartCard>

      <ChartCard
        title="Savings accounts"
        description={
          savingsAccounts.length
            ? `${savingsAccounts.map((s) => s.name).join(", ")} · ${formatPKR(nowBalance)}${annualised !== null ? ` · ~${annualised.toFixed(1)}% a year lately` : ""}`
            : "No savings accounts yet"
        }
        table={{
          columns: ["Month", "Balance", "Profit"],
          rows: balance.map((b, i) => [a.monthLabels[i], formatPKR(b.value), formatPKR(profit[i])]),
        }}
      >
        {savingsAccounts.length && balance.some((b) => b.value) ? (
          <EChart
            label="Line chart of savings balance over 12 months"
            height={220}
            option={{
              ...baseOption(t),
              grid: { left: 4, right: 8, top: 12, bottom: 4, containLabel: true },
              tooltip: { ...baseOption(t).tooltip, trigger: "axis", valueFormatter: (v: number) => formatPKR(v) },
              xAxis: { ...categoryAxis(t, a.monthLabels), boundaryGap: false },
              yAxis: valueAxis(t),
              series: [
                {
                  name: "Balance",
                  type: "line",
                  data: balance.map((b) => b.value),
                  showSymbol: false,
                  lineStyle: { width: 2, color: t.series[2] },
                  itemStyle: { color: t.series[2] },
                  areaStyle: { color: t.series[2], opacity: 0.1 },
                },
              ],
            }}
          />
        ) : (
          <ChartEmpty height={220}>Add a savings account (like Mahana) to track it here.</ChartEmpty>
        )}
        {profit.some((p) => p) && (
          <p className="mt-2 text-xs text-muted-foreground">
            Profit credited, last 12 months: {formatPKR(profit.reduce((s, p) => s + p, 0))}. Exact growth rates arrive with “Update
            balance” in Phase 6.
          </p>
        )}
      </ChartCard>
    </div>
  );
}
