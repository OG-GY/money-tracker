"use client";

import { ArrowDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Chip } from "@/components/chip";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EnvelopeBalance } from "@/lib/db/types";
import { formatPKR } from "@/lib/format";
import { MOVE_LABEL, inferMoveKind as inferKind } from "@/lib/ledger/moves";
import { useCreateMove } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";

/** "" = To Assign. */
export type MovePreset = { from?: string; to?: string; amount?: number; title?: string };

const TO_ASSIGN = "";

export function MovePanel({
  open,
  onOpenChange,
  preset,
  envelopes,
  toAssign,
  date,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset?: MovePreset;
  envelopes: EnvelopeBalance[];
  toAssign: number;
  date: string;
  /** Called after a successful save (e.g. to clear a voice draft). */
  onSaved?: () => void;
}) {
  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={preset?.title ?? "Move money"}
      footer={<SubmitButton />}
    >
      {open && (
        <MoveForm
          preset={preset}
          envelopes={envelopes}
          toAssign={toAssign}
          date={date}
          onDone={() => {
            onSaved?.();
            onOpenChange(false);
          }}
        />
      )}
    </ResponsivePanel>
  );
}

function SubmitButton() {
  return (
    <Button type="submit" form="move-form" size="lg" className="h-12 w-full text-base">
      Move money
    </Button>
  );
}

function MoveForm({
  preset,
  envelopes,
  toAssign,
  date,
  onDone,
}: {
  preset?: MovePreset;
  envelopes: EnvelopeBalance[];
  toAssign: number;
  date: string;
  onDone: () => void;
}) {
  const create = useCreateMove();
  const [from, setFrom] = useState<string | undefined>(preset?.from);
  const [to, setTo] = useState<string | undefined>(preset?.to);
  const [amount, setAmount] = useState(preset?.amount ? String(preset.amount) : "");
  const [when, setWhen] = useState(date);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const live = envelopes.filter((e) => !e.archived);
  const byId = new Map(live.map((e) => [e.envelope_id, e]));
  const kindOf = (id: string | undefined) => (id === undefined ? undefined : id === TO_ASSIGN ? null : (byId.get(id)?.kind ?? null));
  const fromKind = kindOf(from);
  const toKind = kindOf(to);
  const kind = fromKind !== undefined && toKind !== undefined && from !== to ? inferKind(fromKind, toKind) : null;
  const available = from === undefined ? null : from === TO_ASSIGN ? toAssign : (byId.get(from)?.available ?? 0);

  const options = [
    { id: TO_ASSIGN, label: "To Assign", available: toAssign, kind: null as string | null },
    ...live.map((e) => ({ id: e.envelope_id, label: e.name, available: e.available, kind: e.kind as string })),
  ];
  // Only offer destinations that make a valid move from the chosen source.
  const toOptions = options.filter((o) => o.id !== from && (from === undefined || inferKind(fromKind ?? null, o.kind)));

  async function submit() {
    const value = Number(amount.replace(/[^\d]/g, ""));
    if (from === undefined) return setError("Choose where the money comes from");
    if (to === undefined) return setError("Choose where it goes");
    if (!kind) return setError("Money can't move between these two envelopes");
    if (!value) return setError("Enter an amount");
    setError(null);
    try {
      await create.mutateAsync({
        kind,
        amount: value,
        occurred_on: when,
        from_envelope_id: from || null,
        to_envelope_id: to || null,
        note: note.trim() || null,
      });
      toast.success(`${MOVE_LABEL[kind]}: ${formatPKR(value)}`);
      onDone();
    } catch (e) {
      toast.error("Couldn't move money", { description: (e as Error).message });
    }
  }

  return (
    <form
      id="move-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col items-center gap-1 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium text-muted-foreground">Rs</span>
          <input
            aria-label="Amount"
            inputMode="numeric"
            autoFocus
            placeholder="0"
            value={amount ? Number(amount.replace(/[^\d]/g, "") || 0).toLocaleString("en-IN") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            className="w-full max-w-[14ch] bg-transparent text-center text-5xl font-semibold tabular outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        {available !== null && (
          <button
            type="button"
            onClick={() => available > 0 && setAmount(String(available))}
            className={cn("text-sm", available < 0 ? "text-expense" : "text-muted-foreground hover:text-foreground")}
          >
            {available < 0 ? "Overspent " : "Available "}
            {formatPKR(available)}
            {available > 0 && " · use all"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">From</Label>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Chip
              key={o.id || "to-assign"}
              selected={from === o.id}
              onClick={() => {
                setFrom(o.id);
                if (to !== undefined && (to === o.id || !inferKind(o.kind, kindOf(to) ?? null))) setTo(undefined);
              }}
            >
              {o.label}
              <span className={cn("tabular", from === o.id ? "opacity-80" : o.available < 0 ? "text-expense" : "text-muted-foreground")}>
                {formatPKR(o.available)}
              </span>
            </Chip>
          ))}
        </div>
      </div>

      <ArrowDown className="mx-auto size-5 text-muted-foreground" />

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">To</Label>
        <div className="flex flex-wrap gap-2">
          {toOptions.map((o) => (
            <Chip key={o.id || "to-assign"} selected={to === o.id} onClick={() => setTo(o.id)}>
              {o.label}
            </Chip>
          ))}
        </div>
        {kind && (
          <p className="text-sm text-muted-foreground">
            This is {kind === "investment" ? "an" : "a"} <span className="font-medium text-foreground">{MOVE_LABEL[kind]}</span>
            {kind === "investment" && " — recorded as money you put into the venture."}
            {kind === "draw" && " — recorded as income the venture gave you."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">Date</Label>
          <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className="h-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-10" />
        </div>
      </div>

      {error && <p className="text-sm text-expense">{error}</p>}
      {create.isPending && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
    </form>
  );
}
