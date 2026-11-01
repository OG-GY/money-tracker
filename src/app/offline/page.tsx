import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <WifiOff className="size-6 text-warning" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          Reconnect to see your money. Offline entry is coming in a later update.
        </p>
      </div>
      {/* A full reload, not client navigation: the router can't reach the server offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="mt-2 h-11 rounded-lg bg-primary px-5 text-sm leading-11 font-medium text-primary-foreground">
        Try again
      </a>
    </main>
  );
}
