"use client";

import { BarChart, GaugeChart, HeatmapChart, LineChart, PieChart, SankeyChart, TreemapChart } from "echarts/charts";
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { formatCompactPKR } from "@/lib/format";

// Tree-shaken ECharts: only the chart types this app draws.
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  SankeyChart,
  HeatmapChart,
  TreemapChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export type ChartTheme = {
  series: string[]; // categorical slots, fixed order
  other: string;
  income: string;
  expense: string;
  warning: string;
  grid: string;
  axis: string;
  ink: string;
  fg: string;
  surface: string;
  seqLo: string;
  seqHi: string;
  font: string;
};

function readTheme(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    series: [1, 2, 3, 4, 5, 6].map((i) => v(`--chart-${i}`)),
    other: v("--chart-other"),
    income: v("--income"),
    expense: v("--expense"),
    warning: v("--warning"),
    grid: v("--chart-grid"),
    axis: v("--chart-axis"),
    ink: v("--chart-ink"),
    fg: v("--foreground"),
    surface: v("--card"),
    seqLo: v("--chart-seq-lo"),
    seqHi: v("--chart-seq-hi"),
    // Canvas needs a concrete family, not a CSS variable.
    font: getComputedStyle(document.body).fontFamily,
  };
}

/** Design tokens as chart colours; re-read when light/dark flips. */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<ChartTheme | null>(null);
  useEffect(() => {
    // Wait a frame so the theme class has applied before reading tokens.
    const id = requestAnimationFrame(() => setTheme(readTheme()));
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);
  return theme;
}

/** Shared chrome: hairline solid grid, recessive axes, popover tooltip, no shadows. */
export function baseOption(t: ChartTheme) {
  return {
    animationDuration: 500,
    textStyle: { fontFamily: t.font, color: t.ink },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.axis,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.fg, fontSize: 12 },
      extraCssText: "box-shadow:none;border-radius:10px;",
      confine: true,
    },
    legend: { textStyle: { color: t.ink, fontSize: 12 }, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 16 },
  };
}

export function valueAxis(t: ChartTheme, opts: { percent?: boolean } = {}) {
  return {
    type: "value" as const,
    splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" as const } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.ink, fontSize: 11, formatter: (v: number) => (opts.percent ? `${v}%` : formatCompactPKR(v)) },
  };
}

export function categoryAxis(t: ChartTheme, data: string[]) {
  return {
    type: "category" as const,
    data,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.ink, fontSize: 11, hideOverlap: true },
  };
}

export function EChart({
  option,
  height = 280,
  label,
  onEvents,
}: {
  option: object;
  height?: number;
  /** Screen-reader summary; the Table view carries the values. */
  label: string;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
      />
    </div>
  );
}
