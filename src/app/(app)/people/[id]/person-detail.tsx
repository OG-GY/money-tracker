"use client";

import { ArrowLeft, CalendarClock, Loader2, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { useEntry } from "@/components/entry/entry-provider";
import { TxList } from "@/components/transactions/tx-list";
import { Button } from "@/components/ui/button";
import type { OpenItem } from "@/lib/db/types";
import { formatDay } from "@/lib/dates";
import { formatPKR, todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { useOpenItems, usePersonBalances, useTransactions } from "@/lib/ledger/queries";
import { LOAN_SHAPE, type FormLoanAction } from "@/lib/ledger/schema";
import { cn } from "@/lib/utils";
import { PersonPanel } from "../person-panel";

const QUICK_ACTIONS: FormLoanAction[] = ["lend", "borrow", "repay_to_me", "repay_by_me", "friend_paid", "write_off"];

export function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const m = useLedgerModel();
  const balances = usePersonBalances();
  const items = useOpenItems(id);
  const tx = useTransactions({ accountId: id });
  const { openNew } = useEntry();
  const [editing, setEditing] = useState(false);
  const today = todayInKarachi();

  const person = m.accountById.get(id);
  const bal = balances.data?.find((b) => b.account_id === id);

  if (m.isLoading || balances.isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!person || person.kind !== "person" || !bal) {
    return <p className="px-4 pt-10 text-center text-muted-foreground">Person not found.</p>;
  }

  const open = (items.data ?? []).filter((i) => i.outstanding > 0);
  const theyOwe = open.filter((i) => i.direction === "they_owe");
  const iOwe = open.filter((i) => i.direction === "i_owe");

  return (
    <>
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-6">
        <div className="flex items-center justify-between">
          <Link
            href="/people"
            className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> People
          </Link>
          <Button variant="ghost" className="h-10" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        </div>

        <div className="mt-2 flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-primary">
            {person.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
              {person.name}
              {person.archived && <span className="ml-2 text-sm font-normal text-muted-foreground">Archived</span>}
            </h1>
            {person.meta.phone && (
              <a href={`tel:${person.meta.phone}`} className="inline-flex items-center gap-1 text-sm text-primary">
                <Phone className="size-3.5" /> {person.meta.phone}
              </a>
            )}
            {person.meta.note && <p className="text-sm text-muted-foreground">{person.meta.note}</p>}
          </div>
        </div>

        <p className="mt-5 text-base">
          {bal.net === 0 ? (
            <span className="text-muted-foreground">Overall, you&apos;re even with {person.name}.</span>
          ) : bal.net > 0 ? (
            <>Overall, {person.name} owes you <span className="font-semibold text-income">{formatPKR(bal.net)}</span></>
          ) : (
            <>Overall, you owe {person.name} <span className="font-semibold text-expense">{formatPKR(-bal.net)}</span></>
          )}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-6 px-4 md:px-8">
        <div className="grid gap-3 sm:grid-cols-2">
          <Side
            title="They owe me"
            total={bal.they_owe_me}
            tone="text-income"
            items={theyOwe}
            today={today}
            settleLabel="Mark repaid"
            onSettle={(i) =>
              openNew({ loan_action: "repay_to_me", person_id: id, settles_transaction_id: i.transaction_id, amount: i.outstanding })
            }
          />
          <Side
            title="I owe them"
            total={bal.i_owe_them}
            tone="text-expense"
            items={iOwe}
            today={today}
            settleLabel="Repay"
            onSettle={(i) =>
              openNew({ loan_action: "repay_by_me", person_id: id, settles_transaction_id: i.transaction_id, amount: i.outstanding })
            }
          />
        </div>

        {!person.archived && (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {QUICK_ACTIONS.map((a) => (
              <Button
                key={a}
                variant="outline"
                className="h-10 shrink-0"
                onClick={() => openNew({ loan_action: a, person_id: id })}
              >
                {LOAN_SHAPE[a].label}
              </Button>
            ))}
          </div>
        )}

        <section>
          <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Timeline</h2>
          {tx.isLoading ? (
            <Loader2 className="mx-auto animate-spin text-muted-foreground" />
          ) : (
            <TxList items={tx.data ?? []} empty={`Nothing between you and ${person.name} yet.`} />
          )}
        </section>
      </div>

      <PersonPanel open={editing} onOpenChange={setEditing} person={person} onArchived={() => router.push("/people")} />
    </>
  );
}

function Side({
  title,
  total,
  tone,
  items,
  today,
  settleLabel,
  onSettle,
}: {
  title: string;
  total: number;
  tone: string;
  items: OpenItem[];
  today: string;
  settleLabel: string;
  onSettle: (i: OpenItem) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <AnimatedNumber value={Math.max(total, 0)} className={cn("mt-1 block text-2xl font-semibold tabular", tone)} />
      {items.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y border-t">
          {items.map((i) => {
            const overdue = !!i.due_date && i.due_date < today;
            const dueToday = i.due_date === today;
            return (
              <li key={i.transaction_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular">
                    {formatPKR(i.outstanding)}
                    {i.outstanding < i.amount && (
                      <span className="font-normal text-muted-foreground"> of {formatPKR(i.amount)}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.loan_action === "opening"
                      ? "From before"
                      : `${i.loan_action === "friend_paid" ? "Paid for me" : i.loan_action === "lend" ? "Lent" : "Borrowed"} ${formatDay(i.occurred_on)}`}
                    {i.note && ` · ${i.note}`}
                  </p>
                  {i.due_date && (
                    <p
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 text-xs",
                        overdue || dueToday ? "font-medium text-warning" : "text-muted-foreground",
                      )}
                    >
                      <CalendarClock className="size-3" />
                      {overdue ? "Overdue · " : dueToday ? "Due today · " : "Due "}
                      {formatDay(i.due_date)}
                    </p>
                  )}
                </div>
                <Button variant="secondary" size="sm" className="h-8" onClick={() => onSettle(i)}>
                  {settleLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
