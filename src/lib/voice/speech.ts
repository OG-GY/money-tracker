"use client";

// Browser Web Speech API — the fallback when Whisper is unavailable (SPEC D4).

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function ctor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export const canUseSpeech = () => !!ctor();

/** Listen until the speaker pauses (or `stop()`); resolves with the text heard. */
export function listen(lang = "en-IN") {
  const Rec = ctor();
  if (!Rec) throw new Error("Speech recognition isn't supported in this browser");
  const rec = new Rec();
  // Roman-script output suits mixed Urdu/English and the user's own names.
  rec.lang = lang;
  rec.interimResults = false;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let text = "";
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    rec.onerror = (e) => (e.error === "no-speech" || e.error === "aborted" ? resolve(text) : reject(new Error(e.error)));
    rec.onend = () => resolve(text);
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}
