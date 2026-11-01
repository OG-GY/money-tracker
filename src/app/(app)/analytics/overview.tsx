"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useState } from "react";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { EChart, baseOption, categoryAxis, valueAxis } from "@/components/charts/echart";
import { Segmented } from "@/components/chip";
import { cashflowDaily, cashflowMonthly, moneyFlow, periodSummary } from "@/lib/analytics/compute";
import { daysBetween } from "@/lib/analytics/period";
import { formatDay } from "@/lib/dates";
import { formatCompactPKR, formatPKR, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Analytics } from "./use-analytics";

// ── 1. Period summary ────────────────────────────────────────────────────────

function Delta({ pct, upIsGood }: { pct: number | null; upIsGood: boolean }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">no earlier data</span>;
  const flat = Math.abs(pct) < 0.5;
  const good = flat ? null : pct > 0 === upIsGood;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good === null ? "text-muted-foreground" : good ? "text-income" : "text-expense")}>
      <Icon className="size-3.5" />
      {formatPct(pct)}
      <span className="font-normal text-muted-foreground">&nbsp;vs before</span>
    </span>
  );
}

export function SummaryTiles({ a }: { a: Analytics }) {
  const s = periodSummary(a.rows, a.current, a.previous);
  const tiles = [
    { label: "Money in", value: s.income, pct: s.change.income, upIsGood: true },
    { label: "Money out", value: s.expense, pct: s.change.expense, upIsGood: false },
    { label: "Net", value: s.net, pct: s.change.net, upIsGood: true },
    { label: "Daily average spend", value: s.dailySpend, pct: s.change.dailySpend, upIsGood: false },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t.label}</p>
          <p className={cn("mt-1 text-xl font-semibold md:text-2xl", t.label === "Net" && t.value < 0 && "text-expense")}>
            {formatPKR(t.value)}
          </p>
          <Delta pct={t.pct} upIsGood={t.upIsGood} />
        </div>
      ))}
    </div>
  );
}

// ── 2. Cash flow trend ───────────────────────────────────────────────────────

export function CashFlow({ a }: { a: Analytics }) {
  const short = daysBetween(a.current.start, a.full.end) <= 62;
  const [mode, setMode] = useState<"period" | "year">(short ? "period" : "year");
  const t = a.theme!;
  const daily = mode === "period";
  const points = daily
    ? cashflowDaily(a.rows, { start: a.current.start, end: a.full.end }).map((d) => ({ label: formatDay(d.date, a.today), ...d }))
    : cashflowMonthly(a.rows, a.months).map((d, i) => ({ label: a.monthLabels[i], ...d }));
  const empty = points.every((p) => !p.income && !p.expense);

  const line = (name: string, color: string, data: number[]) => ({
    name,
    type: "line",
    data,
    smooth: false,
    showSymbol: false,
    symbolSize: 8,
    lineStyle: { width: 2, color, cap: "round", join: "round" },
    itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
    emphasis: { focus: "series" },
    endLabel: { show: true, color: t.ink, fontSize: 11, formatter: (p: { value: number }) => formatCompactPKR(p.value) },
  });

  return (
    <ChartCard
      title="Cash flow"
      description={daily ? "Money in vs out, day by day" : "Money in vs out, last 12 months"}
      action={
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "period", label: "Period" },
            { value: "year", label: "12 mo" },
          ]}
          className="w-36 [&_button]:h-7"
        />
      }
      table={{
        columns: [daily ? "Day" : "Month", "Money in", "Money out", "Net"],
        rows: points.map((p) => [p.label, formatPKR(p.income), formatPKR(p.expense), formatPKR(p.income - p.expense)]),
      }}
    >
      {empty ? (
        <ChartEmpty height={260} />
      ) : (
        <EChart
          label="Line chart of money in and money out"
          height={260}
          option={{
            ...baseOption(t),
            legend: { ...baseOption(t).legend, top: 0, left: 0 },
            grid: { left: 4, right: 56, top: 32, bottom: 4, containLabel: true },
            tooltip: { ...baseOption(t).tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: t.axis } }, valueFormatter: (v: number) => formatPKR(v) },
            xAxis: { ...categoryAxis(t, points.map((p) => p.label)), boundaryGap: false },
            yAxis: valueAxis(t),
            series: [line("Money in", t.income, points.map((p) => p.income)), line("Money out", t.expense, points.map((p) => p.expense))],
          }}
        />
      )}
    </ChartCard>
  );
}

// ── 4. Money flow (Sankey) ───────────────────────────────────────────────────

export function MoneyFlow({ a }: { a: Analytics }) {
  const t = a.theme!;
  const flow = moneyFlow(a.rows, a.current, a.lookups, a.ventureNames);
  const color: Record<string, string> = {
    source: t.income,
    account: t.series[0],
    category: t.other,
    venture: t.series[5],
    savings: t.series[2],
    person: t.series[1],
  };
  const height = Math.max(280, Math.min(flow.nodes.length * 26, 640));

  return (
    <ChartCard
      title="Money flow"
      description="Income sources → accounts → where it went"
      table={{
        columns: ["From", "To", "Amount"],
        rows: [...flow.links].sort((x, y) => y.value - x.value).map((l) => [l.source, l.target, formatPKR(l.value)]),
        align: ["left", "left", "right"],
      }}
    >
      {flow.links.length === 0 ? (
        <ChartEmpty height={280} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <EChart
              label="Sankey diagram of money flow"
              height={height}
              option={{
                ...baseOption(t),
                tooltip: { ...baseOption(t).tooltip, trigger: "item", valueFormatter: (v: number) => formatPKR(v) },
                series: [
                  {
                    type: "sankey",
                    left: 8,
                    right: 120,
                    top: 8,
                    bottom: 8,
                    nodeWidth: 10,
                    nodeGap: 10,
                    nodeAlign: "justify",
                    draggable: false,
                    emphasis: { focus: "adjacency" },
                    data: flow.nodes.map((n) => ({ name: n.name, itemStyle: { color: color[n.group], borderWidth: 0 } })),
                    links: flow.links,
                    lineStyle: { color: "source", opacity: 0.18, curveness: 0.5 },
                    label: { color: t.fg, fontSize: 11, formatter: (p: { name: string; value: number }) => `${p.name}  ${formatCompactPKR(p.value)}` },
                  },
                ],
              }}
            />
          </div>
        </div>
      )}
    </ChartCard>
  );
}
