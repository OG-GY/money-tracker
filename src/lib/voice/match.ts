// Loose name matching for spoken names ("sada pay" → "SadaPay").

export type Named = { id: string; name: string };
export type Match = { id: string; name: string; exact: boolean };

export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9؀-ۿ]/g, "");

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Exact (normalised) match first, then one clear prefix/substring/typo match. */
export function matchName(spoken: string | null | undefined, items: Named[]): Match | null {
  if (!spoken) return null;
  const s = norm(spoken);
  if (!s) return null;

  const exact = items.find((i) => norm(i.name) === s);
  if (exact) return { id: exact.id, name: exact.name, exact: true };

  const scored = items
    .map((i) => {
      const n = norm(i.name);
      if (!n) return null;
      // Partial matches must cover at least half the longer name ("pay" ≠ "SadaPay").
      const covers = Math.min(s.length, n.length) / Math.max(s.length, n.length) >= 0.5;
      if (covers && (n.startsWith(s) || s.startsWith(n))) return { i, score: 1 };
      if (covers && (n.includes(s) || s.includes(n))) return { i, score: 2 };
      // A whole word of the name is fine even when short ("salary" → "Techroniqs salary").
      if (s.length >= 3 && i.name.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).includes(s)) return { i, score: 2 };
      const d = distance(s, n);
      const tolerance = Math.max(s.length, n.length) >= 8 ? 2 : Math.max(s.length, n.length) >= 4 ? 1 : 0;
      return d <= tolerance ? { i, score: 2 + d } : null;
    })
    .filter((x): x is { i: Named; score: number } => !!x)
    .sort((a, b) => a.score - b.score);

  if (!scored.length) return null;
  // Ambiguous: two equally good guesses — don't pick one.
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return { id: scored[0].i.id, name: scored[0].i.name, exact: false };
}
