"use client";

import { useIsMutating } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Chip, Segmented } from "@/components/chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ForWhom, LoanAction, NeedWant, TypedTransaction } from "@/lib/db/types";
import { formatDay } from "@/lib/dates";
import { formatPKR, todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import {
  useCreatePerson,
  useDeleteTransaction,
  useOpenItems,
  useSaveTransaction,
  useTransactions,
} from "@/lib/ledger/queries";
import {
  LOAN_ACTIONS,
  LOAN_SHAPE,
  fieldErrors,
  transactionInput,
  type EntryType,
  type TransactionInput,
  type TransactionValues,
} from "@/lib/ledger/schema";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "loan", label: "Loan" },
] as const;

const FOR_WHOM: { value: ForWhom; label: string }[] = [
  { value: "self", label: "Me" },
  { value: "family", label: "Family" },
  { value: "household", label: "Household" },
  { value: "gift", label: "Gift" },
  { value: "other", label: "Other" },
];

/** What a screen can pre-fill when it opens the form (e.g. "Lend" on a person). */
export type EntryPreset = {
  type?: EntryType;
  loan_action?: LoanAction;
  person_id?: string;
  venture_id?: string;
  settles_transaction_id?: string;
  amount?: number;
};

type Draft = {
  type: EntryType;
  amount: string;
  occurred_on: string;
  from_account_id: string;
  to_account_id: string;
  category_id: string;
  need_want: NeedWant | "";
  for_whom: ForWhom;
  merchant: string;
  note: string;
  venture_id: string;
  /** "" = let the default decide (category envelope, Savings goal or To Assign). */
  envelope_id: string;
  // Loans
  loan_action: LoanAction | "";
  person_id: string;
  account_id: string;
  due_date: string;
  settles_transaction_id: string;
};

const EMPTY: Omit<Draft, "occurred_on"> = {
  type: "expense",
  amount: "",
  from_account_id: "",
  to_account_id: "",
  category_id: "",
  need_want: "",
  for_whom: "self",
  merchant: "",
  note: "",
  venture_id: "",
  envelope_id: "",
  loan_action: "",
  person_id: "",
  account_id: "",
  due_date: "",
  settles_transaction_id: "",
};

function fromTransaction(tx: TypedTransaction): Draft {
  const base: Draft = {
    ...EMPTY,
    type: tx.tx_type === "expense" ? "expense" : tx.tx_type === "transfer" ? "transfer" : "income",
    amount: String(tx.amount),
    occurred_on: tx.occurred_on,
    from_account_id: tx.from_account_id,
    to_account_id: tx.to_account_id,
    category_id: tx.category_id ?? "",
    need_want: tx.need_want ?? "",
    for_whom: tx.for_whom,
    merchant: tx.merchant ?? "",
    note: tx.note ?? "",
    venture_id: tx.venture_id ?? "",
    envelope_id: tx.envelope_id ?? "",
  };
  if (!tx.loan_action) return base;
  const shape = LOAN_SHAPE[tx.loan_action];
  return {
    ...base,
    type: "loan",
    loan_action: tx.loan_action,
    person_id: shape.from === "person" ? tx.from_account_id : tx.to_account_id,
    account_id: shape.from === "asset" ? tx.from_account_id : shape.to === "asset" ? tx.to_account_id : "",
    due_date: tx.due_date ?? "",
    settles_transaction_id: tx.settles_transaction_id ?? "",
  };
}

/** Form state from (possibly incomplete) values — e.g. a voice draft being edited. */
function fromValues(v: TransactionInput): Draft {
  const base: Draft = {
    ...EMPTY,
    type: v.type,
    amount: v.amount ? String(v.amount) : "",
    occurred_on: v.occurred_on || todayInKarachi(),
    from_account_id: v.from_account_id ?? "",
    to_account_id: v.to_account_id ?? "",
    category_id: v.category_id ?? "",
    need_want: v.need_want ?? "",
    for_whom: v.for_whom ?? "self",
    merchant: v.merchant ?? "",
    note: v.note ?? "",
    venture_id: v.venture_id ?? "",
    envelope_id: v.envelope_id ?? "",
  };
  if (!v.loan_action) return base;
  const shape = LOAN_SHAPE[v.loan_action];
  return {
    ...base,
    type: "loan",
    loan_action: v.loan_action,
    person_id: (shape.from === "person" ? v.from_account_id : v.to_account_id) ?? "",
    account_id: (shape.from === "asset" ? v.from_account_id : shape.to === "asset" ? v.to_account_id : "") ?? "",
    due_date: v.due_date ?? "",
    settles_transaction_id: v.settles_transaction_id ?? "",
  };
}

