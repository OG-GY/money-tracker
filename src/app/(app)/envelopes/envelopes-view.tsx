"use client";

import { motion } from "framer-motion";
import { ArrowRightLeft, Briefcase, ChevronLeft, ChevronRight, Copy, Loader2, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AnimatedNumber } from "@/components/animated-number";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { EnvelopeBalance } from "@/lib/db/types";
import { addMonths, dateInMonth, formatMonth, monthRange } from "@/lib/dates";
import { formatPKR, todayInKarachi } from "@/lib/format";
import { useBudgetOverview, useCopyLastMonth, useEnvelopeBalances } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";
import { EnvelopePanel } from "./envelope-panel";
import { MovePanel, type MovePreset } from "./move-panel";

export function EnvelopesView() {
  const today = todayInKarachi();
  const thisMonth = monthRange(today).start;
  const [month, setMonth] = useState(thisMonth);
  const balances = useEnvelopeBalances(month);
  const overview = useBudgetOverview(month);
  const copy = useCopyLastMonth();

  const [move, setMove] = useState<MovePreset | null>(null);
  const [editing, setEditing] = useState<EnvelopeBalance | "new" | null>(null);

  const all = balances.data ?? [];
  const personal = all.filter((e) => e.kind === "personal" && !e.archived);
  const ventures = all.filter((e) => e.kind === "venture" && !e.archived);
  const archived = all.filter((e) => e.archived && e.available !== 0);
  const toAssign = overview.data?.to_assign ?? 0;
  const overspent = personal.filter((e) => e.available < 0);

  async function copyPlan() {
    try {
      const n = await copy.mutateAsync(month);
      toast(n ? `Assigned ${n} envelope${n === 1 ? "" : "s"} from last month` : "Nothing to copy", {
        description: n ? undefined : "Last month's assignments are already covered.",
      });
    } catch (e) {
      toast.error("Couldn't copy the plan", { description: (e as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        title="Envelopes"
        action={
          <Button variant="outline" size="lg" className="h-10" onClick={() => setEditing("new")}>
            <Plus /> New
          </Button>
        }
      />

      <div className="flex flex-col gap-5 px-4 md:px-8">
        <div className="flex items-center justify-between rounded-2xl border bg-card p-1">
          <Button variant="ghost" size="icon-lg" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft />
          </Button>
          <button className="font-medium" onClick={() => setMonth(thisMonth)} disabled={month === thisMonth}>
            {formatMonth(month)}
            {month !== thisMonth && <span className="ml-2 text-xs text-primary">Back to now</span>}
          </button>
          <Button variant="ghost" size="icon-lg" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight />
          </Button>
        </div>

        <motion.div
          layout
          className={cn(
            "flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center",
            toAssign < 0 ? "bg-expense text-white" : toAssign > 0 ? "bg-primary text-primary-foreground" : "border bg-card",
          )}
        >
          <div className="flex-1">
            <p className={cn("text-sm", toAssign === 0 ? "text-muted-foreground" : "opacity-90")}>To Assign</p>
            <AnimatedNumber value={toAssign} className="block text-3xl font-semibold tabular" />
            <p className={cn("mt-1 text-sm", toAssign === 0 ? "text-muted-foreground" : "opacity-90")}>
              {toAssign > 0
                ? "Give every rupee a job."
                : toAssign < 0
                  ? "You've assigned more than you have. Take some back from an envelope."
                  : "Every rupee has a job."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={toAssign === 0 ? "default" : "secondary"}
              className="h-11"
              onClick={() => setMove(toAssign < 0 ? { to: "", title: "Take money back" } : { from: "", title: "Assign" })}
            >
              {toAssign < 0 ? "Take back" : "Assign"}
            </Button>
            <Button
              variant={toAssign === 0 ? "outline" : "secondary"}
              className="h-11"
              onClick={copyPlan}
              disabled={copy.isPending}
            >
              {copy.isPending ? <Loader2 className="animate-spin" /> : <Copy />} Copy last month
            </Button>
            <Button variant={toAssign === 0 ? "outline" : "secondary"} className="h-11" onClick={() => setMove({})}>
              <ArrowRightLeft /> Move
            </Button>
          </div>
        </motion.div>

        {overspent.length > 0 && (
          <p className="flex items-center gap-2 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
            <TriangleAlert className="size-4 shrink-0" />
            {overspent.length} overspent {overspent.length === 1 ? "envelope" : "envelopes"}. Cover them from another envelope.
          </p>
        )}

        {balances.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : balances.error ? (
          <p className="text-sm text-expense">{(balances.error as Error).message}</p>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {personal.map((e, i) => (
                <EnvelopeCard
                  key={e.envelope_id}
                  e={e}
                  index={i}
                  onOpen={() => setEditing(e)}
                  onCover={() => setMove({ to: e.envelope_id, amount: -e.available, title: `Cover ${e.name}` })}
                />
              ))}
            </section>

            <section>
              <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Venture envelopes · protected business money
              </h2>
              {ventures.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {ventures.map((e) => (
                    <div key={e.envelope_id} className="rounded-2xl border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                          <Briefcase className="size-4 text-primary" />
                        </div>
                        <Link href={`/ventures/${e.venture_id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                          {e.name}
                        </Link>
                        <span className={cn("text-lg font-semibold tabular", e.available < 0 && "text-expense")}>
                          {formatPKR(e.available)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        This month: +{formatPKR(e.received)} revenue · −{formatPKR(e.spent)} costs
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="h-10"
                          onClick={() => setMove({ to: e.envelope_id, title: `Invest in ${e.name}` })}
                        >
                          Invest
                        </Button>
                        <Button
                          className="h-10"
                          disabled={e.available <= 0}
                          onClick={() =>
                            setMove({ from: e.envelope_id, to: "", amount: e.available, title: `Pay myself from ${e.name}` })
                          }
                        >
                          Pay myself
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-1 text-sm text-muted-foreground">
                  No ventures yet. <Link href="/ventures" className="text-primary">Add one</Link> to get its envelope.
                </p>
              )}
            </section>

            {archived.length > 0 && (
              <p className="text-sm text-warning">
                Archived envelopes still holding money: {archived.map((e) => `${e.name} (${formatPKR(e.available)})`).join(", ")}
              </p>
            )}

            <p className="px-1 pb-2 text-xs text-muted-foreground tabular">
              On-budget money {formatPKR(overview.data?.on_budget_total ?? 0)} = envelopes{" "}
              {formatPKR(overview.data?.envelopes_total ?? 0)} + To Assign {formatPKR(toAssign)}
            </p>
          </>
        )}
      </div>

      <MovePanel
        open={move !== null}
        onOpenChange={(o) => !o && setMove(null)}
        preset={move ?? undefined}
        envelopes={all}
        toAssign={toAssign}
        date={dateInMonth(month, today)}
      />
      <EnvelopePanel
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        envelope={editing && editing !== "new" ? editing : undefined}
        existingNames={all.map((e) => e.name)}
        onMove={(preset) => {
          setEditing(null);
          setMove(preset);
        }}
      />
    </>
  );
}

function EnvelopeCard({
  e,
  index,
  onOpen,
  onCover,
}: {
  e: EnvelopeBalance;
  index: number;
  onOpen: () => void;
  onCover: () => void;
}) {
  const target = e.monthly_target ?? 0;
  const funded = target ? Math.min(Math.max(e.assigned, 0) / target, 1) : 0;
  const over = e.available < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn("rounded-2xl border bg-card", over && "border-expense/50")}
    >
      <button type="button" onClick={onOpen} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{e.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular">
              {e.rolled_over !== 0 && `${formatPKR(e.rolled_over)} rolled · `}
              {formatPKR(e.assigned)} assigned · {formatPKR(e.spent)} spent
            </p>
          </div>
          <div className="text-right">
            <p className={cn("text-lg font-semibold tabular", over ? "text-expense" : e.available === 0 && "text-muted-foreground")}>
              {formatPKR(e.available)}
            </p>
            <p className="text-xs text-muted-foreground">{over ? "overspent" : "available"}</p>
          </div>
        </div>
        {target > 0 && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn("h-full rounded-full", funded >= 1 ? "bg-income" : "bg-primary")}
                initial={{ width: 0 }}
                animate={{ width: `${funded * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground tabular">
              {funded >= 1 ? "Target funded" : `${formatPKR(Math.max(target - Math.max(e.assigned, 0), 0))} to reach ${formatPKR(target)}`}
            </p>
          </div>
        )}
      </button>
      {over && (
        <div className="border-t px-4 py-2">
          <Button variant="ghost" className="h-9 w-full text-expense hover:text-expense" onClick={onCover}>
            Cover {formatPKR(-e.available)}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
