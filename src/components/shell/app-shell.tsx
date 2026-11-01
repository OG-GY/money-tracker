"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EntryProvider } from "@/components/entry/entry-provider";
import { PeriodProvider } from "@/components/period/period-provider";
import { VoiceProvider } from "@/components/voice/voice-provider";
import { BottomTabs } from "./bottom-tabs";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

const COLLAPSE_KEY = "sidebar-collapsed";

/**
 * One layout, two shells (SPEC §8.2): below 768px a bottom tab bar,
 * from 768px a collapsible sidebar plus top bar. Same pages either way.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a client-only preference after hydration
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  return (
    <PeriodProvider>
    <EntryProvider>
      <VoiceProvider>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+1.5rem)] md:pb-10">
            {children}
          </main>
        </div>
        <BottomTabs />
      </div>
      </VoiceProvider>
    </EntryProvider>
    </PeriodProvider>
  );
}
