"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PeriodSwitcher } from "@/components/period/period-switcher";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EnvelopeHealth, Savings } from "./budget";
import { Loans, Ventures } from "./business";
import { CashFlow, MoneyFlow, SummaryTiles, WhereItCameFrom } from "./overview";
import { Leaks, SpendingCalendar, SpendingTreemap, WhereItGoes } from "./spending";
import { useAnalytics } from "./use-analytics";
import { Accounts, Income, NetWorth } from "./wealth";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "spending", label: "Spending" },
  { id: "budget", label: "Budget & savings" },
  { id: "wealth", label: "Wealth" },
  { id: "business", label: "Ventures & loans" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function AnalyticsView() {
  const a = useAnalytics();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "overview") as Tab;

  const rangeLabel =
    a.current.start === a.current.end
      ? formatDay(a.current.start, a.today)
      : `${formatDay(a.current.start, a.today)} – ${formatDay(a.current.end, a.today)}`;

  return (
    <>
      <PageHeader title="Analytics" description={a.today ? `${rangeLabel} · compared with the period before` : undefined} />

      <div className="flex flex-col gap-4 px-4 md:px-8">
        {/* One filter row above everything it scopes (the top bar holds it on desktop). */}
        <PeriodSwitcher id="analytics-period" className="md:hidden" />

        <div role="tablist" aria-label="Analytics sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => router.replace(`${pathname}?tab=${t.id}`, { scroll: false })}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {a.error ? (
          <p className="text-sm text-expense">{a.error.message}</p>
        ) : !a.ready ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            {tab === "overview" && (
              <>
                <SummaryTiles a={a} />
                <WhereItCameFrom a={a} />
                <CashFlow a={a} />
                <MoneyFlow a={a} />
              </>
            )}
            {tab === "spending" && (
              <>
                <WhereItGoes a={a} />
                <Leaks a={a} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <SpendingCalendar a={a} />
                  <SpendingTreemap a={a} />
                </div>
              </>
            )}
            {tab === "budget" && (
              <>
                <EnvelopeHealth a={a} />
                <Savings a={a} />
              </>
            )}
            {tab === "wealth" && (
              <>
                <NetWorth a={a} />
                <Income a={a} />
                <Accounts a={a} />
              </>
            )}
            {tab === "business" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <Ventures a={a} />
                <Loans a={a} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
