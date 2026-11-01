import { z } from "zod";

// Shared client/server validation (SPEC §10). Mirrors the DB trigger rules.

const rupees = z.coerce
  .number({ error: "Enter an amount" })
  .int("Whole rupees only")
  .positive("Amount must be more than 0")
  .max(10_000_000_000, "That amount is too large");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : null));

export const ENTRY_TYPES = ["expense", "income", "transfer", "loan"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const LOAN_ACTIONS = ["lend", "borrow", "repay_to_me", "repay_by_me", "friend_paid", "write_off"] as const;

/** How each loan action moves money (SPEC §2.2). */
export const LOAN_SHAPE: Record<
  (typeof LOAN_ACTIONS)[number],
  { from: "asset" | "person"; to: "asset" | "person" | "sink"; label: string; hint: string }
> = {
  lend: { from: "asset", to: "person", label: "I lent", hint: "They owe you" },
  borrow: { from: "person", to: "asset", label: "I borrowed", hint: "You owe them" },
  repay_to_me: { from: "person", to: "asset", label: "They repaid me", hint: "They owe you less" },
  repay_by_me: { from: "asset", to: "person", label: "I repaid them", hint: "You owe them less" },
  friend_paid: { from: "person", to: "sink", label: "They paid for me", hint: "Your expense; you owe them" },
  write_off: { from: "person", to: "sink", label: "Write off", hint: "Forgive what they owe you" },
};

export const transactionInput = z
  .object({
    type: z.enum(ENTRY_TYPES),
    amount: rupees,
    occurred_on: isoDate,
    from_account_id: z.uuid("Choose where the money came from"),
    to_account_id: z.uuid("Choose where the money went"),
    category_id: z.uuid().nullable().optional(),
    need_want: z.enum(["need", "want"]).nullable().optional(),
    for_whom: z.enum(["self", "gift", "family", "household", "other"]).default("self"),
    merchant: optionalText,
    note: optionalText,
    venture_id: z.uuid().nullable().optional(),
    envelope_id: z.uuid().nullable().optional(),
    loan_action: z.enum(LOAN_ACTIONS).nullable().optional(),
    due_date: isoDate.nullable().optional(),
    settles_transaction_id: z.uuid().nullable().optional(),
  })
  .refine((v) => v.from_account_id !== v.to_account_id, {
    path: ["to_account_id"],
    message: "From and To must be different",
  })
  .refine((v) => v.type !== "loan" || !!v.loan_action, { path: ["loan_action"], message: "Pick what happened" })
  .refine((v) => (v.type !== "expense" && v.loan_action !== "friend_paid") || !!v.category_id, {
    path: ["category_id"],
    message: "Pick a category",
  })
  .refine((v) => !v.due_date || v.due_date >= v.occurred_on, {
    path: ["due_date"],
    message: "Due date can't be before the entry date",
  });

export type TransactionInput = z.input<typeof transactionInput>;
export type TransactionValues = z.output<typeof transactionInput>;

export const accountInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  kind: z.enum(["asset", "source"]),
  subtype: z.enum(["bank", "wallet", "cash", "savings"]).nullable(),
  on_budget: z.boolean(),
  opening_balance: z.coerce.number().int("Whole rupees only").min(0).default(0),
});
export type AccountValues = z.output<typeof accountInput>;

export const personInput = z.object({
  name: z.string().trim().min(1, "Give them a name").max(60),
  phone: z.string().trim().max(30).optional().transform((v) => v || undefined),
  note: z.string().trim().max(200).optional().transform((v) => v || undefined),
});
export type PersonValues = z.output<typeof personInput>;

export const ventureInput = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  status: z.enum(["active", "paused", "closed"]).default("active"),
  started_on: isoDate.nullable().optional(),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
});
export type VentureValues = z.output<typeof ventureInput>;

/** First validation message per field, for inline form errors. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
