"use client";

import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { EChart, baseOption, categoryAxis, valueAxis } from "@/components/charts/echart";
import { balancesAtMonthEnds, incomeBySource, netWorthByMonth, pctChange, regularSources } from "@/lib/analytics/compute";
import { formatCompactPKR, formatPKR, formatPct } from "@/lib/format";
import { useBalances, usePersonBalances } from "@/lib/ledger/queries";
import { slotColor, type Analytics } from "./use-analytics";

// ── 10. Net worth ────────────────────────────────────────────────────────────

export function NetWorth({ a }: { a: Analytics }) {
  const t = a.theme!;
  const series = netWorthByMonth(a.rows, a.months, a.lookups);
  const balances = useBalances();
  const people = usePersonBalances();
  const assets = (balances.data ?? []).filter((b) => b.kind === "asset").reduce((s, b) => s + Number(b.balance), 0);
  const owedToMe = (people.data ?? []).reduce((s, p) => s + Math.max(p.they_owe_me, 0), 0);
  const iOwe = (people.data ?? []).reduce((s, p) => s + Math.max(p.i_owe_them, 0), 0);
  const now = assets + owedToMe - iOwe;
  const yearAgo = series[0]?.value ?? 0;

  return (
    <ChartCard
      title="Net worth"
      description="All accounts + owed to me − I owe"
      table={{ columns: ["Month end", "Net worth"], rows: series.map((s, i) => [a.monthLabels[i], formatPKR(s.value)]) }}
    >
      <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-4xl font-semibold md:text-5xl">{formatPKR(now)}</p>
          <p className="text-sm text-muted-foreground">
            {formatPct(pctChange(now, yearAgo))} over 12 months
          </p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-muted-foreground">Accounts</dt>
            <dd className="font-medium">{formatPKR(assets)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owed to me</dt>
            <dd className="font-medium">{formatPKR(owedToMe)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">I owe</dt>
            <dd className="font-medium">{formatPKR(iOwe)}</dd>
          </div>
        </dl>
      </div>
      {series.some((s) => s.value) ? (
        <EChart
          label="Line chart of net worth over 12 months"
          height={220}
          option={{
            ...baseOption(t),
            grid: { left: 4, right: 56, top: 12, bottom: 4, containLabel: true },
            tooltip: { ...baseOption(t).tooltip, trigger: "axis", valueFormatter: (v: number) => formatPKR(v) },
            xAxis: { ...categoryAxis(t, a.monthLabels), boundaryGap: false },
            yAxis: { ...valueAxis(t), scale: true },
            series: [
              {
                type: "line",
                data: series.map((s) => s.value),
                symbolSize: 8,
                showSymbol: false,
                lineStyle: { width: 2, color: t.series[0] },
                itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2 },
                areaStyle: { color: t.series[0], opacity: 0.1 },
                endLabel: { show: true, color: t.ink, fontSize: 11, formatter: (p: { value: number }) => formatCompactPKR(p.value) },
              },
            ],
          }}
        />
      ) : (
        <ChartEmpty height={220} />
      )}
    </ChartCard>
  );
}

// ── 11. Income ───────────────────────────────────────────────────────────────

export function Income({ a }: { a: Analytics }) {
  const t = a.theme!;
  const sources = incomeBySource(a.rows, a.months, a.lookups);
  const regular = regularSources(sources);
  const named = sources.filter((s) => a.sourceSlots.has(s.id)).sort((x, y) => a.sourceSlots.get(x.id)! - a.sourceSlots.get(y.id)!);
  const rest = sources.filter((s) => !a.sourceSlots.has(s.id));
  const stacks = [
    ...named.map((s) => ({ name: s.name, data: s.byMonth, color: slotColor(a, a.sourceSlots.get(s.id)) })),
    ...(rest.length ? [{ name: "Other", data: a.months.map((_, i) => rest.reduce((sum, s) => sum + s.byMonth[i], 0)), color: t.other }] : []),
  ];
  const total = sources.reduce((s, x) => s + x.total, 0);
  const regularTotal = sources.filter((s) => regular.has(s.id)).reduce((s, x) => s + x.total, 0);

  return (
    <ChartCard
      title="Income by source"
      description={
        total
          ? `Last 12 months · ${Math.round((regularTotal / total) * 100)}% regular (salary-like), ${Math.round(((total - regularTotal) / total) * 100)}% irregular`
          : "Last 12 months"
      }
      table={{
        columns: ["Source", "Type", "12-month total"],
        rows: [...sources].sort((x, y) => y.total - x.total).map((s) => [s.name, regular.has(s.id) ? "Regular" : "Irregular", formatPKR(s.total)]),
        align: ["left", "left", "right"],
      }}
    >
      {total ? (
        <EChart
          label="Stacked bar chart of income by source per month"
          height={260}
          option={{
            ...baseOption(t),
            legend: { ...baseOption(t).legend, top: 0, left: 0 },
            grid: { left: 4, right: 8, top: 36, bottom: 4, containLabel: true },
            tooltip: { ...baseOption(t).tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: t.grid, opacity: 0.5 } }, valueFormatter: (v: number) => formatPKR(v) },
            xAxis: categoryAxis(t, a.monthLabels),
            yAxis: valueAxis(t),
            series: stacks.map((s, i) => ({
              name: s.name,
              type: "bar",
              stack: "income",
              barMaxWidth: 24,
              data: s.data,
              // 2px surface gap between segments; only the top segment gets the rounded end.
              itemStyle: { color: s.color, borderColor: t.surface, borderWidth: 1, borderRadius: i === stacks.length - 1 ? [4, 4, 0, 0] : 0 },
              emphasis: { focus: "series" },
            })),
          }}
        />
      ) : (
        <ChartEmpty height={260} />
      )}
    </ChartCard>
  );
}

