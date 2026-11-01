"use client";

import { useMemo } from "react";
import { useChartTheme } from "@/components/charts/echart";
import { usePeriod } from "@/components/period/period-provider";
import { byParentCategory, incomeBySource, lastMonths, stableSlots, type Lookups } from "@/lib/analytics/compute";
import { useLedgerRows } from "@/lib/analytics/use-ledger-rows";
import { formatMonthShort } from "@/lib/dates";
import { useLedgerModel } from "@/lib/ledger/model";

const ALL_TIME = { start: "0000-01-01", end: "9999-12-31" };

/** Everything the analytics sections share: rows, lookups, period, theme, stable colours. */
export function useAnalytics() {
  const rowsQ = useLedgerRows();
  const m = useLedgerModel();
  const period = usePeriod();
  const theme = useChartTheme();
  const rows = useMemo(() => rowsQ.data ?? [], [rowsQ.data]);

  const lookups: Lookups = useMemo(() => ({ accountById: m.accountById, catById: m.catById }), [m.accountById, m.catById]);
  const months = useMemo(() => (period.today ? lastMonths(period.today, 12) : []), [period.today]);
  const monthLabels = useMemo(() => months.map(formatMonthShort), [months]);

  // Colour follows the entity: slots are ranked on all-time totals, so changing
  // the period never repaints a category or source (dataviz non-negotiable).
  const categorySlots = useMemo(() => stableSlots(byParentCategory(rows, ALL_TIME, lookups), 5), [rows, lookups]);
  const sourceSlots = useMemo(
    () => stableSlots(incomeBySource(rows, months, lookups).map((s) => ({ id: s.id, amount: s.total })), 5),
    [rows, months, lookups],
  );
  const ventureNames = useMemo(() => new Map(m.allVentures.map((v) => [v.id, v.name])), [m.allVentures]);

  return {
    ...period,
    rows,
    lookups,
    model: m,
    theme,
    months,
    monthLabels,
    categorySlots,
    sourceSlots,
    ventureNames,
    ready: !!theme && !!period.today && !rowsQ.isLoading && !m.isLoading,
    error: rowsQ.error as Error | null,
  };
}

export type Analytics = ReturnType<typeof useAnalytics>;

/** Colour for a stable slot index (or the neutral "Other"). */
export const slotColor = (a: Analytics, slot: number | undefined) =>
  slot === undefined ? a.theme!.other : a.theme!.series[slot] ?? a.theme!.other;
