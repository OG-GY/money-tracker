import { z } from "zod";

// The parser's output contract (SPEC §4 step 5). Lenient on input — models
// drift — strict on what comes out.

export const DRAFT_ACTIONS = [
  "expense",
  "income",
  "transfer",
  "lend",
  "borrow",
  "repay_to_me",
  "repay_by_me",
  "friend_paid",
  "write_off",
  "savings_update",
  "envelope_move",
] as const;
export type DraftAction = (typeof DRAFT_ACTIONS)[number];

const nullableText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null),
  z.string().nullable(),
);
const isoDateOrNull = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null),
  z.string().nullable(),
);

export const draftSchema = z.object({
  action: z.enum(DRAFT_ACTIONS),
  amount: z.preprocess((v) => {
    const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }, z.number().int().positive().nullable()),
  date: isoDateOrNull,
  from: nullableText,
  to: nullableText,
  category: nullableText,
  merchant: nullableText,
  venture: nullableText,
  for_whom: z.preprocess(
    (v) => (["self", "gift", "family", "household", "other"].includes(String(v)) ? v : "self"),
    z.enum(["self", "gift", "family", "household", "other"]),
  ),
  need_want: z.preprocess((v) => (v === "need" || v === "want" ? v : null), z.enum(["need", "want"]).nullable()),
  due_date: isoDateOrNull,
  note: nullableText,
  confidence: z.preprocess((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0.5;
  }, z.number()),
  unknown_names: z.preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []), z.array(z.string())),
});
export type ParsedDraft = z.infer<typeof draftSchema>;

export const parseResultSchema = z.object({ drafts: z.array(draftSchema).max(20) });

/** Names the parser may match against — the user's own data. */
export type ParseContext = {
  today: string;
  assets: { name: string; subtype: string | null; on_budget: boolean }[];
  people: string[];
  sources: string[];
  categories: string[]; // "Parent > Child" or "Parent"
  envelopes: string[];
  ventures: string[];
};

/** Swappable providers (SPEC §4). */
export interface Transcriber {
  name: string;
  transcribe(audio: Blob, hint?: string): Promise<string>;
}
export interface Parser {
  name: string;
  parseTransactions(text: string, context: ParseContext): Promise<ParsedDraft[]>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(`${provider}: ${message}`);
  }
}
