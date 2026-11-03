"use client";

import { animate, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { ArrowDown, ArrowUp, Mic, Pencil, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useEntry } from "@/components/entry/entry-provider";
import { dayTotals as computeDayTotals, type DayTotal } from "@/lib/analytics/compute";
import type { TypedTransaction } from "@/lib/db/types";
import { formatDay } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { useDeleteTransaction, useRestoreTransaction } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";
import { describeTx } from "./tx-describe";

const ACTIONS_WIDTH = 144;

/** "auto-added" badge for voice entries saved without review (SPEC §4). */
function VoiceBadge({ tx }: { tx: TypedTransaction }) {
  if (tx.entry_method !== "voice") return null;
  return tx.auto_confirmed ? (
    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">auto-added</span>
  ) : (
    <Mic aria-label="Voice entry" className="size-3 shrink-0 text-muted-foreground" />
  );
}

function Amount({ value, sign, className }: { value: number; sign: 1 | -1 | 0; className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold whitespace-nowrap tabular",
        sign === 1 && "text-income",
        sign === -1 && "text-expense",
        className,
      )}
    >
      {sign === 1 ? "+" : sign === -1 ? "−" : ""}
      {formatPKR(value)}
    </span>
  );
}

function useDeleteWithUndo() {
  const del = useDeleteTransaction();
  const restore = useRestoreTransaction();
  return async (tx: TypedTransaction) => {
    try {
      await del.mutateAsync(tx.id);
      toast("Entry deleted", {
        action: { label: "Undo", onClick: () => restore.mutate(tx) },
      });
    } catch (e) {
      toast.error("Couldn't delete", { description: (e as Error).message });
    }
  };
}

/** "spent Rs 1,200 · +Rs 25,000" for a day header; nothing when the day had neither. */
function DayTotalLabel({ total }: { total?: DayTotal }) {
  if (!total || (!total.spent && !total.earned)) return null;
  return (
    <span className="flex items-baseline gap-2 text-xs font-medium normal-case tracking-normal tabular">
      {total.spent > 0 && (
        <span>
          <span className="text-muted-foreground">spent </span>
          <span className="text-expense">{formatPKR(total.spent)}</span>
        </span>
      )}
      {total.earned > 0 && <span className="text-income">+{formatPKR(total.earned)}</span>}
    </span>
  );
}

/**
 * Mobile: grouped by day with swipe-to-reveal actions. Desktop: sortable table.
 * Day headers show what was spent and earned that day. Pass `dayTotals` when the
 * list is only a slice (e.g. Home's latest entries) so the totals cover the whole day.
 */
export function TxList({
  items,
  empty,
  dayTotals,
}: {
  items: TypedTransaction[];
  empty?: React.ReactNode;
  dayTotals?: Map<string, DayTotal>;
}) {
  const totals = useMemo(() => dayTotals ?? computeDayTotals(items), [dayTotals, items]);
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        {empty ?? "No entries yet."}
      </div>
    );
  }
  return (
    <>
      <div className="md:hidden">
        <MobileList items={items} totals={totals} />
      </div>
      <div className="hidden md:block">
        <DesktopTable items={items} totals={totals} />
      </div>
    </>
  );
}

