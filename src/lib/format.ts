// Pakistani/South-Asian digit grouping: 1,25,000.
const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const TIME_ZONE = "Asia/Karachi";

/** Whole rupees → "Rs 1,25,000" (negative: "−Rs 1,500"). */
export function formatPKR(amount: number, opts: { sign?: boolean } = {}) {
  const rounded = Math.round(amount);
  const body = `Rs ${grouping.format(Math.abs(rounded))}`;
  if (rounded < 0) return `−${body}`;
  if (opts.sign && rounded > 0) return `+${body}`;
  return body;
}

/** Compact rupees for axis ticks and tiles: 950 / 12K / 1.25L / 2.4Cr. */
export function formatCompactPKR(amount: number) {
  const a = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, ""));
  if (a >= 1e7) return `${sign}${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)}K`;
  return `${sign}${Math.round(a)}`;
}

/** Signed percent for deltas: "+12%", "−3%", "—" when undefined. */
export function formatPct(p: number | null | undefined, digits = 0) {
  if (p == null || !Number.isFinite(p)) return "—";
  const v = p.toFixed(digits);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${v.replace("-", "")}%`;
}

/** Today's date in Asia/Karachi as YYYY-MM-DD. */
export function todayInKarachi(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}
