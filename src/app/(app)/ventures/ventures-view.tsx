"use client";

import { motion } from "framer-motion";
import { Briefcase, ChevronRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { VentureStatus } from "@/lib/db/types";
import { formatPKR } from "@/lib/format";
import { useVentureSummary } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";
import { VenturePanel } from "./venture-panel";

export const STATUS_STYLE: Record<VentureStatus, string> = {
  active: "bg-primary/10 text-primary",
  paused: "bg-warning/15 text-warning",
  closed: "bg-muted text-muted-foreground",
};

export function VenturesView() {
  const summary = useVentureSummary();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const all = summary.data ?? [];
  const list = all.filter((v) => v.archived === showArchived);

  return (
    <>
      <PageHeader
        title="Ventures"
        description="All time"
        action={
          <Button size="lg" className="h-10" onClick={() => setAdding(true)}>
            <Plus /> Add venture
          </Button>
        }
      />

      {summary.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : summary.error ? (
        <p className="px-4 text-sm text-expense md:px-8">{(summary.error as Error).message}</p>
      ) : (
        <div className="flex flex-col gap-3 px-4 md:px-8">
          {all.some((v) => v.archived) && (
            <button className="self-end text-sm text-primary" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? "Show active" : "Show archived"}
            </button>
          )}
          {list.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((v, i) => (
                <motion.div
                  key={v.venture_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link
                    href={`/ventures/${v.venture_id}`}
                    className="block rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                        <Briefcase className="size-4 text-primary" />
                      </div>
                      <p className="min-w-0 flex-1 truncate font-medium">{v.name}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLE[v.status])}>
                        {v.status}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                    <dl className="mt-4 grid grid-cols-4 gap-2 text-sm">
                      <Stat label="Put in" value={formatPKR(v.invested)} />
                      <Stat label="Took out" value={formatPKR(v.drawn)} />
                      <Stat
                        label="Profit"
                        value={formatPKR(v.profit)}
                        tone={v.profit > 0 ? "text-income" : v.profit < 0 ? "text-expense" : undefined}
                      />
                      <Stat label="ROI" value={v.roi === null ? "—" : `${v.roi}%`} />
                    </dl>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              {showArchived ? "No archived ventures." : "No ventures yet. Add your first business."}
            </div>
          )}
        </div>
      )}

      <VenturePanel open={adding} onOpenChange={setAdding} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-semibold tabular", tone)}>{value}</dd>
    </div>
  );
}
