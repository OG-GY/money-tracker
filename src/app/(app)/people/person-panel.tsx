"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/chip";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/lib/db/types";
import { formatPKR } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { setPersonOpening, useCreatePerson, useOpenItems, useUpdateAccount } from "@/lib/ledger/queries";
import { fieldErrors, personInput } from "@/lib/ledger/schema";

type OldLoan = "none" | "they_owe" | "i_owe";

/** Add a friend, or edit/archive one (SPEC §2.8), including any loan from before tracking began. */
export function PersonPanel({
  open,
  onOpenChange,
  person,
  onArchived,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  person?: Account;
  onArchived?: () => void;
}) {
  // Editing: wait for the existing starting balance so the form opens with it filled in.
  const items = useOpenItems(person?.id);
  const opening = person ? (items.data ?? []).find((i) => i.loan_action === "opening") : undefined;
  const ready = !person || !items.isLoading;

  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={person ? "Edit person" : "Add friend"}
      footer={
        <Button type="submit" form="person-form" size="lg" className="h-12 w-full text-base">
          {person ? "Save" : "Add friend"}
        </Button>
      }
    >
      {open &&
        (ready ? (
          <PersonForm
            person={person}
            initialLoan={opening ? { dir: opening.direction, amount: opening.amount } : undefined}
            onDone={() => onOpenChange(false)}
            onArchived={onArchived}
          />
        ) : (
          <Loader2 className="mx-auto mt-8 animate-spin text-muted-foreground" />
        ))}
    </ResponsivePanel>
  );
}

function PersonForm({
  person,
  initialLoan,
  onDone,
  onArchived,
}: {
  person?: Account;
  initialLoan?: { dir: "they_owe" | "i_owe"; amount: number };
  onDone: () => void;
  onArchived?: () => void;
}) {
  const m = useLedgerModel();
  const qc = useQueryClient();
  const create = useCreatePerson();
  const update = useUpdateAccount();
  const [name, setName] = useState(person?.name ?? "");
  const [phone, setPhone] = useState(person?.meta.phone ?? "");
  const [note, setNote] = useState(person?.meta.note ?? "");
  const [oldLoan, setOldLoan] = useState<OldLoan>(initialLoan?.dir ?? "none");
  const [oldAmount, setOldAmount] = useState(initialLoan ? String(initialLoan.amount) : "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const parsed = personInput.safeParse({ name, phone, note });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const v = parsed.data;
    if (m.people.some((p) => p.id !== person?.id && p.name.toLowerCase() === v.name.toLowerCase())) {
      return setErrors({ name: "You already have someone with this name" });
    }
    const amount = Number(oldAmount || 0);
    if (oldLoan !== "none" && amount <= 0) return setErrors({ oldLoan: "Enter how much" });

    setSaving(true);
    try {
      let id = person?.id;
      if (person) {
        await update.mutateAsync({ id: person.id, patch: { name: v.name, meta: { ...person.meta, phone: v.phone, note: v.note } } });
      } else {
        id = (await create.mutateAsync(v)).id;
      }
      // Only touch the starting balance when it actually changed.
      const before = initialLoan ? `${initialLoan.dir}:${initialLoan.amount}` : "none";
      const after = oldLoan === "none" ? "none" : `${oldLoan}:${amount}`;
      if (id && before !== after) {
        await setPersonOpening(id, oldLoan === "none" ? null : oldLoan, oldLoan === "none" ? 0 : amount);
        await qc.invalidateQueries({ queryKey: ["ledger"] });
      }
      toast.success(person ? "Saved" : `${v.name} added`);
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!person) return;
    try {
      await update.mutateAsync({ id: person.id, patch: { archived: !person.archived } });
      toast.success(person.archived ? `${person.name} restored` : `${person.name} archived`);
      onDone();
      if (!person.archived) onArchived?.();
    } catch (e) {
      toast.error("Couldn't update", { description: (e as Error).message });
    }
  }

  const who = name.trim() || "They";

  return (
    <form
      id="person-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="p-name" className="text-muted-foreground">Name</Label>
        <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ali" className="h-11" autoFocus={!person} />
        {errors.name && <p className="text-sm text-expense">{errors.name}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="p-phone" className="text-muted-foreground">Phone (optional)</Label>
        <Input id="p-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx xxxxxxx" className="h-11" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="p-note" className="text-muted-foreground">Note (optional)</Label>
        <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. office friend" className="h-11" />
      </div>

      {/* A loan that already existed before using the app: not spending, not income. */}
      <div className="flex flex-col gap-3 rounded-2xl border p-4">
        <div>
          <p className="font-medium">Loan from before</p>
          <p className="text-sm text-muted-foreground">Anything already pending before you started using the app.</p>
        </div>
        <Segmented
          value={oldLoan}
          onChange={setOldLoan}
          options={[
            { value: "none", label: "Nothing" },
            { value: "they_owe", label: `${who} owes me` },
            { value: "i_owe", label: `I owe ${name.trim() || "them"}` },
          ]}
          className="[&_button]:truncate [&_button]:px-1 [&_button]:text-xs sm:[&_button]:text-sm"
        />
        {oldLoan !== "none" && (
          <>
            <label className="flex h-11 items-center gap-2 rounded-lg border px-3 focus-within:border-ring">
              <span className="text-sm text-muted-foreground">Rs</span>
              <input
                inputMode="numeric"
                placeholder="0"
                aria-label="Amount from before"
                value={oldAmount ? Number(oldAmount).toLocaleString("en-IN") : ""}
                onChange={(e) => setOldAmount(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full bg-transparent tabular outline-none"
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {oldAmount
                ? oldLoan === "they_owe"
                  ? `${who} owes you ${formatPKR(Number(oldAmount))} — doesn't count as spending or income.`
                  : `You owe ${name.trim() || "them"} ${formatPKR(Number(oldAmount))} — doesn't count as spending or income.`
                : "Total of everything still pending."}
            </p>
          </>
        )}
        {errors.oldLoan && <p className="text-sm text-expense">{errors.oldLoan}</p>}
      </div>

      {saving && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}

      {person && (
        <Button type="button" variant="outline" className="h-11" onClick={archive} disabled={update.isPending}>
          <Archive />
          {person.archived ? "Restore" : "Archive"}
        </Button>
      )}
    </form>
  );
}
