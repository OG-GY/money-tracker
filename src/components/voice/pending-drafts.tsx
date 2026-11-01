"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Mic } from "lucide-react";
import Link from "next/link";
import { voiceDb } from "@/lib/voice/drafts-db";

/** "3 voice drafts waiting" — links to the Confirm screen. Renders nothing when empty. */
export function PendingDrafts() {
  const count = useLiveQuery(() => voiceDb().drafts.count(), [], 0);
  if (!count) return null;
  return (
    <Link
      href="/confirm"
      className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm transition-colors hover:bg-primary/15"
    >
      <Mic className="size-4 text-primary" />
      <span className="flex-1">
        <span className="font-semibold">{count}</span> voice {count === 1 ? "draft" : "drafts"} waiting for review
      </span>
      <ArrowRight className="size-4 text-primary" />
    </Link>
  );
}
