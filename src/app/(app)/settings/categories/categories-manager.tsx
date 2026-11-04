"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, ChevronRight, Loader2, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Chip, Segmented } from "@/components/chip";
import { PageHeader } from "@/components/page-header";
import { ResponsivePanel } from "@/components/responsive-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account, Category, Group, GroupKind } from "@/lib/db/types";
import { useLedgerModel } from "@/lib/ledger/model";
import { seedGroups, useSaveCategory, useSaveGroup, useUpdateAccount } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";

type Editing =
  | { type: "category"; category?: Category; parent?: Category }
  | { type: "group"; group?: Group; kind: GroupKind }
  | { type: "source"; source: Account };

export function CategoriesManager() {
  const m = useLedgerModel();
  const qc = useQueryClient();
  const [tab, setTab] = useState<GroupKind>("spending");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const seeded = useRef(false);

  // First visit: create the default groups (idempotent on the server).
  useEffect(() => {
    if (m.isLoading || seeded.current || m.groupById.size > 0) return;
    seeded.current = true;
    seedGroups()
      .then(() => qc.invalidateQueries({ queryKey: ["ledger"] }))
      .catch((e) => setSeedError((e as Error).message));
  }, [m.isLoading, m.groupById.size, qc]);

  const groupsOfKind = tab === "spending" ? m.spendingGroups : m.incomeGroups;
  const cats = m.categories.filter((c) => !c.archived && !c.is_system);
  const tops = cats.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => cats.filter((c) => c.parent_id === id);
  const sources = m.sources;

  /** What lives in a spending group: its top-level categories, plus subcategories moved there on their own. */
  const spendingMembers = (groupId: string | null) => {
    const own = tops.filter((c) => (c.group_id ?? null) === groupId);
    const moved = cats.filter((c) => {
      if (!c.parent_id || !c.group_id) return false;
      const parent = m.catById.get(c.parent_id);
      return c.group_id === groupId && parent?.group_id !== groupId;
    });
    return { own, moved };
  };

  return (
    <>
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:px-8 md:pt-6">
        <Link href="/settings" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted">
          <ArrowLeft className="size-4" /> Settings
        </Link>
      </div>
      <PageHeader title="Categories" description="Groups sit on top, so you can see what % goes to you, family, business…" />

      <div className="flex max-w-3xl flex-col gap-4 px-4 md:px-8">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "spending", label: "Spending" },
            { value: "income", label: "Income" },
          ]}
        />

        {seedError && (
          <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
            Couldn&apos;t create the groups — run the latest database update (20261106000000_groups.sql) in Supabase first.
          </p>
        )}

        {m.isLoading ? (
          <Loader2 className="mx-auto animate-spin text-muted-foreground" />
        ) : tab === "spending" ? (
          <>
            {[...groupsOfKind.map((g) => g as Group | null), null].map((g) => {
              const { own, moved } = spendingMembers(g?.id ?? null);
              if (!g && !own.length && !moved.length) return null;
              return (
                <section key={g?.id ?? "ungrouped"} className="rounded-2xl border bg-card">
                  <GroupHeader name={g?.name ?? "Ungrouped"} onEdit={g ? () => setEditing({ type: "group", group: g, kind: "spending" }) : undefined} />
                  <ul className="divide-y">
                    {own.map((c) => {
                      const kids = childrenOf(c.id);
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => setEditing({ type: "category", category: c })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{c.name}</span>
                              {kids.length > 0 && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {kids.map((k) => (k.group_id && k.group_id !== c.group_id ? `${k.name} → ${m.groupById.get(k.group_id)?.name}` : k.name)).join(" · ")}
                                </span>
                              )}
                            </span>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </button>
                        </li>
                      );
                    })}
                    {moved.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setEditing({ type: "category", category: c })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                          <span className="min-w-0 flex-1 font-medium">
                            <span className="text-muted-foreground">{m.catById.get(c.parent_id!)?.name} › </span>
                            {c.name}
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                    {!own.length && !moved.length && <li className="px-4 py-3 text-sm text-muted-foreground">Nothing here yet.</li>}
                  </ul>
                </section>
              );
            })}
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-11" onClick={() => setEditing({ type: "category" })}>
                <Plus /> Category
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setEditing({ type: "group", kind: "spending" })}>
                <Plus /> Group
              </Button>
            </div>
          </>
        ) : (
          <>
            {[...groupsOfKind.map((g) => g as Group | null), null].map((g) => {
              const members = sources.filter((s) => (s.group_id ?? null) === (g?.id ?? null));
              if (!g && !members.length) return null;
              return (
                <section key={g?.id ?? "ungrouped"} className="rounded-2xl border bg-card">
                  <GroupHeader name={g?.name ?? "Ungrouped"} onEdit={g ? () => setEditing({ type: "group", group: g, kind: "income" }) : undefined} />
                  <ul className="divide-y">
                    {members.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => setEditing({ type: "source", source: s })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50">
                          <span className="flex-1 font-medium">{s.name}</span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                    {!members.length && <li className="px-4 py-3 text-sm text-muted-foreground">No sources here yet.</li>}
                  </ul>
                </section>
              );
            })}
            <p className="text-sm text-muted-foreground">Add new income sources from Accounts → Add → Income source.</p>
            <Button variant="outline" className="h-11" onClick={() => setEditing({ type: "group", kind: "income" })}>
              <Plus /> Income group
            </Button>
          </>
        )}
      </div>

      <EditPanel editing={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function GroupHeader({ name, onEdit }: { name: string; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2.5">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{name}</h2>
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label={`Rename ${name}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function EditPanel({ editing, onClose }: { editing: Editing | null; onClose: () => void }) {
  const title =
    editing?.type === "group"
      ? editing.group
        ? "Rename group"
        : "New group"
      : editing?.type === "source"
        ? editing.source.name
        : editing?.category
          ? "Edit category"
          : editing?.parent
            ? `New in ${editing.parent.name}`
            : "New category";
  return (
    <ResponsivePanel
      open={editing !== null}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <Button type="submit" form="category-form" size="lg" className="h-12 w-full text-base">
          Save
        </Button>
      }
    >
      {editing?.type === "group" && <GroupForm group={editing.group} kind={editing.kind} onDone={onClose} />}
      {editing?.type === "source" && <SourceForm source={editing.source} onDone={onClose} />}
      {editing?.type === "category" && (
        <CategoryForm key={editing.category?.id ?? editing.parent?.id ?? "new"} category={editing.category} parent={editing.parent} onDone={onClose} />
      )}
    </ResponsivePanel>
  );
}

function GroupChips({
  groups,
  value,
  onChange,
  inheritLabel,
}: {
  groups: Group[];
  value: string | null;
  onChange: (id: string | null) => void;
  inheritLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {inheritLabel && (
        <Chip selected={value === null} onClick={() => onChange(null)}>
          {inheritLabel}
        </Chip>
      )}
      {groups.map((g) => (
        <Chip key={g.id} selected={value === g.id} onClick={() => onChange(g.id)}>
          {g.name}
        </Chip>
      ))}
    </div>
  );
}

function CategoryForm({ category, parent, onDone }: { category?: Category; parent?: Category; onDone: () => void }) {
  const m = useLedgerModel();
  const save = useSaveCategory();
  const isSub = !!(category?.parent_id ?? parent);
  const parentCat = parent ?? (category?.parent_id ? m.catById.get(category.parent_id) : undefined);
  const [name, setName] = useState(category?.name ?? "");
  // A subcategory starts by following its parent; a new top-level one picks a group.
  const [groupId, setGroupId] = useState<string | null>(category?.group_id ?? (isSub ? null : (m.spendingGroups[0]?.id ?? null)));
  const [newSub, setNewSub] = useState("");
  const [error, setError] = useState<string | null>(null);
  const kids = category && !category.parent_id ? m.categories.filter((c) => c.parent_id === category.id && !c.archived) : [];

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give it a name");
    const siblings = m.categories.filter((c) => (c.parent_id ?? null) === (parentCat?.id ?? null) && c.id !== category?.id && !c.archived);
    if (siblings.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return setError("That name is already used here");
    try {
      await save.mutateAsync({
        id: category?.id,
        values: { name: trimmed, group_id: groupId, ...(category ? {} : { parent_id: parentCat?.id ?? null }) },
      });
      toast.success(category ? "Saved" : `${trimmed} added`);
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    }
  }

  async function addSub() {
    const trimmed = newSub.trim();
    if (!trimmed || !category) return;
    if (kids.some((k) => k.name.toLowerCase() === trimmed.toLowerCase())) return setError(`${trimmed} already exists`);
    try {
      await save.mutateAsync({ values: { name: trimmed, parent_id: category.id, group_id: null } });
      setNewSub("");
      toast.success(`${trimmed} added to ${category.name}`);
    } catch (e) {
      toast.error("Couldn't add", { description: (e as Error).message });
    }
  }

  async function archive() {
    if (!category) return;
    try {
      await save.mutateAsync({ id: category.id, values: { name: category.name, archived: true } });
      toast.success(`${category.name} hidden`, { description: "Old entries keep it; it won't be offered for new ones." });
      onDone();
    } catch (e) {
      toast.error("Couldn't update", { description: (e as Error).message });
    }
  }

  const parentGroupName = parentCat?.group_id ? m.groupById.get(parentCat.group_id)?.name : undefined;

  return (
    <form
      id="category-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      {parentCat && <p className="text-sm text-muted-foreground">Inside {parentCat.name}</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="c-name" className="text-muted-foreground">Name</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hostel rent" className="h-11" autoFocus={!category} />
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground">Group</Label>
        <GroupChips
          groups={m.spendingGroups}
          value={groupId}
          onChange={setGroupId}
          inheritLabel={isSub ? `Same as ${parentCat?.name}${parentGroupName ? ` (${parentGroupName})` : ""}` : undefined}
        />
        {isSub && <p className="text-xs text-muted-foreground">e.g. Bills › Electricity can be Family &amp; home while the rest of Bills is Personal.</p>}
      </div>

      {category && !category.parent_id && (
        <div className="flex flex-col gap-2">
          <Label className="text-muted-foreground">Subcategories</Label>
          {kids.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {kids.map((k) => (
                <span key={k.id} className={cn("rounded-full bg-muted px-3 py-1 text-sm", k.group_id && k.group_id !== groupId && "ring-1 ring-primary/40")}>
                  {k.name}
                  {k.group_id && k.group_id !== groupId && <span className="text-muted-foreground"> · {m.groupById.get(k.group_id)?.name}</span>}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a subcategory" className="h-10" onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSub();
              }
            }} />
            <Button type="button" variant="outline" className="h-10" onClick={addSub} disabled={!newSub.trim()}>
              <Plus /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Tap a subcategory on the Categories screen to rename it or move it to another group.</p>
        </div>
      )}

      {error && <p className="text-sm text-expense">{error}</p>}
      {save.isPending && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}

      {category && (
        <Button type="button" variant="outline" className="h-11" onClick={archive}>
          <Archive /> Hide this category
        </Button>
      )}
    </form>
  );
}

function GroupForm({ group, kind, onDone }: { group?: Group; kind: GroupKind; onDone: () => void }) {
  const m = useLedgerModel();
  const save = useSaveGroup();
  const [name, setName] = useState(group?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const siblings = kind === "spending" ? m.spendingGroups : m.incomeGroups;

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give it a name");
    if (siblings.some((g) => g.id !== group?.id && g.name.toLowerCase() === trimmed.toLowerCase())) return setError("That group already exists");
    try {
      await save.mutateAsync({ id: group?.id, values: { name: trimmed, kind, sort_order: siblings.length + 1 } });
      toast.success(group ? "Renamed" : `${trimmed} added`);
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    }
  }

  return (
    <form
      id="category-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <Label htmlFor="g-name" className="text-muted-foreground">Group name</Label>
      <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "spending" ? "e.g. Hostel life" : "e.g. Side projects"} className="h-11" autoFocus />
      {error && <p className="text-sm text-expense">{error}</p>}
    </form>
  );
}

function SourceForm({ source, onDone }: { source: Account; onDone: () => void }) {
  const m = useLedgerModel();
  const update = useUpdateAccount();
  const [groupId, setGroupId] = useState<string | null>(source.group_id);

  async function submit() {
    try {
      await update.mutateAsync({ id: source.id, patch: { group_id: groupId } });
      toast.success("Saved");
      onDone();
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    }
  }

  return (
    <form
      id="category-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <Label className="text-muted-foreground">Income group</Label>
      <GroupChips groups={m.incomeGroups} value={groupId} onChange={setGroupId} />
    </form>
  );
}
