"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Chip, Segmented } from "@/components/chip";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetSubtype } from "@/lib/db/types";
import { todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { createAccount, createPerson, createVenture, seedDefaults } from "@/lib/ledger/queries";
import { cn } from "@/lib/utils";

type AssetRow = { key: string; name: string; subtype: AssetSubtype; on: boolean; balance: string };

// SPEC §11 example seed — everything is editable here.
const PRESET_ASSETS: Omit<AssetRow, "key" | "on" | "balance">[] = [
  { name: "Meezan", subtype: "bank" },
  { name: "SadaPay", subtype: "wallet" },
  { name: "Easypaisa", subtype: "wallet" },
  { name: "JazzCash", subtype: "wallet" },
  { name: "Cash", subtype: "cash" },
  { name: "Mahana", subtype: "savings" },
];
const PRESET_SOURCES = ["Techroniqs salary", "SnapDev AI", "Mahana Profit", "Gift received"];
const PRESET_VENTURES = ["ElevLoop", "Make Pakistan Digital", "Electronics store"];

const SUBTYPES: { value: AssetSubtype; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "wallet", label: "Wallet" },
  { value: "cash", label: "Cash" },
  { value: "savings", label: "Savings" },
];

const STEPS = ["Accounts", "Income", "Ventures", "People", "Categories"] as const;

