"use client";

import { ArrowLeft, TrendingUp } from "lucide-react";
import { useState } from "react";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { EChart, baseOption, categoryAxis, valueAxis } from "@/components/charts/echart";
import { Button } from "@/components/ui/button";
import {
  aboveAverage,
  byForWhom,
  byParentCategory,
  bySubcategory,
  categoryTree,
  dailySpend,
  daysOf,
  needWant,
  smallRepeated,
  wantsShareByMonth,
} from "@/lib/analytics/compute";
import { daysBetween, priorPeriods } from "@/lib/analytics/period";
import { formatDay, monthRange } from "@/lib/dates";
import { formatCompactPKR, formatPKR, formatPct } from "@/lib/format";
import { slotColor, type Analytics } from "./use-analytics";

/** Linear blend of two #rrggbb colours (for the calendar scale swatches). */
function mixHex(a: string, b: string, s: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * s).toString(16).padStart(2, "0")).join("")}`;
}

const FOR_WHOM_LABEL: Record<string, string> = { self: "Me", family: "Family", household: "Household", gift: "Gifts", other: "Other" };

// ── 3. Where it goes ─────────────────────────────────────────────────────────

export function WhereItGoes({ a }: { a: Analytics }) {
  const t = a.theme!;
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);
  const cats = byParentCategory(a.rows, a.current, a.lookups);
  const total = cats.reduce((s, c) => s + c.amount, 0);

  // ≤ 6 segments: the stable top-5 categories, everything else folds into Other.
  const named = cats.filter((c) => a.categorySlots.has(c.id));
  const rest = cats.filter((c) => !a.categorySlots.has(c.id));
  const slices = [
    ...named.map((c) => ({ ...c, color: slotColor(a, a.categorySlots.get(c.id)) })),
    ...(rest.length ? [{ id: "other", name: "Other", amount: rest.reduce((s, c) => s + c.amount, 0), color: t.other }] : []),
  ];
  const subs = drill ? (drill.id === "other" ? rest : bySubcategory(a.rows, a.current, drill.id, a.lookups)) : [];
  const drillColor = drill ? (drill.id === "other" ? t.other : slotColor(a, a.categorySlots.get(drill.id))) : t.series[0];

  const whom = byForWhom(a.rows, a.current).filter((w) => w.amount > 0);
  const nw = needWant(a.rows, a.current);

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <ChartCard
        title={drill ? drill.name : "Where it goes"}
        description={drill ? "Subcategories" : `${formatPKR(total)} spent · tap a slice to drill down`}
        action={
          drill && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setDrill(null)}>
              <ArrowLeft /> All
            </Button>
          )
        }
        table={{
          columns: ["Category", "Spent", "Share"],
          rows: (drill ? subs : cats).map((c) => [c.name, formatPKR(c.amount), `${((c.amount / (total || 1)) * 100).toFixed(1)}%`]),
        }}
      >
        {!total ? (
          <ChartEmpty height={280} />
        ) : drill ? (
          <EChart
            label={`Bar chart of ${drill.name} subcategories`}
            height={Math.max(160, subs.length * 36 + 24)}
            option={{
              ...baseOption(t),
              grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
              tooltip: { ...baseOption(t).tooltip, trigger: "item", valueFormatter: (v: number) => formatPKR(v) },
              xAxis: { ...valueAxis(t), splitLine: { show: false }, axisLabel: { show: false } },
              yAxis: { ...categoryAxis(t, subs.map((s) => s.name)), inverse: true },
              series: [
                {
                  type: "bar",
                  data: subs.map((s) => s.amount),
                  barMaxWidth: 20,
                  itemStyle: { color: drillColor, borderRadius: [0, 4, 4, 0] },
                  label: { show: true, position: "right", color: t.ink, fontSize: 11, formatter: (p: { value: number }) => formatCompactPKR(p.value) },
                },
              ],
            }}
          />
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
            <EChart
              label="Donut chart of spending by category"
              height={260}
              onEvents={{
                click: (p) => {
                  const d = (p as { data?: { id: string; name: string } }).data;
                  if (d) setDrill({ id: d.id, name: d.name });
                },
              }}
              option={{
                ...baseOption(t),
                tooltip: {
                  ...baseOption(t).tooltip,
                  trigger: "item",
                  formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br/><b>${formatPKR(p.value)}</b> · ${p.percent}%`,
                },
                series: [
                  {
                    type: "pie",
                    radius: ["58%", "82%"],
                    padAngle: 1,
                    itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
                    label: { show: true, position: "center", formatter: () => formatCompactPKR(total), color: t.fg, fontSize: 20, fontWeight: 600 },
                    labelLine: { show: false },
                    emphasis: { scale: true, scaleSize: 4, label: { show: true } },
                    data: slices.map((s) => ({ id: s.id, name: s.name, value: s.amount, itemStyle: { color: s.color } })),
                  },
                ],
              }}
            />
            {/* Legend + direct labels: identity never rests on colour alone. */}
            <ul className="flex flex-col gap-2 text-sm">
              {slices.map((s) => (
                <li key={s.id}>
                  <button className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => setDrill({ id: s.id, name: s.name })}>
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="tabular text-muted-foreground">{Math.round((s.amount / total) * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ChartCard>

      <div className="flex flex-col gap-4">
        <ChartCard
          title="For whom"
          table={{ columns: ["For", "Spent"], rows: whom.map((w) => [FOR_WHOM_LABEL[w.key], formatPKR(w.amount)]) }}
        >
          {whom.length ? (
            <EChart
              label="Bar chart of spending by who it was for"
              height={whom.length * 34 + 16}
              option={{
                ...baseOption(t),
                grid: { left: 4, right: 64, top: 4, bottom: 4, containLabel: true },
                tooltip: { ...baseOption(t).tooltip, trigger: "item", valueFormatter: (v: number) => formatPKR(v) },
                xAxis: { ...valueAxis(t), splitLine: { show: false }, axisLabel: { show: false } },
                yAxis: { ...categoryAxis(t, whom.map((w) => FOR_WHOM_LABEL[w.key])), inverse: true },
                series: [
                  {
                    type: "bar",
                    data: whom.map((w) => w.amount),
                    barMaxWidth: 18,
                    itemStyle: { color: t.series[0], borderRadius: [0, 4, 4, 0] },
                    label: { show: true, position: "right", color: t.ink, fontSize: 11, formatter: (p: { value: number }) => formatCompactPKR(p.value) },
                  },
                ],
              }}
            />
          ) : (
            <ChartEmpty height={120} />
          )}
        </ChartCard>

        <ChartCard title="Needs vs wants">
          {nw.need + nw.want ? (
            <div>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                <div className="rounded-l-full bg-primary" style={{ width: `${100 - nw.wantShare}%` }} />
                <div className="rounded-r-full bg-chart-2" style={{ width: `${nw.wantShare}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-sm bg-primary" /> Needs
                  </dt>
                  <dd className="font-semibold">{formatPKR(nw.need)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-sm bg-chart-2" /> Wants
                  </dt>
                  <dd className="font-semibold">
                    {formatPKR(nw.want)} <span className="font-normal text-muted-foreground">· {Math.round(nw.wantShare)}%</span>
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <ChartEmpty height={80} />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ── 5. Spending calendar ─────────────────────────────────────────────────────

export function SpendingCalendar({ a }: { a: Analytics }) {
  const t = a.theme!;
  // Show whole months around the period so short periods still read as a calendar.
  const range = { start: monthRange(a.current.start).start, end: monthRange(a.full.end).end };
  const spend = dailySpend(a.rows, range);
  const days = daysOf(range);
  const max = Math.max(0, ...spend.values());
  const months = Math.round(daysBetween(range.start, range.end) / 30);
  const vertical = months <= 2;

  return (
    <ChartCard
      title="Spending calendar"
      description="Each day shaded by how much went out"
      table={{
        columns: ["Day", "Spent"],
        rows: days.filter((d) => spend.get(d)).map((d) => [formatDay(d, a.today), formatPKR(spend.get(d)!)]),
      }}
    >
      {!max ? (
        <ChartEmpty height={200} />
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: vertical ? undefined : months * 110 }}>
            <EChart
              label="Calendar heatmap of daily spending"
              height={vertical ? 70 + 44 * 6 * months : 200}
              option={{
                ...baseOption(t),
                tooltip: {
                  ...baseOption(t).tooltip,
                  formatter: (p: { value: [string, number] }) => `${formatDay(p.value[0], a.today)}<br/><b>${formatPKR(p.value[1])}</b>`,
                },
                visualMap: {
                  min: 0,
                  max,
                  show: false,
                  inRange: { color: [t.seqLo, t.seqHi] },
                },
                calendar: {
                  range: [range.start, range.end],
                  orient: vertical ? "vertical" : "horizontal",
                  top: vertical ? 40 : 24,
                  left: vertical ? 32 : 36,
                  right: 8,
                  bottom: 8,
                  cellSize: vertical ? ["auto", 40] : ["auto", 18],
                  splitLine: { show: false },
                  itemStyle: { color: t.surface, borderColor: t.surface, borderWidth: 2 },
                  dayLabel: { firstDay: 1, color: t.ink, fontSize: 10, nameMap: ["S", "M", "T", "W", "T", "F", "S"] },
                  monthLabel: { color: t.ink, fontSize: 11 },
                  yearLabel: { show: false },
                },
                series: [
                  {
                    type: "heatmap",
                    coordinateSystem: "calendar",
                    data: days.filter((d) => spend.get(d)).map((d) => [d, spend.get(d)]),
                    itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
                  },
                ],
              }}
            />
          </div>
        </div>
      )}
      {max > 0 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          {/* Stepped swatches, not a gradient (SPEC §8.1: flat fills only). */}
          {[0, 0.25, 0.5, 0.75, 1].map((s) => (
            <span key={s} className="size-3 rounded-sm" style={{ background: mixHex(t.seqLo, t.seqHi, s) }} />
          ))}
          <span>{formatCompactPKR(max)}</span>
        </div>
      )}
    </ChartCard>
  );
}

// ── 6. Spending treemap ──────────────────────────────────────────────────────

export function SpendingTreemap({ a }: { a: Analytics }) {
  const t = a.theme!;
  const tree = categoryTree(a.rows, a.current, a.lookups);
  return (
    <ChartCard
      title="Spending map"
      description="Each box sized by what it cost"
      table={{
        columns: ["Category", "Subcategory", "Spent"],
        rows: tree.flatMap((p) => (p.children ?? [{ name: "—", value: p.value }]).map((c) => [p.name, c.name, formatPKR(c.value)])),
        align: ["left", "left", "right"],
      }}
    >
      {!tree.length ? (
        <ChartEmpty height={300} />
      ) : (
        <EChart
          label="Treemap of spending by category"
          height={320}
          option={{
            ...baseOption(t),
            tooltip: {
              ...baseOption(t).tooltip,
              formatter: (p: { treePathInfo: { name: string }[]; value: number }) =>
                `${p.treePathInfo.slice(1).map((n) => n.name).join(" › ")}<br/><b>${formatPKR(p.value)}</b>`,
            },
            series: [
              {
                type: "treemap",
                data: tree,
                roam: false,
                nodeClick: "zoomToNode",
                breadcrumb: { show: true, bottom: 0, itemStyle: { color: t.surface, borderColor: t.axis, textStyle: { color: t.fg } } },
                width: "100%",
                height: "88%",
                top: 0,
                // One series → one hue; levels separate with the 2px surface gap.
                itemStyle: { color: t.series[0], borderColor: t.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
                levels: [
                  { itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2 }, upperLabel: { show: false } },
                  { itemStyle: { borderColor: t.surface, gapWidth: 2 }, colorSaturation: [0.35, 0.6], upperLabel: { show: true, height: 20, color: "#fff", fontSize: 11 } },
                  { colorSaturation: [0.3, 0.55], itemStyle: { borderColorSaturation: 0.6, gapWidth: 1 } },
                ],
                label: { color: "#fff", fontSize: 11, formatter: (p: { name: string; value: number }) => `${p.name}\n${formatCompactPKR(p.value)}` },
              },
            ],
          }}
        />
      )}
    </ChartCard>
  );
}

// ── 7. Leak detection ────────────────────────────────────────────────────────

export function Leaks({ a }: { a: Analytics }) {
  const t = a.theme!;
  const above = aboveAverage(a.rows, a.current, priorPeriods(a.current, 3), a.lookups);
  const small = smallRepeated(a.rows, a.current, a.lookups);
  const wants = wantsShareByMonth(a.rows, a.months.slice(-6));
  const labels = a.monthLabels.slice(-6);
  const latest = [...wants].reverse().find((w) => w.share !== null);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Above usual" description="vs average of the 3 periods before">
        {above.length ? (
          <ul className="flex flex-col divide-y text-sm">
            {above.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <TrendingUp className="size-4 shrink-0 text-warning" aria-label="Above average" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-right">
                  <span className="font-semibold">+{formatPKR(c.over)}</span>
                  <span className="block text-xs text-muted-foreground">{formatPct(c.overPct)} · usual {formatCompactPKR(c.average)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing running above its usual level.</p>
        )}
      </ChartCard>

      <ChartCard title="Small spends that add up" description="Rs 1,000 or less, 3+ times this period">
        {small.length ? (
          <ul className="flex flex-col divide-y text-sm">
            {small.slice(0, 6).map((g) => (
              <li key={g.label} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
                <span className="text-right">
                  <span className="font-semibold">{formatPKR(g.total)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {g.count}× · avg {formatCompactPKR(g.total / g.count)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No repeated small spends found.</p>
        )}
      </ChartCard>

      <ChartCard
        title="Wants share"
        description={latest ? `${Math.round(latest.share!)}% of spending last month with data` : "Share of spending that was a want"}
        table={{ columns: ["Month", "Wants %"], rows: wants.map((w, i) => [labels[i], w.share === null ? "—" : `${w.share.toFixed(0)}%`]) }}
      >
        {wants.some((w) => w.share !== null) ? (
          <EChart
            label="Line chart of wants as a share of spending"
            height={180}
            option={{
              ...baseOption(t),
              grid: { left: 4, right: 32, top: 12, bottom: 4, containLabel: true },
              tooltip: { ...baseOption(t).tooltip, trigger: "axis", valueFormatter: (v: number | null) => (v == null ? "—" : `${v.toFixed(0)}%`) },
              xAxis: { ...categoryAxis(t, labels), boundaryGap: false },
              yAxis: { ...valueAxis(t, { percent: true }), max: 100 },
              series: [
                {
                  type: "line",
                  data: wants.map((w) => (w.share === null ? null : Math.round(w.share))),
                  connectNulls: true,
                  symbolSize: 8,
                  lineStyle: { width: 2, color: t.series[1] },
                  itemStyle: { color: t.series[1], borderColor: t.surface, borderWidth: 2 },
                  areaStyle: { color: t.series[1], opacity: 0.1 },
                },
              ],
            }}
          />
        ) : (
          <ChartEmpty height={180} />
        )}
      </ChartCard>
    </div>
  );
}