function MobileList({ items, totals }: { items: TypedTransaction[]; totals: Map<string, DayTotal> }) {
  const groups = useMemo(() => {
    const out: { day: string; items: TypedTransaction[] }[] = [];
    for (const tx of items) {
      const last = out.at(-1);
      if (last?.day === tx.occurred_on) last.items.push(tx);
      else out.push({ day: tx.occurred_on, items: [tx] });
    }
    return out;
  }, [items]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="mb-2 flex items-baseline justify-between gap-3 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span>{formatDay(g.day)}</span>
            <DayTotalLabel total={totals.get(g.day)} />
          </h3>
          <div className="overflow-hidden rounded-2xl border bg-card">
            {g.items.map((tx, i) => (
              <SwipeRow
                key={tx.id}
                tx={tx}
                divider={i > 0}
                open={openId === tx.id}
                onOpenChange={(o) => setOpenId(o ? tx.id : null)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SwipeRow({
  tx,
  divider,
  open,
  onOpenChange,
}: {
  tx: TypedTransaction;
  divider: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const m = useLedgerModel();
  const { openEdit } = useEntry();
  const deleteWithUndo = useDeleteWithUndo();
  const d = describeTx(tx, m);
  const x = useMotionValue(0);
  const actionsOpacity = useTransform(x, [-ACTIONS_WIDTH, -24, 0], [1, 0.4, 0]);

  // Close when another row opens.
  useEffect(() => {
    if (!open && x.get() !== 0) animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
  }, [open, x]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const shouldOpen = info.offset.x < -ACTIONS_WIDTH / 2 || info.velocity.x < -400;
    animate(x, shouldOpen ? -ACTIONS_WIDTH : 0, { type: "spring", stiffness: 500, damping: 40 });
    onOpenChange(shouldOpen);
  }

  return (
    <div className={cn("relative", divider && "border-t")}>
      <motion.div style={{ opacity: actionsOpacity }} className="absolute inset-y-0 right-0 flex" aria-hidden={!open}>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            openEdit(tx);
          }}
          className="flex w-18 flex-col items-center justify-center gap-1 bg-muted text-xs font-medium"
        >
          <Pencil className="size-4" /> Edit
        </button>
        <button
          type="button"
          onClick={() => deleteWithUndo(tx)}
          className="flex w-18 flex-col items-center justify-center gap-1 bg-expense text-xs font-medium text-white"
        >
          <Trash2 className="size-4" /> Delete
        </button>
      </motion.div>

      <motion.button
        type="button"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTIONS_WIDTH, right: 0 }}
        dragElastic={0.1}
        style={{ x }}
        onDragEnd={onDragEnd}
        onClick={() => (open ? onOpenChange(false) : openEdit(tx))}
        className="relative flex min-h-16 w-full items-center gap-3 bg-card px-4 py-3 text-left"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <d.icon className={cn("size-4", d.sign === 1 ? "text-income" : d.sign === -1 ? "text-expense" : "text-muted-foreground")} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-medium">
            <span className="truncate">{d.title}</span>
            <VoiceBadge tx={tx} />
          </p>
          <p className="truncate text-sm text-muted-foreground">{d.subtitle}</p>
        </div>
        <Amount value={tx.amount} sign={d.sign} />
      </motion.button>
    </div>
  );
}

type SortKey = "date" | "amount";

function DesktopTable({ items, totals }: { items: TypedTransaction[]; totals: Map<string, DayTotal> }) {
  const m = useLedgerModel();
  const { openEdit } = useEntry();
  const deleteWithUndo = useDeleteWithUndo();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });

  const sorted = useMemo(() => {
    const rows = [...items];
    rows.sort((a, b) => {
      const v =
        sort.key === "amount"
          ? a.amount - b.amount
          : a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at);
      return v * sort.dir;
    });
    return rows;
  }, [items, sort]);

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={cn("px-4 py-3 font-medium", className)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {sort.key === key && (sort.dir === -1 ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />)}
      </button>
    </th>
  );

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            {header("date", "Date", "w-32")}
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Account</th>
            {header("amount", "Amount", "text-right [&>button]:flex-row-reverse")}
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((tx, i) => {
            const d = describeTx(tx, m);
            // Sorted by date, each new day gets a header row with its totals.
            const newDay = sort.key === "date" && tx.occurred_on !== sorted[i - 1]?.occurred_on;
            return (
              <Fragment key={tx.id}>
              {newDay && (
                <tr className="border-b bg-muted/40">
                  <td colSpan={6} className="px-4 py-2">
                    <div className="flex items-baseline justify-between gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      <span>{formatDay(tx.occurred_on)}</span>
                      <DayTotalLabel total={totals.get(tx.occurred_on)} />
                    </div>
                  </td>
                </tr>
              )}
              <tr
                onClick={() => openEdit(tx)}
                className="group cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
              >
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDay(tx.occurred_on)}</td>
                <td className="max-w-64 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <d.icon
                      className={cn(
                        "size-4 shrink-0",
                        d.sign === 1 ? "text-income" : d.sign === -1 ? "text-expense" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate font-medium">{d.title}</span>
                    <VoiceBadge tx={tx} />
                  </div>
                  {tx.note && <p className="truncate pl-6 text-xs text-muted-foreground">{tx.note}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{d.category ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {/* My side of the movement: the asset involved, else whoever paid. */}
                  {[tx.from_account_id, tx.to_account_id]
                    .map((id) => m.accountById.get(id))
                    .find((a) => a?.kind === "asset")?.name ?? m.accountById.get(tx.from_account_id)?.name}
                </td>
                <td className="px-4 py-3 text-right">
                  <Amount value={tx.amount} sign={d.sign} />
                </td>
                <td className="px-2">
                  <button
                    type="button"
                    aria-label="Delete entry"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWithUndo(tx);
                    }}
                    className="rounded-lg p-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-expense/10 hover:text-expense"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
