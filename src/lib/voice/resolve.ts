import type { ParsedDraft } from "@/lib/ai/types";
import type { Account, Category, Envelope, Venture } from "@/lib/db/types";
import { inferMoveKind } from "@/lib/ledger/moves";
import { LOAN_SHAPE, transactionInput, type TransactionInput, type TransactionValues } from "@/lib/ledger/schema";
import type { MoveInput } from "@/lib/ledger/queries";
import { matchName, norm, type Named } from "./match";

/** The slice of the ledger model the resolver needs. */
export type ResolveModel = {
  assets: Account[];
  people: Account[];
  sources: Account[];
  spending?: Account;
  categories: Category[];
  catById: Map<string, Category>;
  ventures: Venture[];
  envelopes: Envelope[]; // personal + venture, not archived
};

/** Something a card must show before the draft can be saved. */
export type Issue = {
  field: string;
  message: string;
  /** One-tap fix the confirm screen can offer. */
  create?: { kind: "person" | "venture" | "source"; name: string };
};

export type Resolved =
  | { kind: "transaction"; values: TransactionInput; issues: Issue[]; fuzzy: string[] }
  | { kind: "move"; move: Partial<MoveInput>; issues: Issue[]; fuzzy: string[] }
  | { kind: "unsupported"; reason: string; issues: Issue[]; fuzzy: string[] };

export const LOW_CONFIDENCE = 0.7;

const named = (list: { id: string; name: string }[]): Named[] => list.map((x) => ({ id: x.id, name: x.name }));

