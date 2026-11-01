"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EntryForm, EntrySubmit } from "@/components/entry/entry-form";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { formatDay, monthRange } from "@/lib/dates";
import { formatPKR, todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { MOVE_LABEL } from "@/lib/ledger/moves";
import { createAccount, createPerson, createVenture, useBudgetOverview, useEnvelopeBalances } from "@/lib/ledger/queries";
import { LOAN_SHAPE } from "@/lib/ledger/schema";
import { cn } from "@/lib/utils";
import { voiceDb, type StoredDraft } from "@/lib/voice/drafts-db";
import { LOW_CONFIDENCE, completeMove, completeValues, type Issue, type Resolved } from "@/lib/voice/resolve";
import { MovePanel } from "../envelopes/move-panel";

const ACTION_LABEL: Record<string, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  envelope_move: "Envelope move",
  savings_update: "Balance update",
  ...Object.fromEntries(Object.entries(LOAN_SHAPE).map(([k, v]) => [k, v.label])),
};

export function DraftCard({ draft, resolved, onAdd }: { draft: StoredDraft; resolved: Resolved; onAdd: () => Promise<void> }) {
  const m = useLedgerModel();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const month = monthRange(todayInKarachi()).start;
  const envelopes = useEnvelopeBalances(month);
  const budget = useBudgetOverview();

  const p = draft.parsed;
  const canAdd = !!(completeValues(resolved) || completeMove(resolved));
  const lowConfidence = !draft.edited && p.confidence < LOW_CONFIDENCE;
  const flagged = (field: string) => resolved.fuzzy.includes(field) || resolved.issues.some((i) => i.field === field);

  const acc = (id?: string | null) => (id ? m.accountById.get(id)?.name : undefined);
  const env = (id?: string | null) => (id === null ? "To Assign" : id ? m.envelopeById.get(id)?.name : undefined);

  let from: string | undefined;
  let to: string | undefined;
  let amount = p.amount ?? 0;
  let date = p.date;
  const details: { field: string; label: string }[] = [];
  let action = ACTION_LABEL[p.action] ?? p.action;

  if (resolved.kind === "transaction") {
    const v = resolved.values;
    from = acc(v.from_account_id) ?? p.from ?? undefined;
    to = acc(v.to_account_id) ?? p.to ?? undefined;
    amount = Number(v.amount ?? 0);
    date = v.occurred_on;
    action = v.loan_action ? LOAN_SHAPE[v.loan_action].label : (ACTION_LABEL[v.type] ?? action);
    const cat = m.categoryLabel(v.category_id ?? null);
    if (cat || p.category) details.push({ field: "category", label: cat ?? p.category! });
    if (v.merchant) details.push({ field: "merchant", label: v.merchant });
    if (v.venture_id || p.venture) details.push({ field: "venture", label: m.ventureById.get(v.venture_id ?? "")?.name ?? p.venture! });
    if (v.need_want) details.push({ field: "need_want", label: v.need_want === "need" ? "Need" : "Want" });
    if (v.for_whom && v.for_whom !== "self") details.push({ field: "for_whom", label: `For ${v.for_whom}` });
    if (v.due_date) details.push({ field: "due_date", label: `Due ${formatDay(v.due_date)}` });
    if (v.note) details.push({ field: "note", label: v.note });
  } else if (resolved.kind === "move") {
    from = env(resolved.move.from_envelope_id) ?? p.from ?? undefined;
    to = env(resolved.move.to_envelope_id) ?? p.to ?? undefined;
    if (resolved.move.kind) action = MOVE_LABEL[resolved.move.kind];
  }

  const tone =
    p.action === "expense" || p.action === "friend_paid" ? "text-expense" : p.action === "income" ? "text-income" : "text-foreground";

  async function fix(issue: Issue) {
    if (!issue.create) return;
    setFixing(issue.field);
    try {
      const { kind, name } = issue.create;
      if (kind === "person") await createPerson({ name });
      else if (kind === "venture") await createVenture({ name, status: "active", started_on: todayInKarachi(), notes: null });
      else await createAccount({ name, kind: "source", subtype: null, on_budget: false, opening_balance: 0 }, undefined, todayInKarachi());
      await qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success(`${name} added`);
    } catch (e) {
      toast.error("Couldn't add it", { description: (e as Error).message });
    } finally {
      setFixing(null);
    }
  }

  return (
    <div className={cn("rounded-2xl border bg-card p-4", lowConfidence && "border-warning/60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{action}</p>
          <p className={cn("text-2xl font-semibold tabular", tone, flagged("amount") && "rounded bg-warning/15 px-1")}>
            {amount ? formatPKR(amount) : "Rs ?"}
          </p>
        </div>
        {date && <span className="shrink-0 text-sm text-muted-foreground">{formatDay(date)}</span>}
      </div>

      {(from || to) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Pill flagged={flagged("from")}>{from ?? "?"}</Pill>
          <ArrowRight className="size-4 text-muted-foreground" />
          <Pill flagged={flagged("to")}>{to ?? "?"}</Pill>
        </div>
      )}
      {details.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {details.map((d) => (
            <Pill key={d.field} flagged={flagged(d.field)} muted>
              {d.label}
            </Pill>
          ))}
        </div>
      )}
      {resolved.kind === "unsupported" && <p className="mt-2 text-sm text-muted-foreground">{resolved.reason}</p>}

      {lowConfidence && (
        <p className="mt-3 flex items-center gap-2 text-sm text-warning">
          <AlertTriangle className="size-4" /> Not sure about this one — check the highlighted parts.
        </p>
      )}

      {resolved.issues.length > 0 && resolved.kind !== "unsupported" && (
        <ul className="mt-3 flex flex-col gap-2">
          {resolved.issues.map((i) => (
            <li key={i.field + i.message} className="flex items-center justify-between gap-3 rounded-xl bg-warning/10 px-3 py-2 text-sm">
              <span className="text-warning">{i.message}</span>
              {i.create && (
                <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => fix(i)} disabled={fixing !== null}>
                  {fixing === i.field ? <Loader2 className="animate-spin" /> : <Plus />}
                  {i.create.kind === "person" ? "Add person" : i.create.kind === "venture" ? "Create venture" : "Add source"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-[auto_1fr_1fr] gap-2">
        <Button variant="ghost" className="h-11 text-muted-foreground" aria-label="Discard" onClick={() => voiceDb().drafts.delete(draft.id)}>
          <Trash2 />
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setEditing(true)} disabled={resolved.kind === "unsupported"}>
          <Pencil /> Edit
        </Button>
        <Button
          className="h-11"
          disabled={!canAdd || adding}
          onClick={async () => {
            setAdding(true);
            await onAdd();
            setAdding(false);
          }}
        >
          {adding ? <Loader2 className="animate-spin" /> : <Check />} Add
        </Button>
      </div>

      {resolved.kind === "transaction" && (
        <ResponsivePanel open={editing} onOpenChange={setEditing} title="Edit draft" footer={<EntrySubmit label="Save draft" />}>
          {editing && (
            <EntryForm
              initial={resolved.values}
              onSubmitValues={async (values) => {
                await voiceDb().drafts.update(draft.id, { edited: values });
              }}
              onDone={() => setEditing(false)}
            />
          )}
        </ResponsivePanel>
      )}
      {resolved.kind === "move" && (
        <MovePanel
          open={editing}
          onOpenChange={setEditing}
          preset={{
            from: resolved.move.from_envelope_id === undefined ? undefined : (resolved.move.from_envelope_id ?? ""),
            to: resolved.move.to_envelope_id === undefined ? undefined : (resolved.move.to_envelope_id ?? ""),
            amount: resolved.move.amount,
            title: "Edit envelope move",
          }}
          envelopes={envelopes.data ?? []}
          toAssign={budget.data?.to_assign ?? 0}
          date={resolved.move.occurred_on ?? todayInKarachi()}
          onSaved={() => voiceDb().drafts.delete(draft.id)}
        />
      )}
    </div>
  );
}

function Pill({ children, flagged, muted }: { children: React.ReactNode; flagged?: boolean; muted?: boolean }) {
  return (
    <span
      title={flagged ? "Check this" : undefined}
      className={cn(
        "rounded-full px-2.5 py-1",
        flagged ? "bg-warning/15 text-warning ring-1 ring-warning/50" : muted ? "bg-muted text-muted-foreground" : "bg-muted font-medium",
      )}
    >
      {children}
    </span>
  );
}
