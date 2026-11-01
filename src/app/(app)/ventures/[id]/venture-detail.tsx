"use client";

import { ArrowLeft, Loader2, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Segmented } from "@/components/chip";
import { useEntry } from "@/components/entry/entry-provider";
import { TxList } from "@/components/transactions/tx-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VentureMonth } from "@/lib/db/types";
import { dateInMonth, formatDay, formatMonth, monthRange } from "@/lib/dates";
import { formatPKR, todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import {
  useBudgetOverview,
  useDeleteMove,
  useEnvelopeBalances,
  useEnvelopeMoves,
  useTransactions,
  useVentureMonthly,
  useVentureSummary,
} from "@/lib/ledger/queries";
import { MovePanel, type MovePreset } from "../../envelopes/move-panel";
import { cn } from "@/lib/utils";
import { VenturePanel } from "../venture-panel";
import { STATUS_STYLE } from "../ventures-view";

type Period = "month" | "all" | "custom";

/** Burn and payback from the last 3 months with any activity (SPEC §2.5). */
function paceStats(months: VentureMonth[], invested: number, drawn: number) {
  const recent = months.filter((r) => r.revenue || r.costs).slice(-3);
  const avgProfit = recent.length ? recent.reduce((s, r) => s + r.revenue - r.costs, 0) / recent.length : 0;
  const burn = avgProfit < 0 ? -avgProfit : 0;
  const unrecovered = invested - drawn;
  const payback =
    unrecovered <= 0 ? "Paid back" : avgProfit > 0 ? `${Math.ceil(unrecovered / avgProfit)} months` : "—";
  return { burn, payback };
}

export function VentureDetail() {
  const { id } = useParams<{ id: string }>();
  const m = useLedgerModel();
  const { openNew } = useEntry();
  const today = todayInKarachi();
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState(() => monthRange(today));
  const [editing, setEditing] = useState(false);
  const [move, setMove] = useState<MovePreset | null>(null);
  const envelopes = useEnvelopeBalances(monthRange(today).start);
  const budget = useBudgetOverview();
  const deleteMove = useDeleteMove();

  const range = period === "month" ? monthRange(today) : period === "custom" ? custom : undefined;
  const summary = useVentureSummary(range?.start, range?.end);
  const allTime = useVentureSummary();
  const monthly = useVentureMonthly(id);
  const tx = useTransactions({ ventureId: id, from: range?.start, to: range?.end });

  const venture = m.ventureById.get(id);
  const envelopeId = venture?.envelope_id ?? undefined;
  const moves = useEnvelopeMoves(envelopeId, { enabled: !!envelopeId });
  const envelope = envelopes.data?.find((e) => e.envelope_id === envelopeId);
  const s = summary.data?.find((v) => v.venture_id === id);
  const total = allTime.data?.find((v) => v.venture_id === id);
  const months = useMemo(() => monthly.data ?? [], [monthly.data]);
  const pace = useMemo(
    () => paceStats(months, total?.invested ?? 0, total?.drawn ?? 0),
    [months, total?.invested, total?.drawn],
  );

  if (m.isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!venture) return <p className="px-4 pt-10 text-center text-muted-foreground">Venture not found.</p>;

  return (
    <>
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-6">
        <div className="flex items-center justify-between">
          <Link
            href="/ventures"
            className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> Ventures
          </Link>
          <Button variant="ghost" className="h-10" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{venture.name}</h1>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLE[venture.status])}>
            {venture.archived ? "archived" : venture.status}
          </span>
        </div>
        {venture.notes && <p className="mt-1 text-sm text-muted-foreground">{venture.notes}</p>}
      </div>

      <div className="mt-5 flex flex-col gap-5 px-4 md:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            value={period}
            onChange={setPeriod}
            options={[
              { value: "month", label: "This month" },
              { value: "all", label: "All time" },
              { value: "custom", label: "Custom" },
            ]}
            className="sm:w-80"
          />
          {period === "custom" && (
            <div className="flex gap-2">
              <Input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className="h-10" />
              <Input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className="h-10" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Money I put in" value={s?.invested ?? 0} />
          <Metric label="Money I took out" value={s?.drawn ?? 0} />
          <Metric label="Revenue" value={s?.revenue ?? 0} tone="text-income" />
          <Metric label="Costs" value={s?.costs ?? 0} tone="text-expense" />
          <Metric label="Profit" value={s?.profit ?? 0} tone={(s?.profit ?? 0) < 0 ? "text-expense" : "text-income"} />
          <Metric
            label="Net personal position"
            value={s?.net_personal ?? 0}
            hint={(s?.net_personal ?? 0) >= 0 ? "You're up" : "You're down"}
            tone={(s?.net_personal ?? 0) < 0 ? "text-expense" : "text-income"}
          />
          <Metric label="ROI" text={s?.roi == null ? "—" : `${s.roi}%`} hint="Profit ÷ invested" />
          <Metric
            label="Envelope balance"
            value={envelope?.available ?? 0}
            hint="Business money still in your accounts"
            tone={(envelope?.available ?? 0) < 0 ? "text-expense" : undefined}
          />
        </div>

        {envelopeId && !venture.archived && (
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            <Button variant="outline" className="h-11" onClick={() => setMove({ to: envelopeId, title: `Invest in ${venture.name}` })}>
              Invest
            </Button>
            <Button
              className="h-11"
              disabled={(envelope?.available ?? 0) <= 0}
              onClick={() => setMove({ from: envelopeId, to: "", amount: envelope?.available, title: `Pay myself from ${venture.name}` })}
            >
              Pay myself
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Monthly burn" value={pace.burn} hint="Avg loss, last 3 active months" />
          <Metric label="Months to payback" text={pace.payback} hint="Unrecovered ÷ avg monthly profit" />
        </div>

        {months.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Monthly history</h2>
            <div className="overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Month</th>
                    <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    <th className="px-4 py-2.5 text-right font-medium">Costs</th>
                    <th className="px-4 py-2.5 text-right font-medium">Put in</th>
                    <th className="px-4 py-2.5 text-right font-medium">Took out</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {[...months].reverse().map((r) => (
                    <tr key={r.month} className="border-b last:border-0">
                      <td className="px-4 py-2.5">{formatMonth(r.month)}</td>
                      <td className="px-4 py-2.5 text-right text-income">{formatPKR(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-expense">{formatPKR(r.costs)}</td>
                      <td className="px-4 py-2.5 text-right">{formatPKR(r.invested)}</td>
                      <td className="px-4 py-2.5 text-right">{formatPKR(r.drawn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(moves.data ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Envelope moves</h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
              {(moves.data ?? []).map((mv, i) => {
                const invest = mv.kind === "investment";
                const other = invest ? mv.from_envelope_id : mv.to_envelope_id;
                return (
                  <div key={mv.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t")}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{invest ? "Invested" : mv.kind === "draw" ? "Paid myself" : "Moved"}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDay(mv.occurred_on)} · {invest ? "from " : "to "}
                        {other ? (m.envelopeById.get(other)?.name ?? "envelope") : "To Assign"}
                        {mv.note && ` · ${mv.note}`}
                      </p>
                    </div>
                    <span className={cn("font-semibold tabular", invest ? "text-income" : "text-foreground")}>
                      {invest ? "+" : "−"}
                      {formatPKR(mv.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-muted-foreground"
                      onClick={() => deleteMove.mutate(mv.id)}
                      aria-label="Delete move"
                    >
                      Undo
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Transactions</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => openNew({ type: "income", venture_id: id })}>
                <Plus /> Revenue
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => openNew({ type: "expense", venture_id: id })}>
                <Plus /> Cost
              </Button>
            </div>
          </div>
          {tx.isLoading ? (
            <Loader2 className="mx-auto animate-spin text-muted-foreground" />
          ) : (
            <TxList items={tx.data ?? []} empty="No transactions linked to this venture in this period." />
          )}
        </section>
      </div>

      <VenturePanel open={editing} onOpenChange={setEditing} venture={venture} />
      <MovePanel
        open={move !== null}
        onOpenChange={(o) => !o && setMove(null)}
        preset={move ?? undefined}
        envelopes={envelopes.data ?? []}
        toAssign={budget.data?.to_assign ?? 0}
        date={dateInMonth(monthRange(today).start, today)}
      />
    </>
  );
}

function Metric({
  label,
  value,
  text,
  hint,
  tone,
}: {
  label: string;
  value?: number;
  text?: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular md:text-xl", tone)}>{text ?? formatPKR(value ?? 0)}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
