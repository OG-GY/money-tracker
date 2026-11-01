"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, Keyboard, Loader2, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { MicButton } from "@/components/shell/mic-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoice } from "@/components/voice/voice-provider";
import { todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { insertMove, insertTransaction } from "@/lib/ledger/queries";
import { voiceDb, type StoredDraft } from "@/lib/voice/drafts-db";
import { completeMove, completeValues, resolveDraft, type ResolveModel, type Resolved } from "@/lib/voice/resolve";
import { DraftCard } from "./draft-card";

export function ConfirmView() {
  const params = useSearchParams();
  const m = useLedgerModel();
  const qc = useQueryClient();
  const { submitText, phase } = useVoice();
  const drafts = useLiveQuery(() => voiceDb().drafts.orderBy("createdAt").toArray(), []);
  const [typing, setTyping] = useState(params.get("type") === "1");
  const [text, setText] = useState("");
  const [addingAll, setAddingAll] = useState(false);
  const today = todayInKarachi();

  const model: ResolveModel = {
    assets: m.assets,
    people: m.people,
    sources: m.sources,
    spending: m.spending,
    categories: m.categories,
    catById: m.catById,
    ventures: m.ventures,
    envelopes: m.budgetEnvelopes,
  };
  const resolve = (d: StoredDraft): Resolved =>
    d.edited
      ? {
          kind: "transaction",
          // Validated values use null for empty text; the input shape wants undefined.
          values: { ...d.edited, merchant: d.edited.merchant ?? undefined, note: d.edited.note ?? undefined },
          issues: [],
          fuzzy: [],
        }
      : resolveDraft(d.parsed, model, today);

  const list = drafts ?? [];
  const batches = list.reduce<{ batchId: string; transcript: string; items: StoredDraft[] }[]>((acc, d) => {
    const last = acc.at(-1);
    if (last?.batchId === d.batchId) last.items.push(d);
    else acc.push({ batchId: d.batchId, transcript: d.transcript, items: [d] });
    return acc;
  }, []);
  const ready = m.isLoading ? [] : list.filter((d) => completeValues(resolve(d)) || completeMove(resolve(d)));

  /** Save one draft; client_id = draft id keeps a double tap from saving twice. */
  async function add(d: StoredDraft, r: Resolved) {
    const values = completeValues(r);
    const move = completeMove(r);
    if (values) {
      await insertTransaction(values, {
        entry_method: "voice",
        raw_transcript: d.transcript,
        entry_batch_id: d.batchId,
        client_id: d.id,
      });
    } else if (move) {
      await insertMove(move);
    } else return false;
    await voiceDb().drafts.delete(d.id);
    return true;
  }

  async function addAll() {
    setAddingAll(true);
    let n = 0;
    try {
      for (const d of ready) if (await add(d, resolve(d))) n++;
      toast.success(`Added ${n} ${n === 1 ? "entry" : "entries"}`);
    } catch (e) {
      toast.error("Some entries couldn't be added", { description: (e as Error).message });
    } finally {
      await qc.invalidateQueries({ queryKey: ["ledger"] });
      setAddingAll(false);
    }
  }

  async function parseTyped() {
    const value = text.trim();
    if (!value) return;
    await submitText(value);
    setText("");
  }

  return (
    <>
      <PageHeader
        title="Confirm entries"
        description="Nothing is saved until you tap Add."
        action={
          ready.length > 1 ? (
            <Button size="lg" className="h-10" onClick={addAll} disabled={addingAll}>
              {addingAll ? <Loader2 className="animate-spin" /> : <CheckCheck />} Add all ({ready.length})
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-5 px-4 md:px-8">
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          {typing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                parseTyped();
              }}
              className="flex flex-col gap-3"
            >
              <Textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="aaj Imtiaz se 3500 ka grocery SadaPay se, aur Ali ko 2000 udhaar diye cash"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) parseTyped();
                }}
              />
              <div className="flex gap-2">
                <Button type="submit" className="h-11 flex-1" disabled={!text.trim() || phase !== "idle"}>
                  {phase === "parsing" ? <Loader2 className="animate-spin" /> : <Sparkles />} Understand
                </Button>
                <Button type="button" variant="ghost" className="h-11" onClick={() => setTyping(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-4">
              <MicButton size="tab" />
              <div className="flex-1">
                <p className="font-medium">Speak another entry</p>
                <p className="text-sm text-muted-foreground">Several in one go is fine.</p>
              </div>
              <Button variant="outline" className="h-11" onClick={() => setTyping(true)}>
                <Keyboard /> Type
              </Button>
            </div>
          )}
        </div>

        {drafts === undefined || m.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            No drafts waiting. Tap the mic and say something like “aaj 500 ka petrol cash se”.
          </div>
        ) : (
          batches.map((b) => (
            <section key={b.batchId} className="flex flex-col gap-3">
              <p className="px-1 text-sm text-muted-foreground">“{b.transcript}”</p>
              <AnimatePresence initial={false}>
                {b.items.map((d) => (
                  <motion.div
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DraftCard
                      draft={d}
                      resolved={resolve(d)}
                      onAdd={async () => {
                        try {
                          if (await add(d, resolve(d))) {
                            toast.success("Added");
                            await qc.invalidateQueries({ queryKey: ["ledger"] });
                          }
                        } catch (e) {
                          toast.error("Couldn't add", { description: (e as Error).message });
                        }
                      }}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </section>
          ))
        )}
      </div>
    </>
  );
}
