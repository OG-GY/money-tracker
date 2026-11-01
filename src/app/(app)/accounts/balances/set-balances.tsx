"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { describeChange } from "@/components/balance/update-balance-panel";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { updateBalance, useBalances, useLastSnapshots } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";

/** Every account in one list: type what each really holds, save once. */
export function SetBalances() {
  const router = useRouter();
  const qc = useQueryClient();
  const balances = useBalances();
  const snapshots = useLastSnapshots();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const accounts = (balances.data ?? []).filter((b) => b.kind === "asset" && !b.archived);
  const changed = accounts.filter((a) => values[a.account_id] !== undefined && values[a.account_id] !== "");

  async function saveAll() {
    setSaving(true);
    let updated = 0;
    const failed: string[] = [];
    for (const a of changed) {
      try {
        const r = await updateBalance(a.account_id, Number(values[a.account_id]));
        if (r.kind !== "none") updated++;
      } catch {
        failed.push(a.name);
      }
    }
    await qc.invalidateQueries({ queryKey: ["ledger"] });
    setSaving(false);
    if (failed.length) {
      toast.error(`Couldn't update ${failed.join(", ")}`, { description: "The others were saved. Try again." });
      return;
    }
    toast.success(updated ? `Updated ${updated} account${updated === 1 ? "" : "s"}` : "All balances already matched");
    router.push("/accounts");
  }

  return (
    <>
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-6">
        <Link href="/accounts" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted">
          <ArrowLeft className="size-4" /> Accounts
        </Link>
      </div>
      <PageHeader title="Set balances" description="Open each bank or wallet app and type what it shows. Leave a box empty to skip it." />

      <div className="flex max-w-2xl flex-col gap-3 px-4 md:px-8">
        {balances.isLoading ? (
          <Loader2 className="mx-auto animate-spin text-muted-foreground" />
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts yet. Add them from Accounts or Setup first.</p>
        ) : (
          accounts.map((a) => {
            const raw = values[a.account_id] ?? "";
            const entered = raw === "" ? null : Number(raw);
            const change = entered === null ? null : describeChange(a, entered - Number(a.balance));
            const last = snapshots.data?.get(a.account_id);
            return (
              <div key={a.account_id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      App shows {formatPKR(Number(a.balance))}
                      {last && ` · checked ${formatDay(last.taken_on)}`}
                    </p>
                  </div>
                  <label className="flex h-11 w-40 shrink-0 items-center gap-2 rounded-lg border px-3 focus-within:border-ring">
                    <span className="text-sm text-muted-foreground">Rs</span>
                    <input
                      inputMode="numeric"
                      placeholder="Actual"
                      aria-label={`${a.name} actual balance`}
                      value={raw ? Number(raw).toLocaleString("en-IN") : ""}
                      onChange={(e) => setValues((v) => ({ ...v, [a.account_id]: e.target.value.replace(/[^\d]/g, "") }))}
                      className="w-full bg-transparent tabular outline-none"
                    />
                  </label>
                </div>
                {change && <p className={cn("mt-2 text-sm", change.tone)}>{change.text}</p>}
              </div>
            );
          })
        )}

        {accounts.length > 0 && (
          <div className="sticky bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+0.5rem)] bg-background py-3 md:bottom-0">
            <Button size="lg" className="h-12 w-full text-base" onClick={saveAll} disabled={saving || !changed.length}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {changed.length ? `Save ${changed.length} balance${changed.length === 1 ? "" : "s"}` : "Type at least one balance"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
