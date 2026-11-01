"use client";

import { useMemo } from "react";
import type { Account, Category, Envelope, Venture } from "@/lib/db/types";
import { useAccounts, useCategories, useEnvelopes, useVentures } from "./queries";

export type CategoryOption = Category & { label: string; parentName: string | null };

/** Lookup tables built from accounts + categories + ventures, shared by forms and lists. */
export function useLedgerModel() {
  const accountsQ = useAccounts();
  const categoriesQ = useCategories();
  const venturesQ = useVentures();
  const envelopesQ = useEnvelopes();

  const model = useMemo(() => {
    const all = accountsQ.data ?? [];
    const categories = categoriesQ.data ?? [];
    const allVentures = venturesQ.data ?? [];
    const allEnvelopes = envelopesQ.data ?? [];
    // Pickers only offer live items; lookups include archived ones for old entries.
    const accounts = all.filter((a) => !a.archived);

    const accountById = new Map<string, Account>(all.map((a) => [a.id, a]));
    const catById = new Map<string, Category>(categories.map((c) => [c.id, c]));
    const ventureById = new Map<string, Venture>(allVentures.map((v) => [v.id, v]));
    const envelopeById = new Map<string, Envelope>(allEnvelopes.map((e) => [e.id, e]));

    const categoryOptions: CategoryOption[] = categories
      .filter((c) => !c.is_system)
      .map((c) => {
        const parent = c.parent_id ? catById.get(c.parent_id) : undefined;
        return { ...c, parentName: parent?.name ?? null, label: parent ? `${parent.name} › ${c.name}` : c.name };
      });

    return {
      accounts,
      accountById,
      catById,
      ventureById,
      envelopeById,
      categoryOptions,
      /** Personal envelopes money can be spent from. */
      envelopes: allEnvelopes.filter((e) => e.kind === "personal" && !e.archived),
      savingsGoal: allEnvelopes.find((e) => e.role === "savings_goal"),
      /** Personal + venture envelopes (moves can target either). */
      budgetEnvelopes: allEnvelopes.filter((e) => e.kind !== "to_assign" && !e.archived),
      categories,
      assets: accounts.filter((a) => a.kind === "asset"),
      sources: accounts.filter((a) => a.kind === "source" && !a.meta.system),
      people: accounts.filter((a) => a.kind === "person"),
      ventures: allVentures.filter((v) => !v.archived && v.status !== "closed"),
      allVentures,
      spending: all.find((a) => a.meta.system === "spending"),
      openingSource: all.find((a) => a.meta.system === "opening_balance"),
      categoryLabel: (id: string | null) => {
        if (!id) return null;
        const c = catById.get(id);
        if (!c) return null;
        const p = c.parent_id ? catById.get(c.parent_id) : undefined;
        return p ? `${p.name} › ${c.name}` : c.name;
      },
      /** A category and all of its children, for filtering by a parent. */
      categoryWithChildren: (id: string) => [id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)],
    };
  }, [accountsQ.data, categoriesQ.data, venturesQ.data, envelopesQ.data]);

  return {
    ...model,
    isLoading: accountsQ.isLoading || categoriesQ.isLoading || venturesQ.isLoading || envelopesQ.isLoading,
    error: accountsQ.error ?? categoriesQ.error ?? venturesQ.error ?? envelopesQ.error,
  };
}
