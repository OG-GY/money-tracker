"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { Keyboard, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ParsedDraft } from "@/lib/ai/types";
import { todayInKarachi } from "@/lib/format";
import { useLedgerModel } from "@/lib/ledger/model";
import { insertMove, insertTransaction } from "@/lib/ledger/queries";
import { setAutoConfirm, useAutoConfirm, getAutoConfirm } from "@/lib/settings";
import { saveDrafts } from "@/lib/voice/drafts-db";
import { MAX_RECORDING_MS, canRecord, startRecording, type Recording } from "@/lib/voice/recorder";
import { completeMove, completeValues, resolveDraft, type ResolveModel } from "@/lib/voice/resolve";
import { canUseSpeech, listen } from "@/lib/voice/speech";
import { createClient } from "@/lib/supabase/client";

type Phase = "idle" | "recording" | "listening" | "transcribing" | "parsing" | "failed";

type VoiceContextValue = {
  phase: Phase;
  start: () => void;
  /** Parse typed or dictated text (Confirm screen "Type instead"). */
  submitText: (text: string) => Promise<void>;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice() {
  const ctx = use(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside VoiceProvider");
  return ctx;
}

async function postJson<T>(url: string, body: BodyInit, json = true): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    body,
    ...(json && { headers: { "Content-Type": "application/json" } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const m = useLedgerModel();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const recording = useRef<Recording | null>(null);
  const speechStop = useRef<(() => void) | null>(null);
  const lastAudio = useRef<Blob | null>(null);

  const resolveModel = useMemo<ResolveModel>(
    () => ({
      assets: m.assets,
      people: m.people,
      sources: m.sources,
      spending: m.spending,
      categories: m.categories,
      catById: m.catById,
      ventures: m.ventures,
      envelopes: m.budgetEnvelopes,
    }),
    [m.assets, m.people, m.sources, m.spending, m.categories, m.catById, m.ventures, m.budgetEnvelopes],
  );

  const reset = () => {
    setPhase("idle");
    setError(null);
    setTranscript(null);
  };

  /** SPEC §4 step 7: review mode stores drafts; auto-confirm saves what's complete. */
  const handleDrafts = useCallback(
    async (drafts: ParsedDraft[], text: string) => {
      if (!drafts.length) {
        toast("Didn't catch a transaction", { description: `“${text}”` });
        return;
      }
      const batchId = crypto.randomUUID();

      if (!getAutoConfirm()) {
        await saveDrafts(batchId, text, drafts);
        router.push("/confirm");
        return;
      }

      const today = todayInKarachi();
      const txIds: string[] = [];
      const moveIds: string[] = [];
      const review: ParsedDraft[] = [];
      for (const d of drafts) {
        const r = resolveDraft(d, resolveModel, today);
        const values = completeValues(r);
        const move = completeMove(r);
        try {
          if (values) {
            const id = await insertTransaction(values, {
              entry_method: "voice",
              auto_confirmed: true,
              raw_transcript: text,
              entry_batch_id: batchId,
            });
            if (id) txIds.push(id);
          } else if (move) {
            const id = await insertMove(move);
            if (id) moveIds.push(id);
          } else {
            review.push(d);
          }
        } catch {
          review.push(d);
        }
      }
      if (review.length) await saveDrafts(batchId, text, review);
      await qc.invalidateQueries({ queryKey: ["ledger"] });

      const added = txIds.length + moveIds.length;
      if (added) {
        toast.success(`Added ${added} ${added === 1 ? "entry" : "entries"}`, {
          description: review.length ? `${review.length} need${review.length === 1 ? "s" : ""} a quick review.` : `“${text}”`,
          duration: 6000,
          action: {
            label: "Undo",
            onClick: async () => {
              const db = createClient();
              if (txIds.length) await db.from("transactions").delete().in("id", txIds);
              if (moveIds.length) await db.from("envelope_moves").delete().in("id", moveIds);
              await qc.invalidateQueries({ queryKey: ["ledger"] });
              toast("Undone");
            },
          },
        });
      }
      if (review.length) router.push("/confirm");
    },
    [qc, resolveModel, router],
  );

  const parseText = useCallback(
    async (text: string) => {
      setTranscript(text);
      setPhase("parsing");
      const { drafts } = await postJson<{ drafts: ParsedDraft[] }>("/api/parse", JSON.stringify({ text }));
      await handleDrafts(drafts, text);
      reset();
    },
    [handleDrafts],
  );

  const transcribeAndParse = useCallback(
    async (audio: Blob) => {
      setPhase("transcribing");
      setError(null);
      let text: string;
      try {
        const form = new FormData();
        form.append("audio", audio);
        ({ text } = await postJson<{ text: string }>("/api/transcribe", form, false));
      } catch (e) {
        setError((e as Error).message);
        setPhase("failed");
        return;
      }
      if (!text.trim()) {
        setError("Didn't hear anything. Try again a little closer to the mic.");
        setPhase("failed");
        return;
      }
      try {
        await parseText(text);
      } catch (e) {
        setError((e as Error).message);
        setPhase("failed");
      }
    },
    [parseText],
  );

  const startSpeech = useCallback(async () => {
    try {
      setError(null);
      setPhase("listening");
      setStartedAt(Date.now());
      const s = listen();
      speechStop.current = s.stop;
      const text = await s.done;
      speechStop.current = null;
      if (!text) {
        setError("Didn't hear anything.");
        setPhase("failed");
        return;
      }
      await parseText(text);
    } catch (e) {
      setError((e as Error).message);
      setPhase("failed");
    }
  }, [parseText]);

  const start = useCallback(async () => {
    if (phase !== "idle" && phase !== "failed") return;
    if (!navigator.onLine) {
      toast("You're offline", { description: "Voice entry needs internet for now. Add it manually instead." });
      return;
    }
    if (!canRecord()) {
      if (canUseSpeech()) return startSpeech();
      toast.error("This browser can't record audio");
      return;
    }
    try {
      setError(null);
      setTranscript(null);
      const rec = await startRecording();
      recording.current = rec;
      setStartedAt(Date.now());
      setPhase("recording");
      const audio = await rec.done;
      recording.current = null;
      lastAudio.current = audio;
      await transcribeAndParse(audio);
    } catch (e) {
      recording.current = null;
      if ((e as DOMException).name === "AbortError") return reset();
      if ((e as DOMException).name === "NotAllowedError") {
        toast.error("Microphone blocked", { description: "Allow microphone access in your browser settings." });
        return reset();
      }
      setError((e as Error).message);
      setPhase("failed");
    }
  }, [phase, startSpeech, transcribeAndParse]);

  const stop = useCallback(() => {
    recording.current?.stop();
    speechStop.current?.();
  }, []);
  const cancel = () => {
    recording.current?.cancel();
    speechStop.current?.();
    speechStop.current = null;
    reset();
  };

  // `M` starts the mic on desktop (SPEC §8.2).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      if (phase === "recording" || phase === "listening") stop();
      else start();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, start, stop]);

  const value = useMemo(
    () => ({
      phase,
      start: () => void start(),
      submitText: async (text: string) => {
        try {
          await parseText(text);
        } catch (e) {
          reset();
          toast.error("Couldn't understand that", { description: (e as Error).message });
        }
      },
    }),
    [phase, start, parseText],
  );

  return (
    <VoiceContext value={value}>
      {children}
      <AnimatePresence>
        {phase !== "idle" && (
          <VoiceOverlay
            key="voice"
            phase={phase}
            startedAt={startedAt}
            transcript={transcript}
            error={error}
            level={() => recording.current?.level() ?? 0.3}
            onStop={stop}
            onCancel={cancel}
            onRetry={() => (lastAudio.current ? transcribeAndParse(lastAudio.current) : start())}
            onSpeech={canUseSpeech() ? startSpeech : undefined}
            onType={() => {
              reset();
              router.push("/confirm?type=1");
            }}
          />
        )}
      </AnimatePresence>
    </VoiceContext>
  );
}

function VoiceOverlay({
  phase,
  startedAt,
  transcript,
  error,
  level,
  onStop,
  onCancel,
  onRetry,
  onSpeech,
  onType,
}: {
  phase: Phase;
  startedAt: number;
  transcript: string | null;
  error: string | null;
  level: () => number;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onSpeech?: () => void;
  onType: () => void;
}) {
  const autoConfirm = useAutoConfirm();
  const live = phase === "recording" || phase === "listening";
  const busy = phase === "transcribing" || phase === "parsing";
  const [elapsed, setElapsed] = useState(0);
  const pulse = useMotionValue(1);
  const scale = useSpring(pulse, { stiffness: 300, damping: 20 });

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const tick = () => {
      setElapsed(Date.now() - startedAt);
      pulse.set(1 + level() * 0.6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, startedAt, level, pulse]);

  const secs = Math.floor(elapsed / 1000);
  const label =
    phase === "recording"
      ? "Listening…"
      : phase === "listening"
        ? "Listening (device speech)…"
        : phase === "transcribing"
          ? "Transcribing…"
          : phase === "parsing"
            ? "Understanding…"
            : "Something went wrong";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40"
        onClick={busy ? undefined : onCancel}
      />
      <motion.div
        role="dialog"
        aria-label="Voice entry"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-lg flex-col items-center gap-5 rounded-t-3xl border-t bg-popover px-6 pt-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:bottom-6 md:rounded-3xl md:border"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="absolute top-3 right-3 rounded-lg p-2 text-muted-foreground hover:bg-muted"
          disabled={busy}
        >
          <X className="size-5" />
        </button>

        <p className="text-sm font-medium text-muted-foreground">{label}</p>

        <div className="relative flex size-36 items-center justify-center">
          {live && <motion.div style={{ scale }} className="absolute inset-0 rounded-full bg-primary/20" />}
          {live && (
            <motion.div
              className="absolute inset-3 rounded-full bg-primary/25"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <button
            type="button"
            onClick={live ? onStop : undefined}
            aria-label={live ? "Stop recording" : label}
            className={`relative flex size-24 items-center justify-center rounded-full ${phase === "failed" ? "bg-muted text-expense" : "bg-primary text-primary-foreground"}`}
          >
            {live ? <Square className="size-8 fill-current" /> : busy ? <Loader2 className="size-9 animate-spin" /> : <Mic className="size-9" />}
          </button>
        </div>

        {live && (
          <p className="tabular text-sm text-muted-foreground">
            0:{String(secs).padStart(2, "0")} / {MAX_RECORDING_MS / 1000 / 60}:00 · tap to stop
          </p>
        )}
        {transcript && <p className="max-w-sm text-center text-sm">“{transcript}”</p>}

        {phase === "failed" && (
          <div className="flex w-full flex-col gap-2">
            {error && <p className="text-center text-sm text-expense">{error}</p>}
            <Button size="lg" className="h-12" onClick={onRetry}>
              <RotateCcw /> Try again
            </Button>
            {onSpeech && (
              <Button size="lg" variant="outline" className="h-12" onClick={onSpeech}>
                <Mic /> Use device speech recognition
              </Button>
            )}
            <Button size="lg" variant="ghost" className="h-12" onClick={onType}>
              <Keyboard /> Type it instead
            </Button>
          </div>
        )}

        {(live || phase === "failed") && (
          <label className="flex w-full items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-sm">
            <span>
              <span className="font-medium">Auto-add</span>
              <span className="block text-xs text-muted-foreground">Save without reviewing (with Undo)</span>
            </span>
            <Switch checked={autoConfirm} onCheckedChange={setAutoConfirm} />
          </label>
        )}
      </motion.div>
    </>
  );
}
