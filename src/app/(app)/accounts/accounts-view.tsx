"use client";

import { motion } from "framer-motion";
import { Banknote, ChevronRight, Landmark, Loader2, PiggyBank, Plus, Scale, Smartphone, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { AccountBalance, AssetSubtype } from "@/lib/db/types";
import { formatPKR } from "@/lib/format";
import { useBalances } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";
import { AddAccountPanel } from "./add-account-panel";

const SUBTYPE_ICON: Record<AssetSubtype, typeof Landmark> = {
  bank: Landmark,
  wallet: Smartphone,
  cash: Banknote,
  savings: PiggyBank,
};

export function AccountsView() {
  const balances = useBalances();
  const [adding, setAdding] = useState(false);
  const rows = balances.data ?? [];

  const onBudget = rows.filter((r) => r.kind === "asset" && r.on_budget);
  const offBudget = rows.filter((r) => r.kind === "asset" && !r.on_budget);
  // System sources (opening balances, corrections) aren't real income.
  const sources = rows.filter((r) => r.kind === "source" && r.name !== "Opening Balance" && r.name !== "Balance correction");
  const sum = (list: AccountBalance[]) => list.reduce((s, r) => s + Number(r.balance), 0);

  return (
    <>
      <PageHeader
        title="Accounts"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="h-10" render={<Link href="/accounts/balances" />} nativeButton={false}>
              <Scale /> Set balances
            </Button>
            <Button size="lg" className="h-10" onClick={() => setAdding(true)}>
              <Plus /> Add
            </Button>
          </div>
        }
      />

      {balances.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : balances.error ? (
        <p className="px-4 text-sm text-expense md:px-8">{(balances.error as Error).message}</p>
      ) : (
        <div className="flex flex-col gap-6 px-4 md:px-8">
          <div className="grid grid-cols-2 gap-3 md:max-w-xl">
            <Total label="On budget" value={sum(onBudget)} />
            <Total label="Savings" value={sum(offBudget)} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Group title="On-budget accounts" rows={onBudget} empty="No accounts yet. Run setup or add one." />
            <Group title="Savings (off-budget)" rows={offBudget} empty="No savings accounts." />
          </div>

          <section>
            <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Income sources · all-time received
            </h2>
            {sources.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sources.map((s) => (
                  <Link
                    key={s.account_id}
                    href={`/accounts/${s.account_id}`}
                    className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <TrendingUp className="size-4 text-income" />
                    <span className="flex-1 truncate font-medium">{s.name}</span>
                    <span className="text-sm text-muted-foreground tabular">{formatPKR(Number(s.total_out))}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-1 text-sm text-muted-foreground">No income sources yet.</p>
            )}
          </section>
        </div>
      )}

      <AddAccountPanel open={adding} onOpenChange={setAdding} />
    </>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <AnimatedNumber
        value={value}
        className={cn("mt-1 block text-xl font-semibold tabular md:text-2xl", value < 0 && "text-expense")}
      />
    </div>
  );
}

function Group({ title, rows, empty }: { title: string; rows: AccountBalance[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {rows.length ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {rows.map((r, i) => {
            const Icon = SUBTYPE_ICON[r.subtype ?? "bank"];
            return (
              <motion.div
                key={r.account_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(i > 0 && "border-t")}
              >
                <Link
                  href={`/accounts/${r.account_id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{r.subtype}</p>
                  </div>
                  <span className={cn("font-semibold tabular", Number(r.balance) < 0 && "text-expense")}>
                    {formatPKR(Number(r.balance))}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
