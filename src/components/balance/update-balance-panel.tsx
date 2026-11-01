"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountBalance } from "@/lib/db/types";
import { formatPKR, todayInKarachi } from "@/lib/format";
import { useUpdateBalance } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";

/** What saving will record, so there are no surprises (mirrors public.update_balance). */
export function describeChange(account: Pick<AccountBalance, "subtype" | "total_in" | "total_out">, diff: number) {
  if (diff === 0) return { text: "Matches — nothing to record.", tone: "text-muted-foreground" };
  const fresh = Number(account.total_in) === 0 && Number(account.total_out) === 0;
  if (fresh && diff > 0) return { text: `Recorded as an opening balance of ${formatPKR(diff)} (not income).`, tone: "text-foreground" };
  if (account.subtype === "savings" && diff > 0) return { text: `${formatPKR(diff)} recorded as profit.`, tone: "text-income" };
  if (account.subtype === "savings") return { text: `Down ${formatPKR(-diff)} — recorded as a correction and flagged for you to check.`, tone: "text-warning" };
  return {
    text: `${diff > 0 ? "+" : "−"}${formatPKR(Math.abs(diff))} balance correction (kept out of income and spending).`,
    tone: "text-foreground",
  };
}

export function UpdateBalancePanel({
  account,
  open,
  onOpenChange,
}: {
  account: AccountBalance;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={`Update ${account.name}`}
      description="Enter what your bank or wallet app shows right now."
      footer={
        <Button type="submit" form="balance-form" size="lg" className="h-12 w-full text-base">
          Save balance
        </Button>
      }
    >
      {open && <BalanceForm account={account} onDone={() => onOpenChange(false)} />}
    </ResponsivePanel>
  );
}

function BalanceForm({ account, onDone }: { account: AccountBalance; onDone: () => void }) {
  const update = useUpdateBalance();
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayInKarachi());
  const known = Number(account.balance);
  const entered = value === "" ? null : Number(value);
  const diff = entered === null ? null : entered - known;
  const change = diff === null ? null : describeChange(account, diff);

  async function submit() {
    if (entered === null) return;
    try {
      const r = await update.mutateAsync({ accountId: account.account_id, balance: entered, date });
      if (r.kind === "none") toast.success(`${account.name} checked — all matches`);
      else if (r.flagged) toast.warning(`${account.name} went down by ${formatPKR(-r.difference)}`, { description: "Recorded as a correction. Check if something's missing." });
      else toast.success(`${account.name} updated to ${formatPKR(r.balance)}`);
      onDone();
    } catch (e) {
      toast.error("Couldn't update", { description: (e as Error).message });
    }
  }

  return (
    <form
      id="balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <div className="rounded-2xl bg-muted p-4 text-sm">
        <p className="text-muted-foreground">The app thinks it holds</p>
        <p className="text-xl font-semibold">{formatPKR(known)}</p>
      </div>

      <div className="flex flex-col items-center gap-1 py-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-medium text-muted-foreground">Rs</span>
          <input
            aria-label="Actual balance"
            inputMode="numeric"
            autoFocus
            placeholder="0"
            value={value ? Number(value).toLocaleString("en-IN") : ""}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
            className="w-full max-w-[14ch] bg-transparent text-center text-5xl font-semibold outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        {change && (
          <p className={cn("flex items-center gap-1.5 text-center text-sm", change.tone)}>
            {change.tone === "text-warning" && <AlertTriangle className="size-4" />}
            {change.text}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">As of</Label>
        <Input type="date" value={date} max={todayInKarachi()} onChange={(e) => setDate(e.target.value)} className="h-10" />
        <p className="text-xs text-muted-foreground">Entries dated after this day aren&apos;t counted.</p>
      </div>
      {update.isPending && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
    </form>
  );
}
