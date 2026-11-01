"use client";

import { Loader2, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { Chip } from "@/components/chip";
import { useEntry } from "@/components/entry/entry-provider";
import { PageHeader } from "@/components/page-header";
import { ResponsivePanel } from "@/components/responsive-panel";
import { TxList } from "@/components/transactions/tx-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TxType } from "@/lib/db/types";
import { useLedgerModel } from "@/lib/ledger/model";
import { useTransactions, type TransactionFilters } from "@/lib/ledger/queries";

type Filters = {
  type?: TxType;
  accountId?: string;
  personId?: string;
  ventureId?: string;
  entry?: "auto" | "voice";
  categoryId?: string;
  forWhom?: string;
  needWant?: string;
  from?: string;
  to?: string;
};

const TYPE_OPTIONS: { value: TxType; label: string }[] = [
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfers" },
  { value: "loan", label: "Loans & repayments" },
  { value: "opening", label: "Opening balances" },
];
const FOR_WHOM = [
  { value: "self", label: "Me" },
  { value: "family", label: "Family" },
  { value: "household", label: "Household" },
  { value: "gift", label: "Gift" },
  { value: "other", label: "Other" },
];

export function TransactionsView() {
  // Re-mount when the top-bar search sends a new ?q=.
  const q = useSearchParams().get("q") ?? "";
  return <TransactionsInner key={q} initialSearch={q} />;
}

function TransactionsInner({ initialSearch }: { initialSearch: string }) {
  const m = useLedgerModel();
  const { openNew } = useEntry();
  const [search, setSearch] = useState(initialSearch);
  const deferredSearch = useDeferredValue(search);
  const [filters, setFilters] = useState<Filters>({});
  const [panelOpen, setPanelOpen] = useState(false);

  const query: TransactionFilters = {
    search: deferredSearch || undefined,
    type: filters.type,
    accountId: filters.accountId,
    personId: filters.personId,
    ventureId: filters.ventureId,
    autoConfirmed: filters.entry === "auto" || undefined,
    voice: filters.entry === "voice" || undefined,
    categoryIds: filters.categoryId ? m.categoryWithChildren(filters.categoryId) : undefined,
    forWhom: filters.forWhom,
    needWant: filters.needWant,
    from: filters.from,
    to: filters.to,
  };
  const tx = useTransactions(query);

  const set = (patch: Filters) => setFilters((f) => ({ ...f, ...patch }));
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    set({ [key]: filters[key] === value ? undefined : value } as Filters);

  const active: { key: keyof Filters; label: string }[] = [];
  if (filters.type) active.push({ key: "type", label: TYPE_OPTIONS.find((o) => o.value === filters.type)!.label });
  if (filters.accountId) active.push({ key: "accountId", label: m.accountById.get(filters.accountId)?.name ?? "Account" });
  if (filters.entry) active.push({ key: "entry", label: filters.entry === "auto" ? "Auto-added" : "Voice entries" });
  if (filters.personId) active.push({ key: "personId", label: m.accountById.get(filters.personId)?.name ?? "Person" });
  if (filters.ventureId) active.push({ key: "ventureId", label: m.ventureById.get(filters.ventureId)?.name ?? "Venture" });
  if (filters.categoryId) active.push({ key: "categoryId", label: m.categoryLabel(filters.categoryId) ?? "Category" });
  if (filters.forWhom) active.push({ key: "forWhom", label: FOR_WHOM.find((o) => o.value === filters.forWhom)!.label });
  if (filters.needWant) active.push({ key: "needWant", label: filters.needWant === "need" ? "Needs" : "Wants" });
  if (filters.from) active.push({ key: "from", label: `From ${filters.from}` });
  if (filters.to) active.push({ key: "to", label: `To ${filters.to}` });

  const parents = m.categoryOptions.filter((c) => !c.parent_id);
  const subcats = filters.categoryId
    ? m.categoryOptions.filter(
        (c) => c.parent_id === (m.catById.get(filters.categoryId!)?.parent_id ?? filters.categoryId),
      )
    : [];

  return (
    <>
      <PageHeader
        title="Transactions"
        action={
          <Button onClick={() => openNew()} size="lg" className="h-10 md:hidden">
            <Plus /> Add
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-4 md:px-8">
        <div className="flex gap-2">
          <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border bg-card px-3 focus-within:border-ring">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchant or note"
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
          <Button variant="outline" className="h-11 px-4" onClick={() => setPanelOpen(true)}>
            <SlidersHorizontal />
            Filters
            {active.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{active.length}</span>
            )}
          </Button>
        </div>

        {active.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {active.map((a) => (
              <Chip key={a.key} selected onClick={() => set({ [a.key]: undefined } as Filters)}>
                {a.label} <X className="size-3.5" />
              </Chip>
            ))}
            <Button variant="ghost" className="h-10" onClick={() => setFilters({})}>
              Clear all
            </Button>
          </div>
        )}

        {tx.isLoading || m.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : tx.error ? (
          <p className="text-sm text-expense">{(tx.error as Error).message}</p>
        ) : (
          <TxList
            items={tx.data ?? []}
            empty={active.length || search ? "Nothing matches these filters." : "No entries yet. Add your first one."}
          />
        )}
      </div>

      <ResponsivePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title="Filters"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="h-12 flex-1" onClick={() => setFilters({})}>
              Reset
            </Button>
            <Button size="lg" className="h-12 flex-[2]" onClick={() => setPanelOpen(false)}>
              Show results
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <FilterGroup label="Type">
            {TYPE_OPTIONS.map((o) => (
              <Chip key={o.value} selected={filters.type === o.value} onClick={() => toggle("type", o.value)}>
                {o.label}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Account">
            {[...m.assets, ...m.sources].map((a) => (
              <Chip key={a.id} selected={filters.accountId === a.id} onClick={() => toggle("accountId", a.id)}>
                {a.name}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Entered by">
            <Chip selected={filters.entry === "voice"} onClick={() => toggle("entry", "voice")}>
              Voice
            </Chip>
            <Chip selected={filters.entry === "auto"} onClick={() => toggle("entry", "auto")}>
              Auto-added
            </Chip>
          </FilterGroup>

          {m.people.length > 0 && (
            <FilterGroup label="Person">
              {m.people.map((p) => (
                <Chip key={p.id} selected={filters.personId === p.id} onClick={() => toggle("personId", p.id)}>
                  {p.name}
                </Chip>
              ))}
            </FilterGroup>
          )}

          {m.allVentures.length > 0 && (
            <FilterGroup label="Venture">
              {m.allVentures.map((v) => (
                <Chip key={v.id} selected={filters.ventureId === v.id} onClick={() => toggle("ventureId", v.id)}>
                  {v.name}
                </Chip>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Category">
            {parents.map((c) => {
              const selected =
                filters.categoryId === c.id || m.catById.get(filters.categoryId ?? "")?.parent_id === c.id;
              return (
                <Chip key={c.id} selected={selected} onClick={() => toggle("categoryId", c.id)}>
                  {c.name}
                </Chip>
              );
            })}
          </FilterGroup>
          {subcats.length > 0 && (
            <FilterGroup label="Subcategory">
              {subcats.map((c) => (
                <Chip
                  key={c.id}
                  selected={filters.categoryId === c.id}
                  onClick={() => set({ categoryId: filters.categoryId === c.id ? c.parent_id! : c.id })}
                >
                  {c.name}
                </Chip>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="For whom">
            {FOR_WHOM.map((o) => (
              <Chip key={o.value} selected={filters.forWhom === o.value} onClick={() => toggle("forWhom", o.value)}>
                {o.label}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Need or want">
            <Chip selected={filters.needWant === "need"} onClick={() => toggle("needWant", "need")}>
              Needs
            </Chip>
            <Chip selected={filters.needWant === "want"} onClick={() => toggle("needWant", "want")}>
              Wants
            </Chip>
          </FilterGroup>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground">From date</Label>
              <Input type="date" value={filters.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} className="h-10" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground">To date</Label>
              <Input type="date" value={filters.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} className="h-10" />
            </div>
          </div>
        </div>
      </ResponsivePanel>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