// ── 14. Accounts ─────────────────────────────────────────────────────────────

export function Accounts({ a }: { a: Analytics }) {
  const t = a.theme!;
  // Stable colour by account creation order (entity, not rank).
  const assets = a.model.assets;
  const slotOf = new Map(assets.map((acc, i) => [acc.id, i]));
  const lines = assets.slice(0, 6).map((acc) => ({
    acc,
    data: balancesAtMonthEnds(a.rows, a.months, (x) => x?.id === acc.id, a.lookups).map((b) => b.value),
  }));
  const balances = useBalances();
  const current = assets.map((acc) => ({ acc, value: Number(balances.data?.find((b) => b.account_id === acc.id)?.balance ?? 0) }));

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <ChartCard
        title="Account balances"
        description="Right now"
        table={{ columns: ["Account", "Balance"], rows: current.map((c) => [c.acc.name, formatPKR(c.value)]) }}
      >
        {current.length ? (
          <EChart
            label="Bar chart of current account balances"
            height={current.length * 36 + 16}
            option={{
              ...baseOption(t),
              grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
              tooltip: { ...baseOption(t).tooltip, trigger: "item", valueFormatter: (v: number) => formatPKR(v) },
              xAxis: { ...valueAxis(t), splitLine: { show: false }, axisLabel: { show: false } },
              yAxis: { ...categoryAxis(t, current.map((c) => c.acc.name)), inverse: true },
              series: [
                {
                  type: "bar",
                  barMaxWidth: 20,
                  data: current.map((c) => ({ value: c.value, itemStyle: { color: c.value < 0 ? t.expense : t.series[0], borderRadius: c.value < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] } })),
                  label: { show: true, position: "right", color: t.ink, fontSize: 11, formatter: (p: { value: number }) => formatCompactPKR(p.value) },
                },
              ],
            }}
          />
        ) : (
          <ChartEmpty height={180} />
        )}
      </ChartCard>

      <ChartCard
        title="Balance trend"
        description={assets.length > 6 ? "First 6 accounts · see Table for all" : "Month-end balance per account"}
        table={{
          columns: ["Month", ...lines.map((l) => l.acc.name)],
          rows: a.months.map((_, i) => [a.monthLabels[i], ...lines.map((l) => formatCompactPKR(l.data[i]))]),
        }}
      >
        {lines.length ? (
          <EChart
            label="Line chart of account balances over time"
            height={260}
            option={{
              ...baseOption(t),
              legend: { ...baseOption(t).legend, top: 0, left: 0 },
              grid: { left: 4, right: 12, top: 36, bottom: 4, containLabel: true },
              tooltip: { ...baseOption(t).tooltip, trigger: "axis", valueFormatter: (v: number) => formatPKR(v) },
              xAxis: { ...categoryAxis(t, a.monthLabels), boundaryGap: false },
              yAxis: valueAxis(t),
              series: lines.map((l) => {
                const color = t.series[slotOf.get(l.acc.id)!] ?? t.other;
                return {
                  name: l.acc.name,
                  type: "line",
                  data: l.data,
                  showSymbol: false,
                  symbolSize: 8,
                  lineStyle: { width: 2, color },
                  itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
                  emphasis: { focus: "series" },
                };
              }),
            }}
          />
        ) : (
          <ChartEmpty height={260} />
        )}
      </ChartCard>
    </div>
  );
}
