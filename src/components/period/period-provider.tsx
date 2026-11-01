"use client";

import { createContext, use, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { resolvePeriod, type PeriodKind, type Range } from "@/lib/analytics/period";
import { monthRange, todayInKarachi } from "@/lib/dates";

type PeriodContextValue = {
  kind: PeriodKind;
  setKind: (k: PeriodKind) => void;
  custom: Range;
  setCustom: (r: Range) => void;
  /** "" until the client knows the date (the shell itself is prerendered). */
  today: string;
} & ReturnType<typeof resolvePeriod>;

const PeriodContext = createContext<PeriodContextValue | null>(null);
const noopSubscribe = () => () => {};
const EMPTY: Range = { start: "", end: "" };

/** One period for the whole app (top-bar switcher on desktop, Analytics on phone). */
export function PeriodProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<PeriodKind>("month");
  const [customState, setCustom] = useState<Range | null>(null);
  // Read the date on the client only; prerendering can't depend on the clock.
  const today = useSyncExternalStore(noopSubscribe, todayInKarachi, () => "");

  const value = useMemo(() => {
    const custom = customState ?? (today ? monthRange(today) : EMPTY);
    const ranges = today ? resolvePeriod(kind, today, custom) : { current: EMPTY, previous: EMPTY, full: EMPTY };
    return { kind, setKind, custom, setCustom, today, ...ranges };
  }, [kind, customState, today]);

  return <PeriodContext value={value}>{children}</PeriodContext>;
}

export function usePeriod() {
  const ctx = use(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used inside PeriodProvider");
  return ctx;
}
