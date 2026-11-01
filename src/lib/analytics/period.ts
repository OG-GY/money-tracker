import { addDays, addMonths, monthRange } from "@/lib/dates";

export type PeriodKind = "today" | "week" | "month" | "custom";
export type Range = { start: string; end: string };

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  custom: "Custom",
};

const dayIndex = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
export const daysBetween = (a: string, b: string) => dayIndex(b) - dayIndex(a) + 1;

/** Monday-start week containing `date`. */
function weekStart(date: string) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(date, -dow);
}

/**
 * The selected period, cut off at today so "this month" means month-to-date,
 * and the matching slice of the period before it (SPEC §6).
 */
export function resolvePeriod(kind: PeriodKind, today: string, custom: Range) {
  if (kind === "today") {
    return { current: { start: today, end: today }, previous: { start: addDays(today, -1), end: addDays(today, -1) }, full: { start: today, end: today } };
  }
  if (kind === "week") {
    const start = weekStart(today);
    const elapsed = daysBetween(start, today);
    const prevStart = addDays(start, -7);
    return {
      current: { start, end: today },
      previous: { start: prevStart, end: addDays(prevStart, elapsed - 1) },
      full: { start, end: addDays(start, 6) },
    };
  }
  if (kind === "month") {
    const { start, end } = monthRange(today);
    const prevStart = addMonths(start, -1);
    const prevEnd = monthRange(prevStart).end;
    const sameDay = addDays(prevStart, daysBetween(start, today) - 1);
    return {
      current: { start, end: today },
      previous: { start: prevStart, end: sameDay > prevEnd ? prevEnd : sameDay },
      full: { start, end },
    };
  }
  const len = daysBetween(custom.start, custom.end);
  return {
    current: custom,
    previous: { start: addDays(custom.start, -len), end: addDays(custom.start, -1) },
    full: custom,
  };
}

/** The `n` equal-length periods just before `range` (for "vs 3-period average"). */
export function priorPeriods(range: Range, n: number): Range[] {
  const len = daysBetween(range.start, range.end);
  return Array.from({ length: n }, (_, i) => ({
    start: addDays(range.start, -len * (i + 1)),
    end: addDays(range.start, -len * i - 1),
  }));
}

export const inRange = (date: string, r: Range) => date >= r.start && date <= r.end;
