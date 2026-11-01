import { TIME_ZONE, todayInKarachi } from "./format";

// All dates are plain YYYY-MM-DD strings in Asia/Karachi (SPEC §10).

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function iso(y: number, m: number, d: number) {
  // Date.UTC normalises overflow (e.g. day 0 = last day of previous month).
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function monthRange(today = todayInKarachi()) {
  const { y, m } = parts(today);
  return { start: iso(y, m, 1), end: iso(y, m + 1, 0) };
}

/** First day of the month `n` months away from `date`'s month. */
export function addMonths(date: string, n: number) {
  const { y, m } = parts(date);
  return iso(y, m + n, 1);
}

/** A date inside `month` to stamp a budget move with: today if it's the current month. */
export function dateInMonth(monthStart: string, today = todayInKarachi()) {
  const { start, end } = monthRange(monthStart);
  return today < start ? start : today > end ? end : today;
}

export function addDays(date: string, days: number) {
  const { y, m, d } = parts(date);
  return iso(y, m, d + days);
}

/** "Today", "Yesterday", or "Mon, 3 Nov". */
export function formatDay(date: string, today = todayInKarachi()) {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const { y, m, d } = parts(date);
  const sameYear = y === parts(today).y;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatMonth(date: string) {
  const { y, m } = parts(date);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** "Nov 26" — for chart axes. */
export function formatMonthShort(date: string) {
  const { y, m } = parts(date);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export { TIME_ZONE, todayInKarachi };