/** Strip grouping commas and spaces: "1,25,000" → "125000". */
const cleanAmount = (v: string) => v.replace(/[^\d]/g, "");

export function EntryForm({
  editing,
  preset,
  initial,
  onSubmitValues,
  onDone,
}: {
  editing?: TypedTransaction;
  preset?: EntryPreset;
  /** Start from these values (voice draft). */
  initial?: TransactionInput;
  /** Draft mode: hand back validated values instead of saving. */
  onSubmitValues?: (values: TransactionValues) => void | Promise<void>;
  onDone: () => void;
}) {
  const m = useLedgerModel();
  const recent = useTransactions({ limit: 60 });
  const save = useSaveTransaction();
  const remove = useDeleteTransaction();
  const createPerson = useCreatePerson();

  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? fromTransaction(editing)
      : initial
        ? fromValues(initial)
        : {
          ...EMPTY,
          occurred_on: todayInKarachi(),
          type: preset?.type ?? (preset?.loan_action ? "loan" : "expense"),
          loan_action: preset?.loan_action ?? "",
          person_id: preset?.person_id ?? "",
          venture_id: preset?.venture_id ?? "",
          settles_transaction_id: preset?.settles_transaction_id ?? "",
          amount: preset?.amount ? String(preset.amount) : "",
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [catSearch, setCatSearch] = useState("");
  const [newPerson, setNewPerson] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const history = useMemo(() => recent.data ?? [], [recent.data]);

  const isLoan = draft.type === "loan";
  const shape = draft.loan_action ? LOAN_SHAPE[draft.loan_action] : null;
  const needsAsset = !!shape && (shape.from === "asset" || shape.to === "asset");
  const hasCategory = draft.type === "expense" || draft.loan_action === "friend_paid";

  // Smart default: the account last used for this type of entry.
  // (Envelope choice is resolved below, once the accounts are known.)
  const last = useMemo(() => history.find((tx) => tx.tx_type === draft.type && !tx.loan_action), [history, draft.type]);
  const lastAsset = useMemo(() => {
    const t = history.find((tx) => tx.tx_type === "expense");
    return t?.from_account_id ?? "";
  }, [history]);

  // Options per entry type (SPEC §2.2 pairs).
  const editingOpening = editing?.tx_type === "opening";
  const fromOptions =
    draft.type === "income" ? (editingOpening && m.openingSource ? [m.openingSource] : m.sources) : m.assets;
  const lastFrom = last?.from_account_id ?? "";
  const fromId = draft.from_account_id || (fromOptions.some((a) => a.id === lastFrom) ? lastFrom : "");
  const toOptions = draft.type === "expense" ? [] : m.assets.filter((a) => a.id !== fromId);
  const lastTo = last?.to_account_id ?? "";
  const toId =
    draft.type === "expense"
      ? (m.spending?.id ?? "")
      : draft.to_account_id || (toOptions.some((a) => a.id === lastTo) ? lastTo : "");

  const loanAccountId = draft.account_id || (m.assets.some((a) => a.id === lastAsset) ? lastAsset : "");
  const loanFrom = !shape ? "" : shape.from === "asset" ? loanAccountId : draft.person_id;
  const loanTo = !shape
    ? ""
    : shape.to === "asset"
      ? loanAccountId
      : shape.to === "person"
        ? draft.person_id
        : (m.spending?.id ?? "");

  // Repayments can settle a specific open item; default is oldest first.
  const settleDirection =
    draft.loan_action === "repay_by_me"
      ? "i_owe"
      : draft.loan_action === "repay_to_me" || draft.loan_action === "write_off"
        ? "they_owe"
        : null;
  const openItems = useOpenItems(settleDirection && draft.person_id ? draft.person_id : undefined);
  const settleOptions =
    settleDirection && draft.person_id
      ? (openItems.data ?? []).filter(
          (i) =>
            i.direction === settleDirection &&
            (i.outstanding > 0 || i.transaction_id === draft.settles_transaction_id),
        )
      : [];

  // Which envelope pays (SPEC §2.6): only for money leaving an on-budget account, outside a venture.
  const onBudget = (id: string) => !!m.accountById.get(id)?.on_budget;
  const envelopeMode: "expense" | "savings" | "loan" | null =
    draft.venture_id && (draft.type === "expense" || draft.type === "income")
      ? null
      : draft.type === "expense" && onBudget(fromId)
        ? "expense"
        : draft.type === "transfer" && onBudget(fromId) && toId && !onBudget(toId)
          ? "savings"
          : isLoan && (draft.loan_action === "lend" || draft.loan_action === "repay_by_me") && onBudget(loanAccountId)
            ? "loan"
            : null;
  const defaultEnvelopeId =
    envelopeMode === "expense"
      ? (m.catById.get(draft.category_id)?.default_envelope_id ?? "")
      : envelopeMode === "savings"
        ? (m.savingsGoal?.id ?? "")
        : "";
  const envelopeId = draft.envelope_id || defaultEnvelopeId;

  // Recent-first categories: the ones used in recent expenses, then the rest.
  const recentCategoryIds = useMemo(() => {
    const ids: string[] = [];
    for (const tx of history) {
      if (tx.category_id && !ids.includes(tx.category_id) && !m.catById.get(tx.category_id)?.is_system) ids.push(tx.category_id);
      if (ids.length === 6) break;
    }
    return ids;
  }, [history, m.catById]);

  const visibleCategories = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    return m.categoryOptions.filter((c) => !q || c.label.toLowerCase().includes(q));
  }, [m.categoryOptions, catSearch]);

  function pickCategory(id: string) {
    const c = m.catById.get(id);
    // An envelope that was only the old category's default follows the new category.
    const wasDefault = draft.envelope_id === (m.catById.get(draft.category_id)?.default_envelope_id ?? "");
    set({
      category_id: id,
      need_want: c?.default_need_want ?? draft.need_want,
      ...(wasDefault && { envelope_id: "" }),
    });
  }

  // Smart default: a merchant seen before brings back its category, account and venture.
  function onMerchantBlur() {
    const name = draft.merchant.trim().toLowerCase();
    if (!name || draft.type !== "expense") return;
    const prev = history.find((tx) => tx.tx_type === "expense" && tx.merchant?.toLowerCase() === name);
    if (!prev) return;
    setDraft((d) => ({
      ...d,
      category_id: d.category_id || prev.category_id || "",
      need_want: d.need_want || prev.need_want || "",
      from_account_id: d.from_account_id || (prev.loan_action ? "" : prev.from_account_id),
      venture_id: d.venture_id || prev.venture_id || "",
    }));
  }

  async function addPerson() {
    const name = newPerson?.trim();
    if (!name) return;
    if (m.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setErrors({ person: `${name} is already in People` });
      return;
    }
    try {
      const person = await createPerson.mutateAsync({ name });
      set({ person_id: person.id, settles_transaction_id: "" });
      setNewPerson(null);
      setErrors({});
    } catch (e) {
      toast.error("Couldn't add person", { description: (e as Error).message });
    }
  }

  async function submit() {
    if (isLoan) {
      const missing: Record<string, string> = {};
      if (!draft.loan_action) missing.loan_action = "Pick what happened";
      else {
        if (!draft.person_id) missing.person = "Choose a person";
        if (needsAsset && !loanAccountId) missing.account = "Choose an account";
      }
      if (Object.keys(missing).length) {
        setErrors(missing);
        return;
      }
    }

    const parsed = transactionInput.safeParse({
      type: draft.type,
      amount: cleanAmount(draft.amount),
      occurred_on: draft.occurred_on,
      from_account_id: isLoan ? loanFrom : fromId,
      to_account_id: isLoan ? loanTo : toId,
      category_id: hasCategory ? draft.category_id || null : null,
      need_want: hasCategory ? draft.need_want || null : null,
      for_whom: draft.for_whom,
      merchant: draft.merchant,
      note: draft.note,
      venture_id: draft.venture_id || null,
      envelope_id: envelopeMode ? envelopeId || null : null,
      loan_action: draft.loan_action || null,
      due_date: draft.due_date || null,
      settles_transaction_id: draft.settles_transaction_id || null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    if (onSubmitValues) {
      await onSubmitValues(parsed.data);
      onDone();
      return;
    }
    try {
      await save.mutateAsync({ id: editing?.id, values: parsed.data });
      toast.success(editing ? "Entry updated" : "Entry added");
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    }
  }

  async function onDelete() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await remove.mutateAsync(editing.id);
      toast.success("Entry deleted");
      onDone();
    } catch (e) {
      toast.error("Couldn't delete", { description: (e as Error).message });
    }
  }

  if (m.isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const amountTone =
    draft.type === "expense" || draft.loan_action === "friend_paid"
      ? "text-expense"
      : draft.type === "income"
        ? "text-income"
        : "text-foreground";

  return (
    <form
      id="entry-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      {!editingOpening && (
        <Segmented
          value={draft.type}
          onChange={(type) => {
            setErrors({});
            set({ type, from_account_id: "", to_account_id: "" });
          }}
          options={TYPES}
        />
      )}

      <div className="flex flex-col items-center gap-1 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium text-muted-foreground">Rs</span>
          <input
            aria-label="Amount"
            inputMode="numeric"
            autoFocus={!editing}
            placeholder="0"
            value={draft.amount ? Number(cleanAmount(draft.amount) || 0).toLocaleString("en-IN") : ""}
            onChange={(e) => set({ amount: cleanAmount(e.target.value) })}
            className={cn(
              "w-full max-w-[14ch] bg-transparent text-center text-5xl font-semibold tabular outline-none placeholder:text-muted-foreground/40",
              amountTone,
            )}
          />
        </div>
        <FieldError msg={errors.amount} />
      </div>

      {isLoan ? (
        <>
          <Field label="What happened" error={errors.loan_action}>
            <div className="grid grid-cols-2 gap-2">
              {LOAN_ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => set({ loan_action: a, settles_transaction_id: "", due_date: "" })}
                  className={cn(
                    "flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors",
                    draft.loan_action === a ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  <span className="text-sm font-medium">{LOAN_SHAPE[a].label}</span>
                  <span className={cn("text-xs", draft.loan_action === a ? "opacity-85" : "text-muted-foreground")}>
                    {LOAN_SHAPE[a].hint}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {shape && (
            <>
              <Field label="Person" error={errors.person}>
                <div className="flex flex-wrap gap-2">
                  {m.people.map((p) => (
                    <Chip
                      key={p.id}
                      selected={draft.person_id === p.id}
                      onClick={() => set({ person_id: p.id, settles_transaction_id: "" })}
                    >
                      {p.name}
                    </Chip>
                  ))}
                  {newPerson === null ? (
                    <Chip onClick={() => setNewPerson("")}>
                      <Plus className="size-4" /> New person
                    </Chip>
                  ) : (
                    <div className="flex w-full gap-2">
                      <Input
                        autoFocus
                        value={newPerson}
                        onChange={(e) => setNewPerson(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addPerson();
                          }
                        }}
                        placeholder="Name, e.g. Ali"
                        className="h-10"
                      />
                      <Button type="button" className="h-10" onClick={addPerson} disabled={createPerson.isPending}>
                        {createPerson.isPending ? <Loader2 className="animate-spin" /> : "Add"}
                      </Button>
                    </div>
                  )}
                </div>
              </Field>

              {needsAsset && (
                <Field
                  label={shape.from === "asset" ? "From my account" : "Into my account"}
                  error={errors.account}
                >
                  <ChipRow
                    items={m.assets.map((a) => ({ id: a.id, label: a.name }))}
                    value={loanAccountId}
                    onChange={(id) => set({ account_id: id })}
                    empty="Add an account in Setup first."
                  />
                </Field>
              )}

              {settleOptions.length > 0 && (
                <Field label="Settles">
                  <div className="flex flex-col gap-2">
                    <SettleOption
                      selected={!draft.settles_transaction_id}
                      onClick={() => set({ settles_transaction_id: "" })}
                      title="Oldest first"
                      detail="Applies to the oldest open items automatically"
                    />
                    {settleOptions.map((i) => (
                      <SettleOption
                        key={i.transaction_id}
                        selected={draft.settles_transaction_id === i.transaction_id}
                        onClick={() => set({ settles_transaction_id: i.transaction_id })}
                        title={`${formatPKR(i.outstanding)} open of ${formatPKR(i.amount)}`}
                        detail={[formatDay(i.occurred_on), i.due_date && `due ${formatDay(i.due_date)}`, i.note]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))}
                  </div>
                </Field>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Field label={draft.type === "income" ? "From (income source)" : "From"} error={errors.from_account_id}>
            <ChipRow
              items={fromOptions.map((a) => ({ id: a.id, label: a.name }))}
              value={fromId}
              onChange={(id) => set({ from_account_id: id })}
              empty={draft.type === "income" ? "Add an income source in Accounts first." : "Add an account in Setup first."}
            />
          </Field>

          {draft.type !== "expense" && (
            <Field label="To" error={errors.to_account_id}>
              <ChipRow
                items={toOptions.map((a) => ({ id: a.id, label: a.name }))}
                value={toId}
                onChange={(id) => set({ to_account_id: id })}
                empty="Add another account first."
              />
            </Field>
          )}
        </>
      )}

      {hasCategory && (
        <Field label="Category" error={errors.category_id}>
          {recentCategoryIds.length > 0 && !catSearch && (
            <div className="mb-2 flex flex-wrap gap-2">
              {recentCategoryIds.map((id) => (
                <Chip key={id} selected={draft.category_id === id} onClick={() => pickCategory(id)}>
                  {m.categoryLabel(id)}
                </Chip>
              ))}
            </div>
          )}
          <label className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm focus-within:border-ring">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="Search categories"
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {visibleCategories.map((c) => (
              <Chip key={c.id} selected={draft.category_id === c.id} onClick={() => pickCategory(c.id)}>
                {c.parentName ? (
                  <>
                    <span className={cn(draft.category_id === c.id ? "opacity-80" : "text-muted-foreground")}>
                      {c.parentName} ›
                    </span>
                    {c.name}
                  </>
                ) : (
                  c.name
                )}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.occurred_on}>
          <Input type="date" value={draft.occurred_on} onChange={(e) => set({ occurred_on: e.target.value })} className="h-10" />
        </Field>
        {hasCategory ? (
          <Field label="Need or want">
            <Segmented
              value={draft.need_want || "need"}
              onChange={(need_want) => set({ need_want })}
              options={[
                { value: "need", label: "Need" },
                { value: "want", label: "Want" },
              ]}
            />
          </Field>
        ) : draft.loan_action === "lend" || draft.loan_action === "borrow" ? (
          <Field label="Due date (optional)" error={errors.due_date}>
            <Input
              type="date"
              value={draft.due_date}
              min={draft.occurred_on}
              onChange={(e) => set({ due_date: e.target.value })}
              className="h-10"
            />
          </Field>
        ) : (
          <div />
        )}
      </div>

      {envelopeMode && (
        <Field label={envelopeMode === "loan" ? "Take it from" : "Pay from envelope"}>
          <div className="flex flex-wrap gap-2">
            {envelopeMode === "loan" && (
              <Chip selected={!envelopeId} onClick={() => set({ envelope_id: "" })}>
                To Assign
              </Chip>
            )}
            {m.envelopes.map((e) => (
              <Chip key={e.id} selected={envelopeId === e.id} onClick={() => set({ envelope_id: e.id })}>
                {e.name}
              </Chip>
            ))}
          </div>
          {envelopeMode === "expense" && !envelopeId && (
            <p className="text-xs text-muted-foreground">Pick a category or an envelope.</p>
          )}
        </Field>
      )}

      {(draft.type === "expense" || draft.type === "income") && m.ventures.length > 0 && (
        <Field label="Venture (optional)">
          <div className="flex flex-wrap gap-2">
            <Chip selected={!draft.venture_id} onClick={() => set({ venture_id: "" })}>
              Personal
            </Chip>
            {m.ventures.map((v) => (
              <Chip key={v.id} selected={draft.venture_id === v.id} onClick={() => set({ venture_id: v.id })}>
                {v.name}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      {hasCategory && (
        <>
          <Field label="Merchant">
            <Input
              value={draft.merchant}
              onChange={(e) => set({ merchant: e.target.value })}
              onBlur={onMerchantBlur}
              placeholder="e.g. Imtiaz"
              className="h-10"
            />
          </Field>
          <Field label="For whom">
            <div className="flex flex-wrap gap-2">
              {FOR_WHOM.map((o) => (
                <Chip key={o.value} selected={draft.for_whom === o.value} onClick={() => set({ for_whom: o.value })}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </Field>
        </>
      )}

      <Field label="Note">
        <Input value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" className="h-10" />
      </Field>

      {errors.form && <FieldError msg={errors.form} />}

      {editing && (
        <Button type="button" variant="destructive" className="h-11" onClick={onDelete} disabled={remove.isPending}>
          {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          {confirmDelete ? "Tap again to delete" : "Delete entry"}
        </Button>
      )}
    </form>
  );
}

export function EntrySubmit({ editing, label }: { editing?: boolean; label?: string }) {
  const pending = useIsMutating() > 0;
  return (
    <Button type="submit" form="entry-form" size="lg" className="h-12 w-full text-base" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {label ?? (editing ? "Save changes" : "Add entry")}
    </Button>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground">{label}</Label>
      {children}
      <FieldError msg={error} />
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-sm text-expense">{msg}</p> : null;
}

function SettleOption({
  selected,
  onClick,
  title,
  detail,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
        selected ? "border-primary bg-primary/10" : "hover:bg-muted",
      )}
    >
      <span className="text-sm font-medium">{title}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </button>
  );
}

function ChipRow({
  items,
  value,
  onChange,
  empty,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  empty: string;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Chip key={i.id} selected={value === i.id} onClick={() => onChange(i.id)}>
          {i.label}
        </Chip>
      ))}
    </div>
  );
}
