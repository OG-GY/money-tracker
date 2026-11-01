"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TableView = { columns: string[]; rows: (string | number)[][]; align?: ("left" | "right")[] };

/**
 * A chart with its Table twin (dataviz: every chart has a table view; it is
 * also the relief for the light-mode hues under 3:1 contrast).
 */
export function ChartCard({
  title,
  description,
  table,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  table?: TableView;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("min-w-0 rounded-2xl border bg-card p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table && (
            <div role="tablist" aria-label="View" className="flex rounded-lg bg-muted p-0.5">
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  aria-label={v === "chart" ? "Chart view" : "Table view"}
                  onClick={() => setView(v)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    view === v ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "chart" ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {view === "table" && table ? <DataTable {...table} /> : children}
    </section>
  );
}

export function DataTable({ columns, rows, align }: TableView) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>;
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-left text-muted-foreground">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={cn("border-b px-2 py-2 font-medium", (align?.[i] ?? (i ? "right" : "left")) === "right" && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b last:border-0">
              {r.map((cell, i) => (
                <td key={i} className={cn("px-2 py-2", (align?.[i] ?? (i ? "right" : "left")) === "right" && "text-right")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Empty state sized like a chart so the layout doesn't jump. */
export function ChartEmpty({ height = 240, children }: { height?: number; children?: ReactNode }) {
  return (
    <div style={{ height }} className="flex items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
      {children ?? "Nothing to show for this period yet."}
    </div>
  );
}
