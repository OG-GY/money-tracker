"use client";

import { Archive, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/chip";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Venture, VentureStatus } from "@/lib/db/types";
import { todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { useCreateVenture, useUpdateVenture } from "@/lib/ledger/queries";
import { fieldErrors, ventureInput } from "@/lib/ledger/schema";

const STATUSES: { value: VentureStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
];

/** Add a venture (its envelope is created by the DB), or edit / archive one. */
export function VenturePanel({
  open,
  onOpenChange,
  venture,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  venture?: Venture;
}) {
  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={venture ? "Edit venture" : "Add venture"}
      description={venture ? undefined : "It gets its own protected envelope for business money."}
      footer={
        <Button type="submit" form="venture-form" size="lg" className="h-12 w-full text-base">
          {venture ? "Save" : "Add venture"}
        </Button>
      }
    >
      {open && <VentureForm venture={venture} onDone={() => onOpenChange(false)} />}
    </ResponsivePanel>
  );
}

function VentureForm({ venture, onDone }: { venture?: Venture; onDone: () => void }) {
  const m = useLedgerModel();
  const create = useCreateVenture();
  const update = useUpdateVenture();
  const [name, setName] = useState(venture?.name ?? "");
  const [status, setStatus] = useState<VentureStatus>(venture?.status ?? "active");
  const [startedOn, setStartedOn] = useState(venture?.started_on ?? todayInKarachi());
  const [notes, setNotes] = useState(venture?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const parsed = ventureInput.safeParse({ name, status, started_on: startedOn || null, notes });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (m.allVentures.some((v) => v.id !== venture?.id && v.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return setErrors({ name: "You already have a venture with this name" });
    }
    try {
      if (venture) await update.mutateAsync({ id: venture.id, patch: parsed.data });
      else await create.mutateAsync(parsed.data);
      toast.success(venture ? "Saved" : `${parsed.data.name} added`);
      onDone();
    } catch (e) {
      const msg = (e as Error).message;
      toast.error("Couldn't save", {
        description: msg.includes("envelopes_user_id_name_key") ? "An envelope already uses this name." : msg,
      });
    }
  }

  async function archive() {
    if (!venture) return;
    try {
      await update.mutateAsync({ id: venture.id, patch: { archived: !venture.archived } });
      toast.success(venture.archived ? "Restored" : "Archived");
      onDone();
    } catch (e) {
      toast.error("Couldn't update", { description: (e as Error).message });
    }
  }

  return (
    <form
      id="venture-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="v-name" className="text-muted-foreground">Name</Label>
        <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ElevLoop" className="h-11" autoFocus={!venture} />
        {errors.name && <p className="text-sm text-expense">{errors.name}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">Status</Label>
        <Segmented value={status} onChange={setStatus} options={STATUSES} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="v-start" className="text-muted-foreground">Started on</Label>
        <Input id="v-start" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className="h-11" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="v-notes" className="text-muted-foreground">Notes</Label>
        <Textarea id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={3} />
      </div>
      {venture && (
        <Button type="button" variant="outline" className="h-11" onClick={archive} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" /> : <Archive />}
          {venture.archived ? "Restore" : "Archive"}
        </Button>
      )}
    </form>
  );
}
