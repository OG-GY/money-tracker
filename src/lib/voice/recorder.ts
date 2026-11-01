"use client";

export const MAX_RECORDING_MS = 60_000;

// Opus in WebM where supported (Chrome/Android), AAC in MP4 on Safari/iOS.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function canRecord() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export type Recording = {
  /** Resolves with the audio when stopped (or at the 60s cap). */
  done: Promise<Blob>;
  stop: () => void;
  cancel: () => void;
  /** 0..1 input level, for the pulse animation. */
  level: () => number;
};

/** Mono, compressed recording (SPEC §4 step 2). */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 32_000 });
  const chunks: Blob[] = [];
  let cancelled = false;

  // Input level for the UI.
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      cleanup();
      if (cancelled) reject(new DOMException("Cancelled", "AbortError"));
      else resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("Recording failed"));
    };
  });

  recorder.start(250);
  const cap = setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_RECORDING_MS);

  return {
    done,
    stop: () => {
      clearTimeout(cap);
      if (recorder.state === "recording") recorder.stop();
    },
    cancel: () => {
      cancelled = true;
      clearTimeout(cap);
      if (recorder.state === "recording") recorder.stop();
    },
    level: () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return Math.min(peak / 64, 1);
    },
  };
}
