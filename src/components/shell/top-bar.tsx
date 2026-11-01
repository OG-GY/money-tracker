"use client";

import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useEntry } from "@/components/entry/entry-provider";
import { PeriodSwitcher } from "@/components/period/period-switcher";
import { Button } from "@/components/ui/button";
import { AutoConfirmToggle } from "@/components/voice/auto-confirm-toggle";
import { MicButton } from "./mic-button";

/** Desktop-only top bar: period switcher, search, new entry and mic. */
export function TopBar() {
  const { openNew } = useEntry();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // `/` focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || (e.target as HTMLElement).closest("input, textarea, select")) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 hidden min-h-16 items-center gap-4 border-b bg-background px-6 py-2 md:flex">
      <PeriodSwitcher id="topbar-period" />

      <div className="ml-auto flex items-center gap-3">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = searchRef.current?.value.trim() ?? "";
            router.push(q ? `/transactions?q=${encodeURIComponent(q)}` : "/transactions");
          }}
          className="hidden h-9 w-64 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 lg:flex"
        >
          <Search className="size-4 shrink-0" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search transactions"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border px-1.5 text-[10px] font-medium">/</kbd>
        </form>
        <Button onClick={() => openNew()} className="h-9">
          <Plus /> New <kbd className="ml-1 rounded bg-primary-foreground/20 px-1.5 text-[10px]">N</kbd>
        </Button>
        <MicButton size="sm" />
        <AutoConfirmToggle compact />
      </div>
    </header>
  );
}