export function SetupWizard() {
  const router = useRouter();
  const qc = useQueryClient();
  const m = useLedgerModel();
  const [step, setStep] = useState(0);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [assets, setAssets] = useState<AssetRow[]>(() =>
    PRESET_ASSETS.map((a, i) => ({ ...a, key: `p${i}`, on: true, balance: "" })),
  );
  const [sources, setSources] = useState<{ name: string; on: boolean }[]>(() =>
    PRESET_SOURCES.map((name) => ({ name, on: true })),
  );
  const [newSource, setNewSource] = useState("");
  const [ventures, setVentures] = useState(() => PRESET_VENTURES.map((name) => ({ name, on: true })));
  const [newVenture, setNewVenture] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [newPersonName, setNewPersonName] = useState("");
  const nextKey = useRef(0);

  // Seed system accounts, envelopes and categories once (idempotent on the server).
  useEffect(() => {
    let cancelled = false;
    seedDefaults()
      .then(() => qc.invalidateQueries({ queryKey: ["ledger"] }))
      .then(() => !cancelled && setSeeded(true))
      .catch((e) => toast.error("Couldn't prepare your data", { description: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const existingNames = new Set(m.accounts.map((a) => `${a.kind}:${a.name.toLowerCase()}`));
  const exists = (kind: string, name: string) => existingNames.has(`${kind}:${name.trim().toLowerCase()}`);

  const patchAsset = (key: string, patch: Partial<AssetRow>) =>
    setAssets((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function finish() {
    setSaving(true);
    try {
      const date = todayInKarachi();
      for (const a of assets) {
        if (!a.on || !a.name.trim() || exists("asset", a.name)) continue;
        await createAccount(
          {
            name: a.name.trim(),
            kind: "asset",
            subtype: a.subtype,
            on_budget: a.subtype !== "savings",
            opening_balance: Number(a.balance.replace(/[^\d]/g, "") || 0),
          },
          m.openingSource?.id,
          date,
        );
      }
      for (const s of sources) {
        if (!s.on || !s.name.trim() || exists("source", s.name)) continue;
        await createAccount(
          { name: s.name.trim(), kind: "source", subtype: null, on_budget: false, opening_balance: 0 },
          undefined,
          date,
        );
      }
      for (const v of ventures) {
        if (!v.on || m.allVentures.some((x) => x.name.toLowerCase() === v.name.toLowerCase())) continue;
        await createVenture({ name: v.name, status: "active", started_on: date, notes: null });
      }
      for (const name of people) {
        if (exists("person", name)) continue;
        await createPerson({ name });
      }
      await qc.invalidateQueries({ queryKey: ["ledger"] });
      toast.success("You're all set");
      router.push("/");
    } catch (e) {
      toast.error("Couldn't finish setup", { description: (e as Error).message });
      setSaving(false);
    }
  }

  const parents = m.categoryOptions.filter((c) => !c.parent_id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-safe">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Back to app" className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
          <ArrowLeft className="size-5" />
        </Link>
        <Logo className="size-8" />
        <span className="font-semibold">Setup</span>
      </div>

      <ol className="mt-6 grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-2">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <span className={cn("text-xs font-medium", i === step ? "text-foreground" : "text-muted-foreground")}>
              {s}
            </span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
          className="mt-6 flex-1"
        >
          {step === 0 && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Where does your money sit?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Turn on the accounts you use and enter what&apos;s in each today. Savings accounts are tracked but kept
                out of envelopes.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                {assets.map((a) => {
                  const already = exists("asset", a.name);
                  return (
                    <div key={a.key} className={cn("rounded-2xl border bg-card p-4 transition-opacity", !a.on && "opacity-50")}>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={a.on ? `Skip ${a.name}` : `Use ${a.name}`}
                          onClick={() => patchAsset(a.key, { on: !a.on })}
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg border",
                            a.on && "border-primary bg-primary text-primary-foreground",
                          )}
                        >
                          {a.on && <Check className="size-4" />}
                        </button>
                        <Input
                          value={a.name}
                          onChange={(e) => patchAsset(a.key, { name: e.target.value })}
                          className="h-10 flex-1 font-medium"
                          aria-label="Account name"
                        />
                        {a.key.startsWith("c") && (
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() => setAssets((rows) => rows.filter((r) => r.key !== a.key))}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </div>
                      {a.on && (
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Segmented
                            value={a.subtype}
                            onChange={(subtype) => patchAsset(a.key, { subtype })}
                            options={SUBTYPES}
                            className="sm:flex-1"
                          />
                          {already ? (
                            <span className="text-sm text-muted-foreground sm:w-40">Already added</span>
                          ) : (
                            <label className="flex h-10 items-center gap-2 rounded-lg border px-3 sm:w-40">
                              <span className="text-sm text-muted-foreground">Rs</span>
                              <input
                                inputMode="numeric"
                                placeholder="0"
                                value={a.balance ? Number(a.balance).toLocaleString("en-IN") : ""}
                                onChange={(e) => patchAsset(a.key, { balance: e.target.value.replace(/[^\d]/g, "") })}
                                className="w-full bg-transparent tabular outline-none"
                                aria-label={`${a.name} opening balance`}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() =>
                    setAssets((rows) => [
                      ...rows,
                      { key: `c${nextKey.current++}`, name: "", subtype: "wallet", on: true, balance: "" },
                    ])
                  }
                >
                  <Plus /> Add another account
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Where does income come from?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Employers, clients, profit — tap to toggle.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {sources.map((s, i) => (
                  <Chip
                    key={s.name}
                    selected={s.on}
                    onClick={() => setSources((rows) => rows.map((r, j) => (j === i ? { ...r, on: !r.on } : r)))}
                  >
                    {s.on && <Check className="size-4" />}
                    {s.name}
                  </Chip>
                ))}
              </div>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newSource.trim();
                  if (!name || sources.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
                  setSources((rows) => [...rows, { name, on: true }]);
                  setNewSource("");
                }}
              >
                <Input
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="Add a source, e.g. Fiverr client"
                  className="h-11"
                />
                <Button type="submit" variant="outline" className="h-11">
                  <Plus /> Add
                </Button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Any businesses?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Each venture gets its own envelope so business money stays separate. You can add more any time.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {ventures.map((v, i) => (
                  <Chip
                    key={v.name}
                    selected={v.on}
                    onClick={() => setVentures((rows) => rows.map((r, j) => (j === i ? { ...r, on: !r.on } : r)))}
                  >
                    {v.on && <Check className="size-4" />}
                    {v.name}
                  </Chip>
                ))}
              </div>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newVenture.trim();
                  if (!name || ventures.some((v) => v.name.toLowerCase() === name.toLowerCase())) return;
                  setVentures((rows) => [...rows, { name, on: true }]);
                  setNewVenture("");
                }}
              >
                <Input value={newVenture} onChange={(e) => setNewVenture(e.target.value)} placeholder="Add a venture" className="h-11" />
                <Button type="submit" variant="outline" className="h-11">
                  <Plus /> Add
                </Button>
              </form>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">People you lend to or borrow from</h1>
              <p className="mt-1 text-sm text-muted-foreground">Optional. You can also add them later or while adding a loan.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {people.map((name) => (
                  <Chip key={name} selected onClick={() => setPeople((rows) => rows.filter((r) => r !== name))}>
                    {name} <X className="size-3.5" />
                  </Chip>
                ))}
              </div>
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newPersonName.trim();
                  if (!name || people.some((p) => p.toLowerCase() === name.toLowerCase())) return;
                  setPeople((rows) => [...rows, name]);
                  setNewPersonName("");
                }}
              >
                <Input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} placeholder="e.g. Ali" className="h-11" />
                <Button type="submit" variant="outline" className="h-11">
                  <Plus /> Add
                </Button>
              </form>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                A starter set. You can rename and add categories from Settings later.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                {!seeded && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
                {parents.map((p) => {
                  const children = m.categoryOptions.filter((c) => c.parent_id === p.id);
                  return (
                    <div key={p.id} className="rounded-xl border bg-card px-4 py-3">
                      <p className="font-medium">{p.name}</p>
                      {children.length > 0 && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{children.map((c) => c.name).join(" · ")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </motion.section>
      </AnimatePresence>

      <div className="sticky bottom-0 mt-6 flex gap-3 bg-background py-4">
        {step > 0 && (
          <Button variant="outline" size="lg" className="h-12 flex-1" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="h-12 flex-[2] text-base" onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button size="lg" className="h-12 flex-[2] text-base" onClick={finish} disabled={saving || !seeded}>
            {saving && <Loader2 className="animate-spin" />}
            Finish setup
          </Button>
        )}
      </div>
    </main>
  );
}
