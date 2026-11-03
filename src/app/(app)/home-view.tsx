"use client";

import { motion, type Variants } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  HandCoins,
  Plus,
  Scale,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { useEntry } from "@/components/entry/entry-provider";
import { PageHeader } from "@/components/page-header";
import { MicButton } from "@/components/shell/mic-button";
import { AutoConfirmToggle } from "@/components/voice/auto-confirm-toggle";
import { PendingDrafts } from "@/components/voice/pending-drafts";
import { TxList } from "@/components/transactions/tx-list";
import { Button } from "@/components/ui/button";
import { formatDay, formatMonth, monthRange, todayInKarachi } from "@/lib/dates";
import { formatPKR } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import {
  useBalances,
  useBudgetOverview,
  useEnvelopeBalances,
  useOpenItems,
  usePeriodSummary,
  usePersonBalances,
  useTransactions,
} from "@/lib/ledger/queries";
import { dayTotals } from "@/lib/analytics/compute";
import { useLedgerRows } from "@/lib/analytics/use-ledger-rows";
import { cn } from "@/lib/utils";
import { BreakdownPanel, type Breakdown } from "./home-breakdowns";

const container: Variants = { show: { transition: { staggerChildren: 0.06 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export function HomeView() {
  const today = todayInKarachi();
  const { start, end } = monthRange(today);
  const m = useLedgerModel();
  const summary = usePeriodSummary(start, end);
  const balances = useBalances();
  const recent = useTransactions({ limit: 6 });
  // The recent list is only a slice; day totals come from the whole ledger.
  const ledgerRows = useLedgerRows();
  const totalsByDay = useMemo(() => (ledgerRows.data ? dayTotals(ledgerRows.data) : undefined), [ledgerRows.data]);
  const { openNew } = useEntry();
  const openItems = useOpenItems();
  const budget = useBudgetOverview();
  const envelopes = useEnvelopeBalances(start);
  const toAssign = budget.data?.to_assign ?? 0;
  const overspent = (envelopes.data ?? []).filter((e) => !e.archived && e.available < 0);
  const overdue = (openItems.data ?? []).filter((i) => i.outstanding > 0 && i.due_date && i.due_date < today);

  const s = summary.data ?? { income: 0, expense: 0, net: 0, days: 1 };
  // Daily average over the days elapsed so far this month.
  const daysElapsed = Number(today.slice(8, 10));
  const needsSetup = !m.isLoading && m.assets.length === 0;
  const assets = (balances.data ?? []).filter((b) => b.kind === "asset");

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const people = usePersonBalances();
  const activePeople = (people.data ?? []).filter((p) => !p.archived);
  const owedToMe = activePeople.reduce((sum, p) => sum + Math.max(p.they_owe_me, 0), 0);
  const iOwe = activePeople.reduce((sum, p) => sum + Math.max(p.i_owe_them, 0), 0);

  const cards: { label: string; value: number; icon: LucideIcon; tone: string; hint: string; opens: Breakdown }[] = [
    { label: "Earnings", value: s.income, icon: ArrowDownLeft, tone: "text-income", hint: "Tap to see where it came from", opens: "earnings" },
    {
      label: "Spendings",
      value: s.expense,
      icon: ArrowUpRight,
      tone: "text-expense",
      hint: `${formatPKR(s.expense / Math.max(daysElapsed, 1))} a day · by category`,
      opens: "spendings",
    },
  ];

  return (
    <>
      <PageHeader title="Home" description={formatMonth(today)} />

      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-4 px-4 md:px-8">
        {needsSetup && (
          <motion.div variants={item} className="flex flex-col gap-4 rounded-2xl bg-primary p-5 text-primary-foreground sm:flex-row sm:items-center">
            <Sparkles className="size-6 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Let&apos;s set up your accounts</p>
              <p className="mt-0.5 text-sm opacity-90">Add your banks and wallets with today&apos;s balances, and your income sources.</p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              className="h-11"
              render={<Link href="/setup" />}
              nativeButton={false}
            >
              Start setup <ArrowRight />
            </Button>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <motion.button
              key={c.label}
              type="button"
              variants={item}
              whileTap={{ scale: 0.98 }}
              onClick={() => setBreakdown(c.opens)}
              className="group flex flex-col rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <c.icon className={cn("size-4", c.tone)} />
                <span className="flex-1">{c.label}</span>
                <ChevronRight className="size-4 opacity-50 transition-opacity group-hover:opacity-100" />
              </span>
              <AnimatedNumber value={c.value} className={cn("mt-2 block text-xl font-semibold tabular md:text-2xl", c.tone)} />
              <span className="mt-0.5 text-xs text-muted-foreground">{c.hint}</span>
            </motion.button>
          ))}

          {/* Loans: both directions at a glance; tap for who owes what. */}
          <motion.button
            type="button"
            variants={item}
            whileTap={{ scale: 0.98 }}
            onClick={() => setBreakdown("loans")}
            className="group flex flex-col rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <HandCoins className="size-4 text-primary" />
              <span className="flex-1">Loans</span>
              <ChevronRight className="size-4 opacity-50 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Owed to you</span>
              <span className="font-semibold text-income tabular">{formatPKR(owedToMe)}</span>
            </span>
            <span className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">You owe</span>
              <span className="font-semibold text-expense tabular">{formatPKR(iOwe)}</span>
            </span>
          </motion.button>

          <motion.div variants={item} className="flex flex-col rounded-2xl border bg-card p-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Scale className={cn("size-4", s.net < 0 ? "text-expense" : "text-foreground")} /> Net
            </span>
            <AnimatedNumber value={s.net} className={cn("mt-2 block text-xl font-semibold tabular md:text-2xl", s.net < 0 && "text-expense")} />
            <span className="mt-0.5 text-xs text-muted-foreground">Earnings − spendings</span>
          </motion.div>
        </div>

        <BreakdownPanel open={breakdown} onOpenChange={setBreakdown} range={{ start, end }} label={formatMonth(today)} today={today} />

        <PendingDrafts />

        {toAssign > 0 && (
          <motion.div variants={item}>
            <Link
              href="/envelopes"
              className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground"
            >
              <Wallet className="size-5 shrink-0" />
              <span className="flex-1">
                <span className="font-semibold tabular">{formatPKR(toAssign)}</span> waiting to be assigned
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </motion.div>
        )}

        {overspent.length > 0 && (
          <motion.div variants={item}>
            <Link href="/envelopes" className="block rounded-2xl border border-warning/40 bg-warning/10 p-4">
              <p className="flex items-center gap-2 font-medium text-warning">
                <AlertTriangle className="size-4" /> Overspent envelopes
              </p>
              <p className="mt-1 text-sm">
                {overspent.map((e) => `${e.name} ${formatPKR(e.available)}`).join(" · ")}
              </p>
            </Link>
          </motion.div>
        )}

        {overdue.length > 0 && (
          <motion.div variants={item} className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <p className="flex items-center gap-2 font-medium text-warning">
              <AlertTriangle className="size-4" /> {overdue.length} overdue {overdue.length === 1 ? "loan" : "loans"}
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {overdue.slice(0, 4).map((i) => (
                <li key={i.transaction_id}>
                  <Link href={`/people/${i.person_id}`} className="flex justify-between gap-3 hover:underline">
                    <span className="truncate">
                      {i.direction === "they_owe"
                        ? `${m.accountById.get(i.person_id)?.name} owes you`
                        : `You owe ${m.accountById.get(i.person_id)?.name}`}{" "}
                      · due {formatDay(i.due_date!)}
                    </span>
                    <span className="font-semibold tabular">{formatPKR(i.outstanding)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        <motion.div variants={item} className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-8 text-center md:hidden">
          <MicButton size="hero" />
          <div>
            <p className="font-medium">Tap to speak an entry</p>
            <p className="mt-1 text-sm text-muted-foreground">“aaj 500 ka petrol cash se”</p>
          </div>
          <AutoConfirmToggle />
          <Button variant="outline" size="lg" className="h-11" onClick={() => openNew()}>
            <Plus /> Add manually
          </Button>
        </motion.div>

        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <motion.section variants={item}>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Accounts</h2>
              <Link href="/accounts" className="text-sm text-primary">See all</Link>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-card">
              {assets.length ? (
                assets.map((a, i) => (
                  <Link
                    key={a.account_id}
                    href={`/accounts/${a.account_id}`}
                    className={cn("flex min-h-12 items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50", i > 0 && "border-t")}
                  >
                    <span className="font-medium">{a.name}</span>
                    <span className={cn("tabular", Number(a.balance) < 0 && "text-expense")}>{formatPKR(Number(a.balance))}</span>
                  </Link>
                ))
              ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No accounts yet.</p>
              )}
            </div>
          </motion.section>

          <motion.section variants={item}>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent</h2>
              <Link href="/transactions" className="text-sm text-primary">See all</Link>
            </div>
            <TxList items={recent.data ?? []} dayTotals={totalsByDay} empty="No entries yet. Tap the mic or add one manually." />
          </motion.section>
        </div>
      </motion.div>
    </>
  );
}
