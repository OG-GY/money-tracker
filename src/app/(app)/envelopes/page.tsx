import type { Metadata } from "next";
import { Suspense } from "react";
import { EnvelopesView } from "./envelopes-view";

export const metadata: Metadata = { title: "Envelopes" };

// The current month is a per-visit value, so the view streams in.
export default function EnvelopesPage() {
  return (
    <Suspense>
      <EnvelopesView />
    </Suspense>
  );
}
