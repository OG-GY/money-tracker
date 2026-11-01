"use client";

import { Archive, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EnvelopeBalance } from "@/lib/db/types";
import { formatPKR } from "@/lib/format";
import { useSaveEnvelope } from "@/lib/ledger/queries";

/** Create a personal envelope, or edit name / monthly target / archive. */
export function EnvelopePanel({
  open,
  onOpenChange,
  envelope,
  existingNames,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  envelope?: EnvelopeBalance;
  existingNames: string[];
  onMove?: (preset: { from?: string; to?: string; title: string }) => void;
}) {
  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={envelope ? envelope.name : "New envelope"}
      footer={
        <Button type="submit" form="envelope-form" size="lg" className="h-12 w-full text-base">
          {envelope ? "Save" : "Create envelope"}
        </Button>
      }
    >
      {open && (
        <EnvelopeForm
          envelope={envelope}
          existingNames={existingNames}
          onDone={() => onOpenChange(false)}
          onMove={onMove}
        />
      )}
    </ResponsivePanel>
  );
}

function EnvelopeForm({
  envelope,
  existingNames,
  onDone,
  onMove,
}: {
  envelope?: EnvelopeBalance;
  existingNames: string[];
  onDone: () => void;
  onMove?: (preset: { from?: string; to?: string; title: string }) => void;
}) {
  const save = useSaveEnvelope();
  const [name, setName] = useState(envelope?.name ?? "");
  const [target, setTarget] = useState(envelope?.monthly_target ? String(envelope.monthly_target) : "");
  const [error, setError] = useState<string | null>(null);
  const isVenture = envelope?.kind === "venture";

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give it a name");
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase() && n !== envelope?.name)) {
      return setError("An envelope with this name already exists");
    }
    const monthly_target = target ? Number(target) : null;
    try {
      await save.mutateAsync({
        id: envelope?.envelope_id,
        values: isVenture ? { monthly_target } : { name: trimmed, monthly_target },
      });
      toast.success(envelope ? "Saved" : `${trimmed} created`);
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    }
  }

  async function archive() {
    if (!envelope) return;
    if (!envelope.archived && envelope.available !== 0) {
      return setError(`Move the ${formatPKR(envelope.available)} out first so nothing is lost.`);
    }
    try {
      await save.mutateAsync({ id: envelope.envelope_id, values: { archived: !envelope.archived } });
      toast.success(envelope.archived ? "Restored" : "Archived");
      onDone();
    } catch (e) {
      toast.error("Couldn't update", { description: (e as Error).message });
    }
  }

  return (
    <form
      id="envelope-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      {envelope && (
        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-muted p-4 text-sm">
          <Row label="Rolled over" value={envelope.rolled_over} />
          <Row label="Assigned" value={envelope.assigned} />
          <Row label={isVenture ? "Costs" : "Spent"} value={-envelope.spent} />
          {(isVenture || envelope.received > 0) && <Row label={isVenture ? "Revenue" : "Received"} value={envelope.received} />}
          <Row label="Available" value={envelope.available} strong />
        </dl>
      )}

      {envelope && onMove && !isVenture && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => onMove({ from: "", to: envelope.envelope_id, title: `Assign to ${envelope.name}` })}>
            Assign
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => onMove({ from: envelope.envelope_id, title: `Move from ${envelope.name}` })}>
            Move out
          </Button>
        </div>
      )}

      {!isVenture && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="e-name" className="text-muted-foreground">Name</Label>
          <Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eid shopping" className="h-11" autoFocus={!envelope} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">Monthly target (optional)</Label>
        <label className="flex h-11 items-center gap-2 rounded-lg border px-3 focus-within:border-ring">
          <span className="text-sm text-muted-foreground">Rs</span>
          <input
            inputMode="numeric"
            placeholder="0"
            value={target ? Number(target).toLocaleString("en-IN") : ""}
            onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))}
            className="w-full bg-transparent tabular outline-none"
          />
        </label>
      </div>

      {error && <p className="text-sm text-expense">{error}</p>}

      {envelope && !isVenture && envelope.role !== "savings_goal" && (
        <Button type="button" variant="outline" className="h-11" onClick={archive} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Archive />}
          {envelope.archived ? "Restore" : "Archive"}
        </Button>
      )}
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular ${strong ? "text-lg font-semibold" : "font-medium"} ${value < 0 ? "text-expense" : ""}`}>
        {formatPKR(value)}
      </dd>
    </div>
  );
}
