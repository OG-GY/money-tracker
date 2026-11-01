"use client";

import { ArrowLeft, Loader2, Scale } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { UpdateBalancePanel } from "@/components/balance/update-balance-panel";
import { TxList } from "@/components/transactions/tx-list";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { useBalances, useLastSnapshots, useTransactions } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";

export function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const balances = useBalances();
  const tx = useTransactions({ accountId: id });
  const account = balances.data?.find((b) => b.account_id === id);
  const snapshots = useLastSnapshots();
  const [updating, setUpdating] = useState(false);
  const lastChecked = snapshots.data?.get(id);

  if (balances.isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!account) {
    return <p className="px-4 pt-10 text-center text-muted-foreground">Account not found.</p>;
  }

  const isSource = account.kind === "source";
  const balance = Number(account.balance);

  return (
    <>
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-6">
        <Link
          href="/accounts"
          className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="size-4" /> Accounts
        </Link>
        <div className="mt-2 pb-5">
          <p className="text-sm text-muted-foreground capitalize">
            {isSource ? "Income source" : `${account.subtype}${account.on_budget ? "" : " · off-budget"}`}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{account.name}</h1>
          <AnimatedNumber
            value={isSource ? Number(account.total_out) : balance}
            className={cn("mt-2 block text-4xl font-semibold tabular", !isSource && balance < 0 && "text-expense")}
          />
          {isSource ? (
            <p className="mt-1 text-sm text-muted-foreground">Received all time</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                In {formatPKR(Number(account.total_in))} · Out {formatPKR(Number(account.total_out))}
                {lastChecked && ` · checked ${formatDay(lastChecked.taken_on)}`}
              </p>
              <Button variant="outline" className="mt-4 h-10" onClick={() => setUpdating(true)}>
                <Scale /> Update balance
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="px-4 md:px-8">
        {tx.isLoading ? (
          <Loader2 className="mx-auto animate-spin text-muted-foreground" />
        ) : (
          <TxList items={tx.data ?? []} empty="No entries for this account yet." />
        )}
      </div>
      {!isSource && <UpdateBalancePanel account={account} open={updating} onOpenChange={setUpdating} />}
    </>
  );
}
