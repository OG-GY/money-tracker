"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/chip";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AssetSubtype } from "@/lib/db/types";
import { todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { useCreateAccount } from "@/lib/ledger/queries";
import { accountInput, fieldErrors } from "@/lib/ledger/schema";

const SUBTYPES: { value: AssetSubtype; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "wallet", label: "Wallet" },
  { value: "cash", label: "Cash" },
  { value: "savings", label: "Savings" },
];

export function AddAccountPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Add account"
      footer={
        <Button type="submit" form="account-form" size="lg" className="h-12 w-full text-base">
          Add account
        </Button>
      }
    >
      {open && <AccountForm onDone={() => onOpenChange(false)} />}
    </ResponsivePanel>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const m = useLedgerModel();
  const create = useCreateAccount();
  const [kind, setKind] = useState<"asset" | "source">("asset");
  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState<AssetSubtype>("wallet");
  const [onBudget, setOnBudget] = useState(true);
  const [balance, setBalance] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const parsed = accountInput.safeParse({
      name,
      kind,
      subtype: kind === "asset" ? subtype : null,
      on_budget: kind === "asset" && onBudget,
      opening_balance: kind === "asset" ? balance || 0 : 0,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (m.accounts.some((a) => a.kind === kind && a.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return setErrors({ name: "You already have one with this name" });
    }
    try {
      await create.mutateAsync({ values: parsed.data, openingSourceId: m.openingSource?.id, date: todayInKarachi() });
      toast.success(`${parsed.data.name} added`);
      onDone();
    } catch (e) {
      toast.error("Couldn't add account", { description: (e as Error).message });
    }
  }

  return (
    <form
      id="account-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "asset", label: "Money account" },
          { value: "source", label: "Income source" },
        ]}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="acc-name" className="text-muted-foreground">Name</Label>
        <Input
          id="acc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "asset" ? "e.g. NayaPay" : "e.g. Upwork client"}
          className="h-11"
          autoFocus
        />
        {errors.name && <p className="text-sm text-expense">{errors.name}</p>}
      </div>

      {kind === "asset" && (
        <>
          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground">Type</Label>
            <Segmented
              value={subtype}
              onChange={(s) => {
                setSubtype(s);
                setOnBudget(s !== "savings");
              }}
              options={SUBTYPES}
            />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
            <span>
              <span className="block font-medium">Part of envelopes</span>
              <span className="text-sm text-muted-foreground">Off for savings you track but don&apos;t budget.</span>
            </span>
            <Switch checked={onBudget} onCheckedChange={setOnBudget} />
          </label>
          <div className="flex flex-col gap-2">
            <Label className="text-muted-foreground">Current balance</Label>
            <label className="flex h-11 items-center gap-2 rounded-lg border px-3 focus-within:border-ring">
              <span className="text-sm text-muted-foreground">Rs</span>
              <input
                inputMode="numeric"
                placeholder="0"
                value={balance ? Number(balance).toLocaleString("en-IN") : ""}
                onChange={(e) => setBalance(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full bg-transparent tabular outline-none"
              />
            </label>
            {errors.opening_balance && <p className="text-sm text-expense">{errors.opening_balance}</p>}
          </div>
        </>
      )}
      {create.isPending && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
    </form>
  );
}