function matchCategory(spoken: string | null, m: ResolveModel) {
  if (!spoken) return null;
  const parts = spoken.split(/>|›|\//).map((s) => s.trim()).filter(Boolean);
  const usable = m.categories.filter((c) => !c.archived && (!c.is_system || c.name === "Loan written off"));
  const parentOf = (c: Category) => (c.parent_id ? m.catById.get(c.parent_id) : undefined);

  if (parts.length >= 2) {
    const [p, child] = [norm(parts[0]), norm(parts[parts.length - 1])];
    const hit = usable.find((c) => norm(c.name) === child && parentOf(c) && norm(parentOf(c)!.name) === p);
    if (hit) return { id: hit.id, exact: true };
    const childMatch = matchName(parts[parts.length - 1], named(usable.filter((c) => c.parent_id)));
    if (childMatch) return { id: childMatch.id, exact: false };
    const parentMatch = matchName(parts[0], named(usable.filter((c) => !c.parent_id)));
    return parentMatch ? { id: parentMatch.id, exact: false } : null;
  }
  // A bare name: a subcategory first ("Groceries"), then a top-level one ("Entertainment").
  const sub = matchName(parts[0], named(usable.filter((c) => c.parent_id)));
  if (sub) return { id: sub.id, exact: sub.exact };
  const top = matchName(parts[0], named(usable.filter((c) => !c.parent_id)));
  return top ? { id: top.id, exact: top.exact } : null;
}

type Slot = "asset" | "person" | "source";

/**
 * Turn one parsed draft into form values the ledger can save, plus the issues
 * that block saving. Never guesses an unknown name (SPEC §4 step 7).
 */
export function resolveDraft(d: ParsedDraft, m: ResolveModel, today: string): Resolved {
  const issues: Issue[] = [];
  const fuzzy: string[] = [];
  if (!d.amount) issues.push({ field: "amount", message: "No amount heard" });

  const lookup = (spoken: string | null, slot: Slot, field: string): string | undefined => {
    const list = slot === "asset" ? m.assets : slot === "person" ? m.people : m.sources;
    const hit = matchName(spoken, named(list));
    if (hit) {
      if (!hit.exact) fuzzy.push(field);
      return hit.id;
    }
    if (!spoken) {
      issues.push({ field, message: slot === "asset" ? "Which account?" : slot === "person" ? "Who?" : "Which income source?" });
    } else if (slot === "person") {
      issues.push({ field, message: `${spoken} isn't in People`, create: { kind: "person", name: spoken } });
    } else if (slot === "source") {
      issues.push({ field, message: `${spoken} isn't an income source yet`, create: { kind: "source", name: spoken } });
    } else {
      issues.push({ field, message: `No account called “${spoken}” — edit to pick one` });
    }
    return undefined;
  };

  let venture_id: string | null = null;
  if (d.venture) {
    const v = matchName(d.venture, named(m.ventures));
    if (v) {
      venture_id = v.id;
      if (!v.exact) fuzzy.push("venture");
    } else {
      issues.push({ field: "venture", message: `${d.venture} isn't a venture yet`, create: { kind: "venture", name: d.venture } });
    }
  }

  const date = d.date ?? today;
  const base = {
    amount: d.amount ?? undefined,
    occurred_on: date,
    merchant: d.merchant ?? undefined,
    note: d.note ?? undefined,
    for_whom: d.for_whom,
  };

  const category = () => {
    const c = matchCategory(d.category, m);
    if (!c) {
      issues.push({ field: "category", message: d.category ? `Couldn't match category “${d.category}”` : "Pick a category" });
      return { category_id: null, need_want: d.need_want };
    }
    if (!c.exact) fuzzy.push("category");
    return { category_id: c.id, need_want: d.need_want ?? m.catById.get(c.id)?.default_need_want ?? null };
  };

  switch (d.action) {
    case "expense": {
      const values: TransactionInput = {
        ...base,
        type: "expense",
        from_account_id: lookup(d.from, "asset", "from") ?? "",
        to_account_id: m.spending?.id ?? "",
        ...category(),
        venture_id,
      };
      return { kind: "transaction", values, issues, fuzzy };
    }
    case "income":
      return {
        kind: "transaction",
        values: {
          ...base,
          type: "income",
          from_account_id: lookup(d.from, "source", "from") ?? "",
          to_account_id: lookup(d.to, "asset", "to") ?? "",
          venture_id,
        },
        issues,
        fuzzy,
      };
    case "transfer": {
      const from = lookup(d.from, "asset", "from") ?? "";
      const to = lookup(d.to, "asset", "to") ?? "";
      if (from && from === to) issues.push({ field: "to", message: "From and To are the same account" });
      return { kind: "transaction", values: { ...base, type: "transfer", from_account_id: from, to_account_id: to }, issues, fuzzy };
    }
    case "lend":
    case "borrow":
    case "repay_to_me":
    case "repay_by_me":
    case "friend_paid":
    case "write_off": {
      const shape = LOAN_SHAPE[d.action];
      const pick = (end: "from" | "to") => {
        const kind = shape[end];
        const spoken = end === "from" ? d.from : d.to;
        if (kind === "sink") return m.spending?.id ?? "";
        return lookup(spoken, kind === "person" ? "person" : "asset", end) ?? "";
      };
      const values: TransactionInput = {
        ...base,
        type: "loan",
        loan_action: d.action,
        from_account_id: pick("from"),
        to_account_id: pick("to"),
        due_date: d.action === "lend" || d.action === "borrow" ? d.due_date : null,
        ...(d.action === "friend_paid" ? category() : {}),
      };
      return { kind: "transaction", values, issues, fuzzy };
    }
    case "envelope_move": {
      const end = (spoken: string | null, field: string) => {
        if (!spoken || /^to\s*assign$/i.test(spoken.trim()) || norm(spoken) === "toassign") return { id: null, kind: null };
        const hit = matchName(spoken, named(m.envelopes));
        if (!hit) {
          issues.push({ field, message: `No envelope called “${spoken}”` });
          return undefined;
        }
        if (!hit.exact) fuzzy.push(field);
        return { id: hit.id, kind: m.envelopes.find((e) => e.id === hit.id)!.kind };
      };
      const from = end(d.from, "from");
      const to = end(d.to, "to");
      const kind = from && to ? inferMoveKind(from.kind, to.kind) : null;
      if (from && to && !kind) issues.push({ field: "to", message: "Money can't move between these envelopes" });
      return {
        kind: "move",
        move: {
          kind: kind ?? undefined,
          amount: d.amount ?? undefined,
          occurred_on: date,
          from_envelope_id: from?.id ?? null,
          to_envelope_id: to?.id ?? null,
          note: d.note,
        },
        issues,
        fuzzy,
      };
    }
    case "savings_update":
      return {
        kind: "unsupported",
        reason: `Balance update for ${d.to ?? "an account"} (${d.amount ?? "?"}). Update balance arrives in Phase 6 — add it from Accounts for now.`,
        issues: [{ field: "action", message: "Can't save balance updates yet" }],
        fuzzy,
      };
  }
}

/** Fully validated values when a transaction draft is complete, else null. */
export function completeValues(r: Resolved): TransactionValues | null {
  if (r.kind !== "transaction" || r.issues.length) return null;
  const parsed = transactionInput.safeParse(r.values);
  return parsed.success ? parsed.data : null;
}

export function completeMove(r: Resolved): MoveInput | null {
  if (r.kind !== "move" || r.issues.length) return null;
  const mv = r.move;
  return mv.kind && mv.amount && mv.occurred_on
    ? { kind: mv.kind, amount: mv.amount, occurred_on: mv.occurred_on, from_envelope_id: mv.from_envelope_id ?? null, to_envelope_id: mv.to_envelope_id ?? null, note: mv.note ?? null }
    : null;
}
