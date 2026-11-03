// Row shapes for the tables and views in supabase/migrations. Keep in sync by hand
// (or replace with `supabase gen types` once the project is linked).

export type AccountKind = "asset" | "person" | "source" | "sink";
export type AssetSubtype = "bank" | "wallet" | "cash" | "savings";
export type NeedWant = "need" | "want";
export type ForWhom = "self" | "gift" | "family" | "household" | "other";
/** "opening" = a person's starting balance from before tracking began. */
export type LoanAction = "lend" | "borrow" | "repay_to_me" | "repay_by_me" | "friend_paid" | "write_off" | "opening";
export type EntryMethod = "manual" | "voice" | "system";
export type TxType = "income" | "expense" | "transfer" | "loan" | "opening" | "adjustment";

/** Result of public.update_balance. */
export type BalanceUpdate = {
  kind: "none" | "opening" | "profit" | "adjustment";
  previous: number;
  balance: number;
  difference: number;
  transaction_id: string | null;
  flagged: boolean;
};

export type BalanceSnapshot = { id: string; account_id: string; taken_on: string; balance: number; created_at: string };

export type Account = {
  id: string;
  user_id: string;
  name: string;
  kind: AccountKind;
  subtype: AssetSubtype | null;
  on_budget: boolean;
  archived: boolean;
  meta: { system?: "spending" | "opening_balance"; phone?: string; note?: string };
  created_at: string;
};

export type AccountBalance = {
  account_id: string;
  name: string;
  kind: AccountKind;
  subtype: AssetSubtype | null;
  on_budget: boolean;
  archived: boolean;
  balance: number;
  total_in: number;
  total_out: number;
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  default_need_want: NeedWant | null;
  default_envelope_id: string | null;
  is_system: boolean;
  sort_order: number;
  archived: boolean;
};

export type Transaction = {
  id: string;
  occurred_on: string;
  amount: number;
  from_account_id: string;
  to_account_id: string;
  category_id: string | null;
  envelope_id: string | null;
  venture_id: string | null;
  for_whom: ForWhom;
  need_want: NeedWant | null;
  merchant: string | null;
  note: string | null;
  due_date: string | null;
  loan_action: LoanAction | null;
  settles_transaction_id: string | null;
  entry_method: EntryMethod;
  entry_batch_id: string | null;
  raw_transcript: string | null;
  auto_confirmed: boolean;
  client_id: string | null;
  created_at: string;
};

export type TypedTransaction = Transaction & { tx_type: TxType };

export type PeriodSummary = { income: number; expense: number; net: number; days: number };

export type PersonBalance = {
  account_id: string;
  name: string;
  archived: boolean;
  meta: Account["meta"];
  they_owe_me: number;
  i_owe_them: number;
  net: number;
  last_activity: string | null;
};

export type OpenItem = {
  transaction_id: string;
  person_id: string;
  direction: "they_owe" | "i_owe";
  loan_action: LoanAction;
  occurred_on: string;
  due_date: string | null;
  amount: number;
  outstanding: number;
  note: string | null;
  merchant: string | null;
};

export type VentureStatus = "active" | "paused" | "closed";

export type Venture = {
  id: string;
  name: string;
  status: VentureStatus;
  started_on: string | null;
  envelope_id: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
};

export type VentureSummary = {
  venture_id: string;
  name: string;
  status: VentureStatus;
  archived: boolean;
  started_on: string | null;
  revenue: number;
  costs: number;
  profit: number;
  invested: number;
  drawn: number;
  net_personal: number;
  roi: number | null;
};

export type EnvelopeKind = "personal" | "venture" | "to_assign";
export type MoveKind = "assign" | "move" | "investment" | "draw";

export type Envelope = {
  id: string;
  name: string;
  kind: EnvelopeKind;
  role: "savings_goal" | null;
  monthly_target: number | null;
  sort_order: number;
  archived: boolean;
};

export type EnvelopeBalance = {
  envelope_id: string;
  name: string;
  kind: EnvelopeKind;
  role: "savings_goal" | null;
  monthly_target: number | null;
  sort_order: number;
  archived: boolean;
  venture_id: string | null;
  rolled_over: number;
  assigned: number;
  spent: number;
  received: number;
  available: number;
};

export type BudgetOverview = { on_budget_total: number; envelopes_total: number; to_assign: number };

export type EnvelopeMove = {
  id: string;
  occurred_on: string;
  amount: number;
  from_envelope_id: string | null;
  to_envelope_id: string | null;
  kind: MoveKind;
  note: string | null;
  created_at: string;
};

export type VentureMonth ={ month: string; revenue: number; costs: number; invested: number; drawn: number };
