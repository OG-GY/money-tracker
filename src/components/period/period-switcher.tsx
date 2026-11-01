"use client";

import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { PERIOD_LABEL, type PeriodKind } from "@/lib/analytics/period";
import { cn } from "@/lib/utils";
import { usePeriod } from "./period-provider";

const KINDS: PeriodKind[] = ["today", "week", "month", "custom"];

/** Filter row control (SPEC §6): one switcher scopes every chart below it. */
export function PeriodSwitcher({ id = "period", className }: { id?: string; className?: string }) {
  const { kind, setKind, custom, setCustom } = usePeriod();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div role="tablist" aria-label="Period" className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "relative h-8 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
              kind === k ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {kind === k && (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 rounded-md bg-background"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{PERIOD_LABEL[k]}</span>
          </button>
        ))}
      </div>
      {kind === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="From"
            value={custom.start}
            max={custom.end}
            onChange={(e) => e.target.value && setCustom({ ...custom, start: e.target.value })}
            className="h-9 w-auto"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            value={custom.end}
            min={custom.start}
            onChange={(e) => e.target.value && setCustom({ ...custom, end: e.target.value })}
            className="h-9 w-auto"
          />
        </div>
      )}
    </div>
  );
}
