"use client";

import { Archive, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/lib/db/types";
import { useLedgerModel } from "@/lib/ledger/model";
import { useCreatePerson, useUpdateAccount } from "@/lib/ledger/queries";
import { fieldErrors, personInput } from "@/lib/ledger/schema";

/** Add a friend, or edit/archive one (SPEC §2.8). */
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
      {open && <PersonForm person={person} onDone={() => onOpenChange(false)} onArchived={onArchived} />}
    </ResponsivePanel>
  );
}

function PersonForm({ person, onDone, onArchived }: { person?: Account; onDone: () => void; onArchived?: () => void }) {
  const m = useLedgerModel();
  const create = useCreatePerson();
  const update = useUpdateAccount();
  const [name, setName] = useState(person?.name ?? "");
  const [phone, setPhone] = useState(person?.meta.phone ?? "");
  const [note, setNote] = useState(person?.meta.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const parsed = personInput.safeParse({ name, phone, note });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const v = parsed.data;
    if (m.people.some((p) => p.id !== person?.id && p.name.toLowerCase() === v.name.toLowerCase())) {
      return setErrors({ name: "You already have someone with this name" });
    }
    try {
      if (person) {
        await update.mutateAsync({
          id: person.id,
          patch: { name: v.name, meta: { ...person.meta, phone: v.phone, note: v.note } },
        });
        toast.success("Saved");
      } else {
        await create.mutateAsync(v);
        toast.success(`${v.name} added`);
      }
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
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
      {person && (
        <Button type="button" variant="outline" className="h-11" onClick={archive} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" /> : <Archive />}
          {person.archived ? "Restore" : "Archive"}
        </Button>
      )}
    </form>
  );
}
