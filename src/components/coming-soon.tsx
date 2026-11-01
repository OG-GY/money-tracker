"use client";

import { motion } from "framer-motion";
import { NAV } from "./shell/nav";
import { PageHeader } from "./page-header";

/** Placeholder for screens that arrive in a later build phase. */
export function ComingSoon({
  section,
  phase,
  summary,
}: {
  section: keyof typeof NAV;
  phase: number;
  summary: string;
}) {
  const { label, icon: Icon } = NAV[section];

  return (
    <>
      <PageHeader title={label} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="mx-4 flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-16 text-center md:mx-8"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Icon className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-medium">Arrives in Phase {phase}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{summary}</p>
        </div>
      </motion.div>
    </>
  );
}
