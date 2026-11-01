"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatPKR, todayInKarachi } from "@/lib/format";
import { useOpenItems, usePersonBalances } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";
import { PersonPanel } from "./person-panel";

export function PeopleView() {
  const people = usePersonBalances();
  const open = useOpenItems();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const today = todayInKarachi();

  const overdueByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of open.data ?? []) {
      if (i.outstanding > 0 && i.due_date && i.due_date < today) map.set(i.person_id, (map.get(i.person_id) ?? 0) + 1);
    }
    return map;
  }, [open.data, today]);

  const all = people.data ?? [];
  const list = all.filter((p) => p.archived === showArchived);
  const active = all.filter((p) => !p.archived);
  const owedToMe = active.reduce((s, p) => s + Math.max(p.they_owe_me, 0), 0);
  const iOwe = active.reduce((s, p) => s + Math.max(p.i_owe_them, 0), 0);
  const overdue = [...overdueByPerson.values()].reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        title="People"
        action={
          <Button size="lg" className="h-10" onClick={() => setAdding(true)}>
            <UserPlus /> Add friend
          </Button>
        }
      />

      {people.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : people.error ? (
        <p className="px-4 text-sm text-expense md:px-8">{(people.error as Error).message}</p>
      ) : (
        <div className="flex flex-col gap-6 px-4 md:px-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Owed to me" value={owedToMe} tone="text-income" />
            <Tile label="I owe" value={iOwe} tone="text-expense" />
            <Tile label="Net" value={owedToMe - iOwe} tone={owedToMe - iOwe < 0 ? "text-expense" : "text-foreground"} />
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Overdue items</p>
              <p className={cn("mt-1 text-xl font-semibold tabular md:text-2xl", overdue > 0 && "text-warning")}>{overdue}</p>
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {showArchived ? "Archived" : "Friends"}
              </h2>
              {all.some((p) => p.archived) && (
                <button className="text-sm text-primary" onClick={() => setShowArchived((s) => !s)}>
                  {showArchived ? "Show active" : "Show archived"}
                </button>
              )}
            </div>

            {list.length ? (
              <div className="overflow-hidden rounded-2xl border bg-card">
                {list.map((p, i) => {
                  const od = overdueByPerson.get(p.account_id) ?? 0;
                  return (
                    <motion.div
                      key={p.account_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={cn(i > 0 && "border-t")}
                    >
                      <Link
                        href={`/people/${p.account_id}`}
                        className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-primary">
                          {p.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 truncate font-medium">
                            {p.name}
                            {od > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 text-xs text-warning">
                                <AlertTriangle className="size-3" /> {od} overdue
                              </span>
                            )}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {p.they_owe_me > 0 && <span>Owes you {formatPKR(p.they_owe_me)}</span>}
                            {p.they_owe_me > 0 && p.i_owe_them > 0 && " · "}
                            {p.i_owe_them > 0 && <span>You owe {formatPKR(p.i_owe_them)}</span>}
                            {p.they_owe_me <= 0 && p.i_owe_them <= 0 && "Settled"}
                          </p>
                        </div>
                        <NetLabel net={p.net} />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
                {showArchived ? "No archived people." : "No friends yet. Add one, or create them while adding a loan."}
              </div>
            )}
          </section>
        </div>
      )}

      <PersonPanel open={adding} onOpenChange={setAdding} />
    </>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <AnimatedNumber value={value} className={cn("mt-1 block text-xl font-semibold tabular md:text-2xl", tone)} />
    </div>
  );
}

export function NetLabel({ net }: { net: number }) {
  if (net === 0) return <span className="text-sm text-muted-foreground">Even</span>;
  return (
    <span className={cn("text-right text-sm font-semibold tabular", net > 0 ? "text-income" : "text-expense")}>
      {formatPKR(Math.abs(net))}
      <span className="block text-xs font-normal text-muted-foreground">{net > 0 ? "owes you" : "you owe"}</span>
    </span>
  );
}
