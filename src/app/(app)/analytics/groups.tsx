"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-card";
import { EChart, baseOption } from "@/components/charts/echart";
import {
  UNGROUPED,
  byIncomeGroup,
  bySpendingGroup,
  categoriesInGroup,
  sourcesInGroup,
} from "@/lib/analytics/compute";
import { formatCompactPKR, formatPKR } from "@/lib/format";
import type { Analytics } from "./use-analytics";

/**
 * Spending or income split by high-level group, each expandable to what's inside
 * (categories for spending, sources for income).
 */
export function GroupBreakdown({ a, kind }: { a: Analytics; kind: "spending" | "income" }) {
  const t = a.theme!;
  const [open, setOpen] = useState<string | null>(null);
  const known = kind === "spending" ? a.model.spendingGroups : a.model.incomeGroups;
  const groups = kind === "spending" ? bySpendingGroup(a.rows, a.current, a.lookups) : byIncomeGroup(a.rows, a.current, a.lookups);
  const total = groups.reduce((s, g) => s + g.amount, 0);

  // Colour follows the group's own order, never its rank this period.
  const colorOf = (id: string) => {
    const i = known.findIndex((g) => g.id === id);
    return id === UNGROUPED || i < 0 ? t.other : (t.series[i] ?? t.other);
  };
  const members = (id: string) =>
    kind === "spending" ? categoriesInGroup(a.rows, a.current, id, a.lookups) : sourcesInGroup(a.rows, a.current, id, a.lookups);

  const title = kind === "spending" ? "Spending by group" : "Income by group";
  if (!known.length) {
    return (
      <ChartCard title={title}>
        <ChartEmpty height={160}>
          <span className="px-6 text-center">
            Groups aren&apos;t set up yet. Run the latest database update, then open{" "}
            <Link href="/settings/categories" className="text-primary">
              Settings → Categories
            </Link>
            .
          </span>
        </ChartEmpty>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={title}
      description={total ? `${formatPKR(total)} ${kind === "spending" ? "spent" : "earned"} · tap a group for details` : undefined}
      action={
        <Link href="/settings/categories" className="text-sm text-primary">
          Edit
        </Link>
      }
      table={{
        columns: ["Group", kind === "spending" ? "Category" : "Source", "Amount", "Share"],
        rows: groups.flatMap((g) => [
          [g.name, "—", formatPKR(g.amount), `${((g.amount / (total || 1)) * 100).toFixed(1)}%`],
          ...members(g.id).map((m) => ["", m.name, formatPKR(m.amount), `${((m.amount / (total || 1)) * 100).toFixed(1)}%`]),
        ]),
        align: ["left", "left", "right", "right"],
      }}
    >
      {!total ? (
        <ChartEmpty height={200}>Nothing in this period.</ChartEmpty>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <EChart
            label={`Donut chart of ${kind} by group`}
            height={200}
            onEvents={{
              click: (p) => {
                const d = (p as { data?: { id: string } }).data;
                if (d) setOpen((o) => (o === d.id ? null : d.id));
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
                  label: { show: true, position: "center", formatter: () => formatCompactPKR(total), color: t.fg, fontSize: 18, fontWeight: 600 },
                  labelLine: { show: false },
                  emphasis: { scale: true, scaleSize: 4 },
                  data: groups.map((g) => ({ id: g.id, name: g.name, value: g.amount, itemStyle: { color: colorOf(g.id) } })),
                },
              ],
            }}
          />
          {/* Legend + percentages: identity never rests on colour alone. */}
          <ul className="flex flex-col divide-y text-sm">
            {groups.map((g) => {
              const isOpen = open === g.id;
              return (
                <li key={g.id}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : g.id)} className="flex w-full items-center gap-2 py-2 text-left">
                    {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colorOf(g.id) }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
                    <span className="tabular">{formatPKR(g.amount)}</span>
                    <span className="w-10 text-right font-semibold tabular">{Math.round((g.amount / total) * 100)}%</span>
                  </button>
                  {isOpen && (
                    <ul className="mb-2 ml-6 flex flex-col gap-1.5 border-l pl-3">
                      {members(g.id).map((m) => (
                        <li key={m.id} className="flex justify-between gap-3">
                          <span className="truncate text-muted-foreground">{m.name}</span>
                          <span className="tabular">
                            {formatPKR(m.amount)}
                            <span className="ml-2 text-muted-foreground">{Math.round((m.amount / g.amount) * 100)}%</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
