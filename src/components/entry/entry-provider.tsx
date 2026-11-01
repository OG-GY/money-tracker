"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ResponsivePanel } from "@/components/responsive-panel";
import type { TypedTransaction } from "@/lib/db/types";
import { EntryForm, EntrySubmit, type EntryPreset } from "./entry-form";

type EntryContextValue = {
  openNew: (preset?: EntryPreset) => void;
  openEdit: (tx: TypedTransaction) => void;
};

const EntryContext = createContext<EntryContextValue | null>(null);

export function useEntry() {
  const ctx = use(EntryContext);
  if (!ctx) throw new Error("useEntry must be used inside EntryProvider");
  return ctx;
}

/** Hosts the add/edit panel once for the whole app; `N` opens a new entry on desktop. */
export function EntryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TypedTransaction | undefined>();
  const [preset, setPreset] = useState<EntryPreset | undefined>();
  // Remount the form for every open so it starts from fresh state.
  const [session, setSession] = useState(0);

  const openNew = useCallback((p?: EntryPreset) => {
    setEditing(undefined);
    setPreset(p);
    setSession((s) => s + 1);
    setOpen(true);
  }, []);
  const openEdit = useCallback((tx: TypedTransaction) => {
    setEditing(tx);
    setSession((s) => s + 1);
    setOpen(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      openNew();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNew]);

  const value = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);

  return (
    <EntryContext value={value}>
      {children}
      <ResponsivePanel
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit entry" : "New entry"}
        footer={<EntrySubmit editing={!!editing} />}
      >
        <EntryForm key={session} editing={editing} preset={preset} onDone={() => setOpen(false)} />
      </ResponsivePanel>
    </EntryContext>
  );
}
